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
 * 优化点：
 * - 站长免打扰：自动屏蔽 localhost 并支持通过 URL 参数 `?owner=true` 开启免打扰，生成本地缓存并展示悬浮提示
 * - 访客足迹合并：将连续或最近相同的访客足迹合并，展示“X页”徽章与下拉箭头，点击即可展开精致的时间轴足迹
 */
(function () {
  'use strict';

  // =========================================================
  // 配置
  // =========================================================
  var VISITOR_API = 'https://toko-visitor-tracker.tokisaka.workers.dev'; // Cloudflare Worker URL
  var VISITOR_LIMIT = 30; // 适当增加拉取条数，以便前端合并后有足够的内容展示
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
   * @returns {string} 英文相对时间
   */
  function timeAgo(isoString) {
    var seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
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

  /**
   * 显示悬浮提示框 (Toast)
   * @param {string} message 
   */
  function showToast(message) {
    // 移除已有的 toast
    var oldToast = document.querySelector('.toko-toast');
    if (oldToast) oldToast.remove();

    var toast = document.createElement('div');
    toast.className = 'toko-toast';
    toast.innerHTML = ''
      + '<span class="toko-toast-icon">✨</span>'
      + '<span class="toko-toast-text">' + message + '</span>';
    
    document.body.appendChild(toast);

    // 触发过渡动画
    setTimeout(function () {
      toast.classList.add('is-visible');
    }, 50);

    // 4秒后淡出并移除
    setTimeout(function () {
      toast.classList.remove('is-visible');
      setTimeout(function () {
        toast.remove();
      }, 400);
    }, 4000);
  }

  /**
   * 清除 URL 中的特定参数
   * @param {string} param 
   */
  function cleanUrlParam(param) {
    try {
      var url = new URL(window.location.href);
      url.searchParams.delete(param);
      window.history.replaceState({}, document.title, url.pathname + url.search);
    } catch (e) {
      console.warn('[访客追踪] 净化 URL 失败:', e);
    }
  }

  /**
   * 检查 URL 是否携带 owner 状态切换参数
   */
  function checkOwnerToggle() {
    var params = new URLSearchParams(window.location.search);
    if (params.has('owner')) {
      var val = params.get('owner');
      if (val === 'true') {
        localStorage.setItem('skip-track', 'true');
        showToast('嘘——匿迹魔法已生效，接下来的每一步都将悄然无息。');
        cleanUrlParam('owner');
      } else if (val === 'false') {
        localStorage.removeItem('skip-track');
        showToast('魔法解除，你的足迹将重新化作点点星光。');
        cleanUrlParam('owner');
      }
    }
  }

  /**
   * 判断当前是否应该跳过追踪
   * @returns {boolean}
   */
  function shouldSkipTrack() {
    // 1. 本地环境过滤
    var hostname = window.location.hostname;
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.indexOf('192.168.') === 0) {
      return true;
    }
    // 2. 站长本地免打扰标识
    if (localStorage.getItem('skip-track') === 'true') {
      return true;
    }
    return false;
  }

  // =========================================================
  // 核心功能
  // =========================================================

  /**
   * 记录页面访问（fire-and-forget）
   */
  function trackVisit() {
    if (isDevMode() || shouldSkipTrack()) return;
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
   * 渲染访客面板 DOM
   * - 在 /visitors/ 页面：渲染到 #visitors-board-container
   * - 在其他页面：不渲染侧边栏面板（保持侧栏干净）
   */
  function renderVisitorBoard() {
    // 已存在则跳过
    if (document.querySelector('.widget--visitor-board')) return;

    // 检查是否在 /visitors/ 页面
    var visitorsContainer = document.getElementById('visitors-board-container');
    if (visitorsContainer) {
      // 清除 loading 占位
      visitorsContainer.innerHTML = '';

      var section = document.createElement('section');
      section.className = 'widget--visitor-board';
      section.innerHTML = ''
        + '<h2 class="widget-title">'
        +   '<span class="visitor-icon">✨</span>'
        +   'Visitors'
        + '</h2>'
        + '<div class="visitor-stats-bar">'
        +   '<span class="stat-item" id="visitor-today-uv">Today UV: --</span>'
        +   '<span class="stat-divider">·</span>'
        +   '<span class="stat-item" id="visitor-total-pv">Total PV: --</span>'
        + '</div>'
        + '<div class="visitor-list" id="visitor-list">'
        +   '<div class="visitor-loading">Loading...</div>'
        + '</div>'
        + '<div class="page-view-counter" id="page-view-counter" style="display:none">'
        +   '📖 Page views: <span id="page-pv-count">--</span>'
        + '</div>';

      visitorsContainer.appendChild(section);
      return;
    }

    // 其他页面：不在侧栏渲染面板
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
      listEl.innerHTML = '<div class="visitor-empty">No visitors yet.</div>';
      return;
    }

    // =========================================================
    // 访客前端会话合并 (Session Grouping)
    // =========================================================
    var grouped = [];
    var visitorMap = {};

    visitors.forEach(function (v) {
      var key = v.hash || (v.country + '_' + v.city);
      
      if (!visitorMap[key]) {
        visitorMap[key] = {
          country: v.country,
          city: v.city,
          hash: v.hash,
          flag: countryToFlag(v.country),
          locationText: v.city || v.country || '未知',
          history: []
        };
        grouped.push(visitorMap[key]);
      }

      // 去重过滤：避免短时间内重复记录相同的页面
      var historyLen = visitorMap[key].history.length;
      var lastAdded = historyLen > 0 ? visitorMap[key].history[historyLen - 1] : null;
      
      if (!lastAdded || lastAdded.page !== v.page) {
        visitorMap[key].history.push({
          page: v.page || '/',
          title: v.title || v.page || '/',
          time: v.time
        });
      }
    });

    // 渲染合并后的列表
    // 只展示前 8 个访客，保证侧边栏整洁度
    var renderLimit = Math.min(grouped.length, 8);
    
    for (var i = 0; i < renderLimit; i++) {
      (function () {
        var v = grouped[i];
        var entry = document.createElement('div');
        entry.className = 'visitor-entry';
        
        var hasHistory = v.history.length > 1;
        if (hasHistory) {
          entry.classList.add('has-history');
        }

        var latestVisit = v.history[0];
        var timeText = latestVisit.time ? timeAgo(latestVisit.time) : '';

        // 拼接头部
        var html = ''
          + '<div class="visitor-header">'
          +   '<span class="visitor-flag">' + v.flag + '</span>'
          +   '<div class="visitor-info">'
          +     '<span class="visitor-location">' + v.locationText + '</span>'
          +     '<span class="visitor-page" title="' + latestVisit.page + '">' + latestVisit.title + '</span>'
          +   '</div>'
          +   '<div class="visitor-meta">'
          +     '<span class="visitor-time">' + timeText + '</span>';
        
        if (hasHistory) {
          html += ''
            +     '<div class="visitor-badge-wrap">'
            +       '<span class="visitor-badge">' + v.history.length + ' pages</span>'
            +       '<span class="visitor-arrow">▾</span>'
            +     '</div>';
        }
        
        html += ''
          +   '</div>'
          + '</div>';

        // 拼接时间轴足迹列表
        if (hasHistory) {
          html += '<div class="visitor-history-list">';
          v.history.forEach(function (h, hIdx) {
            var stepTime = h.time ? timeAgo(h.time) : '';
            var isLatest = hIdx === 0;
            html += ''
              + '<div class="visitor-history-item' + (isLatest ? ' is-latest' : '') + '">'
              +   '<span class="timeline-dot"></span>'
              +   '<div class="timeline-content">'
              +     '<span class="timeline-page-title" title="' + h.page + '">' + h.title + '</span>'
              +     '<span class="timeline-time">' + stepTime + '</span>'
              +   '</div>'
              + '</div>';
          });
          html += '</div>';
        }

        entry.innerHTML = html;
        listEl.appendChild(entry);

        // 给有足迹的记录绑定点击展开交互
        if (hasHistory) {
          var header = entry.querySelector('.visitor-header');
          header.addEventListener('click', function () {
            var isExpanded = entry.classList.contains('is-expanded');
            
            // 先关闭所有的展开（手风琴效果，更加干净）
            document.querySelectorAll('.visitor-entry.is-expanded').forEach(function (other) {
              if (other !== entry) {
                other.classList.remove('is-expanded');
                var otherList = other.querySelector('.visitor-history-list');
                if (otherList) {
                  otherList.style.maxHeight = '0px';
                  otherList.style.opacity = '0';
                }
              }
            });

            // 切换当前
            entry.classList.toggle('is-expanded');
            var list = entry.querySelector('.visitor-history-list');
            
            if (entry.classList.contains('is-expanded')) {
              list.style.maxHeight = list.scrollHeight + 'px';
              list.style.opacity = '1';
            } else {
              list.style.maxHeight = '0px';
              list.style.opacity = '0';
            }
          });
        }
      })();
    }
  }

  // =========================================================
  // 初始化
  // =========================================================
  document.addEventListener('DOMContentLoaded', function () {
    // 防抖：避免极短时间内重复触发
    var debounceTimer = null;

    function init() {
      // 检查 owner 偏好配置
      checkOwnerToggle();
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
     * - 重新追踪和更新页面统计
     * - 在 /visitors/ 页面重新渲染面板
     */
    reinit: function () {
      trackVisit();
      fetchPageStats();
      // 如果导航到 visitors 页面，渲染面板
      renderVisitorBoard();
      // 重新拉取访客列表（如果面板已存在）
      if (document.querySelector('.widget--visitor-board')) {
        fetchVisitors();
      }
    }
  };
})();
