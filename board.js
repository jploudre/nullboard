function AppConfig() {
  this.verLast = null; // last used codeVersion
  this.verSeen = null; // latest codeVersion they saw the changelog for

  this.maxUndo = 20; // board revisions to keep

  this.fileLinks = false; // mark up `foo` as <a href=file:///foo>...</a>

  this.board = null; // active board
}

function BoardMeta() {
  this.title = '';
  this.current = 1; // revision
  this.uiSpot = 0; // 0 = not set
  this.history = []; // revision IDs
}

class Storage {
  constructor() {
    this.type = '?';

    this.conf = new AppConfig();
    this.boardIndex = new Map();
  }

  open() {
    return this.openInner();
  }

  wipe() {
    return this.wipeInner();
  }

  getConfig() {
    return this.conf;
  }

  setVerLast() {
    if (this.conf.verLast === SKB.codeVersion) return true;

    this.conf.verLast = SKB.codeVersion;
    return this.saveConfig();
  }

  setVerSeen(ver) {
    this.conf.verSeen = ver || SKB.codeVersion;
    return this.saveConfig();
  }

  setActiveBoard(boardId) {
    const meta = boardId ? this.boardIndex.get(boardId) : true;

    if (!meta) throw `Invalid boardId in setActiveBoard(... ${boardId})`;

    if (this.conf.board === boardId) return true;

    this.conf.board = boardId;
    return this.saveConfig();
  }

  saveConfig() {
    return this.setJson('config', this.conf);
  }

  //

  getBoardIndex() {
    return this.boardIndex;
  }

  saveBoard(board) {
    /*
			 *	1. assign new revision (next unused)
			 *	2. trim all in-between revisions bypassed by undos if any
			 *	3. cap history as per config
			 */
    let meta = this.boardIndex.get(board.id);
    let okData; let
      okMeta;

    delete board.history; // remove temporarily

    if (!meta) {
      board.revision = 1;

      okData = this.setJson(this.bk(board.id, board.revision), board);

      meta = new BoardMeta();
      meta.title = board.title || '(Untitled board)';
      meta.current = board.revision;
      meta.history = [board.revision];

      this.boardIndex.set(board.id, meta);
    } else {
      const revOld = board.revision;
      const revNew = meta.history[0] + 1;

      board.revision = revNew;

      okData = this.setJson(this.bk(board.id, board.revision), board);

      meta.title = board.title || '(Untitled board)';
      meta.current = board.revision;

      // trim revisions skipped over with undo and cap the revision count

      const rebuild = [board.revision];

      for (const rev of meta.history) {
        if ((revOld < rev && rev < revNew) || (rebuild.length >= this.conf.maxUndo)) {
          this.delItem(`board.${board.id}.${rev}`);
        } else {
          rebuild.push(rev);
        }
      }

      meta.history = rebuild;
    }

    /*
			 *	save meta
			 */
    okMeta = this.setJson(this.bmk(board.id), meta)
			          && this.setJson(`board.${board.id}`, meta.current); // for older versions

    board.history = meta.history; // restore

    // Trigger sync if enabled
    if (window.GistSync && window.GistSync.isEnabled()) {
      window.GistSync.queueBoardForSync(board.id);
    }

    return okData && okMeta;
  }

  loadBoard(boardId, revision) {
    const meta = this.boardIndex.get(boardId);

    if (!meta) throw `Invalid boardId in loadBoard(${boardId}, ${revision})`;

    if (revision == null) revision = meta.current;

    if (!meta.history.includes(revision)) throw `Invalid revision in loadBoard(${boardId}, ${revision})`;

    const board = this.getJson(this.bk(boardId, revision));
    if (!board) return false;

    // Accept both old (20190412) and new (20251115) format versions
    const validFormats = [20190412, 20251115];
    if (!validFormats.includes(board.format)) {
      return false;
    }

    if (board.revision !== revision) {
      return false;
    }

    board.history = meta.history;

    return Object.assign(new Board(), board);
  }

  nukeBoard(boardId) {
    const meta = this.boardIndex.get(boardId);

    if (!meta) throw `Invalid boardId in nukeBoard(${boardId})`;

    const title = `${meta.title}`;

    for (const rev of meta.history) this.delItem(this.bk(boardId, rev));

    this.delItem(this.bmk(boardId));
    this.boardIndex.delete(boardId);

    // Delete gist if sync enabled
    if (window.GistSync && window.GistSync.isEnabled()) {
      const gistId = window.GistSync.getGistId(boardId);
      if (gistId) {
        window.GistSync.deleteGist(gistId).catch((error) => {
          console.error('Failed to delete gist:', error);
          // Add to retry queue
          window.GistSync.addToRetryQueue(boardId);
        });
        window.GistSync.deleteGistId(boardId);
      }
    }

    return title;
  }

  getBoardHistory(boardId) {
    const meta = this.boardIndex.get(boardId);

    if (!meta) throw `Invalid boardId in getBoardHistory(${boardId})`;

    return meta.history;
  }

