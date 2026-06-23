/**
 * Wonderland Welcome Screen Controller
 * Controls display, transition, and session persistence of the welcome overlay.
 */
(function () {
  'use strict';

  function initWelcome() {
    var isHome = !!window.isHugoHome;
    var urlParams = new URLSearchParams(window.location.search);
    var isWelcomeForced = urlParams.get('welcome') === '1';
    var hasVisited = sessionStorage.getItem('wonderland_visited');

    var welcomeOverlay = document.getElementById('wonderland-welcome');

    // 1. If not homepage or already visited (and not forced)
    if (!isHome || (hasVisited && !isWelcomeForced)) {
      document.documentElement.classList.add('wonderland-ready');
      if (welcomeOverlay) {
        welcomeOverlay.style.display = 'none';
      }
      return;
    }

    // 2. Otherwise, we show the welcome overlay (we are on homepage and first visit or forced)
    if (welcomeOverlay) {
      welcomeOverlay.style.display = 'flex';
      document.body.classList.add('wonderland-active');

      var enterBtn = document.getElementById('enter-wonderland-btn');
      if (enterBtn) {
        // Handle enter click
        enterBtn.addEventListener('click', function () {
          // Add transition class
          welcomeOverlay.classList.add('wonderland-leaving');
          document.body.classList.remove('wonderland-active');

          // Set session storage immediately to prevent reload triggers
          sessionStorage.setItem('wonderland_visited', 'true');

          // Trigger content fade-up slightly before overlay disappears completely (400ms into 800ms transition)
          setTimeout(function () {
            document.documentElement.classList.add('wonderland-ready');
          }, 300);

          // Hide completely after transition completes
          setTimeout(function () {
            welcomeOverlay.style.display = 'none';
          }, 800);
        });
      }
    } else {
      // Fallback if template is missing but JS runs
      document.documentElement.classList.add('wonderland-ready');
    }
  }

  // Run on DOM content loaded (safe defer behavior)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWelcome);
  } else {
    initWelcome();
  }
})();
