/**
 * Wonderland Canvas Stars Background
 * A lightweight, high-performance canvas particle system with responsive count throttling
 * and full support for prefers-reduced-motion.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('wonderland-canvas');
  if (!canvas) return;

  var ctx = canvas.getContext('2d');
  var particles = [];
  var animationFrameId = null;
  var width = 0;
  var height = 0;

  // Configuration
  var MAX_PARTICLES_DESKTOP = 55;
  var MAX_PARTICLES_MOBILE = 0; // Disable completely on mobile for performance
  var MOBILE_BREAKPOINT = 768;

  // Soft dream-like color palette
  var STAR_COLORS = [
    'rgba(255, 255, 255, ',     // Soft white
    'rgba(188, 174, 211, ',     // Pale lavender
    'rgba(223, 203, 211, ',     // Soft pink
    'rgba(203, 217, 231, '      // Pale blue
  ];

  function getTargetParticleCount() {
    if (window.innerWidth < MOBILE_BREAKPOINT) {
      return MAX_PARTICLES_MOBILE;
    }
    return MAX_PARTICLES_DESKTOP;
  }

  function resizeCanvas() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    var targetCount = getTargetParticleCount();
    
    // Adjust array size if needed, or regenerate
    if (targetCount === 0) {
      particles = [];
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      ctx.clearRect(0, 0, width, height);
      return;
    }

    // Regulate particles
    if (particles.length > targetCount) {
      particles = particles.slice(0, targetCount);
    } else {
      while (particles.length < targetCount) {
        particles.push(createParticle(true)); // Initialize randomly on screen
      }
    }

    // Start loop if not already running and motion is allowed
    var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!motionQuery.matches && !animationFrameId && targetCount > 0) {
      loop();
    }
  }

  function createParticle(randomPos) {
    return {
      x: randomPos ? Math.random() * width : Math.random() * width,
      y: randomPos ? Math.random() * height : (Math.random() > 0.5 ? 0 : height),
      size: Math.random() * 1.7 + 0.5, // 0.5px to 2.2px
      alpha: Math.random() * 0.35 + 0.15, // 0.15 to 0.50
      speedX: (Math.random() * 0.08 - 0.04), // very slow horizontal drift
      speedY: (Math.random() * 0.08 - 0.04), // very slow vertical drift
      colorTemplate: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]
    };
  }

  function drawParticles() {
    ctx.clearRect(0, 0, width, height);

    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.colorTemplate + p.alpha + ')';
      ctx.fill();
    }
  }

  function updateParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.speedX;
      p.y += p.speedY;

      // Wrap-around edges
      if (p.x < -10) p.x = width + 10;
      if (p.x > width + 10) p.x = -10;
      if (p.y < -10) p.y = height + 10;
      if (p.y > height + 10) p.y = -10;
    }
  }

  function loop() {
    var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (motionQuery.matches) {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      return;
    }

    drawParticles();
    updateParticles();
    animationFrameId = requestAnimationFrame(loop);
  }

  // Setup event listeners
  window.addEventListener('resize', resizeCanvas);

  // Initialize
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  
  if (motionQuery.matches) {
    // Render static frame once if reduced motion is requested
    resizeCanvas();
    drawParticles();
  } else {
    resizeCanvas();
  }

  // Listen for preference changes dynamically
  if (motionQuery.addEventListener) {
    motionQuery.addEventListener('change', function (e) {
      if (e.matches) {
        if (animationFrameId) {
          cancelAnimationFrame(animationFrameId);
          animationFrameId = null;
        }
        ctx.clearRect(0, 0, width, height);
      } else {
        resizeCanvas();
      }
    });
  }
})();
