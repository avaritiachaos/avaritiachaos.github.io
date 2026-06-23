/**
 * Wonderland Motion — restrained micro-interactions
 *
 * - Article card cascade fade-up (IntersectionObserver)
 * - Main article page fade-up
 * - Swup PJAX compatible: re-runs on page transitions
 * - Respects prefers-reduced-motion
 */
(function () {
  'use strict';

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Listen for dynamic changes to reduced-motion preference
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', function (e) {
    REDUCED = e.matches;
  });

  /**
   * Observe article cards and main article for fade-up entrance.
   * Safe to call multiple times — skips already-visible elements.
   */
  function initCardAnimations() {
    // Article list cards
    var cards = document.querySelectorAll('.article-list > article:not(.is-visible)');
    if (REDUCED) {
      cards.forEach(function (el) { el.classList.add('is-visible'); });
      var mainReduced = document.querySelector('.main-article:not(.is-visible)');
      if (mainReduced) mainReduced.classList.add('is-visible');
      return;
    }

    if (cards.length) {
      var allCards = document.querySelectorAll('.article-list > article');
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var el = entry.target;
          var idx = Array.prototype.indexOf.call(allCards, el);
          setTimeout(function () { el.classList.add('is-visible'); }, idx * 70);
          observer.unobserve(el);
        });
      }, { threshold: 0.1 });
      cards.forEach(function (c) { observer.observe(c); });
    }

    // Article page (reading page) fade-up
    var mainArticle = document.querySelector('.main-article:not(.is-visible)');
    if (mainArticle) {
      setTimeout(function () {
        mainArticle.classList.add('is-visible');
      }, 50);
    }
  }

  // First load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCardAnimations);
  } else {
    initCardAnimations();
  }

  // Expose for Swup page:view hook
  window.__wonderlandMotion = { init: initCardAnimations };
})();
