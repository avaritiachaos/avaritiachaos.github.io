/**
 * Archive Showcase — Timeline wave + card animations + horizontal scroll controls
 *
 * - Generates an SVG wave path spanning the FULL track scrollWidth (every
 *   article is mounted on the river, so the track is long).
 * - IntersectionObserver fade-up for timeline cards and full-archive entries.
 * - Pointer-Events drag-to-scroll (mouse/pen only — touch keeps native
 *   horizontal scrolling), horizontal wheel scroll, lightweight nav arrows
 *   that disable at the ends, and a progress indicator.
 * - Recomputes the wave + metrics on resize, on lazy-image load, and on Swup
 *   page:view. Respects prefers-reduced-motion.
 */
(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cleanupCallbacks = [];

  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (e) {
    REDUCED = e.matches;
  });

  /**
   * Run all registered cleanup callbacks before re-initializing.
   */
  function runCleanup() {
    while (cleanupCallbacks.length > 0) {
      try {
        cleanupCallbacks.pop()();
      } catch (e) {
        console.warn('[ArchiveScroller] Cleanup error:', e);
      }
    }
  }

  /**
   * Generate a smooth sine-wave SVG path for the timeline connector.
   */
  function generateWavePath(width, height, segments) {
    var amplitude = 18;
    var segmentWidth = width / segments;
    var midY = height / 2;
    var d = 'M 0 ' + midY;

    for (var i = 0; i < segments; i++) {
      var x1 = i * segmentWidth + segmentWidth * 0.5;
      var y1 = midY + (i % 2 === 0 ? -amplitude : amplitude);
      var x2 = (i + 1) * segmentWidth;
      var y2 = midY;
      d += ' Q ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
    }
    return d;
  }

  /**
   * Vertical sine-wave path — the mobile "stream" that flows top→bottom down
   * the left rail of the timeline.
   */
  function generateVerticalWavePath(height, width, segments) {
    var amplitude = 7;
    var segmentHeight = height / segments;
    var midX = width / 2;
    var d = 'M ' + midX.toFixed(1) + ' 0';

    for (var i = 0; i < segments; i++) {
      var y1 = i * segmentHeight + segmentHeight * 0.5;
      var x1 = midX + (i % 2 === 0 ? -amplitude : amplitude);
      var y2 = (i + 1) * segmentHeight;
      var x2 = midX;
      d += ' Q ' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1);
    }
    return d;
  }

  /**
   * Initialize scroller controls: Progress bar, Wheel, Drag, Arrows.
   *
   * Performance contract (why the river is smooth):
   * - All layout-affecting metrics (maxScroll, scroller offset) are read ONCE
   *   in recalc(), called on init + resize + image-load only — never inside
   *   the pointer-move / wheel / scroll hot paths.
   * - The drag move handler does ZERO DOM queries and ZERO layout reads: it
   *   uses the pointer event's own clientX (already in hand) plus a scrollLeft
   *   captured on pointerdown, and writes a single scrollLeft per move.
   * - Touch is left to the browser's native overflow-x scrolling (momentum +
   *   snap); we only take over mouse/pen so the desktop "grab" feels 1:1.
   * - The scroll handler writes one transform to the progress bar and toggles
   *   the arrow end-state — both compositor-cheap. Drag/scroll set
   *   `.is-dragging` / `.is-scrolling`; CSS uses those to suspend per-card
   *   hover transitions, backdrop-filter and pointer-events so the long track
   *   never repaints expensive effects mid-gesture.
   *
   * @returns {Function} recalc — re-read metrics (used by image-load hook).
   */
  function initScrollerControls(scroller, track, timelineContainer) {
    var showcase = timelineContainer.closest('.archive-showcase');
    if (!showcase) return function () {};

    // 1. Progress Bar Setup (built once, cached)
    var progressContainer = showcase.querySelector('.archive-river-progress');
    if (progressContainer) progressContainer.remove();
    progressContainer = document.createElement('div');
    progressContainer.className = 'archive-river-progress';
    var progressBar = document.createElement('div');
    progressBar.className = 'archive-river-progress-bar';
    progressContainer.appendChild(progressBar);
    showcase.appendChild(progressContainer);

    // 2. Arrow Overlay Buttons Setup (built once, cached). Thin chevrons.
    var leftArrow = showcase.querySelector('.archive-river-arrow--left');
    var rightArrow = showcase.querySelector('.archive-river-arrow--right');
    if (leftArrow) leftArrow.remove();
    if (rightArrow) rightArrow.remove();

    leftArrow = document.createElement('button');
    leftArrow.className = 'archive-river-arrow archive-river-arrow--left';
    leftArrow.setAttribute('aria-label', 'Scroll left');
    leftArrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>';

    rightArrow = document.createElement('button');
    rightArrow.className = 'archive-river-arrow archive-river-arrow--right';
    rightArrow.setAttribute('aria-label', 'Scroll right');
    rightArrow.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>';

    showcase.appendChild(leftArrow);
    showcase.appendChild(rightArrow);

    // ── Cached layout metrics (recomputed only on init + resize + img-load) ──
    var maxScroll = 0;

    function recalc() {
      // The only place we touch layout-reading properties.
      maxScroll = scroller.scrollWidth - scroller.clientWidth;

      var hasOverflow = maxScroll > 1;
      var vis = hasOverflow ? '' : 'none';
      progressContainer.style.display = vis;
      leftArrow.style.display = vis;
      rightArrow.style.display = vis;

      updateProgress();
      updateArrowState();
    }

    // Scroll handler reads: compositor-only progress write + class toggles.
    function updateProgress() {
      if (maxScroll <= 0) return;
      var pct = scroller.scrollLeft / maxScroll;
      if (pct < 0) pct = 0; else if (pct > 1) pct = 1;
      progressBar.style.transform = 'scaleX(' + pct + ')';
    }

    // Fade/disable the arrow that points past the river's end.
    function updateArrowState() {
      var sl = scroller.scrollLeft;
      if (sl <= 1) leftArrow.classList.add('is-disabled');
      else leftArrow.classList.remove('is-disabled');
      if (maxScroll > 0 && sl >= maxScroll - 1) rightArrow.classList.add('is-disabled');
      else rightArrow.classList.remove('is-disabled');
    }

    // ── Transient "is-scrolling" flag — lets CSS pause card repaints during
    //    any active scroll, cleared shortly after motion stops. ──
    var scrollingTimer = 0;
    function flagScrolling() {
      scroller.classList.add('is-scrolling');
      clearTimeout(scrollingTimer);
      scrollingTimer = setTimeout(function () {
        scroller.classList.remove('is-scrolling');
      }, 140);
    }

    // Bind scroll progress + arrow state
    var scrollRaf = 0;
    var onScroll = function () {
      flagScrolling();
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(function () {
        scrollRaf = 0;
        updateProgress();
        updateArrowState();
      });
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    cleanupCallbacks.push(function () {
      scroller.removeEventListener('scroll', onScroll);
    });

    var resizeTimer = 0;
    var handleResizeProgress = function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(recalc, 150);
    };
    window.addEventListener('resize', handleResizeProgress);
    cleanupCallbacks.push(function () {
      window.removeEventListener('resize', handleResizeProgress);
    });

    // 3. Wheel Horizontal Scroll (coalesced into one rAF; cached boundary)
    var isHoveringScroller = false;
    var scrollerMouseEnter = function () { isHoveringScroller = true; };
    var scrollerMouseLeave = function () { isHoveringScroller = false; };
    scroller.addEventListener('mouseenter', scrollerMouseEnter);
    scroller.addEventListener('mouseleave', scrollerMouseLeave);
    cleanupCallbacks.push(function () {
      scroller.removeEventListener('mouseenter', scrollerMouseEnter);
      scroller.removeEventListener('mouseleave', scrollerMouseLeave);
    });

    var wheelRaf = 0;
    var wheelAccum = 0;
    var onWheel = function (e) {
      if (!isHoveringScroller || maxScroll <= 0) return;

      // Only take over the wheel for *horizontal* intent: a trackpad sideways
      // swipe (deltaX dominant) or Shift+wheel. Plain vertical wheel is left to
      // the browser so the page scrolls past the river normally (the river is
      // near the top of a long page — trapping vertical wheel felt broken).
      var horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      if (!horizontal && !e.shiftKey) return;

      var delta = horizontal ? e.deltaX : e.deltaY;

      var atStart = scroller.scrollLeft <= 0;
      var atEnd = scroller.scrollLeft >= maxScroll - 1;
      if ((atStart && delta < 0) || (atEnd && delta > 0)) return;

      e.preventDefault();
      wheelAccum += delta * 1.1;
      if (wheelRaf) return;
      wheelRaf = requestAnimationFrame(function () {
        wheelRaf = 0;
        scroller.scrollLeft += wheelAccum;
        wheelAccum = 0;
      });
    };
    scroller.addEventListener('wheel', onWheel, { passive: false });
    cleanupCallbacks.push(function () {
      scroller.removeEventListener('wheel', onWheel);
    });

    // 4. Pointer drag — mouse/pen only. Touch keeps native overflow scrolling.
    var isDown = false;
    var dragPointerId = null;
    var startX = 0;
    var startScrollLeft = 0;
    var dragDistance = 0;

    var onPointerDown = function (e) {
      // Don't hijack touch: native horizontal swipe is smoother and keeps
      // momentum + snap. Vertical page scroll also stays free.
      if (e.pointerType === 'touch') return;
      isDown = true;
      dragPointerId = e.pointerId;
      startX = e.clientX;                  // from the event — no layout read
      startScrollLeft = scroller.scrollLeft; // single read, not in hot path
      dragDistance = 0;
      scroller.classList.add('is-dragging');
      try { scroller.setPointerCapture(e.pointerId); } catch (err) {}
    };

    var onPointerMove = function (e) {
      if (!isDown || e.pointerId !== dragPointerId) return;
      // HOT PATH — arithmetic + one scrollLeft write only. No DOM queries,
      // no scrollWidth/clientWidth/offset reads.
      var dx = e.clientX - startX;
      dragDistance = dx < 0 ? -dx : dx;
      scroller.scrollLeft = startScrollLeft - dx;
    };

    var endDrag = function (e) {
      if (!isDown) return;
      if (e && e.pointerId != null && e.pointerId !== dragPointerId) return;
      isDown = false;
      dragPointerId = null;
      scroller.classList.remove('is-dragging');
      if (e && e.pointerId != null) {
        try { scroller.releasePointerCapture(e.pointerId); } catch (err) {}
      }
    };

    scroller.addEventListener('pointerdown', onPointerDown);
    scroller.addEventListener('pointermove', onPointerMove);
    scroller.addEventListener('pointerup', endDrag);
    scroller.addEventListener('pointercancel', endDrag);
    cleanupCallbacks.push(function () {
      scroller.removeEventListener('pointerdown', onPointerDown);
      scroller.removeEventListener('pointermove', onPointerMove);
      scroller.removeEventListener('pointerup', endDrag);
      scroller.removeEventListener('pointercancel', endDrag);
    });

    // Prevent the click that follows a real drag from opening the card.
    var onCardLinkClick = function (e) {
      if (dragDistance > 6) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    var cardsLinks = scroller.querySelectorAll('.archive-timeline-card__link');
    cardsLinks.forEach(function (link) {
      link.addEventListener('click', onCardLinkClick);
    });
    cleanupCallbacks.push(function () {
      cardsLinks.forEach(function (link) {
        link.removeEventListener('click', onCardLinkClick);
      });
    });

    // 5. Arrow Navigation (programmatic smooth scroll — independent of CSS
    //    scroll-behavior, which we leave `auto` so drag/wheel stay 1:1)
    var onLeftArrowClick = function () {
      var amount = Math.max(320, scroller.clientWidth * 0.7);
      scroller.scrollBy({ left: -amount, behavior: 'smooth' });
    };
    var onRightArrowClick = function () {
      var amount = Math.max(320, scroller.clientWidth * 0.7);
      scroller.scrollBy({ left: amount, behavior: 'smooth' });
    };
    leftArrow.addEventListener('click', onLeftArrowClick);
    rightArrow.addEventListener('click', onRightArrowClick);
    cleanupCallbacks.push(function () {
      leftArrow.removeEventListener('click', onLeftArrowClick);
      rightArrow.removeEventListener('click', onRightArrowClick);
    });

    // Initial metric read now, plus once more after layout/fonts settle.
    recalc();
    setTimeout(recalc, 100);

    return recalc;
  }

  /**
   * Initialize the timeline SVG wave (spanning the full track) + scroller.
   */
  function initTimeline() {
    var container = document.querySelector('.archive-timeline');
    if (!container) return;

    var scroller = document.querySelector('.archive-river-scroller');
    var svg = container.querySelector('.archive-timeline__line');
    var wavePath = container.querySelector('.archive-timeline__wave');
    var waveGlow = container.querySelector('.archive-timeline__wave-glow');
    var track = container.querySelector('.archive-timeline__track');
    var cards = container.querySelectorAll('.archive-timeline-card');

    if (!svg || !wavePath || !track || !cards.length || !scroller) return;

    // Draw the wave to match the FULL track (the whole river). Desktop draws a
    // horizontal wave across track.scrollWidth; mobile draws a vertical
    // "stream" down the left rail across track.scrollHeight.
    var mobileMq = window.matchMedia('(max-width: 768px)');

    function updateSvg() {
      if (mobileMq.matches) {
        var vh = track.scrollHeight;
        var vw = 40; // rail width
        svg.setAttribute('viewBox', '0 0 ' + vw + ' ' + vh);
        svg.style.width = vw + 'px';
        svg.style.height = vh + 'px';

        var vsegs = Math.max(cards.length, 5);
        var vd = generateVerticalWavePath(vh, vw, vsegs);
        wavePath.setAttribute('d', vd);
        if (waveGlow) waveGlow.setAttribute('d', vd);
        return;
      }

      var w = track.scrollWidth;
      var h = 60; // wave height

      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.style.width = w + 'px';
      svg.style.height = h + 'px';

      var segments = Math.max(cards.length * 2, 4);
      var d = generateWavePath(w, h, segments);

      wavePath.setAttribute('d', d);
      if (waveGlow) waveGlow.setAttribute('d', d);
    }

    updateSvg();

    // Initialize horizontal scroller controls (returns its recalc()).
    var recalcScroller = initScrollerControls(scroller, track, container);

    // Debounced resize → redraw wave + re-read metrics.
    var resizeTimer;
    var handleResize = function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        updateSvg();
        recalcScroller();
      }, 150);
    };
    window.addEventListener('resize', handleResize);
    cleanupCallbacks.push(function () {
      window.removeEventListener('resize', handleResize);
    });

    // Lazy images can change layout as they decode; recompute (debounced) once
    // they land so the wave width and scroll metrics stay correct.
    var loadTimer = 0;
    var onImgSettle = function () {
      clearTimeout(loadTimer);
      loadTimer = setTimeout(function () {
        updateSvg();
        recalcScroller();
      }, 120);
    };
    var imgs = track.querySelectorAll('img');
    imgs.forEach(function (img) {
      if (img.complete) return;
      img.addEventListener('load', onImgSettle);
      img.addEventListener('error', onImgSettle);
      cleanupCallbacks.push(function () {
        img.removeEventListener('load', onImgSettle);
        img.removeEventListener('error', onImgSettle);
      });
    });
  }

  /**
   * IntersectionObserver for card fade-up entrance.
   */
  function initCardAnimations() {
    var cards = document.querySelectorAll('.archive-timeline-card:not(.is-visible)');
    if (!cards.length) return;

    if (REDUCED) {
      cards.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        // Stagger by position within the current view (cap so late cards in a
        // long river don't wait forever).
        var idx = parseInt(el.getAttribute('data-index') || '0', 10);
        var delay = Math.min(idx % 6, 5) * 90;
        setTimeout(function () { el.classList.add('is-visible'); }, delay);
        observer.unobserve(el);
      });
    }, { root: null, rootMargin: '0px 200px', threshold: 0.1 });

    cards.forEach(function (c) { observer.observe(c); });
  }

  /**
   * Full archive entry fade-up.
   */
  function initArchiveEntryAnimations() {
    var entries = document.querySelectorAll('.archive-entry:not(.is-visible)');
    if (!entries.length) return;

    if (REDUCED) {
      entries.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.05 });

    entries.forEach(function (e) { observer.observe(e); });
  }

  /**
   * Full init — called on first load and Swup page:view.
   */
  function init() {
    runCleanup();
    initTimeline();
    initCardAnimations();
    initArchiveEntryAnimations();
  }

  // First load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for Swup page:view hook
  window.__archiveShowcase = { init: init };
})();
