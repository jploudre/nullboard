/*
	 *	poor man's error handling -- $fixme
	 */
let easyMartina = false;

window.onerror = function (message, _file, _line, _col, e) {
  if (!easyMartina) alert(`Error occurred: ${e && e.message ? e.message : message}`);
  return false;
};

window.addEventListener('error', (e) => {
  if (!easyMartina) alert(`Error occurred: ${e && e.error && e.error.message ? e.error.message : 'Unknown error'}`);
  return false;
});

/*
	 *	notes / lists / boards
	 */
const $tNote = $('#templates .note');
const $tList = $('#templates .list');
const $tBoard = $('#templates .board');
const $tLoad = $('#templates .load-board');

function addNote($list, $after, $before, color) {
  let $note = $tNote.clone();
  const $notes = $list.find('.notes');

  $note.find('.text').html('');
  $note.addClass('brand-new');

  // Set color (default to gray if not provided)
  color = color || 'gray';
  $note.addClass(`note-${color}`);

  if ($before && $before.length) {
    $before.before($note);
    $note = $before.prev();
  } else
    if ($after && $after.length) {
      $after.after($note);
      $note = $after.next();
    } else {
      $notes.append($note);
      $note = $notes.find('.note').last();
    }

  $note.find('.text')[0].click();
}

function deleteNote($note) {
  $note.remove();
  saveBoard();
}

function noteLocation($item) {
  let loc = 0;
  for (let $p = $item.closest('.note'); $p.length; $p = $p.prev(), loc += 1);
  for (let $p = $item.closest('.list'); $p.length; $p = $p.prev(), loc += 10000);
  return loc;
}

//
function addList() {
  const $board = $('.wrap .board');
  const $lists = $board.find('.lists');
  const $list = $tList.clone();

  $list.find('.text').html('');
  $list.find('.head').addClass('brand-new');

  $lists.append($list);
  const $lastText = $board.find('.lists .list .head .text').last();
  if ($lastText.length) $lastText[0].click();

  const lists = $lists[0];
  lists.scrollLeft = Math.max(0, lists.scrollWidth - lists.clientWidth);

  setupListScrolling();
}

function deleteList($list) {
  let empty = true;

  $list.find('.note .text').each(function () {
    empty &= ($(this).html().length === 0);
  });

  if (!empty && !confirm('Delete this list and all its notes?')) return;

  $list.remove();
  saveBoard();

  setupListScrolling();
}

function moveList($list, left) {
  const $a = $list;
  const $b = left ? $a.prev() : $a.next();

  const _$menuA = $a.children('.head').find('.menu .bulk');
  const _$menuB = $b.children('.head').find('.menu .bulk');

  const _pos_a = $a.offset().left;
  const _pos_b = $b.offset().left;

  // Swap lists immediately
  if (left) $list.prev().before($list);
  else $list.before($list.next());

  saveBoard();
}

//
function openBoard(boardId) {
  closeBoard(true);

  SKB.board = SKB.storage.loadBoard(boardId, null);
  SKB.storage.setActiveBoard(boardId);

  showBoard(true);
}

function reopenBoard(revision) {
  const boardId = SKB.board.id;

  SKB.storage.setBoardRevision(boardId, revision);

  openBoard(boardId);
}

function closeBoard(_quick) {
  if (!SKB.board) return;

  const $board = $('.wrap .board');

  $board.remove();

  SKB.board = null;
  SKB.storage.setActiveBoard(null);

  //		updateUndoRedo();
  updateBoardIndex();
  updatePageTitle();
}

