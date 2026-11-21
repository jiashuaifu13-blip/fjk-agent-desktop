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
- **Terminal 已接入真实 Gateway**：WS 连接位于 Rust 侧（`src-tauri/src/gateway.rs`），握手不带 `Origin` 头，避免 OpenClaw 对「浏览器来源 + 共享 token」清空 operator scopes；桌面端真实对话往返成功。
- **AgentState 已改为事件驱动**：`gateway://event` / `gateway://state` → `AgentStateReducer` → `AgentToPetState` → `PetStateMachine`；`ChatController` 不再直接持有或写入 `PetStateMachine`。
- Gateway 错误已映射为未授权 / 未配对 / 来源拒绝 / 离线 / 超时 / 配置等状态并在 UI 呈现。
- **release 发布形态已完成回归**：`npm run tauri build` 成功，生成 `apps/desktop/src-tauri/target/release/fjk-desktop.exe`（20.24 MB）；直接运行 release exe 已验证窗口启动、Gateway 连接、真实流式对话和正常退出。
- NSIS 安装包已生成并完成安装/运行/卸载回归（详见下文「Release 安装包回归（NSIS）」）；MSI、代码签名、自动更新仍未做。
- **Approval 链路已完成**：订阅 `sessions.messages.subscribe(includeApprovals)` + 审批卡片 + `exec.approval.resolve`；allow（命令真实执行）与 deny（user-denied、命令未执行）均已实测。
- **Connection State / Log Viewer / Settings 只读概览均已完成并界面实测**：连接状态与最近错误、最近 200 条运行事件（可展开/清空）、模型/工具数量/当前 Session/总数（缺失显示「未提供」）。
- **GatewayChatAdapter 订阅顺序已修复**：先注册 `onEvent` 再 `sendMessage`，并缓冲 runId 未知前的早到事件；普通对话正常，快速失败场景未实测。
- Gateway Client 接口已定义（`packages/gateway-client/`，仅类型/接口，未实现）。
- 远程仓库 `origin` 已配置并持续推送 `main`。
- 尚未有任何 Extensions。

## 阶段进度对照

| 阶段 | 目标 | 真实状态 | 证据 / 说明 |
|---|---|---|---|
| Phase 0 | OpenClaw 调查与基础验证 | ✅ **完成** | P0-001~023 全部完成；技术选型报告 GO（OpenClaw 作为 Agent Core） |
| Phase 1 | FJK Desktop 基础框架（Tauri 2 + React + TS + Rust） | ✅ **主体完成** | Rust Gateway 通道、权限探测、错误映射、事件驱动 AgentState、Connection State / Log Viewer / Settings、release 与 NSIS 回归均已完成 |
| Phase 2 | Agent Desktop Terminal | 🟡 **部分** | 真实对话/流式/断线、Approval、Connection State、Log Viewer、Settings（只读+模型回滚）、Session 列表与切换、UI 布局均已验证；历史记录、新建/删除会话未做 |
| Phase 3 | Deepseek-pet 桌宠整合 | **部分（仅 3A + 部分 3D）** | 3A 审计已完成；AgentState→PetState Adapter 与 runtime 驱动已接通；3B/3C/3E 未完成 |
| Phase 4 | Blog Adapter | **未开始** | 无对应代码 |
| Phase 5 | Local Project / Git / GitHub | **未开始** | 无对应产品功能代码 |
| Phase 6 | 产品化 | 🟡 **起步** | NSIS 安装器已生成并完成安装/运行/卸载验证；MSI、签名、升级未做 |
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
- `/apps/desktop/` — Tauri 2 + React + TS 前端最小闭环（桌宠渲染/动画/拖动/点击 + 终端）。
- **真实 Gateway 通道（Rust）**：`src-tauri/src/gateway.rs` 实现协议 v4 握手（connect.challenge → connect → hello-ok）、请求/响应关联、事件转发、断开清理；Tauri 命令 `gateway_info` / `gateway_connect` / `gateway_request` / `gateway_disconnect`；token 不下发到 WebView。
- **真实对话**：桌面端经 Rust 通道完成 `sessions.list` 权限探测与 `chat.send` 流式回复。
- **Gateway 错误映射**：`src/gateway/GatewayError.ts` 覆盖未授权、未配对、来源拒绝、离线、超时、配置、协议等错误。
- **release 构建与运行**：`npm run tauri build` 已成功；release exe 可直接启动、连接 Gateway、完成真实流式对话并正常退出。
- **Approval 链路**：`usePetRuntime` 订阅 `sessions.messages.subscribe { key, includeApprovals: true }`；
  `DesktopTerminal` 渲染审批卡片（命令/过期/允许/拒绝）；`exec.approval.resolve` 解决；
  allow 与 deny 均实测通过（deny 为 user-denied、命令未执行）。
