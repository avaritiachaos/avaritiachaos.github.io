/**
 * Archive Immersive — page-specific chrome for /archives/.
 *
 * Toggles `html.is-archive-immersive` (drives the full-width river layout and
 * hides the left/right sidebars via CSS) and wires the Top/Bottom Docks:
 *
 *   - Top Dock  : Home / Archives / Search / Links / Visitors / Theme
 *   - Bottom Dock: Categories / Tags / Year Jump
 *
 * The old left/right edge-zone "summon the sidebar" interaction is retired —
 * it conflicted with the river's horizontal browsing and nav arrows.
 *
 * Docks are server-rendered inside #swup, so they're scoped to the archive
 * page and swapped out by Swup on navigation. This script is idempotent and
 * re-run on every Swup page:view (via window.updateArchiveImmersiveState).
 */
(function () {
  'use strict';

  function isArchivePage() {
    var path = location.pathname.replace(/\/+$/, '');
    return path.endsWith('/archives');
  }

  // ── Dock interactions ────────────────────────────────────────────────────

  var mobileMq = window.matchMedia('(max-width: 768px)');

  // 移动端筛选面板默认停在"标签"页（分类太少，标签更充实）。
  function centerTagsPage(dock) {
    var inner = dock.querySelector('.archive-dock__inner--filters');
    if (!inner) return;
    var tags = inner.querySelector('[data-filter="tags"]');
    if (!tags) return;
    requestAnimationFrame(function () {
      inner.scrollLeft = tags.offsetLeft - (inner.clientWidth - tags.offsetWidth) / 2;
    });
  }

  // 统一的开/关入口：处理 aria 状态 + 移动端副作用
  // （打开筛选 → 播放器滑出屏幕让位，音乐不停；关闭 → 恢复）。
  function setDockOpen(dock, open) {
    dock.classList.toggle('is-open', open);
    var h = dock.querySelector('.archive-dock__handle');
    if (h) h.setAttribute('aria-expanded', open ? 'true' : 'false');

    if (dock.getAttribute('data-dock') === 'bottom' && mobileMq.matches) {
      var html = document.documentElement;
      if (open) {
        centerTagsPage(dock);
        html.classList.add('mobile-player-hidden');
        html.classList.remove('mobile-player-visible');
      } else {
        html.classList.add('mobile-player-visible');
        html.classList.remove('mobile-player-hidden');
      }
    }
  }

  var outsideBound = false;

  function bindOutsideClickOnce() {
    if (outsideBound) return;
    outsideBound = true;
    // Click outside an open dock collapses it (mobile-friendly).
    document.addEventListener('click', function (e) {
      var openDocks = document.querySelectorAll('.archive-dock.is-open');
      if (!openDocks.length) return;
      openDocks.forEach(function (dock) {
        if (!dock.contains(e.target)) {
          setDockOpen(dock, false);
        }
      });
    });
  }

  function initDocks() {
    var docks = document.querySelectorAll('.archive-dock');

    docks.forEach(function (dock) {
      if (dock.__dockBound) return;
      dock.__dockBound = true;

      // Handle tap/click toggles the dock (the only reveal path on mobile;
      // desktop also reveals on hover via CSS, this just pins it).
      var handle = dock.querySelector('.archive-dock__handle');
      if (handle) {
        handle.addEventListener('click', function (e) {
          e.stopPropagation();
          setDockOpen(dock, !dock.classList.contains('is-open'));
        });
      }
    });

    // Theme button → reuse the theme's existing (now hidden) #dark-mode-toggle,
    // exactly like the mobile theme FAB does.
    var themeBtn = document.querySelector('.archive-dock__theme');
    if (themeBtn && !themeBtn.__bound) {
      themeBtn.__bound = true;
      themeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var toggle = document.getElementById('dark-mode-toggle');
        if (toggle) toggle.click();
      });
    }

    // Year-jump pills → smooth-scroll to the year section in the Full Archive,
    // then collapse the bottom dock.
    var years = document.querySelectorAll('.archive-dock__year');
    years.forEach(function (link) {
      if (link.__bound) return;
      link.__bound = true;
      link.addEventListener('click', function (e) {
        var id = link.getAttribute('data-year');
        var target = id && document.getElementById(id);
        if (!target) return; // let the native #anchor jump handle it
        e.preventDefault();
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (err) {
          target.scrollIntoView();
        }
        var dock = link.closest('.archive-dock');
        if (dock) {
          setDockOpen(dock, false);
        }
      });
    });

    bindOutsideClickOnce();
  }

  function closeAllDocks() {
    document.querySelectorAll('.archive-dock.is-open').forEach(function (d) {
      setDockOpen(d, false);
    });
  }

  // ── State sync (first load + every Swup page:view) ────────────────────────

  function updateArchiveImmersiveState() {
    var isArchive = isArchivePage();
    document.documentElement.classList.toggle('is-archive-immersive', isArchive);

    if (isArchive) {
      initDocks();
    } else {
      closeAllDocks();
    }
  }

  // Initial execution
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateArchiveImmersiveState);
  } else {
    updateArchiveImmersiveState();
  }

  // Expose so Swup can trigger it on page views.
  window.updateArchiveImmersiveState = updateArchiveImmersiveState;
})();
