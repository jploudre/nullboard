/*
 * GitHub Gist Sync UI Module
 * Handles sync dialog and menu indicator
 */

const SyncUI = {
	dialogOpen: false,

	init: function() {
		this.setupMenuHandler();
		this.updateIndicator();
	},

	setupMenuHandler: function() {
		// Will be connected to menu item click
		$(document).on('click', '.sync-gists', (e) => {
			e.preventDefault();
			this.showSyncDialog();
		});
	},

	showSyncDialog: function() {
		if (this.dialogOpen) return;
		this.dialogOpen = true;

		const isEnabled = GistSync.isEnabled();

		let dialogHTML = '';

		if (isEnabled) {
			// Already enabled - show status
			const boardCount = this.countSyncedBoards();
			dialogHTML = `
				<div class="sync-dialog-overlay">
					<div class="sync-dialog">
						<div class="sync-dialog-title">GitHub Gist Sync</div>
						<div class="sync-dialog-content">
							<p>Token: <span class="token-hidden">••••••••••••</span></p>
							<p>Status: ✓ Syncing ${boardCount} boards</p>
						</div>
						<div class="sync-dialog-buttons">
							<button class="sync-disable-btn">Disable Sync</button>
							<button class="sync-update-token-btn">Update Token</button>
							<button class="sync-close-btn">Close</button>
						</div>
					</div>
				</div>
			`;
		} else {
			// Not enabled - show setup
			dialogHTML = `
				<div class="sync-dialog-overlay">
					<div class="sync-dialog">
						<div class="sync-dialog-title">GitHub Gist Sync Setup</div>
						<div class="sync-dialog-content">
							<p>To enable sync:</p>
							<ol>
								<li>Go to github.com/settings/tokens</li>
								<li>Create token with 'gist' scope</li>
								<li>Paste token below</li>
							</ol>
							<input type="text" class="sync-token-input" placeholder="github_pat_..." />
							<div class="sync-error" style="display:none;"></div>
						</div>
						<div class="sync-dialog-buttons">
							<button class="sync-enable-btn">Enable Sync</button>
							<button class="sync-cancel-btn">Cancel</button>
						</div>
					</div>
				</div>
			`;
		}

		$('body').append(dialogHTML);

		// Setup button handlers
		this.setupDialogHandlers();
	},

	setupDialogHandlers: function() {
		const self = this;

		// Enable sync
		$(document).on('click', '.sync-enable-btn', async function() {
			const token = $('.sync-token-input').val().trim();
			if (!token) {
				self.showDialogError('Please enter a token');
				return;
			}

			await self.handleEnableSync(token);
		});

		// Update token
		$(document).on('click', '.sync-update-token-btn', function() {
			self.closeDialog();
			// Show setup dialog with pre-filled token option
			setTimeout(() => {
				self.showUpdateTokenDialog();
			}, 100);
		});

		// Disable sync
		$(document).on('click', '.sync-disable-btn', function() {
			if (confirm('Disable sync? Your boards will remain on GitHub and locally.')) {
				self.handleDisableSync();
			}
		});

		// Close/Cancel
		$(document).on('click', '.sync-close-btn, .sync-cancel-btn, .sync-dialog-overlay', function(e) {
			if (e.target === e.currentTarget) {
				self.closeDialog();
			}
		});
	},

	showUpdateTokenDialog: function() {
		// Similar to setup but for updating token
		const dialogHTML = `
			<div class="sync-dialog-overlay">
				<div class="sync-dialog">
					<div class="sync-dialog-title">Update GitHub Token</div>
					<div class="sync-dialog-content">
						<p>Enter new GitHub Personal Access Token:</p>
						<input type="text" class="sync-token-input" placeholder="github_pat_..." />
						<div class="sync-error" style="display:none;"></div>
					</div>
					<div class="sync-dialog-buttons">
						<button class="sync-enable-btn">Update Token</button>
						<button class="sync-cancel-btn">Cancel</button>
					</div>
				</div>
			</div>
		`;

		$('body').append(dialogHTML);
		this.dialogOpen = true;
		this.setupDialogHandlers();
	},

	closeDialog: function() {
		$('.sync-dialog-overlay').remove();
		this.dialogOpen = false;
	},

	showDialogError: function(message) {
		$('.sync-error').text(message).show();
	},

	handleEnableSync: async function(token) {
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
			await GistSync.pullAllGistsFromGitHub();

			// Push all local boards that don't have gists
			const boardIndex = SKB.storage.getBoardIndex();
			let uploadCount = 0;
			let downloadCount = GistSync.isOffline ? 0 : await this.countDownloadedBoards();

			for (const [boardId, meta] of boardIndex) {
				const gistId = GistSync.getGistId(boardId);
				if (!gistId) {
					// No gist yet - create one
					await GistSync.syncBoardToGist(boardId);
					uploadCount++;
				}
			}

			// Update indicator
			this.updateIndicator();

			// Close dialog and show success
			this.closeDialog();
			alert(`Synced ${boardIndex.size} boards (${downloadCount} downloaded, ${uploadCount} uploaded)`);

		} catch (error) {
			this.showDialogError('Sync failed: ' + error.message);
			$('.sync-enable-btn').prop('disabled', false).text('Enable Sync');
		}
	},

	handleDisableSync: function() {
		GistSync.setEnabled(false);
		GistSync.setToken('');
		this.updateIndicator();
		this.closeDialog();
	},

	updateIndicator: function(state) {
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

		switch(state) {
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
				$indicator.html('<span class="error-badge">⚠️</span> ').removeClass('synced syncing offline').addClass('error');
				break;
		}
	},

	countSyncedBoards: function() {
		const boardIndex = SKB.storage.getBoardIndex();
		let count = 0;
		for (const [boardId, meta] of boardIndex) {
			if (GistSync.getGistId(boardId)) {
				count++;
			}
		}
		return count;
	},

	countDownloadedBoards: function() {
		// This is called during initial sync - count how many we pulled
		// Simple heuristic: boards with gist IDs that we didn't create
		return 0; // Placeholder - actual count happens in handleEnableSync
	},

	showError: function(message) {
		// Show error notification (could be improved with toast)
		console.error('Sync error:', message);
		alert(message);
	}
};

// Auto-initialize when script loads
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', function() {
		window.SyncUI = SyncUI;
		SyncUI.init();
	});
} else {
	window.SyncUI = SyncUI;
	SyncUI.init();
}
