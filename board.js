

	function AppConfig()
	{
		this.verLast      = null;           // last used codeVersion
		this.verSeen      = null;           // latest codeVersion they saw the changelog for

		this.maxUndo      = 20;             // board revisions to keep

		this.fileLinks    = false;          // mark up `foo` as <a href=file:///foo>...</a>

		this.board        = null;           // active board
	}

	function BoardMeta()
	{
		this.title   = '';
		this.current = 1;                   // revision
		this.ui_spot = 0;                   // 0 = not set
		this.history = [ ];                 // revision IDs
	}

	class Storage
	{
		constructor()
		{
			this.type = '?';

			this.conf = new AppConfig();
			this.boardIndex = new Map();

		}

		open()
		{
			return this.openInner();
		}

		wipe()
		{
			return this.wipeInner();
		}

		getConfig()
		{
			return this.conf;
		}

		setVerLast()
		{
			if (this.conf.verLast == SKB.codeVersion)
				return true;

			this.conf.verLast = SKB.codeVersion;
			return this.saveConfig();
		}

		setVerSeen(ver)
		{
			this.conf.verSeen = ver || SKB.codeVersion;
			return this.saveConfig();
		}

		setActiveBoard(board_id)
		{
				var meta = board_id ? this.boardIndex.get(board_id) : true;

			if (! meta)
				throw `Invalid board_id in setActiveBoard(... ${board_id})`;

			if (this.conf.board == board_id)
				return true;

			this.conf.board = board_id;
			return this.saveConfig();
		}

		saveConfig()
		{
			return this.setJson('config', this.conf);
		}

		//

		getBoardIndex()
		{
			return this.boardIndex;
		}

		saveBoard(board)
		{
			/*
			 *	1. assign new revision (next unused)
			 *	2. trim all in-between revisions bypassed by undos if any
			 *	3. cap history as per config
			 */
			var meta = this.boardIndex.get(board.id);
			var ok_data, ok_meta;

			delete board.history; // remove temporarily

			if (! meta)
			{
				board.revision = 1;

				ok_data = this.setJson(this.bk(board.id, board.revision), board);

				meta = new BoardMeta();
				meta.title   = board.title || '(Untitled board)';
				meta.current = board.revision;
				meta.history = [ board.revision ];

				this.boardIndex.set(board.id, meta);
			}
			else
			{
				var rev_old = board.revision;
				var rev_new = meta.history[0] + 1;

				board.revision = rev_new;

				ok_data = this.setJson(this.bk(board.id, board.revision), board);

				meta.title   = board.title || '(Untitled board)';
				meta.current = board.revision;

				// trim revisions skipped over with undo and cap the revision count

				var rebuild = [ board.revision ];

				for (var rev of meta.history)
				{
					if ( (rev_old < rev && rev < rev_new) || (rebuild.length >= this.conf.maxUndo) )
					{
						this.delItem('board.' + board.id + '.' + rev);
								}
					else
					{
						rebuild.push(rev);
					}
				}

				meta.history = rebuild;
			}

			/*
			 *	save meta
			 */
			ok_meta = this.setJson(this.bmk(board.id), meta) &&
			          this.setJson('board.' + board.id, meta.current); // for older versions

			board.history = meta.history; // restore

			// Trigger sync if enabled
			if (window.GistSync && window.GistSync.isEnabled()) {
				window.GistSync.queueBoardForSync(board.id);
			}

				return ok_data && ok_meta;
		}

		loadBoard(board_id, revision)
		{
			var meta = this.boardIndex.get(board_id);

			if (! meta)
				throw `Invalid board_id in loadBoard(${board_id}, ${revision})`;

			if (revision == null)
				revision = meta.current;

			if (! meta.history.includes(revision))
				throw `Invalid revision in loadBoard(${board_id}, ${revision})`;

			var board = this.getJson(this.bk(board_id, revision));
			if (! board)
				return false;

			// Accept both old (20190412) and new (20251115) format versions
			const validFormats = [20190412, 20251115];
			if (!validFormats.includes(board.format))
			{
						return false;
			}

			if (board.revision != revision)
			{
						return false;
			}

			board.history = meta.history;

				return Object.assign(new Board(), board);
		}

		nukeBoard(board_id)
		{
			var meta = this.boardIndex.get(board_id);

			if (! meta)
				throw `Invalid board_id in nukeBoard(${board_id})`;

			var title = meta.title + '';

			for (var rev of meta.history)
				this.delItem(this.bk(board_id, rev));

			this.delItem(this.bmk(board_id));
			this.boardIndex.delete(board_id);

			// Delete gist if sync enabled
			if (window.GistSync && window.GistSync.isEnabled()) {
				const gistId = window.GistSync.getGistId(board_id);
				if (gistId) {
					window.GistSync.deleteGist(gistId).catch(error => {
						console.error('Failed to delete gist:', error);
						// Add to retry queue
						window.GistSync.addToRetryQueue(board_id);
					});
					window.GistSync.deleteGistId(board_id);
				}
			}

			return title;
			}

		getBoardHistory(board_id)
		{
			var meta = this.boardIndex.get(board_id);

			if (! meta)
				throw `Invalid board_id in getBoardHistory(${board_id})`;

			return meta.history;
		}

		setBoardRevision(board_id, revision)
		{
			var meta = this.boardIndex.get(board_id);

			if (! meta)
				throw `Invalid board_id in setBoardRevision(${board_id}, ${revision})`;

			if (! meta.history.includes(revision))
				throw `Invalid revision in setBoardRevision(${board_id}, ${revision})`;

			if (meta.current == revision) // wth
				return true;

			meta.current = revision;

			return this.setJson(this.bmk(board_id), meta) &&
			       this.setJson(this.bk(board_id), revision); // for older versions
		}

		setBoardUiSpot(board_id, ui_spot)
		{
			var meta = this.boardIndex.get(board_id);

			if (! meta)
				throw `Invalid board_id in setBoardUiSpot(${board_id}, ${ui_spot})`;

			meta.ui_spot = ui_spot;

			return this.setJson(this.bmk(board_id), meta);
		}

		/*
		 *	private
		 */

		getItem(name) { throw 'implement-me'; }
		setItem(name) { throw 'implement-me'; }
		delItem(name) { throw 'implement-me'; }

		openInner()   { throw 'implement-me'; }
		wipeInner()   { throw 'implement-me'; }

		bk(id, rev) { return 'board.' + id + (rev !== undefined ? '.' + rev : ''); }
		bmk(id) { return 'board.' + id + '.meta'; }

		getJson(name)
		{
			var foo = this.getItem(name);
			if (! foo) return false;

			try { foo = JSON.parse(foo); } catch (x) { return false; }
			return foo;
		}

		setJson(name, val)
		{
			if (! this.setItem(name, JSON.stringify(val)))
			{
					return false;
			}

			return true;
		}

		/*
		 *	config
		 */
		fixupConfig(newInstall)
		{
			var conf = this.conf;
		}

	};

	class Storage_Local extends Storage
	{
		constructor()
		{
			super();
			this.type = 'LocalStorage';
			this.pfx = 'stickiesboard.';
		}

		getItem(name)
		{
			return localStorage.getItem(this.pfx + name);
		}

		setItem(name, val)
		{
			localStorage.setItem(this.pfx + name, val);
			return true;
		}

		delItem(name)
		{
			localStorage.removeItem(this.pfx + name);
			return true;
		}

		openInner()
		{
			var conf = this.getJson('config');
			var newInstall = true;

//			if (conf && (conf.format != SKB.confVersion))
//			{
//				if (! confirm('Preferences are stored in an unsupported format. Reset them?'))
//					return false;
//
//				conf = null;
//			}

			if (conf)
			{
				this.conf = Object.assign(new AppConfig(), conf);
			}
			else
			{
				if (this.getItem('fsize') == 'z1')
				{
						}

				if (! this.setJson('config', this.conf))
				{
					this.conf = null;
					return false;
				}

				this.conf.board = this.getItem('last_board');
			}

			this.boardIndex = new Map();

			// new format

			for (var i=0; i<localStorage.length; i++)
			{
				var k = localStorage.key(i);
				var m = k.match(new RegExp('^' + this.pfx + 'board\\.(\\d+).meta$'));

				if (! m)
					continue;

				var board_id = parseInt(m[1]);
				var meta = this.getJson(this.bmk(board_id));

				if (! meta.hasOwnProperty('history'))
				{
						continue;
				}

				for (var rev of meta.history)
					if (! this.getJson(this.bk(board_id, rev)))
					{
							meta = this.rebuildMeta(board_id);
						break;
					}

				if (! meta)
					continue;

				meta = Object.assign(new BoardMeta(), meta);
				this.boardIndex.set(board_id, meta);
			}

			// old format

			for (var i=0; i<localStorage.length; i++)
			{
				var k = localStorage.key(i);
				var m = k.match(new RegExp('^' + this.pfx + 'board\\.(\\d+)$'));

				if (! m)
					continue;

				newInstall = false;

				var board_id = parseInt(m[1]);
				if (this.boardIndex.has(board_id))
					continue;

				var meta = this.rebuildMeta(board_id);
				if (! meta)
					continue;

				meta = Object.assign(new BoardMeta(), meta);
				this.boardIndex.set(board_id, meta);
			}

			this.fixupConfig(newInstall);

			this.type = 'LocalStorage';

			// Pull from GitHub if sync enabled
			console.log('Checking if sync is enabled...', 'GistSync exists:', !!window.GistSync, 'Sync enabled:', window.GistSync ? window.GistSync.isEnabled() : 'N/A');
			if (window.GistSync && window.GistSync.isEnabled()) {
				console.log('Sync is enabled, scheduling pull from GitHub in 100ms');
				// Pull in background (don't block app load)
				setTimeout(async () => {
					try {
						await window.GistSync.pullAllGistsFromGitHub();

						// Reload current board if it was updated
						if (this.conf.board) {
							const currentBoardId = this.conf.board;
							const updatedBoard = this.loadBoard(currentBoardId);
							if (updatedBoard && window.SKB) {
								window.SKB.board = updatedBoard;
								// Trigger UI refresh if needed
								if (window.refreshBoard) {
									window.refreshBoard();
								}
							}
						}
					} catch (error) {
						console.error('Initial sync pull failed:', error);
					}
				}, 100);
			}

			return true;
		}

		wipeInner()
		{
			for (var i=0; i<localStorage.length; )
			{
				var k = localStorage.key(i);
				var m = k.indexOf(this.pfx) === 0;

				if (m) localStorage.removeItem(k);
				else   i++;
			}

			this.conf = new AppConfig();
			this.boardIndex = new Map();
		}

		/*
		 *	private
		 */
		rebuildMeta(board_id)
		{
			var meta = new BoardMeta();

				// get current revision

			meta.current = this.getItem('board.' + board_id); // may be null

			// load history

			var re = new RegExp('^' + this.pfx + 'board.' + board_id + '\\.(\\d+)$');
			var revs = new Array();

			for (var i=0; i<localStorage.length; i++)
			{
				var m = localStorage.key(i).match(re);
				if (m) revs.push( parseInt(m[1]) );
			}

			if (! revs.length)
			{
					this.delItem('board.' + board_id);
				return false;
			}

			revs.sort(function(a,b){ return b-a; });
			meta.history = revs;

			// validate current revision

			if (! meta.history.includes(meta.current))
				meta.current = meta.history[meta.history.length-1];

			// get board title

			var board = this.getJson('board.' + board_id + '.' + meta.current)
			meta.title = (board.title || '(untitled board)');

			this.setJson(this.bmk(board_id), meta);

			return meta;
		}
	}
