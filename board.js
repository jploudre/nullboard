

	function AppConfig()
	{
		this.verLast      = null;           // last used codeVersion
		this.verSeen      = null;           // latest codeVersion they saw the changelog for

		this.maxUndo      = 50;             // board revisions to keep

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
			if (this.conf.verLast == NB.codeVersion)
				return true;

			this.conf.verLast = NB.codeVersion;
			return this.saveConfig();
		}

		setVerSeen(ver)
		{
			this.conf.verSeen = ver || NB.codeVersion;
			return this.saveConfig();
		}

		setActiveBoard(board_id)
		{
			console.log('setActiveBoard [' + this.conf.board + '] -> [' + board_id + ']');

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

				ok_data = this.setJson('board.' + board.id + '.' + board.revision, board);

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

				ok_data = this.setJson('board.' + board.id + '.' + board.revision, board);

				meta.title   = board.title || '(Untitled board)';
				meta.current = board.revision;

				// trim revisions skipped over with undo and cap the revision count

				var rebuild = [ board.revision ];

				for (var rev of meta.history)
				{
					if ( (rev_old < rev && rev < rev_new) || (rebuild.length >= this.conf.maxUndo) )
					{
						this.delItem('board.' + board.id + '.' + rev);
						console.log( `Deleted revision ${rev} of ${board.id} (${board.title})` );
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
			ok_meta = this.setJson('board.' + board.id + '.meta', meta) &&
			          this.setJson('board.' + board.id, meta.current); // for older versions

			board.history = meta.history; // restore

			console.log( `Saved revision ${board.revision} of ${board.id} (${board.title}), ok = ${ok_data} | ${ok_meta}` );
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

			var board = this.getJson('board.' + board_id + '.' + revision);
			if (! board)
				return false;

			if (board.format != NB.blobVersion)
			{
				console.log('Board ' + board_id + '/' + revision + ' format is unsupported');
				console.log('Have [' + board.format + '], need [' + NB.blobVersion);
				return false;
			}

			if (board.revision != revision)
			{
				console.log('Board ' + board_id + '/' + revision + ' revision is wrong');
				console.log('Have [' + board.revision + ']');
				return false;
			}

			board.history = meta.history;

			console.log( `Loaded revision ${board.revision} of ${board.id} (${board.title})` );

			return Object.assign(new Board(), board);
		}

		nukeBoard(board_id)
		{
			var meta = this.boardIndex.get(board_id);

			if (! meta)
				throw `Invalid board_id in nukeBoard(${board_id})`;

			var title = meta.title + '';

			for (var rev of meta.history)
				this.delItem('board.' + board_id + '.' + rev);

			this.delItem('board.' + board_id + '.meta');
			this.boardIndex.delete(board_id);


			console.log( `Deleted board ${board_id} (${title})` );
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

			return this.setJson('board.' + board_id + '.meta', meta) &&
			       this.setJson('board.' + board_id, revision); // for older versions
		}

		setBoardUiSpot(board_id, ui_spot)
		{
			var meta = this.boardIndex.get(board_id);

			if (! meta)
				throw `Invalid board_id in setBoardUiSpot(${board_id}, ${ui_spot})`;

			meta.ui_spot = ui_spot;

			return this.setJson('board.' + board_id + '.meta', meta);
		}

		/*
		 *	private
		 */

		getItem(name) { throw 'implement-me'; }
		setItem(name) { throw 'implement-me'; }
		delItem(name) { throw 'implement-me'; }

		openInner()   { throw 'implement-me'; }
		wipeInner()   { throw 'implement-me'; }

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
				console.log("setJson(" + name + ") failed");
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
		}

		getItem(name)
		{
			return localStorage.getItem('stickiesboard.' + name);
		}

		setItem(name, val)
		{
			localStorage.setItem('stickiesboard.' + name, val);
			return true;
		}

		delItem(name)
		{
			localStorage.removeItem('stickiesboard.' + name);
			return true;
		}

		openInner()
		{
			var conf = this.getJson('config');
			var newInstall = true;

//			if (conf && (conf.format != NB.confVersion))
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
				var m = k.match(/^stickiesboard\.board\.(\d+).meta$/);

				if (! m)
					continue;

				var board_id = parseInt(m[1]);
				var meta = this.getJson('board.' + board_id + '.meta');

				if (! meta.hasOwnProperty('history'))
				{
					console.log( `Invalid meta for board ${board_id}` );
					continue;
				}

				for (var rev of meta.history)
					if (! this.getJson('board.' + board_id + '.' + rev))
					{
						console.log( `Invalid revision ${rev} in history of ${board_id}` );
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
				var m = k.match(/^stickiesboard\.board\.(\d+)$/);

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

			return true;
		}

		wipeInner()
		{
			for (var i=0; i<localStorage.length; )
			{
				var k = localStorage.key(i);
				var m = k.match(/^stickiesboard\./);

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

			console.log( `Rebuilding meta for ${board_id} ...` );

			// get current revision

			meta.current = this.getItem('board.' + board_id); // may be null

			// load history

			var re = new RegExp('^stickiesboard\.board\.' + board_id + '\.(\\d+)$');
			var revs = new Array();

			for (var i=0; i<localStorage.length; i++)
			{
				var m = localStorage.key(i).match(re);
				if (m) revs.push( parseInt(m[1]) );
			}

			if (! revs.length)
			{
				console.log('* No revisions found');
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

			this.setJson('board.' + board_id + '.meta', meta);

			return meta;
		}
	}
