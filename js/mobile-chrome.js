/**
 * Mobile Reading Chrome
 *
 * On phones (<= 768px) the fixed BGM player and the lack of a sticky menu make
 * long-form reading awkward. This adds a lightweight, scroll-aware "chrome":
 *
 *  - Scroll DIRECTION drives visibility. We use scrollY DELTA (not finger
 *    direction) because it is stable across momentum scrolling, address-bar
 *    resize and programmatic scrolls:
 *      • scrollY increasing  → reading downward → hide player UI, retract the
 *        top menu peek to a sliver.
 *      • scrollY decreasing  → looking back up  → restore player + menu peek.
 *      • near the very top    → always show everything.
 *  - A fixed top "peek" bar that reveals the EXISTING sidebar menu (no second
 *    menu system).
 *  - A bottom-right theme FAB that reuses the EXISTING #dark-mode-toggle.
 *
 * The BGM player is only hidden visually (transform/opacity) — audio keeps
 * playing; we never call pause.
 *
 * Desktop is never touched (every effect is gated behind isMobile()).
 * Swup-safe: init() is idempotent and re-run on page:view; the scroll listener
 * is bound exactly once.
 *
 * ── How to disable the auto-hide-player behaviour ──
 *   Set `window.MOBILE_CHROME_KEEP_PLAYER = true` (any time), OR add the
 *   attribute `data-keep-player` to <html>. The player UI then stays visible on
 *   mobile while the menu peek still responds to scroll direction.
 */
