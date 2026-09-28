# ncego-helper

新概念英语 1-4 册课件自动导入用户脚本（Tampermonkey / ScriptCat）。

为[夸克英语笔记 ncego.com](https://www.ncego.com/)的课程页自动导入《新概念英语》1-4 册共 276 课的本地课件，
并自动去除页面广告。全程静默运行，无需人工操作。

## 功能

- **自动导入**：打开 `ncego.com` 课程页（如 `https://www.ncego.com/lessons/60`），自动识别当前课
  并调用页面官方 `CoursewareApp.render()` 导入本课课件，不依赖任何手动选择。
- **自动去广告**：`document-start` 阶段注入屏蔽样式，并用 `MutationObserver` 动态清理
  Google AdSense 等广告元素（`ins.adsbygoogle`、`aswift_*`、`doubleclick.net` 等）。
- **静默模式（默认）**：不创建右下角悬浮按钮，不弹出信息类提示（错误提示仍保留）。
- **临时唤出面板**：按 `Alt + Shift + N` 切换悬浮面板，可手动选册/选课、一键导入、预览课件、
  开关「打开页面时自动导入」。
- **完全离线**：276 课课件以 gzip + base64 内嵌在脚本内（原始 JSON 3.86 MB → 约 1.44 MB），
  运行时用 `DecompressionStream('gzip')` 解压，零网络依赖。
- **通用填充回退**：若页面存在 `textarea` / 文件导入框（如 courseband.com 页面），自动写入课件 JSON。

## 安装

1. 浏览器安装 [Tampermonkey](https://www.tampermonkey.net/) 或 [ScriptCat](https://scriptcat.org/) 扩展。
2. 安装仓库根目录的 [`courseband-nce.user.js`](./courseband-nce.user.js)：
   - 新建脚本，粘贴文件内容后保存；或
   - 直接打开该文件的 raw 地址，由扩展自动弹出安装/更新确认页。

## 使用

打开 ncego.com 任意课程页即可，脚本会自动完成导入，无需任何操作。

需要手动干预时：

| 操作 | 说明 |
| --- | --- |
| `Alt + Shift + N` | 唤出 / 隐藏悬浮面板 |
| 面板「一键导入」 | 手动导入当前选中课程 |
| 面板「预览」 | 在内置阅读器中查看课件文本与音频 |
| 面板「自动导入」勾选框 | 关闭后不再自动导入 |

页面脚本也可调用暴露的 API：

```js
window.CourseBandNCE.getLesson(1, 60);        // 读取课件 JSON
window.CourseBandNCE.loadLesson(1, 60);       // 导入指定课程
window.CourseBandNCE.importCurrent();         // 导入当前课程页对应课件
window.CourseBandNCE.togglePanel();           // 切换悬浮面板
window.CourseBandNCE.isSilent();              // 当前是否为静默模式
```

## 支持站点

| 站点 | 行为 |
| --- | --- |
| `www.ncego.com` | 自动导入当前课课件 + 去广告 |
| `www.courseband.com` | 自动填充课件 JSON 到页面导入区 |
| `localhost` / `127.0.0.1` | 本地测试页调试 |

## 目录结构

```
courseband-nce.user.js   构建产物（已内嵌全部课件数据，直接安装这个）
src/template.js          用户脚本源码模板（含 __NCE_DATA_B64__ 占位符）
scripts/build.js         构建脚本：合并课件 → gzip → base64 → 注入模板
test/smoke-test.js       无头冒烟测试（Node + DOM 桩，15 项断言）
test/parser.html         带 textarea 导入区的模拟页面
test/fileonly.html       仅文件导入框的模拟页面
test/noparser.html       无导入区的模拟页面（测试预览回退）
```

## 构建

课件原始 JSON 不入库，需自行准备到 `downloads/`：

```
downloads/nce1/nce1/*.json
downloads/nce2/nce2/*.json
downloads/nce3/nce3/*.json
downloads/nce4/nce4/*.json
```

然后执行：

```bash
node scripts/build.js      # 生成 courseband-nce.user.js
node test/smoke-test.js    # 运行冒烟测试
```

课件 JSON 需符合 CourseBand 协议：

```jsonc
{
  "version": "...",
  "metadata": {
    "book_id": 1,
    "lesson_id": 60,
    "title": "Lesson 117&118 Tommy's breakfast",
    "chinese": "汤米的早餐",
    "media": { "audio": "<base64>", "video": "<base64>" }
  },
  "content": {
    "html_structure": { "encoding": "...", "mime": "...", "content": "<base64>" },
    "subtitles": { "encoding": "...", "data": "<base64>" }
  }
}
```

## 课程 ID 对照

ncego 的 `lessonId` 与 CourseBand 的 `metadata.lesson_id` 完全一致，无需映射表：

| 册 | lesson_id 范围 | 课数 |
| --- | --- | --- |
| 第一册 | 2 – 73 | 72 |
| 第二册 | 76 – 171 | 96 |
| 第三册 | 173 – 232 | 60 |
| 第四册 | 234 – 281 | 48 |

## 免责声明

课件数据源自 [courseband.com](https://www.courseband.com/)，仅供个人学习研究使用。
《新概念英语》内容版权归原作者及出版方所有，请勿用于商业用途或公开传播。

## 版本

当前版本：**1.1.3**