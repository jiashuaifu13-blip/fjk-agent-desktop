# Tasks

## DOING

- Phase 1/2 收尾：自动重连已完成并实测通过；等待下一轮功能。

## TODO

- **下一轮候选**：新建/删除会话（写操作，删除需二次确认）、Settings 更多项（工具开关/执行模式展示）。
- **（可选）快速失败场景的确定性复现。**
  订阅先于发送的修复已落地、普通对话正常；但"run 秒失败"场景无法稳定构造
  （开系统代理表现为挂起而非秒失败），该路径仍标**未实测**。
- MSI 安装包（可选）。NSIS 已完成并验证；MSI、代码签名、自动更新未做。
- 设备配对（device identity）作为浏览器端接入的可选路径。

## BLOCKED

None.

## DONE

### P1-013
自动重连（已实测通过）。

- 退避 1/2/4/8/15s 共 5 次；同一时刻只有一个重连任务；
- 成功后恢复：优先用户当前 Session → 审批订阅（includeApprovals）→ adapter.setSessionKey，
  并清空 approval/error、刷新 settings/sessionList；
- Rust 侧 session epoch：旧 reader 的 `offline` 事件不再污染新连接（header 与面板一致）；
- 网关预热期 `sessions.list` 为空时，按 5×1s 重试再判定失败；
- 实测：attempt 1..3 连接拒绝 → attempt 4 空列表 → attempt 5 恢复成功（session/approvals 均恢复）；
- 提交 `a78fe8a`、`7b201c9`。

### P1-012
Session 切换（已实测）。

- 非当前会话显示「切换」按钮，运行中禁用；切换后「（当前使用）」立即移动；
- 顺序：先 sessions.messages.subscribe {key, includeApprovals:true} 新 key，再 unsubscribe 旧 key；
  旧 key 退订失败则撤销新订阅并保持原会话，不做半切换；
- Adapter 通过 setSessionKey 使用新 key 发送；审批状态清空；
- 用户确认测试通过；提交 1c5ad26。

### P1-011
UI 布局修复（聊天滚动 + 面板互斥/悬浮，已实测）。

- 消息区 min-height:0 + 容器 overflow:hidden，长对话只在消息区内部滚动，输入框固定底部；
- 四个面板互斥：同一时刻最多一个，点击另一个自动切换，再点同一按钮收起；
- 面板改为 absolute 悬浮层（top 56px，最大高度 calc(100%-150px)，内部可滚动），不再挤压聊天区；
- 用户确认测试无异常；提交 d495f24。

### P1-010
Session 管理 —— 只读会话列表（已实测）。

- 顶部「会话」面板展示 sessions.list 的 key、MAIN/SESSION、更新时间；
- 与 settingsOverview.sessionKey 相同的一条标「（当前使用）」；
- updatedAt 缺失显示「未提供」，不推算；
- 本步不新建/删除/切换会话；
- 提交 1fc704b。

### P1-009
Settings 模型修改 + 单次回滚（已实测）。

- 「设置」中可修改当前 Session 的 `model`，走 `sessions.patch { key, model }`，成功后 `sessions.list` 刷新；
- 修改前记录原值，可点「回滚模型」一次性恢复；当前模型为空时禁止写入；
- RPC 实测：`deepseek-flash` → `deepseek-chat` → 回滚 `deepseek-flash`；
- UI 实测：用户确认保存与回滚均正常；
- 提交 `fd3866a`。

### P1-008
GatewayChatAdapter 订阅顺序修复。

- `send()` 改为**先注册 `onEvent`、再 `sendMessage`**，并对 runId 未知前的早到事件做缓冲；
- 结果：`onEvent` 在 L138、`sendMessage` 在 L162（subscribe-before-send=True）；
- `tsc` 0 错误、`npm run build` PASS；普通对话正常（流式 + 回 idle）；
- 快速失败瞬时事件**未实测**（开系统代理表现为挂起，不是秒失败）；
- 提交 `fb108f7`。

### P1-007
Connection State / Log Viewer / Settings 只读概览（均界面实测）。

- Connection State：连接状态徽标、Gateway/模式/Agent/Terminal、连接说明、最近错误、重连说明。
- Log Viewer：最近 200 条运行事件，展开/关闭/清空；启动日志含 handshake、permission probe、
  subscription（approvals=true）、runtime ready。
- Settings：只读展示模型、工具数量、当前 Session、Session 总数；Gateway 未返回的字段统一显示「未提供」，不伪造。
- 提交：`cea1a7b`（Connection State）、`32189e9`（Log Viewer）、`345d9ce`（Settings）。

### P1-005
NSIS 安装包回归通过。

- 配置：`bundle.active = true`、`targets = ["nsis"]`、显式 5 个图标、`windows.nsis.installMode = "currentUser"`。
- 产物：`target/release/bundle/nsis/FJK Agent_0.1.0_x64-setup.exe`（13.22 MB）。
- 安装：`/S` 静默安装退出码 0；安装目录由卸载注册表解析（本机为 `D:\fjk-agent\FJK Agent`）；开始菜单快捷方式已创建。
- 运行：安装版启动正常、Gateway 连接成功、真实对话成功（runId `0c46a932`）。
- 卸载：`uninstall.exe /S` 退出码 0；目录与快捷方式清理，无进程残留。
- 边界：未签名；MSI、自动更新未做。

### P1-004
Release 构建与运行回归通过。

