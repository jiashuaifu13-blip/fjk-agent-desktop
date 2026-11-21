# FJK Agent Desktop

Windows 桌面端 AI Agent：**Tauri 2 + React + TypeScript + Rust**，通过本地 [OpenClaw](https://openclaw.ai) Gateway 驱动 Agent，并内置一只可交互的 AI 桌宠。

> 状态：Phase 0（OpenClaw 调研与链路验证）已完成，Phase 1（桌面框架）进行中。

## 功能

- **真实 Agent 对话**：桌面终端直接连本地 OpenClaw Gateway（协议 v4），支持流式回复、会话复用。
- **AI 桌宠**：Canvas 渲染、动画状态机、拖动、点击交互；桌宠状态跟随 Agent 状态（idle / thinking / working / failed …）。
- **Gateway 连接诊断**：未授权、未配对、来源拒绝、离线、超时、配置错误等都有明确提示，而不是把原始 JSON 丢给用户。
- **桌面端一键启动**：`npm run tauri dev` 同时拉起 Vite 与 Rust 后端。

## 架构

```
FJK Agent Desktop (Tauri)
├─ apps/desktop/src            React 前端：终端 + 桌宠 + 网关传输层
├─ apps/desktop/src-tauri      Rust 后端：WebSocket 网关客户端、Tauri 命令
├─ packages/agent-state        统一 Agent 状态与事件映射（纯 JS，带测试）
├─ packages/gateway-client     Gateway 协议客户端与烟测脚本
└─ Deepseek-pet                桌宠 runtime 与资源来源（已并入本仓库）
```

### 为什么 WebSocket 在 Rust 侧

OpenClaw 会把带浏览器 `Origin` 头的握手视为浏览器客户端，对「共享 token + 无设备身份」的连接清空 operator scopes，导致握手成功但每个 RPC 都返回 `MISSING_SCOPE`。

因此桌面端把 WebSocket 放在 Rust 后端（`src-tauri/src/gateway.rs`）发起：原生连接没有 `Origin` 头，网关按本地后端路径授予请求的 scopes；同时 token 只留在后端，不下发到 WebView。

## 快速开始

### 前置条件

- Windows 10/11（需要 WebView2，一般已内置）
- Node.js 18+
- Rust stable（含 MSVC 工具链）
- 本地 OpenClaw Gateway 已启动（默认 `ws://127.0.0.1:18789`）
- `~/.openclaw/openclaw.json` 中已配置 `gateway.auth.token`

### 运行

```powershell
cd apps/desktop
npm install
npm run tauri dev
```

首次会编译 Rust 依赖（约 1–3 分钟），之后增量启动很快。

### 构建

```powershell
cd apps/desktop
npm run build          # 前端类型检查 + 打包
npm run tauri build    # 生成安装包（bundle 目前未开启）
```

## 配置

- Gateway 地址默认 `ws://127.0.0.1:18789`，可用环境变量 `FJK_GATEWAY_URL` 覆盖。
- Token 从 `~/.openclaw/openclaw.json` 的 `gateway.auth.token` 读取，仅在 Rust 后端使用。
- **不要把 token、`.env` 或任何密钥提交进仓库**（`.gitignore` 已覆盖常见情况）。

## 目录说明

| 路径 | 说明 |
|---|---|
| `apps/desktop/src/components` | 终端与桌宠视图组件 |
| `apps/desktop/src/gateway` | 前端传输层与错误映射 |
| `apps/desktop/src/runtime` | React runtime（网关连接、桌宠启动） |
| `apps/desktop/src-tauri/src` | Rust 入口与网关客户端 |
| `.ai-context/` | 项目状态、架构决策、AI 交接文档 |
| `Deepseek-pet/` | 桌宠 runtime 与资源（已 vendor） |

## 文档

- 项目总纲：[FJK_AGENT_PROJECT_GUIDE.md](FJK_AGENT_PROJECT_GUIDE.md)
- 当前状态：[.ai-context/PROJECT_STATUS.md](.ai-context/PROJECT_STATUS.md)
- 变更记录：[.ai-context/CHANGELOG.md](.ai-context/CHANGELOG.md)
- AI 交接：[.ai-context/AI_HANDOFF.md](.ai-context/AI_HANDOFF.md)

## 许可

暂未指定 License。
