# Tasks

## DOING

- Phase 1：Terminal 已切换到真实 Gateway；继续补 Settings / Connection State / Log Viewer。

## TODO

- **未修复：GatewayChatAdapter 快速失败竞态。**
  当前定位：`GatewayChatAdapter` 先执行 `chat.send`，之后才建立该轮事件订阅；如果 run 极快失败，可能漏掉 `lifecycle error`，导致 UI 停在 `thinking`。此问题单独立项处理，不与 AgentState 本轮改动混合。
- **Approval UI。**
  `waiting_approval` 映射与 reducer 逻辑已存在，但桌面端真实 approval 流程尚未实测，当前仍标记为**未验证**。
- Settings / Connection State / Log Viewer。
- 安装包回归（NSIS / MSI）。当前 `bundle.active = false`，release exe 已验证，但尚未生成或验证安装器。
- 设备配对（device identity）作为浏览器端接入的可选路径。

## BLOCKED

None.

## DONE

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