//
function addBoard() {
  closeBoard(true);

  // Find a unique "Untitled Board" name
  const index = SKB.storage.getBoardIndex();
  const existingTitles = [];

  index.forEach((meta, _boardId) => {
    existingTitles.push(meta.title);
  });

  let boardTitle = 'Untitled Board';
  let counter = 2;

  while (existingTitles.indexOf(boardTitle) !== -1) {
    boardTitle = `Untitled Board ${counter}`;
    counter++;
  }

  // Create board with the unique title
  SKB.board = new Board(boardTitle);

  // Add default lists
  const firstList = SKB.board.addList('Ideas/Someday');
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

function saveBoard() {
  const $board = $('.wrap .board');
  const board = Object.assign(new Board(), SKB.board); // id, revision & title

  board.lists = [];

  $board.find('.list').each(function () {
    const $list = $(this);
    const l = board.addList(getText($list.find('.head .text')));

    $list.find('.note').each(function () {
      const $note = $(this);
      const text = getText($note.find('.text'));

      // Extract color from note class
      let color = 'gray';
      const colorClass = $note.attr('class').match(/\bnote-(yellow|blue|green|pink|purple|gray)\b/);
      if (colorClass) {
        color = colorClass[1];
      }

      const _n = l.addNote(text, color);
    });
  });

  SKB.storage.saveBoard(board);
  SKB.board = board;

  updateUndoRedo();
  updateBoardIndex();
}

function deleteBoard() {
  const _$list = $('.wrap .board .list');
  const boardId = SKB.board.id;

  closeBoard();

  // Cancel any pending sync for this board
  if (window.GistSync && window.GistSync.cancelPendingSync) {
    window.GistSync.cancelPendingSync(boardId);
  }

  SKB.storage.nukeBoard(boardId);

  updateBoardIndex();

  // If no boards remain, create the demo board
  if (SKB.storage.getBoardIndex().size === 0) {
    createDemoBoard();
    showBoard(true);
    selectWelcomeBoardNote();
  }
}

//
function undoBoard() {
  if (!SKB.board) return false;

  const hist = SKB.storage.getBoardHistory(SKB.board.id);
  const have = SKB.board.revision;
  let want = 0;

  for (let i = 0; i < hist.length - 1 && !want; i += 1) if (have === hist[i]) want = hist[i + 1];

  if (!want) {
    return false;
  }

  reopenBoard(want);
  return true;
}

function redoBoard() {
  if (!SKB.board) return false;

  const hist = SKB.storage.getBoardHistory(SKB.board.id);
  const have = SKB.board.revision;
  let want = 0;

  for (let i = 1; i < hist.length && !want; i += 1) if (have === hist[i]) want = hist[i - 1];

  if (!want) {
    return false;
  }

  reopenBoard(want);
  return true;
}

//
function showBoard(quick) {
  const { board } = SKB;

  const $wrap = $('.wrap');

  const $b = $tBoard.clone();
  const $bLists = $b.find('.lists');

  $b[0].boardId = board.id;
  setText($b.find('.head .text'), board.title);

  // Ensure lists array exists
  if (!board.lists) {
    board.lists = [];
  }

  board.lists.forEach((list) => {
    const $l = $tList.clone();
    const $lNotes = $l.find('.notes');

    setText($l.find('.head .text'), list.title);

    list.notes.forEach((n) => {
      const $n = $tNote.clone();
      setText($n.find('.text'), n.text);
      // Apply note color
      const color = n.color || 'gray';
      $n.addClass(`note-${color}`);
      $lNotes.append($n);
    });

    $bLists.append($l);
  });

  if (quick) $wrap.html('').append($b);
  else $wrap.html('').append($b).css({ opacity: 1 });

  // Reset scroll to top when showing board
  window.scrollTo(0, 0);

  updatePageTitle();
  updateUndoRedo();
  updateBoardIndex();
  setupListScrolling();
}

/*
	 *	demo board
	 */
function createDemoBoard() {
  // Create board with welcome title
  SKB.board = new Board('Welcome to Sticky Kanban Board');

  // Add default lists
  const firstList = SKB.board.addList('Ideas/Someday');
  firstList.addNote('Awesome running 200% Zoom and Fullscreen', 'green');
  firstList.addNote('Board titles and list titles can be changed by clicking on them.', 'gray');
  firstList.addNote('Control-Enter while editing to make a new note below', 'pink');
  firstList.addNote('Organize by:\n• Dragging & Dropping notes\n• Changing colors\n• Control-Shift-8 for bullets', 'gray');
  SKB.board.addList('ToDo');
  SKB.board.addList('Doing');
  const doneList = SKB.board.addList('Done');
  doneList.addNote('Ephemeral Process, here. Thinking not twiddling.', 'yellow');

  // Save the board immediately so it persists on reload
  SKB.storage.saveBoard(SKB.board);
  SKB.storage.setActiveBoard(SKB.board.id);

  return SKB.board;
}

/*
	 *	select note in welcome board
	 */
function selectWelcomeBoardNote() {
  const $lastList = $('.board .list').last();
  const $lastNote = $lastList.find('.note').last();
  if ($lastNote.length) {
    $('.board .note').removeClass('selected');
    $lastNote.addClass('selected');
    SKB.selectedNote = $lastNote[0];
    $('.color-menu').removeClass('disabled');
  }
}

/*
	 *	board export / import
	 */
function exportBoard() {
  let blob; let
    file;

  if (!SKB.board) {
    const _index = SKB.storage.getBoardIndex();
    const all = [];

    boards.forEach((meta, boardId) => {
      all.push(SKB.storage.loadBoard(boardId, null));
    });

    blob = JSON.stringify(all);
    file = 'Stickies Board.nbx';
  } else {
    const { board } = SKB;
    blob = JSON.stringify(board);
    file = `Stickies Board-${board.id}-${board.title}.nbx`;
  }

  blob = encodeURIComponent(blob);
  blob = `data:application/octet-stream,${blob}`;

  return { blob, file };
}

/*
	 *
	 */
function saveBoardOrder() {
  const $index = $('.boards-dropdown .load-board');
  let spot = 1;

  $index.each(function () {
    const id = parseInt($(this).attr('boardId'), 10);
    SKB.storage.setBoardUiSpot(id, spot++);
  });
}

/*
	 *
	 */
function updatePageTitle() {
  let title = 'Stickies Board';

  if (SKB.board) {
    title = SKB.board.title;
    title = `SB - ${title || '(untitled board)'}`;
  }

  document.title = title;
}

function updateUndoRedo() {
  const $undo = $('header .undo-board');
  const $redo = $('header .redo-board');

  let undo = false;
  let redo = false;

  if (SKB.board && SKB.board.revision) {
    const history = SKB.storage.getBoardHistory(SKB.board.id);
    const rev = SKB.board.revision;

    undo = (rev !== history[history.length - 1]);
    redo = (rev !== history[0]);
  }

  if (undo) $undo.show(); else $undo.hide();
  if (redo) $redo.show(); else $redo.hide();
}

function updateBoardIndex() {
  const $index = $('.boards-dropdown');
  const $export = $('header .exp-board');

  const _$board = $('.wrap .board');
  const idNow = SKB.board && SKB.board.id;
  let empty = true;

  $index.html('');

  const boards = SKB.storage.getBoardIndex();
  const index = [];

  boards.forEach((meta, id) => { index.push({ id, meta }); });

  index.sort((a, b) => b.meta.uiSpot && a.meta.uiSpot > b.meta.uiSpot);

  index.forEach((entry) => {
    const $e = $tLoad.clone();
    $e.attr('boardId', entry.id);
    $e.html(entry.meta.title);

    if (entry.id === idNow) $e.addClass('active');

    $index.append($e);
    empty = false;
  });

  if (!empty) {
    if (idNow) $export.html('Export this board...').show();
    else $export.html('Export all boards...').show();
  } else {
    $export.hide();
  }
}

// Expose to window for sync-ui.js
window.updateBoardIndex = updateBoardIndex;

/*
	 *	generic utils
	 */
function htmlEncode(raw) {
  // Use vanilla JS instead of jQuery hack
  const div = document.createElement('div');
  div.textContent = raw;
  return div.innerHTML;
}

function setText($note, text) {
  $note.attr('_text', text);

  text = htmlEncode(text);

  const hmmm = /\b(https?:\/\/[^\s]+)/mg;
  text = text.replace(hmmm, (url) => `<a href="${url}" target=_blank>${url}</a>`);

  if (SKB.peek('fileLinks')) {
    const xmmm = /`(.*?)`/mg;
    text = text.replace(xmmm, (full, text) => {
      const link = `file:///${text.replace('\\', '/')}`;
      return `\`<a href="${link}" target=_blank>${text}</a>\``;
    });
  }

  $note.html(text); // ? text : ' ');
}

function getText($note) {
  return $note.attr('_text');
}

function removeTextSelection() {
  if (window.getSelection) { window.getSelection().removeAllRanges(); } else if (document.selection) { document.selection.empty(); }
}

// Export for use in drag.js
window.removeTextSelection = removeTextSelection;

/*
	 *	inline editing
	 */
function startEditing($text, _ev) {
  const $note = $text.parent();
  const $edit = $note.find('.edit');

  $edit.val(getText($text));
  $edit.width($text.width());

  $edit.height($text.height());
  $note.addClass('editing');

  if ($edit.length) $edit[0].focus();
}

function stopEditing($edit, viaEscape, viaXclick) {
  const $item = $edit.parent();
  if (!$item.hasClass('editing')) return;

  $item.removeClass('editing');

  //
  const $text = $item.find('.text');
  const textNow = $edit.val().trimRight();
  const textWas = getText($text);

  //
  const brandNew = $item.hasClass('brand-new');
  $item.removeClass('brand-new');

  if (viaEscape) {
    if (brandNew) $item.closest('.note, .list, .board').remove();
    return;
  }

  if (viaXclick && brandNew && !textNow.length) {
    $item.closest('.note, .list, .board').remove();
    return;
  }

  if (textNow !== textWas || brandNew) {
    setText($text, textNow);

    if ($item.parent().hasClass('board')) SKB.board.title = textNow;

    updatePageTitle();
    saveBoard();
  }

  //
  if (brandNew && $item.hasClass('list')) addNote($item);
}

function handleTab(ev) {
  const $this = $(this);
  const $note = $this.closest('.note');
  const $sibl = ev.shiftKey ? $note.prev() : $note.next();

  if ($sibl.length) {
    stopEditing($this, false, false);
    if ($sibl.length) $sibl.find('.text')[0].click();
  }
}

// setRevealState removed - Ctrl/CapsLock reveal functionality disabled

/*
	 *	adjust this and that
	 */
function adjustLayout() {
  const $body = $('body');
  const $board = $('.board');

  if (!$board.length) return;

  const listW = 240;

  const lists = $board.find('.list').length;
  const listsW = (lists < 2) ? listW : (listW + 10) * lists - 10;
  const bodyW = $body.width();

  if (listsW + 190 <= bodyW) {
    $board.css('max-width', '');
    $body.removeClass('crowded');
  } else {
    let max = Math.floor((bodyW - 40) / (listW + 10));
    max = (max < 2) ? listW : (listW + 10) * max - 10;
    $board.css('max-width', `${max}px`);
    $body.addClass('crowded');
  }
}

//
function adjustListScroller() {
  const $board = $('.board');
  if (!$board.length) return;

  const $lists = $('.board .lists');
  const $scroller = $('.board .lists-scroller');
  const $inner = $scroller.find('div');

  const max = $board.width();
  const want = $lists[0].scrollWidth;
  const have = $inner.outerWidth();

  if (want <= max + 5) {
    $scroller.hide();
    return;
  }

  $scroller.show();
  if (want === have) return;

  $inner.width(want);
  cloneScrollPos($lists, $scroller);
}

function cloneScrollPos($src, $dst) {
  const src = $src[0];
  const dst = $dst[0];

  if (src._busyScrolling) {
    src._busyScrolling--;
    return;
  }

  dst._busyScrolling++;
  dst.scrollLeft = src.scrollLeft;
}

function setupListScrolling() {
  const $lists = $('.board .lists');
  const $scroller = $('.board .lists-scroller');

  adjustListScroller();

  $lists[0]._busyScrolling = 0;
  $scroller[0]._busyScrolling = 0;

  $scroller.on('scroll', () => { cloneScrollPos($scroller, $lists); });
  $lists.on('scroll', () => { cloneScrollPos($lists, $scroller); });

  adjustLayout();
}

/*
	 *	dragsters
	 */
function initDragAndDrop() {
  SKB.noteDrag = new Drag2();
  SKB.noteDrag.listSel = '.board .list .notes';
  SKB.noteDrag.itemSel = '.note';
  SKB.noteDrag.dragster = 'note-dragster';
  SKB.noteDrag.onDragging = function (started) {
    const drag = this;
    const $note = $(drag.item);

    if (started) {
      const { $drag } = drag;

      $drag.html('<div class=titlebar></div><a href=# class=note-icon></a><div class=text></div>');
      $drag.find('.text').html($note.find('.text').html());

      // Copy color class from note to dragster
      const colorClass = $note.attr('class').match(/\bnote-(yellow|blue|green|pink|purple|gray)\b/);
      if (colorClass) {
        $drag.addClass(colorClass[0]);
      }

      drag.org_loc = noteLocation($note);
    } else if (this.org_loc !== noteLocation($note)) saveBoard();
  };

  SKB.loadDrag = new Drag2();
  SKB.loadDrag.listSel = '.boards-dropdown';
  SKB.loadDrag.itemSel = 'a.load-board';
  SKB.loadDrag.dragster = 'load-dragster';
  SKB.loadDrag.onDragging = function (started) {
    const drag = this;

    if (started) {
      const { $drag } = drag;

      $drag.html($(this.item).html());
    } else {
      saveBoardOrder();
    }
  };
}

/*
   *  Initialize SKB object
   */
const SKB = {
  codeVersion: 20251115,
  blobVersion: 20251115, // board blob format in Storage
  board: null,
  storage: null,
  selectedNote: null,

  peek(name) {
    return this.storage.getConfig()[name];
  },

  poke(name, val) {
    const conf = this.storage.getConfig();
    conf[name] = val;
    return this.storage.saveConfig();
  },
};

/*
	 *	event handlers
	 */
// Window blur handler removed - reveal functionality disabled

// Global hotkeys removed

$('.wrap').on('click', '.board .text', function (ev) {
  if (this.was_dragged) {
    this.was_dragged = false;
    return false;
  }

  SKB.noteDrag.cancelPriming();

  // Select this note and enable color menu
  const $note = $(this).closest('.note');
  $('.board .note').removeClass('selected');
  $note.addClass('selected');
  SKB.selectedNote = $note[0];
  $('.color-menu').removeClass('disabled');

  startEditing($(this), ev);
  return false;
});

// Special handler for board title in window titlebar
$('.wrap').on('click', '.board .window-title.head .text', function (_ev) {
  const $head = $(this).closest('.window-title.head');
  const $edit = $head.find('.edit');
  const $text = $(this);
  const $titleSpan = $head.find('span.title');

  $edit.val(getText($text));

  // Match the width of the gray title area (span.title)
  // span.title has padding: 0 7px (14px total)
  // edit input has padding: 2px 7px (14px) + border: 1px (2px) = 16px total
  // .width() sets content width, so subtract edit padding+border from span outerWidth
  const titleWidth = $titleSpan.outerWidth() - 16;
  $edit.width(titleWidth);

  $head.addClass('editing');

  if ($edit.length) $edit[0].focus();

  return false;
});

// Board title edit keydown handler
$('.wrap').on('keydown', '.board .window-title.head .edit', function (ev) {
  const $this = $(this);
  const $head = $this.closest('.window-title.head');

  // Enter or Escape to finish editing
  if (ev.keyCode === 13 || ev.keyCode === 27) {
    const $text = $head.find('.text');
    const textNow = $this.val().trimRight();

    if (ev.keyCode === 13 && textNow) {
      setText($text, textNow);
      if (SKB.board) SKB.board.title = textNow;
      saveBoard();
      updateBoardIndex();
    }

    $head.removeClass('editing');
    return false;
  }
});

// Board title edit blur handler
$('.wrap').on('blur', '.board .window-title.head .edit', function (_ev) {
  const $this = $(this);
  const $head = $this.closest('.window-title.head');
  const $text = $head.find('.text');
  const textNow = $this.val().trimRight();

  if (textNow) {
    setText($text, textNow);
    if (SKB.board) SKB.board.title = textNow;
    saveBoard();
    updateBoardIndex();
  }

  $head.removeClass('editing');
});

// Board title edit input handler - resize as typing
$('.wrap').on('input', '.board .window-title.head .edit', function () {
  const $this = $(this);
  const $head = $this.closest('.window-title.head');

  // Calculate what span.title width would be with this text
  // span.title has padding: 0 7px
  const tempSpan = $('<span>').css({
    'font-size': '10px',
    'font-family': $this.css('font-family'),
    'font-weight': 'bold',
    padding: '0 7px',
    visibility: 'hidden',
    position: 'absolute',
    'white-space': 'nowrap',
  }).text($this.val() || 'A').appendTo('body');

  // Get the outerWidth (includes padding) and subtract edit input's padding+border
  const titleOuterWidth = tempSpan.outerWidth();
  tempSpan.remove();

  const contentWidth = titleOuterWidth - 16; // Subtract edit input's padding (14px) + border (2px)
  const maxWidth = $head.width() - 100; // Leave room for buttons

  $this.width(Math.max(100, Math.min(contentWidth, maxWidth)));
});

//
$('.wrap').on('keydown', '.board .edit', function (ev) {
  const $this = $(this);
  let $note = $this.closest('.note');
  const $list = $this.closest('.list');

  const isNote = $note.length > 0;
  const isList = $list.length > 0;

  // esc
  if (ev.keyCode === 27) {
    stopEditing($this, true, false);
    return false;
  }

  // tab
  if (ev.keyCode === 9) {
    handleTab.call(this, ev);
    return false;
  }

  // done
  if (ev.keyCode === 13 && ev.altKey
    || ev.keyCode === 13 && ev.shiftKey && !ev.ctrlKey) {
    stopEditing($this, false, false);
    return false;
  }

  // done + add after
  if (ev.keyCode === 13 && ev.ctrlKey) {
    stopEditing($this, false, false);

    if (isNote) {
      // Get the color of the current note
      let currentColor = 'gray';
      const colorMatch = $note.attr('class').match(/\bnote-(yellow|blue|green|pink|purple|gray)\b/);
      if (colorMatch) {
        currentColor = colorMatch[1];
      }
      addNote($list, $note, null, currentColor);
    } else
      if (isList) {
        $note = $list.find('.note').last();
        addNote($list, $note);
      } else {
        addList();
      }

    return false;
  }

  // done on Enter if editing board or list title
  if (ev.keyCode === 13 && !isNote) {
    stopEditing($this, false, false);
    return false;
  }

  // Alt + Arrow and Alt + R hotkeys removed

  // ctrl-shift-8
  if (isNote && ev.key === '*' && ev.ctrlKey) {
    const have = this.value;
    const pos = this.selectionStart;
    const want = `${have.substr(0, pos)}\u2022 ${have.substr(this.selectionEnd)}`;
    $this.val(want);
    this.selectionStart = this.selectionEnd = pos + 2;
    return false;
  }

  return true;
});

$('.wrap').on('keypress', '.board .edit', function (ev) {
  // tab
  if (ev.keyCode === 9) {
    handleTab.call(this, ev);
    return false;
  }
});

//
$('.wrap').on('blur', '.board .edit', function (_ev) {
  if (document.activeElement !== this) stopEditing($(this), false, true);
  else ; // switch away from the browser window
});

//
$('.wrap').on('input propertychange', '.board .note .edit', function () {
  const delta = $(this).outerHeight() - $(this).height();

  $(this).height(10);

  if (this.scrollHeight > this.clientHeight) $(this).height(this.scrollHeight - delta);
});

//
// Helper function to flash menu item and handle click
function flash($el) {
  $el.addClass('menu-flashing');
  setTimeout(() => { $el.removeClass('menu-flashing'); }, 600);
}
function handleClick(fn) {
  return function () {
    flash($(this));
    fn.call(this);
    return false;
  };
}

$('header').on('click', '.add-board', handleClick(addBoard));

$('header').on('click', '.add-note-first', handleClick(() => {
  const $fl = $('.wrap .board .lists .list').first();
  if ($fl.length) addNote($fl);
}));

// Click handler for Windows menu dropdown
$('header').on('click', '.load-board', handleClick(function () {
  const boardId = parseInt($(this).attr('boardId'), 10);
  SKB.loadDrag.cancelPriming();
  if (SKB.board && (SKB.board.id === boardId)) closeBoard();
  else openBoard(boardId);
}));

$('header').on('click', '.del-board', handleClick(deleteBoard));
$('header').on('click', '.undo-board', handleClick(undoBoard));
$('header').on('click', '.redo-board', handleClick(redoBoard));

//
// Color menu handler
//
$('header').on('click', '.set-color', handleClick(function () {
  if ($('.color-menu').hasClass('disabled')) return;
  const color = $(this).data('color');
  const $note = $(SKB.selectedNote);
  if (!$note.length) return;
  $note.removeClass('note-yellow note-blue note-green note-pink note-purple note-gray');
  $note.addClass(`note-${color}`);
  const listIndex = $note.closest('.list').index();
  const noteIndex = $note.index();
  if (SKB.board.lists[listIndex] && SKB.board.lists[listIndex].notes[noteIndex]) {
    SKB.board.lists[listIndex].notes[noteIndex].color = color;
    saveBoard();
  }
}));

// Update color menu checkmarks when hovering over Color menu
$('header').on('mouseenter', '.color-menu', () => {
  $('.color-dropdown a').removeClass('active');

  if (SKB.selectedNote) {
    const $note = $(SKB.selectedNote);
    let currentColor = 'gray';

    // Extract color from class
    const classes = $note.attr('class').split(' ');
    for (let i = 0; i < classes.length; i += 1) {
      if (classes[i].match(/^note-/)) {
        currentColor = classes[i].replace('note-', '');
        break;
      }
    }

    $(`.color-dropdown a[data-color="${currentColor}"]`).addClass('active');
  }
});

//
$('header').on('click', '.add-list', handleClick(addList));

$('.wrap').on('click', '.board .del-list', function () {
  deleteList($(this).closest('.list'));
  return false;
});

$('.wrap').on('click', '.board .mov-list-l', function () {
  moveList($(this).closest('.list'), true);
  return false;
});

$('.wrap').on('click', '.board .mov-list-r', function () {
  moveList($(this).closest('.list'), false);
  return false;
});

//
$('.wrap').on('click', '.board .add-note', function () {
  addNote($(this).closest('.list'));
  return false;
});

$('.wrap').on('click', '.board .note-icon', function () {
  deleteNote($(this).closest('.note'));
  return false;
});

//
// Note selection management
//

// Select note when clicking on it (not on text)
$('.wrap').on('click', '.board .note', function (ev) {
  // Don't select if clicking on text (text handler will manage)
  if ($(ev.target).closest('.text').length) return;

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
$('.wrap').on('click', (ev) => {
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
$('.wrap').on('mousedown', '.board .note:not(.editing) .text', function (ev) {
  ev.preventDefault();
  SKB.noteDrag.prime(this.parentNode, ev);
});

// Drag from titlebar only when editing
$('.wrap').on('mousedown', '.board .note.editing .titlebar', function (ev) {
  ev.preventDefault();
  SKB.noteDrag.prime(this.parentNode, ev);
});

// Mousedown handler for Windows menu dropdown
$('header').on('mousedown', 'a.load-board', function (ev) {
  if ($('header a.load-board').length > 1) SKB.loadDrag.prime(this, ev);
});

//
$(document).on('mouseup', (_ev) => {
  if (SKB.noteDrag) SKB.noteDrag.end();
  if (SKB.loadDrag) SKB.loadDrag.end();
  if (SKB.varAdjust) SKB.varAdjust.end();
});

$(document).on('mousemove', (ev) => {
  if (SKB.noteDrag) SKB.noteDrag.onMouseMove(ev);
  if (SKB.loadDrag) SKB.loadDrag.onMouseMove(ev);
  if (SKB.varAdjust) SKB.varAdjust.onMouseMove(ev);
});

$('header .exp-board').on('click', function () {
  flash($(this));
  const pack = exportBoard();
  $(this).attr('href', pack.blob);
  $(this).attr('download', pack.file);
  return true;
});

/***/

$(window).on('resize', adjustLayout);

$('body').on('dragstart', () => false);

/*
	 *	the init()
	 */
SKB.storage = new StorageLocal();

if (!SKB.storage.open()) {
  easyMartina = true;
  throw new Error();
}

const boards = SKB.storage.getBoardIndex();

boards.forEach((_meta, _boardId) => {
  const _hist = _meta.history.join(', ');
});

//
const conf = SKB.storage.getConfig();

/*
	 *	the ui
	 */
initDragAndDrop();

SKB.varAdjust = new VarAdjust();

//
if (conf.board && SKB.storage.getBoardIndex().has(conf.board)) openBoard(conf.board);

adjustLayout();

updateBoardIndex();

SKB.storage.setVerLast();

//
if (!SKB.board && !$('.boards-dropdown .load-board').length) SKB.board = createDemoBoard();

if (SKB.board) {
  showBoard(true);

  // Select last note in last column if this is the welcome board
  if (SKB.board.title === 'Welcome to Sticky Kanban Board') {
    selectWelcomeBoardNote();
  } else {
    // Initialize color menu as disabled (will enable when note is selected)
    $('.color-menu').addClass('disabled');
  }
} else {
  // Initialize color menu as disabled (will enable when note is selected)
  $('.color-menu').addClass('disabled');
}

//
setInterval(adjustListScroller, 100);

setupListScrolling();
