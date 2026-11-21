# 00 · Project Index

> 网页 AI / 新接手者的唯一入口。先读本文件，再按需路由到其他文档或源码。
> 本文件描述的是**真实代码现状**，不是规划。

| 项 | 值 |
|---|---|
| Project | FJK Agent Desktop（本地目录 `D:\pet-desp`） |
| Repo | https://github.com/jiashuaifu13-blip/fjk-agent-desktop |
| Branch | `main` |
| Commit | `1b85c9d`（docs: add project README） |
| Generated | 2026-11-21 |
| CodeGraph | **未建立索引**（仓库内无 `.codegraph/`；可用 `codegraph init` 生成） |
| Main languages | TypeScript / Rust / JavaScript（React 18 + Tauri 2） |
| Code size | 前端 22 个 ts/tsx/js 文件；Rust 3 个文件；共享包 10 个文件 |

## Purpose

Windows 桌面端 AI Agent：用 Tauri 2 + React 做终端与桌宠，用 Rust 后端连接本地 OpenClaw Gateway，
复用 Deepseek-pet 的桌宠 runtime 做状态可视化。

核心约束：**一个 Agent，多个入口**；桌宠只表现 Agent 状态，不维护第二套 Agent。

## Entry Points

| 入口 | 路径 | 说明 |
|---|---|---|
| 桌面窗口 | `apps/desktop/src-tauri/src/main.rs` | Tauri 进程入口，调用 `lib.rs` |
| Rust 初始化 | `apps/desktop/src-tauri/src/lib.rs` | 注册 `GatewayState` 与 4 个 Tauri 命令 |
| 前端挂载 | `apps/desktop/src/main.tsx` | `createRoot` 挂载 `<App />`（刻意不用 StrictMode） |
| 应用根组件 | `apps/desktop/src/App.tsx` | `PetRuntimeProvider` + 终端 + 桌宠 |
| Runtime | `apps/desktop/src/runtime/usePetRuntime.ts` | 启动桌宠、连接网关、创建 ChatController |

## Main Modules

| 模块 | 路径 | 职责 |
|---|---|---|
| Gateway transport (Rust) | `apps/desktop/src-tauri/src/gateway.rs` | 协议 v4 WS 客户端：handshake、RPC 关联、事件泵、连接状态 |
| Tauri commands | 同上 | `gateway_info` / `gateway_connect` / `gateway_request` / `gateway_disconnect` |
| TauriGatewayClient | `apps/desktop/src/gateway/TauriGatewayClient.ts` | 前端通过 invoke 调 Rust，监听 `gateway://event` |
| GatewayChatAdapter | `apps/desktop/src/gateway/GatewayChatAdapter.ts` | 把 `chat.send` + agent 流事件适配成 ChatController 的 `send()` |
| GatewayError | `apps/desktop/src/gateway/GatewayError.ts` | 网关错误 → 未授权/未配对/离线/超时等用户可读状态 |
| ChatController | `apps/desktop/src/chat/ChatController.js` | 消息列表、流式拼接、桌宠状态切换（thinking → speaking → idle） |
| MockChatClient | `apps/desktop/src/chat/MockChatClient.js` | 非 Tauri 环境或网关不可用时的本地模拟 |
| Pet runtime | `apps/desktop/src/pet/*.js` | 迁移自 Deepseek-pet：渲染/动画/状态机/命中测试/音频 |
| Agent state | `packages/agent-state/*.js` | 7 状态定义、Agent→Pet 映射、Gateway 事件→AgentState |
| Legacy WS client | `packages/gateway-client/client.js` | 浏览器版协议客户端（桌面端已不用，保留作参考/烟测） |
| Terminal UI | `apps/desktop/src/components/DesktopTerminal.tsx` | 聊天列表、输入、状态徽标、错误提示 |
| Pet UI | `apps/desktop/src/components/PetView.tsx` | Canvas 宿主 |

## Main Flows

