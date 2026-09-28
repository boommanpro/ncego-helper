// ==UserScript==
// @name         新概念英语1-4册 课件自动导入（CourseBand 数据 · ncego/courseband）
// @namespace    com.courseband.nce-auto-fill
// @version      1.1.3
// @description  静默模式：内嵌《新概念英语》1-4 册 276 课课件（源自 courseband.com）。打开 ncego.com 课程页自动导入本课课件并自动去除页面广告，全程无需人工操作、无右下角悬浮按钮；按 Alt+Shift+N 可临时唤出悬浮面板；courseband.com 页面自动填充加载。
// @author       boommanpro
// @match        https://www.ncego.com/*
// @match        https://www.courseband.com/*
// @match        https://courseband.com/*
// @match        *://localhost/*
// @match        *://127.0.0.1/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        unsafeWindow
// @run-at       document-start
// @noframes
// ==/UserScript==

(function () {
  'use strict';

  /* ==================== 页面全局对象访问（兼容用户脚本沙箱） ==================== */
  const PAGE = (function () {
    try { if (typeof unsafeWindow !== 'undefined' && unsafeWindow) return unsafeWindow; } catch (e) { /* ignore */ }
    try { if (document.defaultView) return document.defaultView; } catch (e) { /* ignore */ }
    return window;
  })();

  /* ==================== 内嵌课件数据（构建时由 scripts/build.js 注入，gzip + base64） ==================== */
  const NCE_DATA_B64 = '__NCE_DATA_B64__';

  /* ==================== 基础配置 ==================== */
  const BOOKS = [
    { id: 1, name: '新概念英语第一册', short: '新概念一', color: '#059669' },
    { id: 2, name: '新概念英语第二册', short: '新概念二', color: '#2563eb' },
    { id: 3, name: '新概念英语第三册', short: '新概念三', color: '#4f46e5' },
    { id: 4, name: '新概念英语第四册', short: '新概念四', color: '#c026d3' }
  ];
  const LS_PREFIX = 'nceaf:';

  /* ==================== 存储（GM 优先，降级 localStorage） ==================== */
  function gmGet(key, def) {
    try { if (typeof GM_getValue === 'function') return GM_getValue(key, def); } catch (e) { /* ignore */ }
    try { const v = localStorage.getItem(LS_PREFIX + key); return v == null ? def : v; } catch (e) { return def; }
  }
  function gmSet(key, val) {
    try { if (typeof GM_setValue === 'function') { GM_setValue(key, val); return; } } catch (e) { /* ignore */ }
    try { localStorage.setItem(LS_PREFIX + key, String(val)); } catch (e) { /* ignore */ }
  }

  /* ==================== 静默模式 ==================== */
  function getUiMode() { return gmGet('nce:ui', 'silent'); }
  function isSilent() { return getUiMode() === 'silent'; }
  /* 静默模式下的信息提示不展示（错误提示仍然保留） */
  function infoToast(msg) { if (!isSilent()) showToast(msg); }

  /* ==================== 数据解压 ==================== */
  let dataPromise = null;
  function inflateBase64Gzip(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof DecompressionStream === 'function') {
      return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')))
        .arrayBuffer()
        .then((buf) => JSON.parse(new TextDecoder().decode(buf)));
    }
    return Promise.reject(new Error('当前浏览器不支持 DecompressionStream（请升级浏览器）'));
  }
  function getData() { if (!dataPromise) dataPromise = inflateBase64Gzip(NCE_DATA_B64); return dataPromise; }
  function decodeB64(str) { try { return atob(str); } catch (e) { return ''; } }

  /* ==================== 工具函数 ==================== */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function setNativeValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'value');
    if (desc && desc.set) desc.set.call(el, value); else el.value = value;
  }
  function waitFor(cond, timeout, interval) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const t = setInterval(() => {
        let ok = false;
        try { ok = cond(); } catch (e) { ok = false; }
        if (ok) { clearInterval(t); resolve(true); }
        else if (Date.now() - start > timeout) { clearInterval(t); reject(new Error('waitFor 超时')); }
      }, interval || 100);
    });
  }
  function showToast(msg, ms) {
    try { if (typeof window.toastHide === 'function') window.toastHide(); } catch (e) { /* ignore */ }
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;background:#111827;color:#fff;' +
      'padding:10px 16px;border-radius:10px;font:13px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.28);max-width:440px;transition:opacity .3s;';
    document.body.appendChild(t);
    window.toastHide = () => { t.style.opacity = '0'; setTimeout(() => t.remove(), 320); };
    setTimeout(window.toastHide, ms || 3200);
  }
  /* 优先使用站点自带 toast（ncego 有 window.toast） */
  function nativeToast(style, msg, title) {
    if (typeof PAGE.toast === 'function') { try { PAGE.toast(style, msg, title); return; } catch (e) { /* ignore */ } }
    showToast((title ? title + '：' : '') + msg);
  }

  /* ==================== 自动去广告 ==================== */
  const AD_BLOCK_HOSTS = [
    'doubleclick.net', 'googleadservices.com', 'googleads.g.doubleclick.net',
    'pagead2.googlesyndication.com', 'googlesyndication.com', 'google-analytics.com',
    'adservice.google.com', 'amazon-adsystem.com', 'fundingchoicesmessages.google.com'
  ];
  const AD_SELECTOR = [
    'ins.adsbygoogle', 'div[id^="google_ads_iframe"]', 'div[id^="aswift_"]',
    'iframe[id^="aswift_"]', 'iframe[src*="doubleclick.net"]', 'iframe[src*="googleads"]',
    'iframe[src*="pagead2"]', 'iframe[src*="googlesyndication"]',
    'iframe[src*="fundingchoices"]', 'iframe[src*="amazon-adsystem"]', '.ad-banner', '.advertisement'
  ].join(', ');

  function isAdElement(el) {
    if (!el || el.nodeType !== 1) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'ins' && (el.classList.contains('adsbygoogle') || String(el.className).includes('adsbygoogle'))) return true;
    if (tag === 'iframe' && el.src) return AD_BLOCK_HOSTS.some((h) => el.src.indexOf(h) !== -1);
    const id = String(el.id || '').toLowerCase();
    const cls = String(typeof el.className === 'string' ? el.className : '').toLowerCase();
    if (id.indexOf('google_ads') !== -1 || id.indexOf('aswift') !== -1) return true;
    if (cls.indexOf('adsbygoogle') !== -1 || cls.indexOf('advert') !== -1 || cls.indexOf('ad-banner') !== -1) return true;
    return false;
  }

  function hideAds() {
    try {
      if (!document.getElementById('nce-adblock-style')) {
        const st = document.createElement('style');
        st.id = 'nce-adblock-style';
        st.textContent = AD_SELECTOR + ' { display:none !important; visibility:hidden !important; }';
        (document.head || document.documentElement || document.body).appendChild(st);
      }
    } catch (e) { /* ignore */ }
    try {
      document.querySelectorAll(AD_SELECTOR + ', iframe').forEach((el) => { if (isAdElement(el)) el.remove(); });
    } catch (e) { /* ignore */ }
  }

  function initAdBlocker() {
    hideAds();
    if (typeof MutationObserver !== 'function') return;
    try {
      const mo = new MutationObserver((mutations) => {
        let dirty = false;
        for (const m of mutations) {
          if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) { dirty = true; break; }
          if (m.type === 'attributes') {
            const t = m.target;
            if (t && t.nodeType === 1 && isAdElement(t)) { try { t.remove(); } catch (e) { /* ignore */ } }
          }
        }
        if (dirty) hideAds();
      });
      const root = document.documentElement || document.body;
      if (root) mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'class', 'id', 'style'] });
    } catch (e) { /* ignore */ }
  }

  /* DOM 就绪（document-start 时 body 可能尚未创建） */
  function whenDomReady() {
    if (document.readyState === 'loading') {
      return new Promise((res) => document.addEventListener('DOMContentLoaded', res, { once: true }));
    }
    return Promise.resolve();
  }

  /* ==================== ncego.com 集成 ==================== */
  function isNcego() { return /(^|\.)ncego\.com$/.test(location.hostname); }
  function isCourseband() { return /(^|\.)courseband\.com$/.test(location.hostname); }

  /* 解析当前页面属于哪一课：优先 LessonConfig，其次 URL 路径 */
  function detectLessonContext() {
    if (isNcego()) {
      const cfg = PAGE.LessonConfig;
      if (cfg && cfg.lessonId) return { provider: 'ncego', bookId: cfg.bookId, lessonId: cfg.lessonId };
      const m = location.pathname.match(/^\/lessons\/(\d+)/);
      if (m) return { provider: 'ncego', bookId: null, lessonId: Number(m[1]) };
    }
    return null;
  }

  /* 在 ncego 课程页通过官方 CoursewareApp.render() 导入内嵌课件 */
  async function importToNcego(bookId, lessonId, opts) {
    opts = opts || {};
    if (typeof PAGE.CoursewareApp !== 'object') throw new Error('页面未提供 CoursewareApp');
    const data = await getData();
    let bid = bookId;
    if (!bid) {
      for (const b of Object.keys(data)) { if (data[b] && data[b][lessonId]) { bid = Number(b); break; } }
    }
    const lesson = bid && data[bid] && data[bid][lessonId];
    if (!lesson) throw new Error('未找到内嵌课件 book=' + bid + ' lesson=' + lessonId);
    PAGE.CoursewareApp.render(lesson);
    gmSet('nce:last', bid + ':' + lessonId);
    if (!opts.silent && !isSilent()) nativeToast('text-bg-success', '已自动导入课件「' + lesson.metadata.title + '」', '新概念课件');
    return lesson;
  }

  /* 等待页面初始化完成后自动导入当前课 */
  async function initNcegoAutoImport() {
    const ctx = detectLessonContext();
    if (!ctx || !ctx.lessonId) return;
    try {
      await waitFor(() => typeof PAGE.CoursewareApp === 'object' &&
        PAGE.CoursewareApp.lessonId != null && PAGE.CoursewareApp.bookId != null, 8000);
    } catch (e) { return; }
    // 已缓存/已渲染则跳过（不打扰用户已有状态）
    if (PAGE.CoursewareApp.subtitles && PAGE.CoursewareApp.subtitles.length > 0) return;
    importToNcego(ctx.bookId, ctx.lessonId, { silent: false }).catch(() => { /* 数据未覆盖时静默 */ });
  }

  /* ==================== 课件填充到页面 ==================== */
  function fillIntoPage(lesson, manual) {
    if (!lesson) return;
    const jsonText = JSON.stringify(lesson);
    const title = (lesson.metadata && lesson.metadata.title) || '';

    const textarea = document.querySelector('textarea');
    if (textarea) {
      setNativeValue(textarea, jsonText);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      infoToast('已自动填充课件「' + title + '」到文本导入框');
      dispatchLessonEvent(lesson);
      return;
    }
    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      try {
        const dt = new DataTransfer();
        dt.items.add(new File([jsonText], 'lesson-' + lesson.metadata.lesson_id + '.json', { type: 'application/json' }));
        fileInput.files = dt.files;
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
        infoToast('已自动填充课件「' + title + '」到文件导入框');
        dispatchLessonEvent(lesson);
        return;
      } catch (e) { /* 回退到预览 */ }
    }
    dispatchLessonEvent(lesson);
    if (manual) openPreview(lesson);
    else infoToast('课件「' + title + '」已就绪（当前页面无导入区，点悬浮面板「预览」查看）');
  }

  /* 向页面派发课件就绪事件（页面可监听 courseband:lesson） */
  function dispatchLessonEvent(lesson) {
    try {
      const CE = (PAGE && PAGE.CustomEvent) || CustomEvent;
      const ev = new CE('courseband:lesson', { detail: lesson });
      if (PAGE && typeof PAGE.dispatchEvent === 'function') PAGE.dispatchEvent(ev);
      else window.dispatchEvent(ev);
    } catch (e) { /* ignore */ }
  }

  /* 加载课件：ncego 课程页走官方导入，其余页面走通用填充 */
  async function loadLesson(bookId, lessonId, manual) {
    const data = await getData();
    const book = data[bookId];
    if (!book) throw new Error('未找到第 ' + bookId + ' 册课件');
    const lesson = book[lessonId];
    if (!lesson) throw new Error('未找到第 ' + bookId + ' 册第 ' + lessonId + ' 课课件');
    if (isNcego() && typeof PAGE.CoursewareApp === 'object') {
      PAGE.CoursewareApp.render(lesson);
      gmSet('nce:last', bookId + ':' + lessonId);
      if (!isSilent()) nativeToast('text-bg-success', '已导入课件「' + lesson.metadata.title + '」', '新概念课件');
      return lesson;
    }
    fillIntoPage(lesson, manual);
    gmSet('nce:last', bookId + ':' + lessonId);
    return lesson;
  }

  /* ==================== 课件预览（内置轻量阅读器） ==================== */
  let previewHost = null;
  function openPreview(lesson) {
    if (!lesson) return;
    if (!previewHost) {
      previewHost = document.createElement('div');
      previewHost.style.cssText = 'all:initial;position:fixed;z-index:2147483646;inset:0;display:flex;align-items:center;justify-content:center;' +
        'background:rgba(15,23,42,.55);backdrop-filter:blur(2px);font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;';
      document.body.appendChild(previewHost);
    }
    const meta = lesson.metadata || {};
    const html = decodeB64((lesson.content && lesson.content.html_structure && lesson.content.html_structure.content) || '');
    let audioUrl = '';
    try { audioUrl = decodeB64((meta.media && meta.media.audio) || ''); } catch (e) { /* ignore */ }

    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;color:#111827;width:min(720px,92vw);max-height:86vh;border-radius:16px;overflow:hidden;' +
      'display:flex;flex-direction:column;box-shadow:0 24px 64px rgba(0,0,0,.35);';
    card.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:#0f172a;color:#fff;">' +
      '<div style="font-weight:700;font-size:15px;">' + esc(meta.title || '') + '<span style="margin-left:8px;color:#93c5fd;font-weight:400;font-size:13px;">' + esc(meta.chinese || '') + '</span></div>' +
      '<button data-act="close" style="background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer;line-height:1;">×</button></div>' +
      (audioUrl ? '<audio controls preload="none" style="width:100%;padding:10px 18px;background:#f1f5f9;display:block;box-sizing:border-box;" src="' + esc(audioUrl) + '"></audio>' : '') +
      '<div data-role="body" style="flex:1;overflow:auto;padding:18px;line-height:1.9;font-size:15px;"></div>' +
      '<div style="padding:12px 18px;border-top:1px solid #e5e7eb;display:flex;gap:10px;justify-content:flex-end;background:#f9fafb;">' +
      '<button data-act="copy" style="background:#e5e7eb;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:13px;">复制 JSON</button>' +
      '<button data-act="close" style="background:#2563eb;color:#fff;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;font-size:13px;">关闭</button></div>';
    const body = card.querySelector('[data-role="body"]');
    const htmlStyle = 'style="margin:0 0 6px;"';
    const safeHtml = (html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<(p|div)[^>]*class="chinese"[^>]*>/gi, '<div style="color:#6b7280;font-size:14px;margin:0 0 10px 0;">')
      .replace(/<p[^>]*>/gi, '<p ' + htmlStyle + '>');
    body.innerHTML = safeHtml || '<p style="color:#9ca3af;">（该课件无文本内容）</p>';
    card.querySelectorAll('[data-act="close"]').forEach((b) => b.addEventListener('click', () => { previewHost.innerHTML = ''; previewHost.style.display = 'none'; }));
    card.querySelector('[data-act="copy"]').addEventListener('click', () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(JSON.stringify(lesson)).then(() => showToast('JSON 已复制'));
      }
    });
    previewHost.style.display = 'flex';
    previewHost.innerHTML = '';
    previewHost.appendChild(card);
  }

  /* ==================== 启动时自动加载/导入 ==================== */
  function startAutoLoad() {
    const params = new URLSearchParams(location.search);
    const b = params.get('book');
    const l = params.get('lesson');
    if (b && l) {
      loadLesson(Number(b), Number(l), false).catch((e) => showToast('自动加载失败：' + e.message));
      return;
    }
    if (gmGet('nce:auto', '1') === '0') return;
    if (isNcego()) { initNcegoAutoImport(); return; }
    const last = gmGet('nce:last', '');
    if (last) {
      const [bk, ls] = last.split(':').map(Number);
      if (bk && ls) loadLesson(bk, ls, false).catch(() => { /* 静默 */ });
    }
  }

  /* ==================== 悬浮面板（Shadow DOM 隔离样式；静默模式下默认不创建） ==================== */
  function initPanel(openNow) {
    const host = document.createElement('div');
    host.id = 'nce-auto-fill-panel';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483645;right:16px;bottom:72px;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });

    shadow.innerHTML =
      '<style>' +
      ':host{all:initial;}' +
      '.fab{position:fixed;right:16px;bottom:16px;z-index:2147483645;display:flex;align-items:center;gap:8px;background:#0f172a;color:#fff;border:0;border-radius:999px;padding:10px 16px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.3);font-family:inherit;}' +
      '.fab:hover{background:#1e293b;}' +
      '.panel{position:fixed;right:16px;bottom:72px;width:360px;max-width:calc(100vw - 32px);background:#fff;color:#111827;border-radius:14px;box-shadow:0 20px 48px rgba(0,0,0,.28);overflow:hidden;display:none;font-family:inherit;}' +
      '.panel.open{display:block;}' +
      '.head{background:#0f172a;color:#fff;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:14px;}' +
      '.head .close{background:transparent;border:0;color:#fff;font-size:18px;cursor:pointer;line-height:1;}' +
      '.body{padding:14px 16px;}' +
      '.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px;}' +
      '.tab{flex:1;min-width:64px;text-align:center;padding:7px 4px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;font-size:12px;cursor:pointer;color:#374151;}' +
      '.tab.active{color:#fff;border-color:transparent;}' +
      '.row{display:flex;gap:10px;align-items:center;margin-bottom:12px;}' +
      'select{flex:1;padding:8px 10px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;background:#fff;color:#111827;}' +
      '.btn{flex:1;padding:10px 12px;border:0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;color:#fff;}' +
      '.btn.load{background:#2563eb;}.btn.preview{background:#6b7280;}' +
      '.auto{display:flex;align-items:center;gap:8px;font-size:13px;color:#374151;margin-bottom:10px;cursor:pointer;user-select:none;}' +
      '.status{font-size:12px;color:#6b7280;background:#f3f4f6;border-radius:8px;padding:8px 10px;word-break:break-all;}' +
      '.status b{color:#111827;}' +
      '</style>' +
      '<button class="fab" data-act="toggle">📚 新概念课件</button>' +
      '<div class="panel">' +
      '<div class="head"><span>新概念英语 1-4 本地课件</span><button class="close" data-act="close">×</button></div>' +
      '<div class="body">' +
      '<div class="tabs" data-role="tabs"></div>' +
      '<div class="row"><select data-role="lesson"></select></div>' +
      '<div class="row"><button class="btn load" data-act="load">一键导入</button><button class="btn preview" data-act="preview">预览</button></div>' +
      '<label class="auto"><input type="checkbox" data-role="auto"> 打开页面时自动导入课件</label>' +
      '<div class="status" data-role="status">正在解压课件数据…</div>' +
      '</div></div>';

    const fab = shadow.querySelector('[data-act="toggle"]');
    const panel = shadow.querySelector('.panel');
    const closeBtn = shadow.querySelector('[data-act="close"]');
    const tabsEl = shadow.querySelector('[data-role="tabs"]');
    const lessonSel = shadow.querySelector('[data-role="lesson"]');
    const autoCb = shadow.querySelector('[data-role="auto"]');
    const statusEl = shadow.querySelector('[data-role="status"]');

    autoCb.checked = gmGet('nce:auto', '1') !== '0';
    let currentBook = Number(gmGet('nce:book', '1'));
    let loaded = false;

    const ctx = detectLessonContext();
    if (ctx && ctx.bookId) currentBook = Number(ctx.bookId);

    function renderTabs() {
      tabsEl.innerHTML = '';
      BOOKS.forEach((b) => {
        const t = document.createElement('button');
        t.className = 'tab' + (b.id === currentBook ? ' active' : '');
        t.textContent = b.short;
        t.style.background = b.id === currentBook ? b.color : '';
        t.addEventListener('click', () => { currentBook = b.id; gmSet('nce:book', String(b.id)); renderTabs(); populateLessons(); });
        tabsEl.appendChild(t);
      });
    }

    async function populateLessons() {
      statusEl.innerHTML = '正在读取第 ' + currentBook + ' 册目录…';
      try {
        const data = await getData();
        const ids = Object.keys(data[currentBook] || {}).map(Number).sort((a, b) => a - b);
        lessonSel.innerHTML = '';
        ids.forEach((id) => {
          const lesson = data[currentBook][id];
          const label = (lesson.metadata && lesson.metadata.title) ? (lesson.metadata.title + (lesson.metadata.chinese ? ' ' + lesson.metadata.chinese : '')) : ('第 ' + id + ' 课');
          const opt = document.createElement('option');
          opt.value = id;
          opt.textContent = label;
          lessonSel.appendChild(opt);
        });
        // 优先选中当前页课程，否则选中上次学习课程
        let pick = null;
        if (ctx && ctx.lessonId && ids.includes(ctx.lessonId)) pick = ctx.lessonId;
        if (pick == null) {
          const last = gmGet('nce:last', '');
          if (last) {
            const [bk, ls] = last.split(':').map(Number);
            if (bk === currentBook && ids.includes(ls)) pick = ls;
          }
        }
        if (pick != null) lessonSel.value = String(pick);
        statusEl.innerHTML = '第' + currentBook + '册共 <b>' + ids.length + '</b> 课（内嵌数据 ' + (NCE_DATA_B64.length / 1048576).toFixed(2) + ' MB）';
        loaded = true;
      } catch (e) {
        statusEl.textContent = '数据加载失败：' + e.message;
      }
    }

    function selectedLesson() {
      const id = Number(lessonSel.value);
      if (!id) return null;
      return { book: currentBook, lesson: id };
    }

    fab.addEventListener('click', () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open') && !loaded) populateLessons();
    });
    closeBtn.addEventListener('click', () => panel.classList.remove('open'));
    autoCb.addEventListener('change', () => gmSet('nce:auto', autoCb.checked ? '1' : '0'));
    shadow.querySelector('[data-act="load"]').addEventListener('click', () => {
      const sel = selectedLesson();
      if (!sel) { showToast('请先选择课程'); return; }
      loadLesson(sel.book, sel.lesson, true)
        .then((lesson) => { statusEl.innerHTML = '已导入：<b>' + esc(lesson.metadata.title) + '</b>'; })
        .catch((e) => showToast('导入失败：' + e.message));
    });
    shadow.querySelector('[data-act="preview"]').addEventListener('click', () => {
      const sel = selectedLesson();
      if (!sel) { showToast('请先选择课程'); return; }
      getData().then((d) => openPreview(d[sel.book] && d[sel.book][sel.lesson])).catch((e) => showToast('预览失败：' + e.message));
    });

    renderTabs();
    populateLessons();
    if (openNow) panel.classList.add('open');
  }

  /* ==================== 面板开关（静默模式默认隐藏，Alt+Shift+N 唤出） ==================== */
  function togglePanelUi() {
    if (getUiMode() === 'silent') {
      gmSet('nce:ui', 'panel');
      whenDomReady().then(() => initPanel(true));
    } else {
      gmSet('nce:ui', 'silent');
      const h = document.getElementById('nce-auto-fill-panel');
      if (h) h.remove();
    }
  }

  function initUiToggle() {
    document.addEventListener('keydown', (e) => {
      if (e.altKey && e.shiftKey && (e.key === 'N' || e.key === 'n')) {
        e.preventDefault();
        togglePanelUi();
      }
    });
  }

  /* ==================== 对外 API ==================== */
  const api = {
    books: BOOKS,
    loadLesson: (book, lesson) => loadLesson(book, lesson, true).catch((e) => showToast('加载失败：' + e.message)),
    getLesson: async (book, lesson) => (await getData())[book] && (await getData())[book][lesson],
    preview: (book, lesson) => getData().then((d) => openPreview(d[book] && d[book][lesson])),
    importCurrent: () => isNcego() && initNcegoAutoImport(),
    showPanel: () => { gmSet('nce:ui', 'panel'); whenDomReady().then(() => initPanel(true)); },
    togglePanel: () => togglePanelUi(),
    isSilent: () => isSilent(),
    version: '1.1.3'
  };
  window.CourseBandNCE = api;
  try { PAGE.CourseBandNCE = api; } catch (e) { /* ignore */ }

  /* ==================== 启动 ==================== */
  if (!window.__nceAutoFillStarted) {
    window.__nceAutoFillStarted = true;
    initAdBlocker();                        // 尽早去广告（document-start）
    startAutoLoad();                        // 自动导入/加载课件
    initUiToggle();                         // Alt+Shift+N 唤出面板
    if (!isSilent()) whenDomReady().then(() => initPanel()); // 静默模式默认不创建面板
  }
})();
