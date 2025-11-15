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

	// Placeholder functions to be implemented
	validateToken: async function(token) { },
	createGist: async function(boardId, boardData) { },
	updateGist: async function(gistId, boardData) { },
	fetchGist: async function(gistId) { },
	listAllGists: async function() { },
	deleteGist: async function(gistId) { },
	syncBoardToGist: async function(boardId) { },
	pullAllGistsFromGitHub: async function() { },
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