- **Connection State**：连接徽标、Gateway/模式/Agent/Terminal、连接说明、最近错误、重连说明。
- **Log Viewer**：最近 200 条运行事件，展开/关闭/清空；含 handshake、permission probe、subscription（approvals=true）、runtime ready。
- **Settings 只读概览**：模型、工具数量、当前 Session、Session 总数；Gateway 未返回字段统一显示「未提供」。
- **GatewayChatAdapter 订阅顺序修复**：先注册 `onEvent` 再 `sendMessage`，缓冲 runId 未知前的早到事件。
- **Settings 模型修改 + 单次回滚**：`sessions.patch { key, model }` 修改当前 Session 模型，记录原值并可一键回滚；RPC 与 UI 均实测（`deepseek-flash` → `deepseek-chat` → 回滚）。
- **Session 只读列表**：MAIN/SESSION、key、更新时间、「（当前使用）」标记。
- **Session 切换**：先订阅新 key（includeApprovals）再退订旧 key，成功后 Adapter/UI 切到新 key，失败不留半切换。
- **UI 布局**：聊天区内部滚动、输入框固定；四个面板互斥且悬浮，不再挤压聊天区。
- `.ai-context/OPENCLAW_*` 系列文档 — Gateway 事件语义 / 认证契约 / 活动事件 / 状态映射 / Client 接口 / 技术选型报告。

## AgentState 验证

- reducer 单元测试：**10/10 通过**。
- T1：真实一问一答逐字流式正常，UI 实测 `thinking → working → completed → idle`，桌宠同步。
- T2：`completed` 后 1.5 秒内追发新请求，无旧 timer 将新 run 打回 idle 的抖动。
- T3：运行中关闭 Gateway，AgentState 进入 `offline`；终端显示离线、输入禁用。
- T4：重启 Gateway 后重新启动桌面端，恢复连接与正常运行路径。
- `waiting_approval` / approval 路径：**部分验证（allow only）**。
  - 桌面端已订阅 `sessions.messages.subscribe { key, includeApprovals: true }`，可收到 `session.approval`；
  - 审批卡片可渲染（命令、过期时间、允许/拒绝）；
  - allow 路径实测通过：点击「允许」后 `whoami` 真实执行（输出 `laptop-qqmq9j32\付家康`，`exitCode=0`，482ms），随后审批记录被移除；
  - **deny 路径已验证**：点击「拒绝」后命令未执行（user-denied），run 正常结束。

## Release 构建回归

- 执行位置：`D:\pet-desp\apps\desktop`
- 构建命令：`npm run tauri build`
- 结果：**成功，无 error**。
- 前端产物：`apps/desktop/dist/` 已生成，检查到 12 个文件、约 11.6 MB，包含 `index.html`、`assets` 与 `pets` 资源。
- release exe：
  `apps/desktop/src-tauri/target/release/fjk-desktop.exe`
- exe 大小：**20.24 MB**。
- 构建时间：**13:20:32**（本次本机构建）。
- 发布形态运行验证：
  1. 直接运行 release exe，窗口正常打开，无白屏、无崩溃。
  2. 成功连接本地 Gateway，界面徽标为 `Gateway`，`agent: idle`。
  3. 真实 `chat.send` 成功并获得逐字流式回复；本次记录 runId `83a787ed`，耗时约 4865ms。
  4. 关闭窗口后 `fjk-desktop` 进程正常退出，无残留。
  5. 验证期间 Gateway 日志未出现 `SsrFBlockedError`。
- 结论：**当前 release exe 发布形态回归通过，不阻断后续 Phase 1 工作。**
- 边界：release exe 已回归；NSIS 安装包后续已单独完成安装/运行/卸载验证（见下文）。

## Approval 链路（部分验证）

