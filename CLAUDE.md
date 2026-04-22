# html2mp4 项目说明

## 项目目标

把本地 HTML 文件（动画、演示页面等）录制为 MP4 视频，提供桌面 GUI。

## 架构概览

```
html2mp4/
├── electron/
│   ├── main.cjs          # Electron 主进程：启动引擎 + 创建窗口
│   └── preload.cjs       # IPC bridge：暴露 nativeFileDialog.pickHtmlFile()
├── engine/
│   ├── server.cjs        # WebSocket 服务器（ws://127.0.0.1:8765）
│   ├── renderer.cjs      # Electron offscreen BrowserWindow 截图
│   ├── encoder.cjs       # fluent-ffmpeg → H.264 MP4 编码
│   └── preload-capture.cjs  # precise 模式：在页面脚本前注入伪时钟
├── renderer/
│   ├── index.html        # 前端 UI（Tailwind CDN + Material Design 3，中文）
│   └── assets/js/main.js # WebSocket 客户端，任务参数构建与进度展示
└── scripts/
    └── pack.cjs          # 自定义打包脚本（替代 electron-builder）
```

## 通信协议

**Client → Engine（WebSocket JSON）**
```json
{ "type": "start", "job": { "sourcePath", "width", "height", "fps", "durationSec",
                             "dpr", "crf", "initWaitMs", "mode", "outputDir", "outputFile" } }
{ "type": "cancel" }
```

**Engine → Client**
```json
{ "type": "progress", "frame": 1, "totalFrames": 100, "percent": 1.0 }
{ "type": "log", "level": "info|warn|error", "message": "..." }
{ "type": "done", "outputPath": "/path/to/output.mp4" }
{ "type": "error", "message": "..." }
```

## 渲染模式

| 模式 | 行为 |
|------|------|
| fast | 实时等待帧间隔（`setTimeout(frameMs)`），适合简单 CSS 动画 |
| precise | 加载前注入伪 `Date` / `performance.now` / `requestAnimationFrame`，逐帧 tick，适合 JS 动画 |

## 关键设计决策

- **引擎在 Electron 主进程运行**（`require('../engine/server.cjs')`），重活（BrowserWindow、FFmpeg）都是子进程，不阻塞主线程
- **Electron offscreen 渲染**替代 puppeteer，避免打包时需要二次下载 Chromium
- **preload-capture.cjs** 通过 `evaluateOnNewDocument` 在页面脚本前注入，precise 模式才生效
- **自定义打包脚本** `scripts/pack.cjs`：复制 `node_modules/electron/dist` + 仅打包 production deps，绕开 electron-builder 的 winCodeSign 签名问题（Windows 非管理员无法创建 macOS 符号链接）

## 命令

| 命令 | 用途 |
|------|------|
| `npm run desktop:dev` | 开发模式（Vite dev server + Electron 热更新） |
| `npm run package` | 打包 → `dist_app/win-unpacked/HTML2MP4.exe` |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | Vitest（目前无测试文件） |

## 打包说明

- 打包脚本：`scripts/pack.cjs`，直接用 Node.js 运行
- 打包输出：`dist_app/win-unpacked/`（已加入 .gitignore）
- 仅打包 production deps：`ws`、`fluent-ffmpeg`、`@ffmpeg-installer`（含 ffmpeg.exe 二进制）及其传递依赖
- 重新打包前若 dist_app 有锁文件（Windows Defender 扫描），脚本会跳过清理继续覆盖

## 依赖说明

| 包 | 类型 | 用途 |
|----|------|------|
| `ws` | prod | WebSocket 服务器 |
| `fluent-ffmpeg` | prod | FFmpeg 封装 |
| `@ffmpeg-installer/ffmpeg` | prod | 平台 FFmpeg 二进制（Windows x64） |
| `electron` | dev | Electron 运行时 |
| `electron-builder` | dev | 保留配置但实际用自定义脚本打包 |

## 遗留 / 待改进

- [ ] 未内嵌自定义图标（当前为默认 Electron 图标）
- [ ] precise 模式无法拦截页面内联 `<script>` 里的同步 rAF 调用（preload 在 DOM 解析前注入，但内联脚本同样在那时运行）
- [ ] GitHub Release 尚未发布打包版本
- [ ] DPR > 1 在 offscreen 渲染中实际效果与 puppeteer 不同（offscreen 以 CSS 像素 1:1 截图，DPR 参数目前无效）
