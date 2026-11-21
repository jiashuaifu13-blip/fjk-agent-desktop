# Project Status

## 当前阶段

Phase 0（项目调查与基础验证）— **已全部完成（P0-001~023）**，进入 Phase 1。

> 注：本文件曾误记为「Phase 3 完成」。经核对真实源码并完成 Phase 0 收尾后，现状如下。

## 真实状态概述

- OpenClaw 已验证可作为 FJK Agent Core（Gateway / DeepSeek 模型 / Agent / Session / Tool / Approval 链路跑通）。
- 统一状态层 `packages/agent-state/` 已实现并通过测试（真实代码，非 Mock）。
- `packages/agent-state/AgentStateReducer.js` 已落地为桌面端 AgentState 唯一行为状态源：消费本地请求意图、Gateway 事件与连接状态，支持 runId / seq / ts 隔离、终态 1500ms 回落与可注入时钟测试。
- Deepseek-pet 已作为 gitlink 引入，但 `.gitmodules` 缺失，属「未正确注册的子模块」状态。
- FJK Desktop 前端已建 `/apps/desktop/`（Tauri 2 + React + TS），终端 + 桌宠最小闭环已实现、构建通过。
- **Terminal 已接入真实 Gateway**：WS 连接位于 Rust 侧（`src-tauri/src/gateway.rs`），握手不带 `Origin` 头，避免 OpenClaw 对「浏览器来源 + 共享 token」清空 operator scopes；2026-11-20 实测桌面端真实对话往返成功。
- **AgentState 已改为事件驱动**：`gateway://event` / `gateway://state` → `AgentStateReducer` → `AgentToPetState` → `PetStateMachine`；`ChatController` 不再直接持有或写入 `PetStateMachine`。
- Gateway 错误已映射为未授权 / 未配对 / 来源拒绝 / 离线 / 超时 / 配置等状态并在 UI 呈现。
- Gateway Client 接口已定义（`packages/gateway-client/`，仅类型/接口，未实现）。
- 远程仓库 `origin` 已配置并持续推送 `main`。
- 尚未有任何 Extensions。

## 阶段进度对照

| 阶段 | 目标 | 真实状态 | 证据 / 说明 |
|---|---|---|---|
| Phase 0 | OpenClaw 调查与基础验证 | ✅ **完成** | P0-001~023 全部完成；技术选型报告 GO（OpenClaw 作为 Agent Core） |
| Phase 1 | FJK Desktop 基础框架（Tauri 2 + React + TS + Rust） | 🟡 **进行中** | Rust Gateway 通道、权限探测、错误映射、事件驱动 AgentState 已完成；Settings / Log Viewer 未做 |
| Phase 2 | Agent Desktop Terminal | 🟡 **部分** | 真实 Gateway 对话、流式回复、连接断线状态已跑通；Session 管理、Approval UI、历史记录未做 |
| Phase 3 | Deepseek-pet 桌宠整合 | **部分（仅 3A + 部分 3D）** | 3A 审计已完成；AgentState→PetState Adapter 与 runtime 驱动已接通；3B/3C/3E 未完成 |
| Phase 4 | Blog Adapter | **未开始** | 无对应代码 |
| Phase 5 | Local Project / Git / GitHub | **未开始** | 无对应产品功能代码 |
| Phase 6 | 产品化 | **未开始** | 无对应代码 |
| Phase 7 | 桌宠动作扩展 | **未开始** | actions.json 已规划动作，实际资源仍少 |

## Phase 0 子任务明细

| 范围 | 状态 |
|---|---|
| P0-001 项目总纲 / P0-002 AI context / P0-003 Git 基线 | ✅ 完成 |
| P0-004 Deepseek-pet 导入 / P0-005 架构审计 / P0-006 集成边界 / P0-007 AgentState 适配器 | ✅ 完成 |
| P0-008 OpenClaw 安装 / P0-009 Windows Gateway / P0-010 DeepSeek Provider / P0-011 模型推理 | ✅ 完成 |
| P0-012 模型传输 / P0-013 Agent Runtime / P0-014 Session 持久化 / P0-015 Tool + Approval 链路 | ✅ 完成 |
| P0-016 Gateway 事件语义调查 | ✅ 完成 |
| P0-017 Gateway 认证契约 | ✅ 完成 |
| P0-018 Agent turn 事件 / P0-019 Tool 事件 / P0-020 Approval 事件 | ✅ 完成 |
| P0-021 事件→AgentState 映射 / P0-022 Gateway Client 接口 / P0-023 Phase 0 最终技术选型报告 | ✅ 完成 |

## 已实现且验证的功能