  setBoardRevision(boardId, revision) {
    const meta = this.boardIndex.get(boardId);

    if (!meta) throw `Invalid boardId in setBoardRevision(${boardId}, ${revision})`;

    if (!meta.history.includes(revision)) throw `Invalid revision in setBoardRevision(${boardId}, ${revision})`;

    if (meta.current === revision) // wth
    { return true; }

    meta.current = revision;

    return this.setJson(this.bmk(boardId), meta)
			       && this.setJson(this.bk(boardId), revision); // for older versions
  }

  setBoardUiSpot(boardId, uiSpot) {
    const meta = this.boardIndex.get(boardId);

    if (!meta) throw `Invalid boardId in setBoardUiSpot(${boardId}, ${uiSpot})`;

    meta.uiSpot = uiSpot;

    return this.setJson(this.bmk(boardId), meta);
  }

  /*
		 *	private
		 */

  getItem(_name) { throw 'implement-me'; }

  setItem(_name) { throw 'implement-me'; }

  delItem(_name) { throw 'implement-me'; }

  openInner() { throw 'implement-me'; }

  wipeInner() { throw 'implement-me'; }

  bk(id, rev) { return `board.${id}${rev !== undefined ? `.${rev}` : ''}`; }

  bmk(id) { return `board.${id}.meta`; }

  getJson(name) {
    let foo = this.getItem(name);
    if (!foo) return false;

    try { foo = JSON.parse(foo); } catch (x) { return false; }
    return foo;
  }

  setJson(name, val) {
    if (!this.setItem(name, JSON.stringify(val))) {
      return false;
    }

    return true;
  }

  /*
		 *	config
		 */
  fixupConfig(_newInstall) {
    // const { conf } = this;
  }
}

class StorageLocal extends Storage {
  constructor() {
    super();
    this.type = 'LocalStorage';
    this.pfx = 'stickiesboard.';
  }

  getItem(name) {
    return localStorage.getItem(this.pfx + name);
  }

  setItem(name, val) {
    localStorage.setItem(this.pfx + name, val);
    return true;
  }

  delItem(name) {
    localStorage.removeItem(this.pfx + name);
    return true;
  }

  openInner() {
    const conf = this.getJson('config');
    let newInstall = true;

    //			if (conf && (conf.format !== SKB.confVersion))
    //			{
    //				if (! confirm('Preferences are stored in an unsupported format. Reset them?'))
    //					return false;
    //
    //				conf = null;
    //			}

    if (conf) {
      this.conf = Object.assign(new AppConfig(), conf);
    } else {
      if (this.getItem('fsize') === 'z1') {
      }

      if (!this.setJson('config', this.conf)) {
        this.conf = null;
        return false;
      }

      this.conf.board = this.getItem('last_board');
    }

    this.boardIndex = new Map();

    // new format

    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      const m = k.match(new RegExp(`^${this.pfx}board\\.(\\d+).meta$`));

      if (!m) continue;

      const boardId = parseInt(m[1]);
      let meta = this.getJson(this.bmk(boardId));

      if (!meta.hasOwnProperty('history')) {
        continue;
      }

      for (const rev of meta.history) {
        if (!this.getJson(this.bk(boardId, rev))) {
          meta = this.rebuildMeta(boardId);
          break;
        }
      }

      if (!meta) continue;

      meta = Object.assign(new BoardMeta(), meta);
      this.boardIndex.set(boardId, meta);
    }

    // old format

    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      const m = k.match(new RegExp(`^${this.pfx}board\\.(\\d+)$`));

      if (!m) continue;

      newInstall = false;

      const boardId = parseInt(m[1]);
      if (this.boardIndex.has(boardId)) continue;

      let meta = this.rebuildMeta(boardId);
      if (!meta) continue;

      meta = Object.assign(new BoardMeta(), meta);
      this.boardIndex.set(boardId, meta);
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

  wipeInner() {
    for (let i = 0; i < localStorage.length;) {
      const k = localStorage.key(i);
      const m = k.indexOf(this.pfx) === 0;

      if (m) localStorage.removeItem(k);
      else i += 1;
    }

    this.conf = new AppConfig();
    this.boardIndex = new Map();
  }

  /*
		 *	private
		 */
  rebuildMeta(boardId) {
    const meta = new BoardMeta();

    // get current revision

    meta.current = this.getItem(`board.${boardId}`); // may be null

    // load history

    const re = new RegExp(`^${this.pfx}board.${boardId}\\.(\\d+)$`);
    const revs = new Array();

    for (let i = 0; i < localStorage.length; i += 1) {
      const m = localStorage.key(i).match(re);
      if (m) revs.push(parseInt(m[1]));
    }

    if (!revs.length) {
      this.delItem(`board.${boardId}`);
      return false;
    }

    revs.sort((a, b) => b - a);
    meta.history = revs;

    // validate current revision

    if (!meta.history.includes(meta.current)) meta.current = meta.history[meta.history.length - 1];

    // get board title

    const board = this.getJson(`board.${boardId}.${meta.current}`);
    meta.title = (board.title || '(untitled board)');

    this.setJson(this.bmk(boardId), meta);

    return meta;
  }
}