- 从 `D:\pet-desp\apps\desktop` 执行 `npm run tauri build`：成功，无 error。
- 前端 production 产物 `apps/desktop/dist/` 已生成：12 个文件，约 11.6 MB。
- release exe：
  `apps/desktop/src-tauri/target/release/fjk-desktop.exe`
- exe 大小：**20.24 MB**。
- 发布形态直接运行验证：
  1. 窗口正常打开，无白屏、无崩溃；
  2. 成功连接本地 Gateway，徽标为 `Gateway`，`agent: idle`；
  3. 真实流式对话成功，记录 runId `83a787ed`；
  4. 关闭窗口后 `fjk-desktop` 进程正常退出，无残留。
- 本轮仅验证 standalone release exe；`bundle.active = false`，未生成/验证 NSIS 或 MSI 安装包。

### P1-003
事件驱动 AgentState 已完成。

- 新增 `packages/agent-state/AgentStateReducer.js`：统一消费本地请求意图、Gateway 事件与连接状态；支持 runId 隔离、seq/ts 乱序保护、终态 1500ms 回落、epoch 防竞态，并通过注入 `now` / `setTimeout` / `clearTimeout` 保持可测试。
- `apps/desktop/src/chat/ChatController.js` 不再持有或直接写入 `PetStateMachine`；改为 dispatch `local/request-started` / `local/request-settled`。
- `apps/desktop/src/runtime/usePetRuntime.ts` 使用 AgentState 作为唯一 Agent 行为状态源，并建立唯一 Agent 驱动链：
  `AgentState → AgentToPetState → PetStateMachine.setState`。
- runtime 中 Agent 生命周期写入桌宠仅保留上述一处；另保留应用启动时的 boot 初始化 `stateMachine.setState(IDLE)`。
- `TauriGatewayClient` 独立提供 `onEvent()` 与 `onConnectionState()`，运行中断线可将 AgentState 切换到 `offline`。
- reducer 单元测试：**10/10 通过**。
- T1 实测：真实流式对话正常，`thinking → working → completed → idle`，桌宠同步。
- T2 实测：completed 后 1.5 秒内追发新消息，无旧 terminal timer 导致的 idle 抖动。
- T3 实测：运行中关闭 Gateway，AgentState 进入 `offline`，终端显示离线并禁用输入。
- T4 实测：重启 Gateway 后重新启动桌面端，可恢复正常连接与运行路径。
- Approval / `waiting_approval` 桌面真实路径：**未验证**。

### P1-006
Approval 卡片 + resolve 已完成，allow 路径已真实验证。

- 前端订阅与 caps 顶层提交：`55d5b08`。
- Approval 卡片 UI 提交：`0675933`。
- 已确认事件：
  - `exec.approval.requested`
  - `session.approval`（`pending` → `terminal`）
  - `exec.approval.resolved`
- resolve 方法：`exec.approval.resolve { id, decision }`。
- allow 路径实测通过：审批卡片出现后点击“允许”，`whoami` 真实执行并返回 `laptop-qqmq9j32\付家康`，`exitCode=0`，耗时 `482ms`，随后审批记录被移除。
- deny 路径实测通过：点击「拒绝」后 `exec.approval.resolved` 记录 `decision:"deny"`、`resolvedBy:"FJK Desktop"`，命令未执行（user-denied）。
### P1-001
Gateway transport moved to Rust (`src-tauri/src/gateway.rs`), removing the
WebView `Origin` header that made OpenClaw clear operator scopes. Tauri commands:
`gateway_info` / `gateway_connect` / `gateway_request` / `gateway_disconnect`;
token stays in the backend. Verified with a real chat round-trip.

### P1-002
Gateway error mapping (`src/gateway/GatewayError.ts`) + UI: unauthorized /
not-paired / origin-rejected / offline / timeout / config states, banner, mode
badge and structured chat error block. Assertions pass.

### P0-001
Project guide established.

### P0-002
AI context system established.

### P0-003
Local Git baseline established.

### P0-004
Deepseek-pet imported.

### P0-005
Deepseek-pet architecture audited.

### P0-006
Pet runtime integration boundary identified.

### P0-007
FJK AgentState adapter created and tested.

### P0-008
OpenClaw installed.

### P0-009
Windows Gateway validated.

### P0-010
DeepSeek Provider configured.

### P0-011
Real model inference validated.

### P0-012
Gateway model transport validated.

### P0-013
Agent Runtime validated.

### P0-014
Session persistence validated.

### P0-015
Tool + interactive Approval complete chain validated.

### P0-016
Real Gateway event semantics inspected (OPENCLAW_GATEWAY_EVENT_SEMANTICS.md).

### P0-017
Gateway authentication and connection contract identified (OPENCLAW_GATEWAY_AUTH_CONTRACT.md).

### P0-018
Agent turn events identified (OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md).

### P0-019
Tool execution events identified (OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md).

### P0-020
Approval request / resolution events identified (OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md).

### P0-021
Gateway Event → FJK AgentState mapping defined (OPENCLAW_EVENT_TO_AGENTSTATE_MAPPING.md + packages/agent-state/GatewayEventToAgentState.js).

### P0-022
FJK Gateway Client interface defined (OPENCLAW_GATEWAY_CLIENT_INTERFACE.md + packages/gateway-client).

### P0-023
Phase 0 technical selection report produced (OPENCLAW_TECH_SELECTION.md).
