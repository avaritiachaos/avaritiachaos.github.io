/**
 * CG 图片懒加载 — IntersectionObserver
 * 配合 cg.html shortcode 使用
 */
document.addEventListener('DOMContentLoaded', () => {
  const images = document.querySelectorAll('.cg-image[data-src]');

  if (!images.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        const picture = img.closest('picture');

        // 加载 <source> 的 srcset
        if (picture) {
          picture.querySelectorAll('source[data-srcset]').forEach(source => {
            source.srcset = source.dataset.srcset;
            source.removeAttribute('data-srcset');
          });
        }

        // 加载 <img> 的 src
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
        }
        observer.unobserve(img);
      }
    });
  }, {
    rootMargin: '300px 0px',  // 提前 300px 开始加载
    threshold: 0.01
  });

  images.forEach(img => observer.observe(img));
});
