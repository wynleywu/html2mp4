# html2mp4 — 通信协议与渲染模式

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

## 打包与依赖

- 打包：`scripts/pack.cjs` → `dist_app/win-unpacked/HTML2MP4.exe`（已 gitignore）
- 仅打包 production deps：`ws`、`fluent-ffmpeg`、`@ffmpeg-installer`（含 ffmpeg.exe）
- `electron` / `electron-builder` 为 dev；实际打包不用 electron-builder 签名流
- dist 被 Defender 锁文件时脚本会跳过清理并覆盖

## 已知限制（产品 backlog）

- 未内嵌自定义图标（默认 Electron 图标）
- precise 模式无法拦截页面内联 `<script>` 里的同步 rAF
- DPR > 1 在 offscreen 下与 puppeteer 行为不同（CSS 像素 1:1，DPR 参数目前无效）
