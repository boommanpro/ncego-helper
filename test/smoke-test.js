#!/usr/bin/env node
/**
 * 无头功能冒烟测试：在 Node 中用桩(DOM stub)加载 courseband-nce.user.js，
 * 验证核心行为：初始化、数据解压、课件填充(textarea)、进度记忆、深链参数。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

/* ---------- DOM / 浏览器 API 桩 ---------- */
function stubEl(tag) {
  return {
    tagName: (tag || 'div').toUpperCase(),
    style: {},
    value: '',
    checked: false,
    files: null,
    className: '',
    innerHTML: '',
    textContent: '',
    classList: { add() {}, remove() {} },
    children: [],
    appendChild() {},
    remove() {},
    addEventListener() {},
    dispatchEvent() { return true; },
    querySelector() { return stubEl('div'); },
    querySelectorAll() { return []; },
    attachShadow() { const s = stubEl('div'); this.shadowRoot = s; return s; },
    setAttribute() {}
  };
}

let textareaValue = '';
const textareaStub = stubEl('textarea');
textareaStub.addEventListener = (type, fn) => { textareaStub['on' + type] = fn; };

const localStorageStub = (() => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
})();

global.window = globalThis;
global.location = { search: '' };
global.localStorage = localStorageStub;
global.HTMLTextAreaElement = { prototype: {} };
global.HTMLInputElement = { prototype: {} };
global.document = {
  readyState: 'complete',
  title: 'test',
  querySelector: (sel) => (sel === 'textarea' ? textareaStub : null),
  querySelectorAll: () => [],
  getElementById: () => null,
  createElement: (tag) => stubEl(tag),
  addEventListener: () => {},
  removeEventListener: () => {},
  body: { appendChild() {}, removeChild() {} }
};
global.dispatchEvent = () => true;
global.addEventListener = () => {};

/* ---------- 加载用户脚本 ---------- */
const script = fs.readFileSync(path.join(__dirname, '..', 'courseband-nce.user.js'), 'utf8');
vm.runInThisContext(script, { filename: 'courseband-nce.user.js' });

/* ---------- 断言工具 ---------- */
let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name); }
}

(async () => {
  console.log('[1] 初始化');
  check('window.CourseBandNCE 已暴露', typeof window.CourseBandNCE === 'object');
  check('books 列表为 4 册', window.CourseBandNCE.books.length === 4);

  console.log('[2] 数据解压与获取');
  const lesson = await window.CourseBandNCE.getLesson(1, 2);
  check('第1册第2课存在', !!lesson);
  check('标题正确', lesson && lesson.metadata.title === 'Lesson 1&2 Excuse me!');
  check('中文标题正确', lesson && lesson.metadata.chinese === '对不起！');
  const l4 = await window.CourseBandNCE.getLesson(4, 281);
  check('第4册第281课存在(48课/册尾)', !!l4 && l4.metadata.title.includes('Lesson 48'));

  console.log('[3] 一键填充 -> textarea');
  textareaValue = '';
  textareaStub.value = '';
  await window.CourseBandNCE.loadLesson(2, 76);
  check('textarea 已写入 JSON', textareaStub.value.includes('"lesson_id":76'));
  check('写入内容为完整课件', JSON.parse(textareaStub.value).metadata.title === 'Lesson 1 A Private Conversation');

  console.log('[4] 学习进度记忆');
  check('nce:last 已记录 2:76', localStorage.getItem('nceaf:nce:last') === '2:76');

  console.log('[5] 深链参数解析');
  global.location = { search: '?book=3&lesson=173' };
  // 重新加载脚本以触发 startAutoLoad（防止 __nceAutoFillStarted 重复执行）
  textareaStub.value = '';
  // 手动清理标志后重跑
  window.__nceAutoFillStarted = false;
  vm.runInThisContext(script, { filename: 'courseband-nce.user.js' });
  await new Promise((r) => setTimeout(r, 300));
  check('深链 ?book=3&lesson=173 自动填充', textareaStub.value.includes('"lesson_id":173'));
  check('自动填充后记忆更新为 3:173', localStorage.getItem('nceaf:nce:last') === '3:173');

  console.log('[6] ncego 课程页自动导入');
  // 模拟 ncego 课程页环境：LessonConfig + CoursewareApp
  let renderedLesson = null;
  const mockApp = {
    subtitles: [],
    lessonId: 60,
    bookId: 1,
    render(lesson) { renderedLesson = lesson; this.subtitles = [1, 2, 3]; }
  };
  global.location = { hostname: 'www.ncego.com', search: '', pathname: '/lessons/60' };
  global.LessonConfig = { bookId: 1, lessonId: 60, sortId: 1 };
  global.CoursewareApp = mockApp;
  global.toast = () => {};
  window.__nceAutoFillStarted = false;
  vm.runInThisContext(script, { filename: 'courseband-nce.user.js' });
  await new Promise((r) => setTimeout(r, 600));
  check('自动调用 CoursewareApp.render', !!renderedLesson);
  check('导入的课件为当前课(60=Lesson 117&118)', renderedLesson && renderedLesson.metadata.title.includes('Tommy'));
  check('导入后记忆更新为 1:60', localStorage.getItem('nceaf:nce:last') === '1:60');
  // 已渲染后再次加载应跳过（不重复导入）
  const renderCountBefore = renderedLesson;
  window.__nceAutoFillStarted = false;
  vm.runInThisContext(script, { filename: 'courseband-nce.user.js' });
  await new Promise((r) => setTimeout(r, 300));
  check('已加载课程不重复导入', renderedLesson === renderCountBefore);

  console.log(`\n结果: ${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('测试异常:', e); process.exit(1); });
