

	/*
	 *	poor man's error handling -- $fixme
	 */
	var easyMartina = false;

	window.onerror = function(message, file, line, col, e){
		var cb1;
		if (! easyMartina) alert("Error occurred: " + (e && e.message ? e.message : message));
		return false;
	};

	window.addEventListener("error", function(e) {
		var cb2;
		if (! easyMartina) alert("Error occurred: " + (e && e.error && e.error.message ? e.error.message : "Unknown error"));
		return false;
	});

	/*
	 *	notes / lists / boards
	 */
	var $tNote = $('tt .note');
	var $tList = $('tt .list');
	var $tBoard = $('tt .board');
	var $tLoad = $('tt .load-board');

	function addNote($list, $after, $before, color)
	{
		var $note  = $tNote.clone();
		var $notes = $list.find('.notes');

		$note.find('.text').html('');
		$note.addClass('brand-new');

		// Set color (default to gray if not provided)
		color = color || 'gray';
		$note.addClass('note-' + color);

		if ($before && $before.length)
		{
			$before.before($note);
			$note = $before.prev();
		}
		else
		if ($after && $after.length)
		{
			$after.after($note);
			$note = $after.next();
		}
		else
		{
			$notes.append($note);
			$note = $notes.find('.note').last();
		}

		$note.find('.text')[0].click();
	}

	function deleteNote($note)
	{
		$note.remove();
		saveBoard();
	}

	function noteLocation($item)
	{
		var loc = 0;
		for (var $p = $item.closest('.note'); $p.length; $p = $p.prev(), loc += 1);
		for (var $p = $item.closest('.list'); $p.length; $p = $p.prev(), loc += 10000);
		return loc;
	}

	//
	function addList()
	{
		var $board = $('.wrap .board');
		var $lists = $board.find('.lists');
		var $list = $tList.clone();

		$list.find('.text').html('');
		$list.find('.head').addClass('brand-new');

		$lists.append($list);
		var $lastText = $board.find('.lists .list .head .text').last();
		if ($lastText.length) $lastText[0].click();

		var lists = $lists[0];
		lists.scrollLeft = Math.max(0, lists.scrollWidth - lists.clientWidth);

		setupListScrolling();
	}

	function deleteList($list)
	{
		var empty = true;

		$list.find('.note .text').each(function(){
			empty &= ($(this).html().length == 0);
		});

		if (! empty && ! confirm("Delete this list and all its notes?"))
			return;

		$list.remove();
		saveBoard();

		setupListScrolling();
	}

	function moveList($list, left)
	{
		var $a = $list;
		var $b = left ? $a.prev() : $a.next();

		var $menu_a = $a.children('.head').find('.menu .bulk');
		var $menu_b = $b.children('.head').find('.menu .bulk');

		var pos_a = $a.offset().left;
		var pos_b = $b.offset().left;

		// Swap lists immediately
		if (left) $list.prev().before($list);
		else      $list.before($list.next());

		saveBoard();
	}

	//
	function openBoard(board_id)
	{
		closeBoard(true);

		SKB.board = SKB.storage.loadBoard(board_id, null);
		SKB.storage.setActiveBoard(board_id);

		showBoard(true);
	}

	function reopenBoard(revision)
	{
		var board_id = SKB.board.id;

		SKB.storage.setBoardRevision(board_id, revision);

		openBoard(board_id);
	}

	function closeBoard(quick)
	{
		if (! SKB.board)
			return;

		var $board = $('.wrap .board');

		$board.remove();

		SKB.board = null;
		SKB.storage.setActiveBoard(null);

//		updateUndoRedo();
		updateBoardIndex();
		updatePageTitle();
	}

	//
	function addBoard()
	{
		closeBoard(true);

		// Find a unique "Untitled Board" name
		var index = SKB.storage.getBoardIndex();
		var existingTitles = [];

		index.forEach(function(meta, board_id) {
			existingTitles.push(meta.title);
		});

		var boardTitle = 'Untitled Board';
		var counter = 2;

		while (existingTitles.indexOf(boardTitle) !== -1) {
			boardTitle = 'Untitled Board ' + counter;
			counter++;
		}

		// Create board with the unique title
		SKB.board = new Board(boardTitle);

		// Add default lists
		var firstList = SKB.board.addList('Ideas/Someday');
		firstList.addNote('Start ideas here.');
		SKB.board.addList('ToDo');
		SKB.board.addList('Doing');
		SKB.board.addList('Done');

		showBoard(true);

		// Save the board immediately so it persists on reload
		saveBoard();

		$('.wrap .board .head').addClass('brand-new');
		$('.wrap .board .head .text')[0].click();
	}

	function saveBoard()
	{
		var $board = $('.wrap .board');
		var board = Object.assign(new Board(), SKB.board); // id, revision & title

		board.lists = [];

		$board.find('.list').each(function(){
			var $list = $(this);
			var l = board.addList( getText($list.find('.head .text')) );

			$list.find('.note').each(function(){
				var $note = $(this);
				var text = getText($note.find('.text'));

				// Extract color from note class
				var color = 'gray';
				var colorClass = $note.attr('class').match(/\bnote-(yellow|blue|green|pink|purple|gray)\b/);
				if (colorClass) {
					color = colorClass[1];
				}

				var n = l.addNote(text, color);
			});
		});

		SKB.storage.saveBoard(board);
		SKB.board = board;

		updateUndoRedo();
		updateBoardIndex();
	}

	function deleteBoard()
	{
		var $list = $('.wrap .board .list');
		var board_id = SKB.board.id;

		if ($list.length && ! confirm("Permanently delete this board and its contents?"))
			return;

		closeBoard();

		SKB.storage.nukeBoard(board_id);

		updateBoardIndex();
	}

	//
	function undoBoard()
	{
		if (! SKB.board)
			return false;

		var hist = SKB.storage.getBoardHistory(SKB.board.id);
		var have = SKB.board.revision;
		var want = 0;

		for (var i=0; i<hist.length-1 && ! want; i++)
			if (have == hist[i])
				want = hist[i+1];

		if (! want)
		{
				return false;
		}

			reopenBoard(want);
		return true;
	}

	function redoBoard()
	{
		if (! SKB.board)
			return false;

		var hist = SKB.storage.getBoardHistory(SKB.board.id);
		var have = SKB.board.revision;
		var want = 0;

		for (var i=1; i<hist.length && ! want; i++)
			if (have == hist[i])
				want = hist[i-1];

		if (! want)
		{
				return false;
		}

			reopenBoard(want);
		return true;
	}

	//
	function showBoard(quick)
	{
		var board = SKB.board;

		var $wrap = $('.wrap');

		var $b = $tBoard.clone();
		var $b_lists = $b.find('.lists');

		$b[0].board_id = board.id;
		setText( $b.find('.head .text'), board.title );

		board.lists.forEach(function(list){

			var $l = $tList.clone();
			var $l_notes = $l.find('.notes');

			setText( $l.find('.head .text'), list.title );

			list.notes.forEach(function(n){
				var $n = $tNote.clone();
				setText( $n.find('.text'), n.text );
				// Apply note color
				var color = n.color || 'gray';
				$n.addClass('note-' + color);
				$l_notes.append($n);
			});

			$b_lists.append($l);
		});

		if (quick)
			$wrap.html('').append($b);
		else
			$wrap.html('').append($b).css({ opacity: 1 });

		updatePageTitle();
		updateUndoRedo();
		updateBoardIndex();
		setupListScrolling();
	}

	/*
	 *	demo board
	 */
	function createDemoBoard()
	{
		// Create board with welcome title
		SKB.board = new Board('Welcome to Sticky Kanban Board');

		// Add default lists
		var firstList = SKB.board.addList('Ideas/Someday');
		firstList.addNote('Awesome running 200% Zoom and Fullscreen');
		firstList.addNote('Lists and Boards can be retitled by clicking on them');
		firstList.addNote('Control-Enter while editing to make a new note below');
		SKB.board.addList('ToDo');
		SKB.board.addList('Doing');
		var doneList = SKB.board.addList('Done');
		doneList.addNote('Ephemeral Process, here. Thinking not tweaking.');

		// Save the board immediately so it persists on reload
		SKB.storage.saveBoard(SKB.board);
		SKB.storage.setActiveBoard(SKB.board.id);

		return SKB.board;
	}

	/*
	 *	board export / import
	 */
	function exportBoard()
	{
		var blob, file;

		if (! SKB.board)
		{
			var index = SKB.storage.getBoardIndex();
			var all = [];

			boards.forEach(function(meta, board_id){
				all.push( SKB.storage.loadBoard(board_id, null) );
			})

			blob = JSON.stringify(all);
			file = `Stickies Board.nbx`;
		}
		else
		{
			var board = SKB.board;
			blob = JSON.stringify(board);
			file = `Stickies Board-${board.id}-${board.title}.nbx`;
		}

		blob = encodeURIComponent(blob);
		blob = "data:application/octet-stream," + blob;

		return { blob: blob, file: file };
	}

	function checkImport(foo)
	{
		var props = [ 'format', 'id', 'revision', 'title', 'lists' ];

		for (var i=0; i<props.length; i++)
			if (! foo.hasOwnProperty(props[i]))
				return "Required board properties are missing.";

		if (! foo.id || ! foo.revision || ! Array.isArray(foo.lists))
			return "Required board properties are empty.";

		if (foo.format != SKB.blobVersion)
			return `Unsupported blob format "${foo.format}", expecting "${SKB.blobVersion}".`;

		return null;
	}

	function importBoard(blob)
	{
		var data;

		try
		{
			data = JSON.parse(blob);
		}
		catch (x)
		{
			alert('File is not in a valid JSON format.');
			return false;
		}

		if (! Array.isArray(data))
			data = [ data ];

		var index = SKB.storage.getBoardIndex();
		var msg, one, all = '';

		for (var i=0; i<data.length; i++)
		{
			var board = data[i];

			var whoops = checkImport(board);
			if (whoops)
			{
				alert(whoops);
				return false;
			}

			var title = board.title || '(untitled board)';
			one =  `"${title}", ID ${board.id}, revision ${board.revision}`;
			all += `    ID ${board.id}, revision ${board.revision} - "${title}"    \n`;
		}

		if (data.length == 1) msg = `Import a board called ${one} ?`;
		else                  msg = `About to import the following boards:\n\n${all}\nProceed?`;

		if (! confirm(msg))
			return false;

		var to_open = '';

		for (var i=0; i<data.length; i++)
		{
			var board = data[i];
			var check_title = true;

			// check ID

			if (index.has(board.id))
			{
				var which = (data.length == 1) ? "with the same ID" : board.id;

				if (confirm(`Board ${which} already exists. Overwrite it?`) &&
				    confirm(`OVERWRITE for sure?`))
				{
						check_title = false;
				}
				else
				if (confirm(`Import the board under a new ID?`))
				{
					var new_id = +new Date();
						board.id = new_id;
				}
				else
				{
						continue;
				}
			}

			if (check_title)
			{
				var retitle = false;
				index.forEach( have => { retitle |= (have.title == board.title) } );

				if (retitle) board.title += ' (imported)';
			}

			// ok, do the deed

			board.revision--; // save will ++ it back

			if (! SKB.storage.saveBoard(board)) // this updates 'index'
			{
				alert(`Failed to save board ${board.id}. Import failed.`);
				return false;
			}

			if (! to_open) to_open = data[0].id;
		}

		if (to_open) openBoard(to_open);
	}


	/*
	 *
	 */
	function saveBoardOrder()
	{
		var $index = $('.boards-dropdown .load-board');
		var spot = 1;

		$index.each(function(){
			var id = parseInt( $(this).attr('board_id') );
			SKB.storage.setBoardUiSpot(id, spot++);
		});
	}

	/*
	 *
	 */
	function updatePageTitle()
	{
		var title = 'Stickies Board';

		if (SKB.board)
		{
			title = SKB.board.title;
			title = 'SB - ' + (title || '(untitled board)');
		}

		document.title = title;
	}

	function updateUndoRedo()
	{
		var $undo = $('header .undo-board');
		var $redo = $('header .redo-board');

		var undo = false;
		var redo = false;

		if (SKB.board && SKB.board.revision)
		{
			var history = SKB.storage.getBoardHistory(SKB.board.id);
			var rev = SKB.board.revision;

			undo = (rev != history[history.length-1]);
			redo = (rev != history[0]);
		}

		if (undo) $undo.show(); else $undo.hide();
		if (redo) $redo.show(); else $redo.hide();
	}

	function updateBoardIndex()
	{
		var $index  = $('.boards-dropdown');
		var $export = $('header .exp-board');

		var $board = $('.wrap .board');
		var id_now = SKB.board && SKB.board.id;
		var empty = true;

		$index.html('');

		var boards = SKB.storage.getBoardIndex();
		var index = [];

		boards.forEach(function(meta, id){ index.push({ id: id, meta: meta }); });

		index.sort(function(a, b){ return b.meta.ui_spot && a.meta.ui_spot > b.meta.ui_spot; });

		index.forEach(function(entry){

			var $e = $tLoad.clone();
			$e.attr('board_id', entry.id);
			$e.html(entry.meta.title);

			if (entry.id == id_now)
				$e.addClass('active');

			$index.append($e);
			empty = false;
		});

		if (! empty)
		{
			if (id_now) $export.html('Export this board...').show();
			else        $export.html('Export all boards...').show();
		}
		else
		{
			$export.hide();
		}
	}


	/*
	 *	generic utils
	 */
	function htmlEncode(raw)
	{
		// Use vanilla JS instead of jQuery hack
		var div = document.createElement('div');
		div.textContent = raw;
		return div.innerHTML;
	}

	function setText($note, text)
	{
		$note.attr('_text', text);

		text = htmlEncode(text);

		var hmmm = /\b(https?:\/\/[^\s]+)/mg;
		text = text.replace(hmmm, function(url){
			return '<a href="' + url + '" target=_blank>' + url + '</a>';
		});

		if ( SKB.peek('fileLinks') )
		{
			var xmmm = /`(.*?)`/mg;
			text = text.replace(xmmm, function(full, text){
				link = 'file:///' + text.replace('\\', '/');
				return '`<a href="' + link + '" target=_blank>' + text + '</a>`';
			});
		}

		$note.html(text); // ? text : ' ');
	}

	function getText($note)
	{
		return $note.attr('_text');
	}

	function removeTextSelection()
	{
		if (window.getSelection) { window.getSelection().removeAllRanges(); }
		else if (document.selection) { document.selection.empty(); }
	}

	/*
	 *	inline editing
	 */
	function startEditing($text, ev)
	{
		var $note = $text.parent();
		var $edit = $note.find('.edit');

		$edit.val( getText($text) );
		$edit.width( $text.width() );

		$edit.height( $text.height() );
		$note.addClass('editing');

		if ($edit.length) $edit[0].focus();
	}

	function stopEditing($edit, via_escape, via_xclick)
	{
		var $item = $edit.parent();
		if (! $item.hasClass('editing'))
			return;

		$item.removeClass('editing');

		//
		var $text = $item.find('.text');
		var text_now = $edit.val().trimRight();
		var text_was = getText( $text );

		//
		var brand_new = $item.hasClass('brand-new');
		$item.removeClass('brand-new');

		if (via_escape)
		{
			if (brand_new)
				$item.closest('.note, .list, .board').remove();
			return;
		}

		if (via_xclick && brand_new && !text_now.length)
		{
			$item.closest('.note, .list, .board').remove();
			return;
		}

		if (text_now != text_was || brand_new)
		{
			setText( $text, text_now );

			if ($item.parent().hasClass('board'))
				SKB.board.title = text_now;

			updatePageTitle();
			saveBoard();
		}

		//
		if (brand_new && $item.hasClass('list'))
			addNote($item);
	}

	function handleTab(ev)
	{
		var $this = $(this);
		var $note = $this.closest('.note');
		var $sibl = ev.shiftKey ? $note.prev() : $note.next();

		if ($sibl.length)
		{
			stopEditing($this, false, false);
			if ($sibl.length) $sibl.find('.text')[0].click();
		}
	}

	// setRevealState removed - Ctrl/CapsLock reveal functionality disabled

	/*
	 *	adjust this and that
	 */
	function adjustLayout()
	{
		var $body = $('body');
		var $board = $('.board');

		if (! $board.length)
			return;

		var list_w = 240;

		var lists = $board.find('.list').length;
		var lists_w = (lists < 2) ? list_w : (list_w + 10) * lists - 10;
		var body_w = $body.width();

		if (lists_w + 190 <= body_w)
		{
			$board.css('max-width', '');
			$body.removeClass('crowded');
		}
		else
		{
			var max = Math.floor( (body_w - 40) / (list_w + 10) );
			max = (max < 2) ? list_w : (list_w + 10) * max - 10;
			$board.css('max-width', max + 'px');
			$body.addClass('crowded');
		}
	}

	//
	function adjustListScroller()
	{
		var $board = $('.board');
		if (! $board.length)
			return;

		var $lists    = $('.board .lists');
		var $scroller = $('.board .lists-scroller');
		var $inner    = $scroller.find('div');

		var max  = $board.width();
		var want = $lists[0].scrollWidth;
		var have = $inner.outerWidth();

		if (want <= max+5)
		{
			$scroller.hide();
			return;
		}

		$scroller.show();
		if (want == have)
			return;

		$inner.width(want);
		cloneScrollPos($lists, $scroller);
	}

	function cloneScrollPos($src, $dst)
	{
		var src = $src[0];
		var dst = $dst[0];

		if (src._busyScrolling)
		{
			src._busyScrolling--;
			return;
		}

		dst._busyScrolling++;
		dst.scrollLeft = src.scrollLeft;
	}

	function setupListScrolling()
	{
		var $lists    = $('.board .lists');
		var $scroller = $('.board .lists-scroller');

		adjustListScroller();

		$lists[0]._busyScrolling = 0;
		$scroller[0]._busyScrolling = 0;

		$scroller.on('scroll', function(){ cloneScrollPos($scroller, $lists); });
		$lists   .on('scroll', function(){ cloneScrollPos($lists, $scroller); });

		adjustLayout();
	}

	/*
	 *	dragsters
	 */
	function initDragAndDrop()
	{
		SKB.noteDrag = new Drag2();
		SKB.noteDrag.listSel = '.board .list .notes';
		SKB.noteDrag.itemSel = '.note';
		SKB.noteDrag.dragster = 'note-dragster';
		SKB.noteDrag.onDragging = function(started)
		{
			var drag = this;
			var $note = $(drag.item);

			if (started)
			{
				var $drag = drag.$drag;

				$drag.html('<div class=titlebar></div><a href=# class=note-icon></a><div class=text></div>');
				$drag.find('.text').html( $note.find('.text').html() );

				// Copy color class from note to dragster
				var colorClass = $note.attr('class').match(/\bnote-(yellow|blue|green|pink|purple|gray)\b/);
				if (colorClass) {
					$drag.addClass(colorClass[0]);
				}

				drag.org_loc = noteLocation($note);
			}
			else
			{
				if (this.org_loc != noteLocation($note))
					saveBoard();
			}
		}

		SKB.loadDrag = new Drag2();
		SKB.loadDrag.listSel = '.boards-dropdown';
		SKB.loadDrag.itemSel = 'a.load-board';
		SKB.loadDrag.dragster = 'load-dragster';
		SKB.loadDrag.onDragging = function(started)
		{
			var drag = this;

			if (started)
			{
				var $drag = drag.$drag;

				$drag.html( $(this.item).html() );
			}
			else
			{
				saveBoardOrder();
			}
		}
	}

	/*
	 *	Initialize SKB object
	 */
	var SKB =
	{
		codeVersion: 20231105,
		blobVersion: 20190412, // board blob format in Storage
		board: null,
		storage: null,
		selectedNote: null,

		peek: function(name)
		{
			return this.storage.getConfig()[name];
		},

		poke: function(name, val)
		{
			var conf = this.storage.getConfig();
			conf[name] = val;
			return this.storage.saveConfig();
		}
	};

	/*
	 *	event handlers
	 */
	// Window blur handler removed - reveal functionality disabled

	// Global hotkeys removed

	$('.wrap').on('click', '.board .text', function(ev){

		if (this.was_dragged)
		{
			this.was_dragged = false;
			return false;
		}

		SKB.noteDrag.cancelPriming();

		// Select this note and enable color menu
		var $note = $(this).closest('.note');
		$('.board .note').removeClass('selected');
		$note.addClass('selected');
		SKB.selectedNote = $note[0];
		$('.color-menu').removeClass('disabled');

		startEditing($(this), ev);
		return false;
	});

	// Special handler for board title in window titlebar
	$('.wrap').on('click', '.board .window-title.head .text', function(ev){
		var $head = $(this).closest('.window-title.head');
		var $edit = $head.find('.edit');
		var $text = $(this);
		var $titleSpan = $head.find('span.title');

		$edit.val( getText($text) );

		// Match the width of the gray title area (span.title)
		// span.title has padding: 0 7px (14px total)
		// edit input has padding: 2px 7px (14px) + border: 1px (2px) = 16px total
		// .width() sets content width, so subtract edit padding+border from span outerWidth
		var titleWidth = $titleSpan.outerWidth() - 16;
		$edit.width(titleWidth);

		$head.addClass('editing');

		if ($edit.length) $edit[0].focus();

		return false;
	});

	// Board title edit keydown handler
	$('.wrap').on('keydown', '.board .window-title.head .edit', function(ev){
		var $this = $(this);
		var $head = $this.closest('.window-title.head');

		// Enter or Escape to finish editing
		if (ev.keyCode == 13 || ev.keyCode == 27)
		{
			var $text = $head.find('.text');
			var text_now = $this.val().trimRight();

			if (ev.keyCode == 13 && text_now)
			{
				setText($text, text_now);
				if (SKB.board) SKB.board.title = text_now;
				saveBoard();
				updateBoardIndex();
			}

			$head.removeClass('editing');
			return false;
		}
	});

	// Board title edit blur handler
	$('.wrap').on('blur', '.board .window-title.head .edit', function(ev){
		var $this = $(this);
		var $head = $this.closest('.window-title.head');
		var $text = $head.find('.text');
		var text_now = $this.val().trimRight();

		if (text_now)
		{
			setText($text, text_now);
			if (SKB.board) SKB.board.title = text_now;
			saveBoard();
			updateBoardIndex();
		}

		$head.removeClass('editing');
	});

	// Board title edit input handler - resize as typing
	$('.wrap').on('input', '.board .window-title.head .edit', function(){
		var $this = $(this);
		var $head = $this.closest('.window-title.head');

		// Calculate what span.title width would be with this text
		// span.title has padding: 0 7px
		var tempSpan = $('<span>').css({
			'font-size': '10px',
			'font-family': $this.css('font-family'),
			'font-weight': 'bold',
			'padding': '0 7px',
			'visibility': 'hidden',
			'position': 'absolute',
			'white-space': 'nowrap'
		}).text($this.val() || 'A').appendTo('body');

		// Get the outerWidth (includes padding) and subtract edit input's padding+border
		var titleOuterWidth = tempSpan.outerWidth();
		tempSpan.remove();

		var contentWidth = titleOuterWidth - 16; // Subtract edit input's padding (14px) + border (2px)
		var maxWidth = $head.width() - 100; // Leave room for buttons

		$this.width(Math.max(100, Math.min(contentWidth, maxWidth)));
	});

	//
	$('.wrap').on('keydown', '.board .edit', function(ev){

		var $this = $(this);
		var $note = $this.closest('.note');
		var $list = $this.closest('.list');

		var isNote = $note.length > 0;
		var isList = $list.length > 0;

		// esc
		if (ev.keyCode == 27)
		{
			stopEditing($this, true, false);
			return false;
		}

		// tab
		if (ev.keyCode == 9)
		{
			handleTab.call(this, ev);
			return false;
		}

		// done
		if (ev.keyCode == 13 && ev.altKey ||
		    ev.keyCode == 13 && ev.shiftKey && ! ev.ctrlKey)
		{
			stopEditing($this, false, false);
			return false;
		}

		// done + add after
		if (ev.keyCode == 13 && ev.ctrlKey)
		{
			stopEditing($this, false, false);

			if (isNote)
			{
				// Get the color of the current note
				var currentColor = 'gray';
				var colorMatch = $note.attr('class').match(/\bnote-(yellow|blue|green|pink|purple|gray)\b/);
				if (colorMatch) {
					currentColor = colorMatch[1];
				}
				addNote($list, $note, null, currentColor);
			}
			else
			if (isList)
			{
				$note = $list.find('.note').last();
				addNote($list, $note);
			}
			else
			{
				addList();
			}

			return false;
		}

		// done on Enter if editing board or list title
		if (ev.keyCode == 13 && ! isNote)
		{
			stopEditing($this, false, false);
			return false;
		}

		// Alt + Arrow and Alt + R hotkeys removed

		// ctrl-shift-8
		if (isNote && ev.key == '*' && ev.ctrlKey)
		{
			var have = this.value;
			var pos  = this.selectionStart;
			var want = have.substr(0, pos) + '\u2022 ' + have.substr(this.selectionEnd);
			$this.val(want);
			this.selectionStart = this.selectionEnd = pos + 2;
			return false;
		}

		return true;
	});

	$('.wrap').on('keypress', '.board .edit', function(ev){

		// tab
		if (ev.keyCode == 9)
		{
			handleTab.call(this, ev);
			return false;
		}
	});

	//
	$('.wrap').on('blur', '.board .edit', function(ev){
		if (document.activeElement != this)
			stopEditing($(this), false, true);
		else
			; // switch away from the browser window
	});

	//
	$('.wrap').on('input propertychange', '.board .note .edit', function(){

		var delta = $(this).outerHeight() - $(this).height();

		$(this).height(10);

		if (this.scrollHeight > this.clientHeight)
			$(this).height(this.scrollHeight - delta);
	});

	//
	// Helper function to flash menu item and handle click
	function flash($el) {
		$el.addClass('menu-flashing');
		setTimeout(function() { $el.removeClass('menu-flashing'); }, 600);
	}
	function handleClick(fn) {
		return function() {
			flash($(this));
			fn.call(this);
			return false;
		};
	}

	$('header').on('click', '.add-board', handleClick(addBoard));

	$('header').on('click', '.add-note-first', handleClick(function(){
		var $fl = $('.wrap .board .lists .list').first();
		if ($fl.length) addNote($fl);
	}));

	// Click handler for Windows menu dropdown
	$('header').on('click', '.load-board', handleClick(function(){
		var board_id = parseInt( $(this).attr('board_id') );
		SKB.loadDrag.cancelPriming();
		if (SKB.board && (SKB.board.id == board_id))
			closeBoard();
		else
			openBoard(board_id);
	}));

	$('header').on('click', '.del-board', handleClick(deleteBoard));
	$('header').on('click', '.undo-board', handleClick(undoBoard));
	$('header').on('click', '.redo-board', handleClick(redoBoard));

	//
	// Color menu handler
	//
	$('header').on('click', '.set-color', handleClick(function(){
		if ($('.color-menu').hasClass('disabled')) return;
		var color = $(this).data('color');
		var $note = $(SKB.selectedNote);
		if (!$note.length) return;
		$note.removeClass('note-yellow note-blue note-green note-pink note-purple note-gray');
		$note.addClass('note-' + color);
		var list_index = $note.closest('.list').index();
		var note_index = $note.index();
		if (SKB.board.lists[list_index] && SKB.board.lists[list_index].notes[note_index]) {
			SKB.board.lists[list_index].notes[note_index].color = color;
			saveBoard();
		}
	}));

	// Update color menu checkmarks when hovering over Color menu
	$('header').on('mouseenter', '.color-menu', function(){
		$('.color-dropdown a').removeClass('active');

		if (SKB.selectedNote) {
			var $note = $(SKB.selectedNote);
			var currentColor = 'gray';

			// Extract color from class
			var classes = $note.attr('class').split(' ');
			for (var i = 0; i < classes.length; i++) {
				if (classes[i].match(/^note-/)) {
					currentColor = classes[i].replace('note-', '');
					break;
				}
			}

			$('.color-dropdown a[data-color="' + currentColor + '"]').addClass('active');
		}
	});

	//
	$('header').on('click', '.add-list', handleClick(addList));

	$('.wrap').on('click', '.board .del-list', function(){
		deleteList( $(this).closest('.list') );
		return false;
	});

	$('.wrap').on('click', '.board .mov-list-l', function(){
		moveList( $(this).closest('.list'), true );
		return false;
	});

	$('.wrap').on('click', '.board .mov-list-r', function(){
		moveList( $(this).closest('.list'), false );
		return false;
	});

	//
	$('.wrap').on('click', '.board .add-note', function(){
		addNote( $(this).closest('.list') );
		return false;
	});

	$('.wrap').on('click', '.board .note-icon', function(){
		deleteNote( $(this).closest('.note') );
		return false;
	});

	//
	// Note selection management
	//

	// Select note when clicking on it (not on text)
	$('.wrap').on('click', '.board .note', function(ev){
		// Don't select if clicking on text (text handler will manage)
		if ($(ev.target).closest('.text').length)
			return;

		// Deselect all notes
		$('.board .note').removeClass('selected');

		// Select this note
		$(this).addClass('selected');
		SKB.selectedNote = this;

		// Enable color menu
		$('.color-menu').removeClass('disabled');

		return false;
	});

	// Deselect when clicking outside notes (but not on header/menus)
	$('.wrap').on('click', function(ev){
		if (!$(ev.target).closest('.note').length && !$(ev.target).closest('header').length) {
			$('.board .note').removeClass('selected');
			SKB.selectedNote = null;

			// Disable color menu
			$('.color-menu').addClass('disabled');
		}
	});

	// Raw note toggle removed
	// Collapse toggle removed

	//
	// Drag from anywhere when NOT editing
	$('.wrap').on('mousedown', '.board .note:not(.editing) .text', function(ev){
		SKB.noteDrag.prime(this.parentNode, ev);
	});

	// Drag from titlebar only when editing
	$('.wrap').on('mousedown', '.board .note.editing .titlebar', function(ev){
		SKB.noteDrag.prime(this.parentNode, ev);
	});

	// Mousedown handler for Windows menu dropdown
	$('header').on('mousedown', 'a.load-board', function(ev){
		if ($('header a.load-board').length > 1)
			SKB.loadDrag.prime(this, ev);
	});

	//
	$(document).on('mouseup', function(ev){
		if (SKB.noteDrag) SKB.noteDrag.end();
		if (SKB.loadDrag) SKB.loadDrag.end();
		if (SKB.varAdjust) SKB.varAdjust.end();
	});

	$(document).on('mousemove', function(ev){
		if (SKB.noteDrag) SKB.noteDrag.onMouseMove(ev);
		if (SKB.loadDrag) SKB.loadDrag.onMouseMove(ev);
		if (SKB.varAdjust) SKB.varAdjust.onMouseMove(ev);
	});

	//
	$('header .imp-board').on('click', handleClick(function(){
		$('header .imp-board-select')[0].click();
	}));

	$('header .imp-board-select').on('change' , function(){
		var files = this.files;
		var reader = new FileReader();
		reader.onload = function(ev){ importBoard(ev.target.result); };
		reader.readAsText(files[0]);
		return true;
	});

	$('header .exp-board').on('click', function(){
		flash($(this));
		var pack = exportBoard();
		$(this).attr('href', pack.blob);
		$(this).attr('download', pack.file);
		return true;
	});

	/***/

	$(window).on('resize', adjustLayout);

	$('body').on('dragstart', function(){ return false; });

	/*
	 *	the init()
	 */
	SKB.storage = new Storage_Local();

	if (! SKB.storage.open())
	{
		easyMartina = true;
		throw new Error();
	}

	var boards = SKB.storage.getBoardIndex();

	boards.forEach( function(meta, board_id) {
		var hist = meta.history.join(', ');
	});

	//
	var conf = SKB.storage.getConfig();


	/*
	 *	the ui
	 */
	initDragAndDrop();

	SKB.varAdjust = new VarAdjust()

	//
	if (conf.board)
		openBoard(conf.board);

	adjustLayout();

	updateBoardIndex();

	SKB.storage.setVerLast();

	//
	if (! SKB.board && ! $('.boards-dropdown .load-board').length)
		SKB.board = createDemoBoard();

	if (SKB.board)
		showBoard(true);

	// Initialize color menu as disabled (will enable when note is selected)
	$('.color-menu').addClass('disabled');

	//
	setInterval(adjustListScroller, 100);

	setupListScrolling();

