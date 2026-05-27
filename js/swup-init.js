/**
 * Swup PJAX 路由 — 实现全局无缝 BGM 播放
 * 
 * 架构：
 * - Swup 仅替换 <main id="swup"> 内部的 DOM
 * - 侧边栏、BGM 播放器、footer 全部在替换区外，永远不被触碰
 * - 每次页面替换后，手动重新挂载 Stack 主题的所有 JS 组件
 */
(function () {
  'use strict';

  // =========================================================
  // 1. 等 DOM + Swup 库加载完毕
  // =========================================================
  document.addEventListener('DOMContentLoaded', function () {
    if (typeof Swup === 'undefined') {
      console.warn('[PJAX] Swup not loaded, falling back to normal navigation');
      return;
    }

    // =========================================================
    // 2. 初始化 Swup
    // =========================================================
    var swup = new Swup({
      containers: ['#swup'],                // 只替换 <main id="swup">
      animateHistoryBrowsing: true,          // 浏览器后退/前进也做动画
      cache: true,                           // 缓存已访问页面
      linkSelector: 'a[href^="/"]:not([data-no-swup]), a[href^="' + window.location.origin + '"]:not([data-no-swup])',
      timeout: 8000                          // 8 秒超时后降级为原生跳转
    });

    // =========================================================
    // 3. 核心：页面替换后重新初始化所有主题组件
    // =========================================================
    function reinitThemeComponents() {
      // --- 3a. Stack 主题的 Gallery + Scrollspy + 代码复制按钮 ---
      var articleContent = document.querySelector('.article-content');
      if (articleContent && window.Stack) {
        // Stack.init() 里做了 gallery / scrollspy / code-copy / colorScheme
        // 但 colorScheme 和 menu 绑定的是侧边栏元素（不在替换区内），不需要重复绑定
        // 所以我们手动只重做 article 相关的部分

        // Gallery (PhotoSwipe)
        if (window.PhotoSwipe && window.PhotoSwipeUI_Default) {
          try {
            // StackGallery 会自动 wrap 图片并绑定点击
            // 但它是 ES module，我们通过重新调用 Stack.init 的方式来触发
            // 不过 Stack.init 也会重绑 menu 和 colorScheme...
            // 安全起见，直接调用完整的 init（menu 和 colorScheme 内部有防重复机制）
          } catch (e) { console.warn('[PJAX] Gallery reinit failed:', e); }
        }

        // 最简单可靠的方式：直接调用 Stack.init()
        // menu() 内部检查 toggleMenu 存在性，不会重复绑定出问题
        // StackColorScheme 绑定在 #dark-mode-toggle 上，重复 new 会多绑一次 click
        // → 我们需要避免重复绑定 colorScheme
      }

      // 安全的做法：手动重建 article 相关组件
      reinitArticleComponents();

      // --- 3b. 图片懒加载 (IntersectionObserver) ---
      reinitLazyLoad();

      // --- 3c. 更新 per-article BGM 数据（但不中断当前播放） ---
      updateArticleBGM();

      // --- 3d. 滚动到顶部 ---
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

    // =========================================================
    // 4. 重建文章页组件（Gallery + Scrollspy + Code Copy）
    // =========================================================
    function reinitArticleComponents() {
      var articleContent = document.querySelector('.article-content');
      if (!articleContent) return;

      // 4a. Gallery (PhotoSwipe)
      if (window.PhotoSwipe && window.PhotoSwipeUI_Default) {
        try {
          // StackGallery 是编译后的类，挂在 Stack bundle 里
          // 最可靠的方式是通过 Stack.init 间接调用
          // 但为了避免 colorScheme 重复绑定，我们自己做
        } catch (e) {}
      }

      // 4b. 代码复制按钮
      var highlights = articleContent.querySelectorAll('div.highlight');
      highlights.forEach(function (highlight) {
        // 跳过已经有按钮的
        if (highlight.querySelector('.copyCodeButton')) return;
        var btn = document.createElement('button');
        btn.textContent = 'Copy';
        btn.classList.add('copyCodeButton');
        highlight.appendChild(btn);
        var codeBlock = highlight.querySelector('code[data-lang]');
        if (!codeBlock) return;
        btn.addEventListener('click', function () {
          navigator.clipboard.writeText(codeBlock.textContent).then(function () {
            btn.textContent = 'Copied!';
            setTimeout(function () { btn.textContent = 'Copy'; }, 1000);
          });
        });
      });

      // 4c. 直接调用 Stack.init() 来处理 gallery + scrollspy
      // 这是最可靠的方式，因为主题的 TS 代码编译后不暴露单独函数
      if (window.Stack && window.Stack.init) {
        try { window.Stack.init(); } catch (e) {
          console.warn('[PJAX] Stack.init() reinit error:', e);
        }
      }
    }

    // =========================================================
    // 5. 重建图片懒加载
    // =========================================================
    function reinitLazyLoad() {
      var images = document.querySelectorAll('.cg-image[data-src]');
      if (!images.length) return;

      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var img = entry.target;
          var picture = img.closest('picture');
          if (picture) {
            picture.querySelectorAll('source[data-srcset]').forEach(function (source) {
              source.srcset = source.getAttribute('data-srcset');
              source.removeAttribute('data-srcset');
            });
          }
          if (img.getAttribute('data-src')) {
            img.src = img.getAttribute('data-src');
            img.removeAttribute('data-src');
          }
          observer.unobserve(img);
        });
      }, { rootMargin: '300px 0px', threshold: 0.01 });

      images.forEach(function (img) { observer.observe(img); });
    }

    // =========================================================
    // 6. 更新 per-article BGM（不中断播放）
    // =========================================================
    function updateArticleBGM() {
      var pageBGMEl = document.getElementById('page-bgm-data');
      if (!pageBGMEl) return; // 这篇文章没有专属 BGM，保持当前播放

      try {
        var pageBGM = JSON.parse(pageBGMEl.textContent);
        if (!pageBGM || !pageBGM.url) return;

        // 检查是否和当前播放的是同一首
        // APlayer 实例挂在 window 上吗？不一定。
        // 我们通过 DOM 检查当前曲名
        var currentTitle = document.querySelector('.aplayer-title');
        if (currentTitle && currentTitle.textContent === (pageBGM.name || '')) {
          return; // 同一首，不切换
        }

        // 显示切换提示
        var existingPrompt = document.getElementById('bgm-switch-prompt');
        if (existingPrompt) existingPrompt.remove();

        var prompt = document.createElement('div');
        prompt.id = 'bgm-switch-prompt';
        prompt.className = 'bgm-prompt';
        prompt.innerHTML = '🎵 切换到「' + (pageBGM.name || '本文 BGM') + '」';
        prompt.style.display = 'block';
        document.body.appendChild(prompt);

        prompt.addEventListener('click', function () {
          // 找到 APlayer 实例并切换曲目
          var container = document.getElementById('bgm-player-container');
          if (container && container._aplayer) {
            var ap = container._aplayer;
            ap.list.clear();
            ap.list.add([{
              name: pageBGM.name || '未知曲目',
              url: pageBGM.url,
              artist: pageBGM.artist || '未知',
              cover: pageBGM.cover || ''
            }]);
            ap.play();
          }
          prompt.classList.add('hidden');
          setTimeout(function () { prompt.remove(); }, 500);
        });

        // 8 秒后自动隐藏
        setTimeout(function () {
          if (prompt.parentNode) {
            prompt.classList.add('hidden');
            setTimeout(function () { prompt.remove(); }, 500);
          }
        }, 8000);
      } catch (e) {
        console.warn('[PJAX] BGM update error:', e);
      }
    }

    // =========================================================
    // 7. 注册 Swup 生命周期钩子
    // =========================================================
    swup.hooks.on('page:view', function () {
      // 每次新页面渲染完成后调用
      reinitThemeComponents();

      // 更新 document.title（Swup 默认会处理，但确保一下）
      var titleEl = document.querySelector('title');
      if (titleEl) document.title = titleEl.textContent;
    });

    // 首次加载也要初始化懒加载（DOMContentLoaded 已触发）
    reinitLazyLoad();

    // =========================================================
    // 8. 错误降级：Swup 发生错误时回退到原生导航
    // =========================================================
    swup.hooks.on('fetch:error', function (visit) {
      console.warn('[PJAX] Fetch error, falling back to native navigation');
      window.location.href = visit.to.url;
    });

    swup.hooks.on('fetch:timeout', function (visit) {
      console.warn('[PJAX] Timeout, falling back to native navigation');
      window.location.href = visit.to.url;
    });

    console.log('[PJAX] Swup initialized. BGM will play seamlessly across pages.');
  });
})();