(function () {
  'use strict';

  var MOBILE_MAX = 768;   // px — only engage at/below this width
  var THRESHOLD = 8;      // px — min scrollY delta before we commit to a direction
  var TOP_ZONE = 80;      // px — within this of the top, always reveal chrome
  var SETTLE_MS = 140;

  var html = document.documentElement;
  var reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var REDUCED = reducedMq.matches;

  var mobileMq = window.matchMedia('(max-width: ' + MOBILE_MAX + 'px)');
  function isMobile() { return mobileMq.matches; }

  // Player auto-hide can be opted out of (see file header).
  function autoHidePlayer() {
    return !(window.MOBILE_CHROME_KEEP_PLAYER === true || html.hasAttribute('data-keep-player'));
  }

  var peek = null;
  var fab = null;
  var bound = false;
  var lastY = 0;
  var ticking = false;

  // ── SVG icons ──────────────────────────────────────────────────────────
  var ICON_MENU = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  var ICON_SUN  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';

  // ── Build the fixed chrome once; reuse on subsequent inits ───────────────
  function buildChrome() {
    peek = document.getElementById('mobile-top-peek');
    if (!peek) {
      peek = document.createElement('div');
      peek.id = 'mobile-top-peek';
      peek.className = 'mobile-top-peek';
      peek.setAttribute('role', 'button');
      peek.setAttribute('tabindex', '0');
      peek.setAttribute('aria-label', '打开菜单');

      var nameEl = document.querySelector('.site-name');
      var title = (nameEl && nameEl.textContent ? nameEl.textContent : '菜单').trim();

      peek.innerHTML =
        '<span class="mobile-top-peek__title">' + title + '</span>' +
        '<span class="mobile-top-peek__icon" aria-hidden="true">' + ICON_MENU + '</span>';

      peek.addEventListener('click', onPeekActivate);
      peek.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPeekActivate(); }
      });
      document.body.appendChild(peek);
    }

    // Only offer a theme FAB if the site actually has a color-scheme toggle.
    var toggle = document.getElementById('dark-mode-toggle');
    fab = document.getElementById('mobile-theme-fab');
    if (!fab && toggle) {
      fab = document.createElement('button');
      fab.id = 'mobile-theme-fab';
      fab.className = 'mobile-theme-fab';
      fab.type = 'button';
      fab.setAttribute('aria-label', '切换日夜模式');
      fab.addEventListener('click', onFabActivate);
      document.body.appendChild(fab);
      // Keep the icon in sync with the theme's own change event.
      window.addEventListener('onColorSchemeChange', updateFabIcon);
      updateFabIcon();
    }
  }

  function updateFabIcon() {
    if (!fab) return;
    // Show the icon of the mode you'd switch TO.
    var dark = html.dataset.scheme === 'dark';
    fab.innerHTML = dark ? ICON_SUN : ICON_MOON;
  }

  // ── Menu: idempotent open/close that mirrors the theme's end-state classes.
  //    We deliberately DON'T call #toggle-menu.click(): Stack.init() re-binds
  //    that handler on every article-page Swup view, so a single .click() can
  //    fire it an even number of times (open→close) and appear to do nothing.
  function openMenu() {
    var menu = document.getElementById('main-menu');
    var ham = document.getElementById('toggle-menu');
    if (!menu) return;
    if (!document.body.classList.contains('show-menu')) {
      document.body.classList.add('show-menu');
      menu.style.display = 'flex';
      if (ham) ham.classList.add('is-active');
    }
  }

  function closeMenu() {
    var menu = document.getElementById('main-menu');
    var ham = document.getElementById('toggle-menu');
    document.body.classList.remove('show-menu');
    if (menu) menu.style.display = '';   // revert to stylesheet (display:none on mobile)
    if (ham) ham.classList.remove('is-active');
  }

  function onPeekActivate() {
    // Bring the real sidebar (which holds the menu) into view, then reveal it.
    try {
      window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
    } catch (e) {
      window.scrollTo(0, 0);
    }
    openMenu();
  }

  function onFabActivate() {
    // Reuse the theme's existing toggle (its handlers are convergent, so one
    // click = one net scheme flip even if Swup re-bound it).
    var toggle = document.getElementById('dark-mode-toggle');
    if (toggle) toggle.click();
    setTimeout(updateFabIcon, 30);
  }

  // ── Visibility state writers (class toggles only — cheap) ────────────────
  function setChrome(show) {
    html.classList.toggle('mobile-chrome-visible', show);
    html.classList.toggle('mobile-chrome-hidden', !show);
  }

  function setPlayer(show) {
    if (!autoHidePlayer()) show = true;
    html.classList.toggle('mobile-player-visible', show);
    html.classList.toggle('mobile-player-hidden', !show);
  }

  function clearState() {
    html.classList.remove(
      'mobile-chrome-hidden', 'mobile-chrome-visible',
      'mobile-player-hidden', 'mobile-player-visible'
    );
  }

  // ── Scroll-direction core ────────────────────────────────────────────────
  function update() {
    var y = window.scrollY || window.pageYOffset || 0;

    // Near the top: always reveal.
    if (y <= TOP_ZONE) {
      setChrome(true);
      setPlayer(true);
      lastY = y;
      return;
    }

    var diff = y - lastY;
    if (Math.abs(diff) < THRESHOLD) return;  // ignore micro-jitter to avoid flicker

    var goingDown = diff > 0;                // scrollY increasing = reading downward
    setChrome(!goingDown);
    setPlayer(!goingDown);
    lastY = y;
  }

  function onScroll() {
    if (!isMobile()) return;
    if (ticking) return;                     // rAF throttle — one update per frame
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      update();
    });
  }

  function onResize() {
    if (!isMobile()) {
      clearState();                          // never leak mobile state onto desktop
      return;
    }
    lastY = window.scrollY || 0;
    update();
  }

  function bindOnce() {
    if (bound) return;
    bound = true;
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    if (reducedMq.addEventListener) {
      reducedMq.addEventListener('change', function (e) { REDUCED = e.matches; });
    }
  }

  // ── Init — first load AND every Swup page:view (idempotent) ──────────────
  function init() {
    buildChrome();
    bindOnce();
    closeMenu();                             // each new page starts with menu closed

    if (!isMobile()) {
      clearState();
      return;
    }

    lastY = window.scrollY || 0;
    setChrome(true);                         // fresh page → everything visible
    setPlayer(true);
    updateFabIcon();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Exposed so swup-init.js can re-run it after PJAX navigations.
  window.__mobileChrome = { init: init };
})();
