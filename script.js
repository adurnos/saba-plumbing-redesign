'use strict';

/* ==========================================================================
   Saba Plumbing & Heating - vanilla interactions
   1. Shrinking header (rAF-scoped, state-guarded)
   2. Floating emergency call toggle
   3. Seamless infinite review carousel with manual controls and drag support
   4. Mobile swipe-hint settle (phones only)
   5. Copyright year
   ========================================================================== */

(function () {
  var header = document.getElementById('siteHeader');
  var floatingCall = document.getElementById('floatingCall');

  var isShrunk = false;
  var callVisible = false;
  var ticking = false;

  /* ---- 1 + 2. Header shrink & floating call ----------------------------- */

  function onScrollState() {
    var y = window.scrollY || window.pageYOffset;

    if (header) {
      var shouldShrink = y > 16;
      if (shouldShrink !== isShrunk) {
        isShrunk = shouldShrink;
        header.classList.toggle('is-shrunk', isShrunk);
      }
    }

    if (floatingCall) {
      var shouldShow = y > 640;
      if (shouldShow !== callVisible) {
        callVisible = shouldShow;
        floatingCall.classList.toggle('is-visible', callVisible);
      }
    }

    ticking = false;
  }

  function requestStateUpdate() {
    if (!ticking) {
      window.requestAnimationFrame(onScrollState);
      ticking = true;
    }
  }

  if (header || floatingCall) {
    window.addEventListener('scroll', requestStateUpdate, { passive: true });
    onScrollState();
  }

  /* ---- 3. Review carousel — seamless infinite loop ----------------------
     The cards are duplicated into three adjacent sets [A][B][C]; B is the
     "home" set and scrolling starts at its left edge. Native scrolling does
     the heavy lifting (so it works by dragging with a mouse or a finger),
     and a rAF-throttled scroll listener instantly teleports the track back
     to the equivalent card whenever the home set is left in either
     direction. Because every set is pixel-identical, the wrap is invisible
     and the loop feels endless for arrows, keyboard, and drag alike.
     ---------------------------------------------------------------------- */

  var track = document.getElementById('reviewTrack');
  var prevBtn = document.getElementById('reviewPrev');
  var nextBtn = document.getElementById('reviewNext');

  if (track && prevBtn && nextBtn) {
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var GAP = 24; // matches the 1.5rem gap in .carousel-track

    // ---- Build [A][B][C]: clones before/after the original cards ---------
    var originals = Array.prototype.slice.call(track.children);
    var count = originals.length;
    if (count) {
      var lead = document.createDocumentFragment();
      var tail = document.createDocumentFragment();
      originals.forEach(function (card) {
        var a = card.cloneNode(true);
        a.setAttribute('aria-hidden', 'true');
        lead.appendChild(a);
        var c = card.cloneNode(true);
        c.setAttribute('aria-hidden', 'true');
        tail.appendChild(c);
      });
      track.insertBefore(lead, originals[0]); // [A]
      track.appendChild(tail);                // [C]
    }

    function cardStep() {
      var card = track.querySelector('.review-card');
      if (!card) return Math.round(track.clientWidth * 0.8);
      return Math.round(card.getBoundingClientRect().width + GAP);
    }

    function setWidth() { return cardStep() * count; }

    // Home set B lives in [setWidth, 2*setWidth). Crossing either edge
    // teleports to the pixel-identical card one set over (instant, no CSS
    // transition involved since this is native scroll position).
    function keepInLoop() {
      var sw = setWidth();
      if (!sw) return;
      var pos = track.scrollLeft;
      var target = null;
      if (pos >= 2 * sw) {
        target = pos - sw;
      } else if (pos < sw) {
        target = pos + sw;
      }
      if (target !== null) {
        track.scrollLeft = target;
        // Keep an active drag continuous across the teleport: refresh BOTH
        // the scroll baseline and the pointer X so the next pointermove
        // continues from the wrapped position instead of the pre-wrap one.
        if (dragging) {
          dragStartLeft = target;
          dragStartX = lastDragX;
        }
      }
    }

    var rafPending = false;
    track.addEventListener('scroll', function () {
      if (rafPending) return;
      rafPending = true;
      window.requestAnimationFrame(function () {
        rafPending = false;
        keepInLoop();
      });
    }, { passive: true });

    // ---- Arrow buttons (never disabled: the loop has no end) -------------
    function go(direction) {
      if (!count) return;
      track.scrollBy({ left: direction * cardStep(), behavior: reducedMotion ? 'auto' : 'smooth' });
    }

    prevBtn.addEventListener('click', function () { go(-1); });
    nextBtn.addEventListener('click', function () { go(1); });

    // ---- Mouse/pen drag-to-scroll (touch already scrolls natively) -------
    var dragging = false;
    var dragStartX = 0;
    var dragStartLeft = 0;
    var lastDragX = 0;

    // Manual drag-to-scroll only for mouse/pen: touch relies on native
    // scrolling (touch-action: pan-x), so we never capture the pointer or
    // fight the browser's own horizontal panning on mobile.
    track.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      dragging = true;
      dragStartX = e.clientX;
      lastDragX = e.clientX;
      dragStartLeft = track.scrollLeft;
      track.classList.add('is-dragging');
      if (track.setPointerCapture) {
        try { track.setPointerCapture(e.pointerId); } catch (err) { /* noop */ }
      }
    });

    track.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      lastDragX = e.clientX;
      track.scrollLeft = dragStartLeft - (e.clientX - dragStartX);
    });

    function endDrag() {
      if (!dragging) return;
      dragging = false;
      track.classList.remove('is-dragging');
      keepInLoop();
    }
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('pointerleave', endDrag);

    track.addEventListener('keydown', function (event) {
      if (event.key === 'ArrowLeft') { event.preventDefault(); go(-1); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); go(1); }
    });

    // ---- Boot: land on the left edge of home set B. On resize, only
    //      re-center if the view has drifted out of the home band, so the
    //      user's current card is preserved while the window resizes. ------
    function home() {
      if (!count) return;
      track.scrollLeft = setWidth();
    }
    window.addEventListener('resize', keepInLoop);
    home();
  }

  /* ---- 4. Mobile swipe-hints — settle the nudge animation after the
     user's first swipe of a phone card rail ------------------------------- */

  Array.prototype.forEach.call(document.querySelectorAll('.service-groups, .process-grid'), function (rail) {
    var hint = rail.nextElementSibling;
    if (!hint || !hint.classList || !hint.classList.contains('swipe-hint')) return;
    rail.addEventListener('scroll', function () {
      hint.classList.add('is-settled');
    }, { once: true, passive: true });
  });

  /* ---- 5. Copyright year ------------------------------------------------ */

  var yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
})();
