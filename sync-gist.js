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
	syncDebounceTimer: null,
	retryQueue: [],
	retryTimer: null,
	isOffline: false,

	// Initialize
	init: function() {
		this.loadRetryQueue();
		this.setupBeforeUnload();
		this.setupOnlineListener();
	},

	// Configuration helpers
	isEnabled: function() {
		return localStorage.getItem('stickiesboard.sync.enabled') === 'true';
	},

	getToken: function() {
		return localStorage.getItem('stickiesboard.sync.token');
	},

	setEnabled: function(enabled) {
		localStorage.setItem('stickiesboard.sync.enabled', enabled ? 'true' : 'false');
	},

	setToken: function(token) {
		localStorage.setItem('stickiesboard.sync.token', token || '');
	},

	getGistId: function(boardId) {
		return localStorage.getItem('stickiesboard.sync.gistId.' + boardId);
	},

	setGistId: function(boardId, gistId) {
		localStorage.setItem('stickiesboard.sync.gistId.' + boardId, gistId);
	},

	deleteGistId: function(boardId) {
		localStorage.removeItem('stickiesboard.sync.gistId.' + boardId);
	},

	getLastSyncRev: function(boardId) {
		const rev = localStorage.getItem('stickiesboard.sync.lastSyncRev.' + boardId);
		return rev ? parseInt(rev) : 0;
	},

	setLastSyncRev: function(boardId, revision) {
		localStorage.setItem('stickiesboard.sync.lastSyncRev.' + boardId, revision.toString());
	},

	setOffline: function(offline) {
		this.isOffline = offline;
		localStorage.setItem('stickiesboard.sync.offline', offline ? 'true' : 'false');
		if (window.SyncUI) {
			window.SyncUI.updateIndicator();
		}
	},

	// API request wrapper with error handling
	_apiRequest: async function(method, endpoint, body = null) {
		const token = this.getToken();
		if (!token) {
			throw new Error('No GitHub token configured');
		}

		const options = {
			method: method,
			headers: {
				'Authorization': 'token ' + token,
				'Accept': 'application/vnd.github.v3+json',
				'Content-Type': 'application/json'
			}
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
			throw new Error('API request failed: ' + response.status);
		}

		// DELETE returns 204 No Content
		if (response.status === 204) {
			return { success: true };
		}

		return await response.json();
	},

	validateToken: async function(token) {
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

	createGist: async function(boardId, boardData) {
		const filename = this.FILENAME_PREFIX + boardId + this.FILENAME_SUFFIX;

		// Remove history before syncing
		const cleanData = Object.assign({}, boardData);
		delete cleanData.history;

		const body = {
			description: 'Sticky Kanban Board Data',
			public: false,
			files: {}
		};
		body.files[filename] = {
			content: JSON.stringify(cleanData)
		};

		const result = await this._apiRequest('POST', '/gists', body);
		return result.id;
	},

	updateGist: async function(gistId, boardData) {
		const filename = this.FILENAME_PREFIX + boardData.id + this.FILENAME_SUFFIX;

		// Remove history before syncing
		const cleanData = Object.assign({}, boardData);
		delete cleanData.history;

		const body = {
			files: {}
		};
		body.files[filename] = {
			content: JSON.stringify(cleanData)
		};

		await this._apiRequest('PATCH', '/gists/' + gistId, body);
		return true;
	},

	fetchGist: async function(gistId) {
		const result = await this._apiRequest('GET', '/gists/' + gistId);
		if (!result) return null;

		// Find the sticky-kanban file
		for (const filename in result.files) {
			if (filename.startsWith(this.FILENAME_PREFIX) && filename.endsWith(this.FILENAME_SUFFIX)) {
				const content = result.files[filename].content;
				try {
					return JSON.parse(content);
				} catch (error) {
					throw new Error('Invalid board data in gist ' + gistId);
				}
			}
		}

		return null;
	},

	listAllGists: async function() {
		const result = await this._apiRequest('GET', '/gists');
		if (!result) return [];

		const boards = [];

		for (const gist of result) {
			for (const filename in gist.files) {
				if (filename.startsWith(this.FILENAME_PREFIX) && filename.endsWith(this.FILENAME_SUFFIX)) {
					// Extract board ID from filename
					const boardId = filename.substring(
						this.FILENAME_PREFIX.length,
						filename.length - this.FILENAME_SUFFIX.length
					);

					try {
						const content = gist.files[filename].content;
						const boardData = JSON.parse(content);

						boards.push({
							gistId: gist.id,
							boardId: parseInt(boardId),
							boardData: boardData
						});
					} catch (error) {
						// Skip corrupted gists rather than failing completely
						console.warn('Skipping corrupted gist ' + gist.id + ': ' + error.message);
					}
				}
			}
		}

		return boards;
	},

	deleteGist: async function(gistId) {
		await this._apiRequest('DELETE', '/gists/' + gistId);
		return true;
	},

	// Sync operations
	syncBoardToGist: async function(boardId) {
		if (!this.isEnabled()) return;

		try {
			// Update indicator to syncing state
			if (window.SyncUI) {
				window.SyncUI.updateIndicator('syncing');
			}

			// Load board from storage
			const board = SKB.storage.loadBoard(boardId);
			if (!board) {
				console.error('Board not found:', boardId);
				return;
			}

			const gistId = this.getGistId(boardId);

			if (gistId) {
				// Update existing gist
				await this.updateGist(gistId, board);
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
			console.error('Sync failed:', error);
			// Error handling done in _apiRequest
			throw error;
		}
	},

	pullAllGistsFromGitHub: async function() {
		if (!this.isEnabled()) return;

		try {
			const gists = await this.listAllGists();
			const localBoardIndex = SKB.storage.getBoardIndex();
			const gistBoardIds = new Set();

			// Process each gist
			for (const gist of gists) {
				gistBoardIds.add(gist.boardId);

				// Store gist ID mapping
				this.setGistId(gist.boardId, gist.gistId);

				const localMeta = localBoardIndex.get(gist.boardId);

				if (!localMeta) {
					// Board doesn't exist locally - import it
					console.log('Importing board from GitHub:', gist.boardData.title);

					// Restore history array
					gist.boardData.history = [gist.boardData.revision];

					SKB.storage.saveBoard(gist.boardData);
					this.setLastSyncRev(gist.boardId, gist.boardData.revision);

				} else {
					// Board exists - compare revisions
					if (gist.boardData.revision > localMeta.current) {
						console.log('Updating board from GitHub (newer revision):', gist.boardData.title);

						// GitHub version is newer - load it
						gist.boardData.history = localMeta.history || [gist.boardData.revision];

						SKB.storage.saveBoard(gist.boardData);
						this.setLastSyncRev(gist.boardId, gist.boardData.revision);
					}
				}
			}

			// Check for deleted boards (local exists but gist deleted)
			for (const [boardId, meta] of localBoardIndex) {
				const hasGistId = this.getGistId(boardId);
				if (hasGistId && !gistBoardIds.has(boardId)) {
					console.log('Board deleted from GitHub, removing locally:', meta.title);
					SKB.storage.nukeBoard(boardId);
					this.deleteGistId(boardId);
				}
			}

		} catch (error) {
			console.error('Pull failed:', error);
			// Don't throw - allow app to continue working locally
		}
	},
	queueBoardForSync: function(boardId) { },
	loadRetryQueue: function() { },
	saveRetryQueue: function() { },
	processRetryQueue: function() { },
	setupBeforeUnload: function() { },
	setupOnlineListener: function() { }
};

// Auto-initialize when script loads
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', function() {
		GistSync.init();
	});
} else {
	GistSync.init();
}
