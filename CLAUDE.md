# html2mp4 — Agent 指南

> 最后对齐：2026-07-25。全局行为见用户级 AGENTS/CLAUDE。  
> 协议 / 打包细节：[`docs/agent/protocol.md`](./docs/agent/protocol.md)。

**产品：** 本地 HTML（动画/演示）录制为 MP4，Electron 桌面 GUI。

## 架构

```
html2mp4/
├── electron/     # main + preload（IPC / nativeFileDialog）
├── engine/       # WebSocket :8765、offscreen 截图、ffmpeg 编码、precise 伪时钟
├── renderer/     # Tailwind CDN UI + WS 客户端
└── scripts/pack.cjs
```

## 关键设计决策

- 引擎在 Electron **主进程**拉起；BrowserWindow / FFmpeg 为子进程
- **offscreen** 替代 puppeteer，避免打包二次下 Chromium
- `preload-capture.cjs` 仅 precise 模式 `evaluateOnNewDocument` 注入
- 自定义 `pack.cjs` 绕开 electron-builder winCodeSign / macOS 符号链接问题

## 命令与端口

| 命令 | 用途 |
|------|------|
| `npm run desktop:dev` | Vite + Electron 热更新 |
| `npm run package` | → `dist_app/win-unpacked/HTML2MP4.exe` |
| `npm run lint` / `typecheck` / `test` | 质量检查 |

| 服务 | 默认 |
|------|------|
| Vite / Electron 页 | **4010**（`PORT`） |
| 录制引擎 WS | **8765** |

## 本地预览（Orca）

- 仅 Vite UI：`orca tab create --url http://127.0.0.1:4010 --json`
- 完整录制 GUI：`npm run desktop:dev`（Electron，不经 Orca）
- 本地 HTML 源：`orca tab create --url "file:///<绝对路径>" --json`
- 禁止 `start` / `explorer` 打开预览

## 按需文档

- [`docs/agent/protocol.md`](./docs/agent/protocol.md) — WS 协议、fast/precise、打包与已知限制
- [`README.md`](./README.md) — 人类说明