1. **启动**：`main.rs` → `lib.rs` 注册命令 → WebView 加载 `main.tsx` → `App` → `usePetRuntime`。
2. **桌宠初始化**：`PetDataLoader` 读 `public/pets/dsh1/{manifest,actions}.json` → `AnimationLibrary`/`AnimationCache` → `PetRenderer` + `PetAnimator` + `PetStateMachine` → `IDLE`。
3. **网关连接**：`TauriGatewayClient.connect()` → Rust `gateway_connect` → 读 `~/.openclaw/openclaw.json` 的 token → WS 握手（`connect.challenge` → `connect`）→ `hello-ok`。
4. **权限探测**：连上后立刻 `sessions.list`；失败按 `MISSING_SCOPE` → 「未授权」、`NOT_PAIRED` → 「未配对」，避免等第一条消息才报错。
5. **对话**：终端提交 → `ChatController.send` → `GatewayChatAdapter` 解析 sessionKey → `chat.send` 拿 `runId` → 订阅 `agent` 事件（`stream=assistant` 增量、`stream=lifecycle` 结束）→ 更新消息与桌宠状态。
6. **错误**：任何 RPC 错误经 `GatewayError` 分类，UI 显示标题 / 详情 / 建议 / 原始负载。

## Core Symbols

| Symbol | 位置 | 作用 |
|---|---|---|
| `GatewayState` | `gateway.rs` | 保存当前 WS 会话（session、pending、id 计数） |
| `Session::request` | `gateway.rs` | 发送 `req` 帧并等待匹配的 `res`，错误原样返回 |
| `TauriGatewayClient` | `src/gateway/TauriGatewayClient.ts` | 前端唯一网关出口 |
| `toGatewayIssue` / `GatewayError` | `src/gateway/GatewayError.ts` | 错误分类与展示文案 |
| `usePetRuntime` | `src/runtime/usePetRuntime.ts` | 启动编排 + 网关状态（`GatewayStatus`） |
| `GatewayChatAdapter` | `src/gateway/GatewayChatAdapter.ts` | 网关流 → ChatController 传输形状 |
| `ChatController` | `src/chat/ChatController.js` | 会话 UI 状态与桌宠状态驱动 |
| `AgentStates` | `packages/agent-state/AgentStates.js` | offline/idle/thinking/working/waiting_approval/completed/failed |
| `gatewayEventToAgentState` | `packages/agent-state/GatewayEventToAgentState.js` | 网关事件 → AgentState |
| `PetStateMachine` | `src/pet/PetStateMachine.js` | 桌宠状态转换与动画选择 |

## Architecture Summary

```
React (WebView)
  ├─ DesktopTerminal / PetView
  ├─ usePetRuntime ──> ChatController ──> GatewayChatAdapter
  └─ TauriGatewayClient ──invoke──> Rust gateway.rs ──WS──> OpenClaw Gateway (127.0.0.1:18789)
                                        └──events──> gateway://event ──> 前端
```

**关键设计**：WebSocket 必须在 Rust 侧发起。OpenClaw 会把带 `Origin` 头的握手当作浏览器客户端，
对「共享 token + 无设备身份」的连接清空 operator scopes（握手成功但 RPC 全部 `MISSING_SCOPE`）。
Rust 原生连接没有 `Origin`，且 token 不下发到 WebView。

## Context Routing

| 需要了解 | 去哪里 |
|---|---|
| 当前进度与已知问题 | `.ai-context/PROJECT_STATUS.md` |
| 最近改动与原因 | `.ai-context/CHANGELOG.md`、`.ai-context/AI_HANDOFF.md` |
| 模块清单 | `.ai-context/MODULE_MAP.md` |
| 网关认证/协议 | `.ai-context/OPENCLAW_GATEWAY_AUTH_CONTRACT.md`、`..._PROTOCOL_AUDIT.md` |
| 事件语义 | `.ai-context/OPENCLAW_GATEWAY_EVENT_SEMANTICS.md`、`..._ACTIVITY_EVENTS.md` |
| 事件→状态映射 | `.ai-context/OPENCLAW_EVENT_TO_AGENTSTATE_MAPPING.md` |
| 桌宠 runtime 来源 | `Deepseek-pet/`、`.ai-context/PET_RUNTIME_*.md` |
| 项目长期规划 | `FJK_AGENT_PROJECT_GUIDE.md` |

## Known Unknowns

- **未建立 CodeGraph 索引**：如需按符号查询，先 `codegraph init`。
- **Gateway 事件尚未真正驱动 AgentState**：当前 `agentState` 仍由桌宠状态反推（`PET_TO_AGENT`），P0-021 的映射仅接在连接状态上。
- **无 Approval UI**：`exec.approval.*` / `question.*` 事件尚未在桌面端呈现。
- **无自动化 UI 测试**：现有测试只有 `packages/agent-state/*.test.mjs`。
- **打包产物未回归**：`npm run tauri build` 的窗口与连接未验证（dev 模式已验证）。
- **`packages/gateway-client/client.js` 已不被桌面端使用**，保留作协议参考与烟测。
- **License 未指定**。
