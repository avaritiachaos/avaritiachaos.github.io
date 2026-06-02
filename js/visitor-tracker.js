/**
 * 访客足迹追踪器
 *
 * 功能：
 * - 记录每次页面访问（POST /track）
 * - 在右侧栏渲染"最近访客"面板
 * - 获取并展示访客列表、UV/PV 统计
 * - 获取当前页面浏览量
 * - 与 Swup PJAX 集成：sidebar 面板持久化，仅在页面切换时重新追踪
 *
 * 注意：VISITOR_API 占位符 '__VISITOR_API__' 将在部署时被替换为实际 Worker URL
 */
(function () {
  'use strict';

  // =========================================================
  // 配置
  // =========================================================
  var VISITOR_API = 'https://toko-visitor-tracker.tokisaka.workers.dev'; // Cloudflare Worker URL
  var VISITOR_LIMIT = 15;
  var TRACK_DEBOUNCE_MS = 500;

  // =========================================================
  // 工具函数
  // =========================================================

  /**
   * 国家代码转旗帜 emoji
   * @param {string} countryCode - ISO 3166-1 alpha-2 国家代码
   * @returns {string} 旗帜 emoji 或默认地球图标
   */
  function countryToFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) return '🌐';
    return String.fromCodePoint(
      ...countryCode.toUpperCase().split('').map(function (c) {
        return 0x1F1E6 + c.charCodeAt(0) - 65;
      })
    );
  }

  /**
   * ISO 时间字符串转相对时间描述
   * @param {string} isoString - ISO 8601 时间字符串
   * @returns {string} 中文相对时间
   */
  function timeAgo(isoString) {
    var seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (seconds < 60) return '刚刚';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' 分钟前';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' 小时前';
    return Math.floor(seconds / 86400) + ' 天前';
  }

  /**
   * 判断是否处于开发模式（API 占位符未替换）
   * @returns {boolean}
   */
  function isDevMode() {
    return VISITOR_API === '__VISITOR_API__';
  }

  /**
   * 带超时的 fetch 封装
   * @param {string} url - 请求地址
   * @param {object} options - fetch 选项
   * @returns {Promise<Response>}
   */
  function fetchWithTimeout(url, options) {
    var controller = new AbortController();
    var timeoutId = setTimeout(function () { controller.abort(); }, 5000);
    var opts = Object.assign({}, options || {}, { signal: controller.signal });
    return fetch(url, opts).finally(function () {
      clearTimeout(timeoutId);
    });
  }

  // =========================================================
  // 核心功能
  // =========================================================

  /**
   * 记录页面访问（fire-and-forget）
   */
  function trackVisit() {
    if (isDevMode()) return;
    try {
      fetchWithTimeout(VISITOR_API + '/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          page: location.pathname,
          title: document.title
        })
      }).catch(function (err) {
        console.warn('[访客追踪] 记录访问失败:', err);
      });
    } catch (err) {
      console.warn('[访客追踪] trackVisit 异常:', err);
    }
  }

  /**
   * 获取访客列表并更新面板
   */
  function fetchVisitors() {
    if (isDevMode()) return;
    try {
      fetchWithTimeout(VISITOR_API + '/visitors?limit=' + VISITOR_LIMIT, {
        method: 'GET',
        credentials: 'include'
      }).then(function (res) {
        return res.json();
      }).then(function (data) {
        if (data && data.visitors) {
          updateVisitorList(data.visitors, data.total_pv, data.today_uv);
        }
      }).catch(function (err) {
        console.warn('[访客追踪] 获取访客列表失败:', err);
      });
    } catch (err) {
      console.warn('[访客追踪] fetchVisitors 异常:', err);
    }
  }

  /**
   * 获取当前页面浏览统计
   */
  function fetchPageStats() {
    if (isDevMode()) return;
    try {
      fetchWithTimeout(VISITOR_API + '/stats?page=' + encodeURIComponent(location.pathname), {
        method: 'GET',
        credentials: 'include'
      }).then(function (res) {
        return res.json();
      }).then(function (data) {
        var counterEl = document.getElementById('page-view-counter');
        var countEl = document.getElementById('page-pv-count');
        if (counterEl && countEl && data && typeof data.page_pv !== 'undefined') {
          countEl.textContent = data.page_pv;
          counterEl.style.display = '';
        }
      }).catch(function (err) {
        console.warn('[访客追踪] 获取页面统计失败:', err);
      });
    } catch (err) {
      console.warn('[访客追踪] fetchPageStats 异常:', err);
    }
  }

  /**
   * 渲染访客面板 DOM 并插入右侧栏
   * 仅在面板不存在时创建（sidebar 在 Swup 替换区外，持久化）
   */
  function renderVisitorBoard() {
    // 已存在则跳过
    if (document.querySelector('.widget--visitor-board')) return;

    // 查找右侧栏容器
    var sidebar = document.querySelector('.right-sidebar .sidebar--main')
      || document.querySelector('.right-sidebar section')
      || document.querySelector('.sidebar.right-sidebar');

    if (!sidebar) {
      console.warn('[访客追踪] 未找到右侧栏容器，跳过渲染');
      return;
    }

    // 构建面板 DOM
    var section = document.createElement('section');
    section.className = 'widget--visitor-board';
    section.innerHTML = ''
      + '<h2 class="widget-title">'
      +   '<span class="visitor-icon">👣</span>'
      +   '最近访客'
      + '</h2>'
      + '<div class="visitor-stats-bar">'
      +   '<span class="stat-item" id="visitor-today-uv">今日 UV: --</span>'
      +   '<span class="stat-divider">·</span>'
      +   '<span class="stat-item" id="visitor-total-pv">总 PV: --</span>'
      + '</div>'
      + '<div class="visitor-list" id="visitor-list">'
      +   '<div class="visitor-loading">加载中...</div>'
      + '</div>'
      + '<div class="page-view-counter" id="page-view-counter" style="display:none">'
      +   '📖 本页浏览: <span id="page-pv-count">--</span>'
      + '</div>';

    sidebar.appendChild(section);
  }

  /**
   * 更新访客列表内容
   * @param {Array} visitors - 访客数组
   * @param {number} totalPv - 总 PV
   * @param {number} todayUv - 今日 UV
   */
  function updateVisitorList(visitors, totalPv, todayUv) {
    // 更新统计数字
    var uvEl = document.getElementById('visitor-today-uv');
    var pvEl = document.getElementById('visitor-total-pv');
    if (uvEl) uvEl.textContent = '今日 UV: ' + (todayUv || 0);
    if (pvEl) pvEl.textContent = '总 PV: ' + (totalPv || 0);

    // 更新访客列表
    var listEl = document.getElementById('visitor-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    if (!visitors || visitors.length === 0) {
      listEl.innerHTML = '<div class="visitor-empty">暂无访客记录</div>';
      return;
    }

    visitors.forEach(function (v) {
      var entry = document.createElement('div');
      entry.className = 'visitor-entry';

      var flag = countryToFlag(v.country);
      var locationText = v.city || v.country || '未知';
      var pageTitle = v.title || v.page || '/';
      var pagePath = v.page || '/';
      var time = v.time ? timeAgo(v.time) : '';

      entry.innerHTML = ''
        + '<span class="visitor-flag">' + flag + '</span>'
        + '<div class="visitor-info">'
        +   '<span class="visitor-location">' + locationText + '</span>'
        +   '<span class="visitor-page" title="' + pagePath + '">' + pageTitle + '</span>'
        + '</div>'
        + '<span class="visitor-time">' + time + '</span>';

      listEl.appendChild(entry);
    });
  }

  // =========================================================
  // 初始化
  // =========================================================
  document.addEventListener('DOMContentLoaded', function () {
    // 防抖：避免极短时间内重复触发
    var debounceTimer = null;

    function init() {
      // 记录访问
      trackVisit();
      // 渲染面板（仅首次）
      renderVisitorBoard();
      // 拉取访客列表
      fetchVisitors();
      // 拉取当前页面统计
      fetchPageStats();
    }

    debounceTimer = setTimeout(init, TRACK_DEBOUNCE_MS);
  });

  // =========================================================
  // Swup PJAX 集成
  // =========================================================
  // 暴露全局接口，供 swup-init.js 在 page:view 时调用
  window.__visitorTracker = {
    /**
     * Swup 页面切换后重新初始化
     * 不重建面板（sidebar 在替换区外），仅重新追踪和更新页面统计
     */
    reinit: function () {
      trackVisit();
      fetchPageStats();
    }
  };
})();