- `packages/agent-state/AgentStates.js` — 统一 7 状态（offline/idle/thinking/working/waiting_approval/completed/failed）。
- `packages/agent-state/AgentToPetState.js` — AgentState → PetState 语义适配。
- `packages/agent-state/GatewayEventToAgentState.js` — Gateway 事件 → AgentState 单事件映射。
- `packages/agent-state/AgentStateReducer.js` — AgentState 权威 reducer/service；支持本地 request-started / request-settled、Gateway event、connection state、runId 隔离、seq/ts 乱序保护、终态 1500ms 回落与 epoch 防竞态。
- `packages/agent-state/AgentStateReducer.test.mjs` — reducer 测试；当前 10/10 通过。
- `apps/desktop/src/chat/ChatController.js` — 不再持有 `PetStateMachine`；只 dispatch 本地 Agent action，保留原有聊天流式逻辑。
- `apps/desktop/src/runtime/usePetRuntime.ts` — 订阅 Gateway 事件/连接状态并驱动 AgentState；Agent 生命周期到桌宠的唯一写入链为 `AgentState → AgentToPetState → stateMachine.setState`，另保留 boot 初始化 `setState(IDLE)`。
- `apps/desktop/src/gateway/TauriGatewayClient.ts` — 独立暴露 `onEvent()` 与 `onConnectionState()`，并在 disconnect 时清理两个 Tauri listener。
- `apps/desktop/src/components/DesktopTerminal.tsx` — 运行中断线时显示 `Gateway · 离线`、断线提示并禁用输入。
- `packages/gateway-client/` — `types.ts` + `GatewayClient.ts` 接口契约（P0-022）。
- OpenClaw 本地运行 + 完整 Agent/Tool/Approval 链路（经 OpenClaw Control UI 验证）。
- `/apps/desktop/` — Tauri 2 + React + TS 前端最小闭环（桌宠渲染/动画/拖动/点击 + 终端），`npm run build` 通过。
- **真实 Gateway 通道（Rust）**：`src-tauri/src/gateway.rs` 实现协议 v4 握手（connect.challenge → connect → hello-ok）、请求/响应关联、事件转发、断开清理；Tauri 命令 `gateway_info` / `gateway_connect` / `gateway_request` / `gateway_disconnect`；token 不下发到 WebView。
- **真实对话**：桌面端经 Rust 通道完成 `sessions.list` 权限探测与 `chat.send` 流式回复。
- **Gateway 错误映射**：`src/gateway/GatewayError.ts` 覆盖未授权、未配对、来源拒绝、离线、超时、配置、协议等错误。
- `.ai-context/OPENCLAW_*` 系列文档 — Gateway 事件语义 / 认证契约 / 活动事件 / 状态映射 / Client 接口 / 技术选型报告。

## 本轮 AgentState 验证

- reducer 单元测试：**10/10 通过**。
- T1：真实一问一答逐字流式正常，UI 实测 `thinking → working → completed → idle`，桌宠同步。
- T2：`completed` 后 1.5 秒内追发新请求，无旧 timer 将新 run 打回 idle 的抖动。
- T3：运行中关闭 Gateway，AgentState 进入 `offline`；终端显示离线、输入禁用。
- T4：重启 Gateway 后重新启动桌面端，恢复连接与正常运行路径。
- `waiting_approval` / approval 路径：**尚未在桌面端真实触发，未验证**。

## 已知问题（需处理）

1. **模型快速失败竞态（未修复）**：模型调用极快失败时 UI 可能停在 `thinking`。当前定位为 `GatewayChatAdapter` 先执行 `chat.send`，之后才建立该轮事件订阅；run 秒失败时可能漏掉 `lifecycle error`。必须作为独立任务处理，本轮不修。
2. **Approval 桌面路径未实测**：映射和 reducer 有对应逻辑，但 `waiting_approval` 尚未通过真实桌面对话验证。
3. **子模块未正确注册**：`Deepseek-pet` 为 gitlink，但无 `.gitmodules`，新克隆无法按标准子模块流程拉取。
4. **安全风险**：`frontend/tauri/tauri.conf.json` 的历史配置存在过宽权限问题，仍需后续核查。
5. **打包模式尚未验证**：dev 模式已回归；`npm run tauri build` 产物仍需单独回归。
6. **`packages/gateway-client/client.js` 已不被桌面端使用**，保留为协议参考/烟测脚本。

## 故障排查

- Windows 系统代理若指向 `127.0.0.1:7897`，当前 OpenClaw 环境可能触发 SSRF 防护，网关日志出现 `SsrFBlockedError`，模型请求会快速失败。遇到“请求秒失败 / UI 停 thinking”时，先确认并关闭该系统代理，再判断是否为代码问题。
- 自动重连不属于当前任务范围；运行中断线后需恢复 Gateway，并手动重启桌面端重新建立连接。

## 下一步

继续 **Phase 1/2**：
1. 独立修复 `GatewayChatAdapter` 的快速失败事件订阅竞态。
2. 实测并实现 Approval UI（`waiting_approval` 路径当前未验证）。
3. 补齐 Settings / Connection State / Log Viewer。
4. 回归 `npm run tauri build` 打包产物。