/*
 * GitHub Gist Sync Module
 * Handles bidirectional sync between localStorage and GitHub Gists
 */

const GistSync = {
  // Configuration
  API_BASE: 'https://api.github.com',
  FILENAME_PREFIX: 'sticky-kanban-',
  FILENAME_SUFFIX: '.json',

  // State
  syncDebounceTimers: new Map(),
  retryQueue: [],
  retryTimer: null,
  isOffline: false,

  // Initialize
  init() {
    this.loadRetryQueue();
    this.setupBeforeUnload();
    this.setupOnlineListener();
  },

  // Configuration helpers
  isEnabled() {
    return localStorage.getItem('stickiesboard.sync.enabled') === 'true';
  },

  getToken() {
    return localStorage.getItem('stickiesboard.sync.token');
  },

  setEnabled(enabled) {
    localStorage.setItem('stickiesboard.sync.enabled', enabled ? 'true' : 'false');
  },

  setToken(token) {
    localStorage.setItem('stickiesboard.sync.token', token || '');
  },

  getGistId(boardId) {
    return localStorage.getItem(`stickiesboard.sync.gistId.${boardId}`);
  },

  setGistId(boardId, gistId) {
    localStorage.setItem(`stickiesboard.sync.gistId.${boardId}`, gistId);
  },

  deleteGistId(boardId) {
    localStorage.removeItem(`stickiesboard.sync.gistId.${boardId}`);
  },

  getLastSyncRev(boardId) {
    const rev = localStorage.getItem(`stickiesboard.sync.lastSyncRev.${boardId}`);
    return rev ? parseInt(rev, 10) : 0;
  },

  setLastSyncRev(boardId, revision) {
    localStorage.setItem(`stickiesboard.sync.lastSyncRev.${boardId}`, revision.toString());
  },

  setOffline(offline) {
    this.isOffline = offline;
    localStorage.setItem('stickiesboard.sync.offline', offline ? 'true' : 'false');
    if (window.SyncUI) {
      window.SyncUI.updateIndicator();
    }
  },

  // API request wrapper with error handling
  async _apiRequest(method, endpoint, body = null) {
    const token = this.getToken();
    if (!token) {
      throw new Error('No GitHub token configured');
    }

    const options = {
      method,
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(this.API_BASE + endpoint, options);

    // Handle errors
    if (response.status === 401) {
      this.setEnabled(false);
      if (window.SyncUI) {
        window.SyncUI.updateIndicator();
        window.SyncUI.showError('Token invalid or expired. Please update token.');
      }
      throw new Error('Invalid or expired token');
    }

    if (response.status === 403) {
      // Rate limit - enter offline mode
      this.setOffline(true);
      throw new Error('Rate limit exceeded');
    }

    if (response.status >= 500) {
      // Server error - enter offline mode
      this.setOffline(true);
      throw new Error('GitHub API unavailable');
    }

    if (response.status === 404 && method === 'GET') {
      return null; // Gist not found
    }

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    // DELETE returns 204 No Content
    if (response.status === 204) {
      return { success: true };
    }

    return await response.json();
  },

  async validateToken(token) {
    try {
      // Temporarily set token for validation
      const oldToken = this.getToken();
      this.setToken(token);

      const result = await this._apiRequest('GET', '/gists');

      // Restore old token if validation failed
      if (!result) {
        this.setToken(oldToken);
        return false;
      }

      return true;
    } catch (error) {
      this.setToken('');
      return false;
    }
  },

  async createGist(boardId, boardData) {
    const filename = this.FILENAME_PREFIX + boardId + this.FILENAME_SUFFIX;

    // Remove history before syncing
    const cleanData = { ...boardData };
    delete cleanData.history;

    const body = {
      description: 'Sticky Kanban Board Data',
      public: false,
      files: {},
    };
    body.files[filename] = {
      content: JSON.stringify(cleanData),
    };

    const result = await this._apiRequest('POST', '/gists', body);
    return result.id;
  },

  async updateGist(gistId, boardData) {
    const filename = this.FILENAME_PREFIX + boardData.id + this.FILENAME_SUFFIX;

    // Remove history before syncing
    const cleanData = { ...boardData };
    delete cleanData.history;

    const body = {
      files: {},
    };
    body.files[filename] = {
      content: JSON.stringify(cleanData),
    };

    await this._apiRequest('PATCH', `/gists/${gistId}`, body);
    return true;
  },

  async fetchGist(gistId) {
    const result = await this._apiRequest('GET', `/gists/${gistId}`);
    if (!result) return null;

    // Find the sticky-kanban file
    for (const filename in result.files) {
      if (filename.startsWith(this.FILENAME_PREFIX) && filename.endsWith(this.FILENAME_SUFFIX)) {
        const { content } = result.files[filename];
        try {
          return JSON.parse(content);
        } catch (error) {
          throw new Error(`Invalid board data in gist ${gistId}`);
        }
      }
    }

    return null;
  },

  async listAllGists() {
    const result = await this._apiRequest('GET', '/gists');
    if (!result) return [];

    const boards = [];

    for (const gist of result) {
      for (const filename in gist.files) {
        if (filename.startsWith(this.FILENAME_PREFIX) && filename.endsWith(this.FILENAME_SUFFIX)) {
          // Extract board ID from filename
          const boardId = filename.substring(
            this.FILENAME_PREFIX.length,
            filename.length - this.FILENAME_SUFFIX.length,
          );

          try {
            let { content } = gist.files[filename];

            // If content is not available in list, fetch the full gist
            if (!content || gist.files[filename].truncated) {
              const fullGistResponse = await this._apiRequest('GET', `/gists/${gist.id}`);
              if (fullGistResponse && fullGistResponse.files && fullGistResponse.files[filename]) {
                content = fullGistResponse.files[filename].content;
              }
            }

            if (!content) {
              continue;
            }

            const boardData = JSON.parse(content);

            // Board IDs are numbers (created as +new Date() in board.js)
            // Parse to ensure type consistency with boardIndex Map keys
            boards.push({
              gistId: gist.id,
              boardId: parseInt(boardId, 10),
              boardData,
            });
          } catch (error) {
            // Skip corrupted gists rather than failing completely
          }
        }
      }
    }

    return boards;
  },

  async deleteGist(gistId) {
    await this._apiRequest('DELETE', `/gists/${gistId}`);
    return true;
  },

  // Sync operations
  async syncBoardToGist(boardId) {
    if (!this.isEnabled()) return;

    try {
      // Check if board still exists in index (may have been deleted)
      const boardIndex = SKB.storage.getBoardIndex();
      if (!boardIndex.has(boardId)) {
        return;
      }

      // Update indicator to syncing state
      if (window.SyncUI) {
        window.SyncUI.updateIndicator('syncing');
      }

      // Load board from storage
      const board = SKB.storage.loadBoard(boardId);
      if (!board) {
        return;
      }

      const gistId = this.getGistId(boardId);

      if (gistId) {
        // Update existing gist
        try {
          await this.updateGist(gistId, board);
        } catch (error) {
          // If gist was deleted from GitHub, create a new one
          if (error.message && error.message.includes('404')) {
            this.deleteGistId(boardId);
            const newGistId = await this.createGist(boardId, board);
            this.setGistId(boardId, newGistId);
          } else {
            throw error;
          }
        }
      } else {
        // Create new gist
        const newGistId = await this.createGist(boardId, board);
        this.setGistId(boardId, newGistId);
      }

      // Update last synced revision
      this.setLastSyncRev(boardId, board.revision);

      // Clear offline flag on success
      if (this.isOffline) {
        this.setOffline(false);
      }

      // Update indicator to synced state
      if (window.SyncUI) {
        window.SyncUI.updateIndicator('synced');
      }
    } catch (error) {
      // Error handling done in _apiRequest
      throw error;
    }
  },

  async pullAllGistsFromGitHub(isInitialSync = false) {
    if (!this.isEnabled()) return;

    try {
      const gists = await this.listAllGists();
      const localBoardIndex = SKB.storage.getBoardIndex();

      // Capture snapshot of local board IDs BEFORE importing
      const localBoardIds = new Set(localBoardIndex.keys());
      const gistBoardIds = new Set();

      // Process each gist
      for (const gist of gists) {
        gistBoardIds.add(gist.boardId);

        // Store gist ID mapping
        this.setGistId(gist.boardId, gist.gistId);

        const localMeta = localBoardIndex.get(gist.boardId);

        if (!localMeta) {
          // Board doesn't exist locally - import it
          // Restore history array
          gist.boardData.history = [gist.boardData.revision];

          SKB.storage.saveBoard(gist.boardData);
          this.setLastSyncRev(gist.boardId, gist.boardData.revision);
        } else {
          // Board exists - compare revisions
          if (gist.boardData.revision > localMeta.current) {
            // GitHub version wins - use only its revision for history
            gist.boardData.history = [gist.boardData.revision];

            SKB.storage.saveBoard(gist.boardData);
            this.setLastSyncRev(gist.boardId, gist.boardData.revision);
          }
        }
      }

      // Check for boards with missing gists (deleted from GitHub)
      // Use the snapshot of IDs from BEFORE import to avoid checking newly imported boards
      for (const boardId of localBoardIds) {
        const meta = localBoardIndex.get(boardId);
        if (!meta) continue; // Board was already deleted
        const hasGistId = this.getGistId(boardId);
        if (hasGistId && !gistBoardIds.has(boardId)) {
          if (isInitialSync) {
            // During initial sync setup - assume gist was manually deleted, keep board
            this.deleteGistId(boardId);
          } else {
            // During regular sync - board was deleted on another device
            SKB.storage.nukeBoard(boardId);
            this.deleteGistId(boardId);
          }
        }
      }
    } catch (error) {
      // Don't throw - allow app to continue working locally
    } finally {
      // Always update board index UI after pull (new/updated/deleted boards)
      if (window.updateBoardIndex) {
        window.updateBoardIndex();
      }
    }
  },
  queueBoardForSync(boardId) {
    if (!this.isEnabled()) return;

    // Update indicator to show sync is pending
    if (window.SyncUI) {
      window.SyncUI.updateIndicator('syncing');
    }

    // Clear existing timer for THIS board only
    if (this.syncDebounceTimers.has(boardId)) {
      clearTimeout(this.syncDebounceTimers.get(boardId));
    }

    // Start new 15-second timer for this board
    const timer = setTimeout(async () => {
      this.syncDebounceTimers.delete(boardId);
      try {
        await this.syncBoardToGist(boardId);

        // Remove from retry queue if present
        this.retryQueue = this.retryQueue.filter((item) => item.boardId !== boardId);
        this.saveRetryQueue();
      } catch (error) {
        // Add to retry queue
        this.addToRetryQueue(boardId);
      }
    }, 15000); // 15 seconds

    this.syncDebounceTimers.set(boardId, timer);
  },

  cancelPendingSync(boardId) {
    // Clear any pending sync timer for this board
    if (this.syncDebounceTimers.has(boardId)) {
      clearTimeout(this.syncDebounceTimers.get(boardId));
      this.syncDebounceTimers.delete(boardId);
    }

    // Remove from retry queue
    this.retryQueue = this.retryQueue.filter((item) => item.boardId !== boardId);
    this.saveRetryQueue();
  },

  addToRetryQueue(boardId) {
    // Check if already in queue
    const existing = this.retryQueue.find((item) => item.boardId === boardId);

    if (existing) {
      // Increment attempt
      existing.attempt += 1;
      existing.nextRetry = Date.now() + this.getRetryDelay(existing.attempt);
    } else {
      // Add new entry
      this.retryQueue.push({
        boardId,
        attempt: 1,
        nextRetry: Date.now() + this.getRetryDelay(1),
      });
    }

    this.saveRetryQueue();
    this.scheduleRetryProcessor();
  },

  getRetryDelay(attempt) {
    switch (attempt) {
    case 1: return 15000; // 15 seconds
    case 2: return 30000; // 30 seconds
    case 3: return 60000; // 60 seconds
    default: return null; // No more retries - go offline
    }
  },

  loadRetryQueue() {
    try {
      const stored = localStorage.getItem('stickiesboard.sync.queue');
      this.retryQueue = stored ? JSON.parse(stored) : [];
    } catch (error) {
      this.retryQueue = [];
      localStorage.removeItem('stickiesboard.sync.queue');
    }
  },
  saveRetryQueue() {
    try {
      localStorage.setItem('stickiesboard.sync.queue', JSON.stringify(this.retryQueue));
    } catch (error) {
      // Silently fail
    }
  },

  scheduleRetryProcessor() {
    // Clear existing timer
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    // Find next retry time
    let nextRetry = null;
    for (const item of this.retryQueue) {
      if (!nextRetry || item.nextRetry < nextRetry) {
        nextRetry = item.nextRetry;
      }
    }

    if (nextRetry) {
      const delay = Math.max(0, nextRetry - Date.now());
      this.retryTimer = setTimeout(() => {
        this.processRetryQueue();
      }, delay);
    }
  },
  async processRetryQueue() {
    const now = Date.now();
    const remaining = [];

    for (const item of this.retryQueue) {
      if (item.nextRetry <= now) {
        try {
          await this.syncBoardToGist(item.boardId);
          // Success - don't add to remaining
        } catch (error) {
          // Failed - check if should retry or go offline
          if (item.attempt >= 3) {
            this.setOffline(true);
            // Keep in queue for when online
            remaining.push({
              boardId: item.boardId,
              attempt: 0, // Reset for when we come back online
              nextRetry: now + 60000,
            });
          } else {
            // Add back with incremented attempt
            item.attempt += 1;
            item.nextRetry = now + this.getRetryDelay(item.attempt);
            remaining.push(item);
          }
        }
      } else {
        remaining.push(item);
      }
    }

    this.retryQueue = remaining;
    this.saveRetryQueue();

    // Schedule next processing
    if (this.retryQueue.length > 0) {
      this.scheduleRetryProcessor();
    }
  },
  setupBeforeUnload() {
    window.addEventListener('beforeunload', (event) => {
      // Check if there are pending operations
      const hasPending = this.syncDebounceTimers.size > 0 || this.retryQueue.length > 0;

      if (hasPending && this.isEnabled()) {
        // Attempt synchronous sync for pending items
        const pendingBoards = [];

        // Add debounced boards
        for (const boardId of this.syncDebounceTimers.keys()) {
          pendingBoards.push(boardId);
        }

        // Add retry queue boards
        for (const item of this.retryQueue) {
          if (!pendingBoards.includes(item.boardId)) {
            pendingBoards.push(item.boardId);
          }
        }

        // Try to sync synchronously (browsers allow this in beforeunload)
        for (const boardId of pendingBoards) {
          try {
            // Note: This uses synchronous XMLHttpRequest which is deprecated
            // but still supported in beforeunload context
            this.syncBoardToGistSync(boardId);
          } catch (error) {
            // Silently fail
          }
        }

        // If we get here and still have pending, warn user
        if (pendingBoards.length > 0) {
          event.preventDefault();
          event.returnValue = 'Changes are still syncing to GitHub. Leave anyway?';
        }
      }
    });
  },

  // Synchronous version for beforeunload
  syncBoardToGistSync(boardId) {
    if (!this.isEnabled()) return;

    const token = this.getToken();
    if (!token) return;

    const board = SKB.storage.loadBoard(boardId);
    if (!board) return;

    const gistId = this.getGistId(boardId);
    if (!gistId) return; // Can't create gist synchronously, skip

    // Update existing gist only
    const filename = this.FILENAME_PREFIX + boardId + this.FILENAME_SUFFIX;
    const cleanData = { ...board };
    delete cleanData.history;

    const xhr = new XMLHttpRequest();
    xhr.open('PATCH', `${this.API_BASE}/gists/${gistId}`, false); // false = synchronous
    xhr.setRequestHeader('Authorization', `token ${token}`);
    xhr.setRequestHeader('Accept', 'application/vnd.github.v3+json');
    xhr.setRequestHeader('Content-Type', 'application/json');

    const body = { files: {} };
    body.files[filename] = { content: JSON.stringify(cleanData) };

    xhr.send(JSON.stringify(body));

    if (xhr.status === 200) {
      this.setLastSyncRev(boardId, board.revision);
    }
  },

  setupOnlineListener() {
    window.addEventListener('online', () => {
      if (this.isOffline && this.isEnabled()) {
        this.setOffline(false);

        // Process retry queue immediately
        this.processRetryQueue();
      }
    });
  },
};

// Export to window
window.GistSync = GistSync;

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    GistSync.init();
  });
} else {
  GistSync.init();
}
