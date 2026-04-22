# html2mp4

把本地 HTML 文件（CSS/JS 动画、演示页面等）录制为 MP4 视频。提供桌面 GUI，基于 Electron + offscreen 渲染 + FFmpeg 编码，无需外部 Chromium。

---

## 系统要求

- Windows 10/11 x64
- Node.js 18+
- npm 9+

---

## 快速开始

```bash
git clone <repo-url>
cd html2mp4
npm install
npm run desktop:dev
```

浏览器会自动打开 Electron 窗口，直接在 GUI 中操作。

---

## 使用方法

界面分三步：

### 1. 输入源

- 在 **源文件路径** 字段填写 HTML 文件的绝对路径，例如 `D:/animations/scene.html`
- 或点击 **本机选择…** 按钮（仅在 Electron 窗口中可用，浏览器模式无法读取本机路径）

### 2. 视频参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| 宽度 | 1920 | 输出视频宽度（px） |
| 高度 | 1080 | 输出视频高度（px） |
| FPS | 60 | 帧率（1–120） |
| 时长 | 10 s | 录制总时长 |
| DPR | 2 | 设备像素比（目前 offscreen 模式实际无效，保留参数） |
| CRF | 18 | H.264 质量因子，越低质量越高（0=无损，40=最低） |
| 初始化等待 | 1000 ms | 页面加载后、开始录制前的等待时间 |
| 渲染模式 | 快速模式 | 见下方说明 |

**渲染模式：**

- **快速模式（fast）** — 按实际帧间隔等待，适合纯 CSS 动画或不依赖精确时钟的页面
- **精确模式（precise）** — 注入伪 `Date` / `performance.now` / `requestAnimationFrame`，逐帧 tick，适合 JS 驱动动画（如 GSAP、Three.js 时间线）

### 3. 录制输出

- **输出目录**：默认 `~/Downloads/renders`，路径由本地引擎解析，支持 `~`
- **文件名**：默认 `output.mp4`
- **导出任务 JSON**：将当前参数导出为 JSON，可用于离线 CLI 调用
- 点击 **Start Recording** 开始录制，底部进度面板实时显示帧数、进度百分比、预计剩余时间和运行日志

---

## 命令

| 命令 | 用途 |
|------|------|
| `npm run desktop:dev` | 开发模式：Vite dev server + Electron 热更新 |
| `npm run package` | 打包为可分发的 `dist_app/win-unpacked/HTML2MP4.exe` |
| `npm run lint` | ESLint 代码检查 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | Vitest 单元测试 |

---

## 打包分发

```bash
npm run package
```

输出目录：`dist_app/win-unpacked/`（已加入 `.gitignore`）

打包内容：Electron 运行时 + 应用代码 + FFmpeg 二进制（`@ffmpeg-installer/ffmpeg` 内嵌）。不依赖用户系统已安装的 FFmpeg。

> **注意**：若打包时 `dist_app` 目录被 Windows Defender 锁定，脚本会跳过清理、直接覆盖。

---

## 架构概览

```
html2mp4/
├── electron/
│   ├── main.cjs           # 主进程：启动引擎 + 创建窗口
│   └── preload.cjs        # IPC bridge：暴露 nativeFileDialog.pickHtmlFile()
├── engine/
│   ├── server.cjs         # WebSocket 服务器（ws://127.0.0.1:8765）
│   ├── renderer.cjs       # offscreen BrowserWindow 截帧
│   ├── encoder.cjs        # fluent-ffmpeg → H.264 MP4
│   └── preload-capture.cjs  # precise 模式伪时钟注入
├── renderer/
│   ├── index.html         # 前端 UI
│   └── assets/js/main.js  # WebSocket 客户端
└── scripts/
    └── pack.cjs           # 自定义打包脚本
```

引擎通过 WebSocket 与前端通信：

```
前端 → 引擎：{ "type": "start", "job": { ... } }
引擎 → 前端：{ "type": "progress", "frame": 1, "totalFrames": 100, "percent": 1.0 }
             { "type": "done", "outputPath": "/path/to/output.mp4" }
             { "type": "error", "message": "..." }
```

---

## 已知限制

- 仅支持 Windows x64（`@ffmpeg-installer/ffmpeg` 平台二进制）
- DPR > 1 在 offscreen 渲染中实际无效，截图以 CSS 像素 1:1 输出
- precise 模式无法拦截页面内联 `<script>` 里的同步 `requestAnimationFrame` 调用
- 应用图标为默认 Electron 图标，未内嵌自定义图标
