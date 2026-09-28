#!/usr/bin/env node
/**
 * 构建 courseband-nce.user.js
 * 读取 downloads/nce{1-4}/nce{1-4}/*.json，合并为 { bookId: { lessonId: lesson } }，
 * gzip 压缩后 base64 编码，注入 src/template.js 中的 __NCE_DATA_B64__ 占位符。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const downloadsDir = path.join(root, 'downloads');
const BOOKS = ['nce1', 'nce2', 'nce3', 'nce4'];

function main() {
  const data = {};
  let total = 0;

  for (const book of BOOKS) {
    const dir = path.join(downloadsDir, book, book);
    if (!fs.existsSync(dir)) {
      console.error('缺少目录: ' + dir);
      process.exit(1);
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const lesson = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      const bid = lesson.metadata && lesson.metadata.book_id;
      const lid = lesson.metadata && lesson.metadata.lesson_id;
      if (!bid || !lid) continue;
      (data[bid] = data[bid] || {})[lid] = lesson;
      total++;
    }
  }

  const json = JSON.stringify(data);
  const gz = zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
  const b64 = gz.toString('base64');

  const template = fs.readFileSync(path.join(root, 'src', 'template.js'), 'utf8');
  if (!template.includes('__NCE_DATA_B64__')) {
    console.error('模板中缺少占位符 __NCE_DATA_B64__');
    process.exit(1);
  }
  const out = template.replace('__NCE_DATA_B64__', b64);
  const target = path.join(root, 'courseband-nce.user.js');
  fs.writeFileSync(target, out, 'utf8');

  console.log('课件总数: ' + total);
  console.log('书籍: ' + Object.keys(data).map((b) => '第' + b + '册(' + Object.keys(data[b]).length + '课)').join(' / '));
  console.log('原始 JSON: ' + (json.length / 1048576).toFixed(2) + ' MB');
  console.log('gzip: ' + (gz.length / 1048576).toFixed(2) + ' MB');
  console.log('base64: ' + (b64.length / 1048576).toFixed(2) + ' MB');
  console.log('生成: ' + target + ' (' + (out.length / 1048576).toFixed(2) + ' MB)');
}

main();
