function Drag2() {
  // config
  this.listSel = null;
  this.itemSel = null;
  this.dragster = null;
  this.onDragging = function (_started) { };
  this.swapAnimMs = 200;

  // state
  this.item = null;
  this.priming = null;
  this.primeXY = { x: 0, y: 0 };
  this.$drag = null;
  this.mouseEv = null;
  this.delta = { x: 0, y: 0 };
  this.inSwap = 0;
  this.swapped = false;

  // api
  this.prime = function (item, ev) {
    const self = this;

    this.item = item;
    this.swapped = false;
    this.priming = setTimeout(() => { self.onPrimed.call(self); }, ev.altKey ? 1 : 500);
    this.primeXY = { x: ev.clientX, y: ev.clientY };
    this.mouseEv = ev;
  };

  this.cancelPriming = function () {
    if (!this.item || !this.priming) return;

    clearTimeout(this.priming);
    this.priming = null;
    this.item = null;
  };

  this.end = function () {
    this.cancelPriming();
    this.stopDragging();
  };

  this.isActive = function () {
    return this.item && (this.priming === null);
  };

  this.onPrimed = function () {
    clearTimeout(this.priming);
    this.priming = null;

    removeTextSelection();

    const $item = $(this.item);
    $item.addClass('dragging');

    $('body').append(`<div class="${this.dragster}"></div>`);
    const $drag = $(`body .${this.dragster}`).last();

    $drag.css({ width: `${$item.outerWidth()}px`, height: `${$item.outerHeight()}px` });

    this.$drag = $drag;

    if (this.onDragging) this.onDragging.call(this, true); // started

    const scrollX = window.pageXOffset;
    const scrollY = window.pageYOffset;

    const pos = $item.offset();
    this.delta.x = pos.left - this.mouseEv.clientX - scrollX;
    this.delta.y = pos.top - this.mouseEv.clientY - scrollY;

    this.adjustDrag();

    $drag.css({ opacity: 1 });

    $('body').addClass('dragging');
  };

  this.adjustDrag = function () {
    if (!this.$drag) return;

    const drag = this;
    const { $drag } = this;

    // Using fixed positioning, so no scroll offset needed
    const dragX = drag.mouseEv.clientX + drag.delta.x;
    const dragY = drag.mouseEv.clientY + drag.delta.y;

    $drag.css({ left: `${dragX}px`, top: `${dragY}px` });

    if (drag.inSwap) return;

    /*
			 *	see if a swap is in order
			 */
    const x = drag.mouseEv.clientX;
    const y = drag.mouseEv.clientY;

    let targetList = null;
    let targetItem = null; // if over some item
    let before = false; // if should go before targetItem

    let $target;

    $(this.listSel).each(function () {
      const list = this;
      const rcList = list.getBoundingClientRect();
      let yTop; let
        itemTop = null;
      let yBottom; let
        itemBottom = null;

      if (x <= rcList.left || rcList.right <= x) return;

      // Check if we're within this list's vertical bounds
      if (y < rcList.top || y >= rcList.bottom) return;

      let hasItems = false;
      $(list).find(drag.itemSel).each(function () {
        hasItems = true;
        const rcItem = this.getBoundingClientRect();

        if (!itemTop || rcItem.top < yTop) {
          itemTop = this;
          yTop = rcItem.top;
        }

        if (!itemBottom || yBottom < rcItem.bottom) {
          itemBottom = this;
          yBottom = rcItem.bottom;
        }

        if (y <= rcItem.top || rcItem.bottom <= y) return;

        if (this === drag.item) return;

        targetList = list;
        targetItem = this;
        before = (y < (rcItem.top + rcItem.bottom) / 2);
      });

      // Only set as target if we haven't found a specific item
      // This handles empty lists
      if (!targetItem && !hasItems) {
        targetList = list;
        targetItem = null; // Will append to end of list
      }
    });

    if (!targetList) return;

    if (targetItem) {
      if (targetItem === drag.item) return;

      $target = $(targetItem);

      if (!before && $target.next()[0] === drag.item
        || before && $target.prev()[0] === drag.item) return;
    }

    /*
			 *	swap 'em
			 */
    const have = drag.item;
    const $have = $(have);
    let $want = $have.clone();

    $want.css({ display: 'none' });

    // Mark that a swap is happening
    drag.swapped = true;

    if (targetItem) {
      if (before) {
        $want.insertBefore($target);
        $want = $target.prev();
      } else {
        $want.insertAfter($target);
        $want = $target.next();
      }
    } else {
      const $list = $(targetList);
      $want = $list.append($want).find(drag.itemSel).last();
    }

    drag.item = $want[0];

    if (!drag.swapAnimMs) {
      $have.remove();
      $want.show();
      return;
    }

    /*
			 *	see if it's a same-list move
			 */
    if (targetList === have.parentNode && targetItem) {
      // Animated same-list swap (only if there's a target item to animate with)
      const delta = $have.offset().top - $target.offset().top;

      let dBulk = 0;
      let dHave = 0;
      let $bulk = $();

      if (delta < 0) // item is moving down
      {
        for (let $i = $have.next(); $i.length && $i[0] !== $want[0]; $i = $i.next()) $bulk = $bulk.add($i);
      } else {
        for (let $i = $want.next(); $i.length && $i[0] !== $have[0]; $i = $i.next()) $bulk = $bulk.add($i);
      }

      if ($bulk.length > 0) {
        dBulk = $have.outerHeight(true);
        dHave = $bulk.last().offset().top + $bulk.last().outerHeight(true) - $bulk.first().offset().top;

        if (delta < 0) dBulk = -dBulk;
        else dHave = -dHave;

        $have.parent().css({ position: 'relative' });
        $have.css({ position: 'relative', 'z-index': 0 });
        $bulk.css({ position: 'relative', 'z-index': 1 });

        // Block new swaps during animation
        drag.inSwap = 1;

        // Use CSS transitions for smooth animation
        $have.addClass('drag-swap-transition').css({ top: `${dHave}px` });
        $bulk.addClass('drag-swap-transition').css({ top: `${dBulk}px` });

        // Clean up after animation completes (but don't block if it fails)
        setTimeout(() => {
          $have.parent().css({ position: '' });
          $have.remove();
          $want.show();
          $bulk.removeClass('drag-swap-transition').css({ position: '', 'z-index': '', top: '' });
          drag.inSwap = 0; // Unblock for next swap
          drag.adjustDrag();
        }, 200); // Match the CSS transition duration
      } else {
        // No animation needed for adjacent swaps
        $have.remove();
        $want.show();
        drag.inSwap = 0; // Unblock for next swap
        drag.adjustDrag();
      }
    } else {
      // Cross-list move with fade animation
      drag.inSwap = 1;

      // Fade out the old item
      $have.css({ transition: 'opacity 200ms cubic-bezier(0.4, 0.0, 0.2, 1)', opacity: 1 });
      setTimeout(() => {
        $have.css({ opacity: 0 });
      }, 10);

      // Prepare and fade in the new item
      $want.css({ opacity: 0 }).show();
      setTimeout(() => {
        $want.css({ transition: 'opacity 200ms cubic-bezier(0.4, 0.0, 0.2, 1)', opacity: 1 });
      }, 10);

      // Clean up after animation completes
      setTimeout(() => {
        $have.remove();
        $want.css({ transition: '', opacity: '' });
        drag.inSwap = 0;
        drag.adjustDrag();
      }, 220); // Slightly longer than transition to ensure it completes
    }
  };

  this.onMouseMove = function (ev) {
    this.mouseEv = ev;

    if (!this.item) return;

    if (this.priming) {
      const x = ev.clientX - this.primeXY.x;
      const y = ev.clientY - this.primeXY.y;
      if (x * x + y * y > 5 * 5) this.onPrimed();
    } else {
      this.adjustDrag();
    }
  };

  this.stopDragging = function () {
    const $item = $(this.item);

    $item.removeClass('dragging');
    $('body').removeClass('dragging');

    if (this.$drag) {
      this.$drag.remove();
      this.$drag = null;

      removeTextSelection();

      if (this.onDragging) this.onDragging.call(this, false); // stopped
    }

    // Play drag end sound only if a swap actually occurred
    if (this.swapped) {
      const audioPopr = document.getElementById('soundPopr');
      if (audioPopr && audioPopr.readyState >= 2) {
        // Clean up any previous clone to prevent accumulation
        if (Drag2.lastAudioClone) {
          Drag2.lastAudioClone.pause();
          Drag2.lastAudioClone = null;
        }
        // Create a fresh clone for this drop
        const audioClone = audioPopr.cloneNode(true);
        audioClone.currentTime = 0;
        Drag2.lastAudioClone = audioClone;
        // Clean up reference after audio finishes
        audioClone.addEventListener('ended', () => {
          Drag2.lastAudioClone = null;
        }, { once: true });
        // Also cleanup if audio duration is exceeded (safety timeout)
        setTimeout(() => {
          if (Drag2.lastAudioClone === audioClone) {
            Drag2.lastAudioClone = null;
          }
        }, 500);
        // Attempt to play
        audioClone.play().catch(() => {
          Drag2.lastAudioClone = null;
        });
      }
      // Reset the swapped flag after playing sound
      this.swapped = false;
    }

    this.item = null;
  };
}

// Static reference for audio clone management (shared across all Drag2 instances)
Drag2.lastAudioClone = null;