- 订阅：桌面端在拿到 session key 后调用 `sessions.messages.subscribe { key, includeApprovals: true }`，
  卸载时 `sessions.messages.unsubscribe { key }`；失败只记录，不阻断聊天。
- 握手：`caps` 必须放在 `connect` 参数**顶层**；放进 `client` 会被网关以
  `invalid connect params: at /client: unexpected property 'caps'` 拒绝。
- 事件：`exec.approval.requested`、`session.approval`（pending → terminal）、`exec.approval.resolved`。
- 解决：`exec.approval.resolve { id, decision }`，decision 为 `allow-once` 或 `deny`。
- 实测（allow）：卡片出现后点击「允许」，`whoami` 真实执行，输出 `laptop-qqmq9j32\付家康`，
  `exitCode=0`、482ms，随后审批记录被移除（再查为 `APPROVAL_NOT_FOUND`）。
- 未验证：无（allow 与 deny 均已验证）。
- 相关提交：`55d5b08`（订阅 + caps 顶层）、`0675933`（审批卡片 UI）。

## 已知问题（需处理）

1. **快速失败场景未实测**：`GatewayChatAdapter` 已改为「先订阅、再发送，并缓冲早到事件」；普通对话正常，
   但"run 秒失败"无法稳定构造（开系统代理表现为挂起而非秒失败），该路径仍标未实测。
2. **Approval 双路径已验证**：allow（命令执行）与 deny（命令未执行、user-denied）均已真实回归。
3. **无自动重连**：运行中断线后需恢复 Gateway，并手动重新启动桌面端。
4. **子模块未正确注册**：`Deepseek-pet` 为 gitlink，但无 `.gitmodules`，新克隆无法按标准子模块流程拉取。
5. **安全风险**：`frontend/tauri/tauri.conf.json` 的历史配置存在过宽权限问题，仍需后续核查。
6. **MSI 安装包未做**：NSIS 安装器已生成并完成安装/运行/卸载验证；MSI、代码签名、自动更新仍未做。
7. **`packages/gateway-client/client.js` 已不被桌面端使用**，保留为协议参考/烟测脚本。

## 故障排查

- Windows 系统代理若指向 `127.0.0.1:7897`，当前 OpenClaw 环境可能触发 SSRF 防护，网关日志出现 `SsrFBlockedError`，模型请求会快速失败。遇到“请求秒失败 / UI 停 thinking”时，先确认并关闭该系统代理，再判断是否为代码问题。
- 卡巴斯基可能拦截 Rust 新生成的 build script，表现为 `os error 5` / `32`。遇到时先删除错误中对应的 `src-tauri\target\debug\build\<crate>` 目录再重试；持续出现则考虑将 `src-tauri\target` 加入排除项。
- 自动重连不属于当前任务范围；运行中断线后需恢复 Gateway，并手动重启桌面端重新建立连接。

## Release 安装包回归（NSIS）

- 配置：`bundle.active = true`、`targets = ["nsis"]`、显式 5 个图标、`windows.nsis.installMode = "currentUser"`。
- 构建：`npm run tauri build` 成功；首次自动下载 NSIS 工具。
- 产物：`target/release/bundle/nsis/FJK Agent_0.1.0_x64-setup.exe`（**13.22 MB**）。
- 安装：`/S` 静默安装，退出码 0；安装目录由卸载注册表解析（本机为 `D:\fjk-agent\FJK Agent`，exe 20.25 MB + uninstall.exe）；开始菜单与桌面快捷方式已创建。
- 运行：安装版启动正常、成功连接 Gateway（网关日志 `client connected`）、真实对话成功（runId `0c46a932`）。
- 卸载：`uninstall.exe /S` 退出码 0；安装目录与快捷方式清理，无进程残留。
- 边界：安装包未签名（SmartScreen「未知发布者」属预期）；MSI、代码签名、自动更新未做。

## 下一步

继续 **Phase 2**（Phase 1 主体已完成）：
1. 下一轮：新建/删除会话（写操作，删除需二次确认）、自动重连、Settings 更多项。
2. （可选）快速失败场景的确定性复现（临时改错模型名），关闭最后一个未实测项。
3. 安装包后续形态：MSI、代码签名、自动更新（NSIS 已完成安装/运行/卸载回归）。
