/*
 * GitHub Gist Sync UI Module
 * Handles sync dialog and menu indicator
 */

const SyncUI = {
  dialogOpen: false,

  init() {
    this.setupMenuHandler();
    this.updateIndicator();
  },

  setupMenuHandler() {
    // Will be connected to menu item click
    $(document).on('click', '.sync-gists', (e) => {
      e.preventDefault();
      this.showSyncDialog();
    });
  },

  showSyncDialog() {
    if (this.dialogOpen) return;
    this.dialogOpen = true;

    const isEnabled = GistSync.isEnabled();

    let dialogHTML = '';

    if (isEnabled) {
      // Already enabled - show status
      const boardCount = this.countSyncedBoards();
      dialogHTML = `
				<div class="dialog-overlay">
					<div class="dialog">
						<div class="dialog-title">
							<span class="title-text">GitHub Gist Sync</span>
						</div>
						<div class="dialog-body">
							<div class="dialog-inner">
								<div class="dialog-content">
									<p>Token: <span class="token-hidden">••••••••••••</span></p>
									<p>Status: ✓ Syncing ${boardCount} boards</p>
								</div>
								<div class="dialog-buttons">
									<button class="dialog-button sync-disable-btn">Disable Sync</button>
									<button class="dialog-button sync-update-token-btn">Update Token</button>
									<button class="dialog-button default sync-close-btn">Close</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			`;
    } else {
      // Not enabled - show setup
      dialogHTML = `
				<div class="dialog-overlay">
					<div class="dialog">
						<div class="dialog-title">
							<span class="title-text">GitHub Gist Sync Setup</span>
						</div>
						<div class="dialog-body">
							<div class="dialog-inner">
								<div class="dialog-content">
									<p>To enable sync:</p>
									<ol>
										<li>Go to github.com/settings/tokens</li>
										<li>Create token with 'gist' scope</li>
										<li>Paste token below</li>
									</ol>
									<input type="text" class="dialog-input" placeholder="github_pat_..." />
									<div class="dialog-error" style="display:none;"></div>
								</div>
								<div class="dialog-buttons">
									<button class="dialog-button default sync-enable-btn">Enable Sync</button>
									<button class="dialog-button sync-cancel-btn">Cancel</button>
								</div>
							</div>
						</div>
					</div>
				</div>
			`;
    }

    $('body').append(dialogHTML);

    // Setup button handlers
    this.setupDialogHandlers();
  },

  setupDialogHandlers() {
    const self = this;

    // Unbind previous handlers to prevent duplicates
    $(document).off('click.syncDialog');

    // Enable sync (use namespaced event)
    $(document).on('click.syncDialog', '.sync-enable-btn', async () => {
      const token = $('.dialog-input').val().trim();
      if (!token) {
        self.showDialogError('Please enter a token');
        return;
      }

      await self.handleEnableSync(token);
    });

    // Update token (use namespaced event)
    $(document).on('click.syncDialog', '.sync-update-token-btn', () => {
      self.closeDialog();
      // Show setup dialog with pre-filled token option
      setTimeout(() => {
        self.showUpdateTokenDialog();
      }, 100);
    });

    // Disable sync (use namespaced event)
    $(document).on('click.syncDialog', '.sync-disable-btn', () => {
      self.handleDisableSync();
    });

    // Close/Cancel (use namespaced event)
    $(document).on('click.syncDialog', '.sync-close-btn, .sync-cancel-btn, .dialog-overlay', (e) => {
      if (e.target === e.currentTarget) {
        self.closeDialog();
      }
    });
  },

  showUpdateTokenDialog() {
    // Similar to setup but for updating token
    const dialogHTML = `
			<div class="dialog-overlay">
				<div class="dialog">
					<div class="dialog-title">
						<span class="title-text">Update GitHub Token</span>
					</div>
					<div class="dialog-body">
						<div class="dialog-inner">
							<div class="dialog-content">
								<p>Enter new GitHub Personal Access Token:</p>
								<input type="text" class="dialog-input" placeholder="github_pat_..." />
								<div class="dialog-error" style="display:none;"></div>
							</div>
							<div class="dialog-buttons">
								<button class="dialog-button default sync-enable-btn">Update Token</button>
								<button class="dialog-button sync-cancel-btn">Cancel</button>
							</div>
						</div>
					</div>
				</div>
			</div>
		`;

    $('body').append(dialogHTML);
    this.dialogOpen = true;
    this.setupDialogHandlers();
  },

  closeDialog() {
    $('.dialog-overlay').remove();
    $(document).off('click.syncDialog'); // Clean up event handlers
    this.dialogOpen = false;
  },

  showDialogError(message) {
    $('.dialog-error').text(message).show();
  },

  async handleEnableSync(token) {
    // Show loading state
    $('.sync-enable-btn').prop('disabled', true).text('Validating...');

    // Validate token
    const valid = await GistSync.validateToken(token);

    if (!valid) {
      this.showDialogError('Invalid token or no access to gists');
      $('.sync-enable-btn').prop('disabled', false).text('Enable Sync');
      return;
    }

    // Enable sync
    GistSync.setEnabled(true);
    GistSync.setToken(token);

    // Update button
    $('.sync-enable-btn').text('Syncing...');

    // Initial sync - pull then push
    try {
      await GistSync.pullAllGistsFromGitHub(true);

      // Push all local boards that don't have gists
      const boardIndex = SKB.storage.getBoardIndex();
      let uploadCount = 0;

      for (const [boardId, meta] of boardIndex) {
        const gistId = GistSync.getGistId(boardId);
        if (!gistId) {
          // No gist yet - create one
          await GistSync.syncBoardToGist(boardId);
          uploadCount += 1;
        }
      }

      // Update indicator
      this.updateIndicator();

      // Close dialog and show success
      this.closeDialog();
      alert(`Sync enabled! ${boardIndex.size} boards are now syncing.`);
    } catch (error) {
      // Rollback on failure
      GistSync.setEnabled(false);
      GistSync.setToken('');
      this.showDialogError(`Sync failed: ${error.message}`);
      $('.sync-enable-btn').prop('disabled', false).text('Enable Sync');
    }
  },

  handleDisableSync() {
    GistSync.setEnabled(false);
    GistSync.setToken('');
    this.updateIndicator();
    this.closeDialog();
  },

  updateIndicator(state) {
    // state can be: 'synced', 'syncing', 'error', 'offline', or auto-detect
    if (!state) {
      // Auto-detect state
      if (!GistSync.isEnabled()) {
        state = 'disabled';
      } else if (GistSync.isOffline) {
        state = 'offline';
      } else {
        // Check if token is valid by seeing if we have it
        const token = GistSync.getToken();
        if (!token) {
          state = 'error';
        } else {
          state = 'synced';
        }
      }
    }

    const $indicator = $('.sync-indicator');

    switch (state) {
    case 'disabled':
      $indicator.html('').removeClass('synced syncing error offline');
      break;
    case 'synced':
      $indicator.html('✓ ').removeClass('syncing error offline').addClass('synced');
      break;
    case 'syncing':
    case 'offline':
      $indicator.html('✓ ').removeClass('synced error').addClass(state);
      break;
    case 'error':
      $indicator.html('<span class="error-badge">✗</span> ').removeClass('synced syncing offline').addClass('error');
      break;
    }
  },

  countSyncedBoards() {
    const boardIndex = SKB.storage.getBoardIndex();
    let count = 0;
    for (const [boardId, meta] of boardIndex) {
      if (GistSync.getGistId(boardId)) {
        count++;
      }
    }
    return count;
  },

  showError(message) {
    // Show error notification (could be improved with toast)
    console.error('Sync error:', message);
    alert(message);
  },
};

// Auto-initialize when script loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.SyncUI = SyncUI;
    SyncUI.init();
  });
} else {
  window.SyncUI = SyncUI;
  SyncUI.init();
}
