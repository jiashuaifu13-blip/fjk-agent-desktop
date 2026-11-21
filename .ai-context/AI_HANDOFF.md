# AI Handoff

## Current Stage

Phase 1（桌面框架）进行中 / Phase 2 部分完成。

事件驱动 AgentState 已完成并经过真实桌面运行验证。当前主数据流为：

`Gateway 事件 / 连接状态 + 本地请求意图 → AgentStateReducer → AgentState → AgentToPetState → PetStateMachine`

桌宠只消费 AgentState，不再由聊天控制器直接写入 Agent 生命周期状态。

## Last Change (2026-11-20)

### Gateway-driven AgentState

1. **AgentStateReducer**
   - 新增 `packages/agent-state/AgentStateReducer.js`。
   - 统一消费：
     - `local/request-started`
     - `local/request-settled`
     - `gateway/event`
     - `connection/state`
   - 复用 `gatewayEventToAgentState` 做单事件语义映射。
   - 支持 runId 隔离、seq/ts 乱序保护、重复事件幂等。
   - `waiting_approval` 不会被普通 assistant/tool working 事件覆盖。
   - `completed` / `failed` 停留 1500ms 后回 `idle`。
   - 通过 epoch 防止旧 terminal timer 把新 run 打回 idle。
   - `now` / `setTimeout` / `clearTimeout` 可注入，便于纯函数级测试。

2. **ChatController**
   - `apps/desktop/src/chat/ChatController.js` 不再持有 `PetStateMachine`。
   - 删除原来的 THINKING / SPEAKING / ERROR / idle 直接桌宠写入。
   - 改为 dispatch 本地 Agent action。
   - 本地 action 是客户端意图，不伪装成 Gateway 事件。
   - 原有真实聊天和流式消息逻辑保留。

3. **Runtime**
   - `apps/desktop/src/runtime/usePetRuntime.ts` 创建并持有 AgentState store。
   - Gateway `gateway://event` 与 `gateway://state` 都进入 reducer。
   - Mock 模式使用同一个 store。
   - Agent 生命周期驱动桌宠的唯一路径为：
     `AgentState → AgentToPetState → PetStateMachine.setState`
   - runtime 中另保留一次应用 boot 初始化 `stateMachine.setState(IDLE)`。
   - 组件卸载时退订 Gateway listener / store listener，并 dispose reducer。

4. **Connection state**
   - `apps/desktop/src/gateway/TauriGatewayClient.ts` 独立提供：
     - `onEvent()`
     - `onConnectionState()`
   - `gateway://state { state: "offline" }` 已真实抓取验证。
   - 不修改 Rust Gateway transport 的现有载荷协议。

5. **Offline UI**
   - `apps/desktop/src/components/DesktopTerminal.tsx` 在运行中断线后：
     - 徽标显示 `Gateway · 离线`
     - 显示断线提示
     - 禁用输入
     - 提示用户重启桌面端
   - 自动重连不属于本任务范围。

### Related commits

- `6359dac` — AgentState → Pet 单向驱动相关代码
- `1dc315a` — Terminal 运行中断线 UI
- `094be78` — PROJECT_STATUS 更新
- `4aefa3d` — TASKS 更新
- `87cd24b` — CHANGELOG 更新

## Verified

- `AgentStateReducer` 单元测试：**10/10 通过**。
- TypeScript 类型检查通过。
- T1：真实一问一答逐字流式正常；实测状态：
  `thinking → working → completed → idle`，桌宠同步表现。
- T2：在 `completed` 后 1.5 秒内追发新请求，没有旧 timer 导致的 idle 抖动。
- T3：运行中关闭 Gateway：
  - AgentState 进入 `offline`
  - Terminal 显示 `Gateway · 离线`
  - 显示断线提示
  - 输入被禁用
- T4：重启 Gateway 后重新启动桌面端，恢复正常连接与运行路径。
- `waiting_approval` / Approval 桌面真实路径：**未验证**。

## Known Issues

### 1. GatewayChatAdapter 快速失败竞态 — 未修复

模型调用非常快失败时，UI 可能停在 `thinking`。

当前定位：

`GatewayChatAdapter` 先执行 `chat.send`，之后才建立该轮事件订阅。

如果 run 在订阅建立之前立即失败，可能漏掉真实 `lifecycle error`，导致 reducer 收不到终态。

这是下一个独立任务。本轮不要顺手修复。

候选方向：
- 先建立事件订阅，再执行 `chat.send`；
- 或在 transport / adapter 层缓存并关联早到事件。

必须基于真实 runId / 事件时序实现，不允许 mock 假终态。

### 2. Approval 路径未实测

`waiting_approval` 的映射和 reducer 优先级已有测试，但桌面端尚未真实触发 Approval 流程，因此仍标记为**未验证**。

### 3. 无自动重连

运行中断线可正确进入 `offline`，但桌面端当前没有自动 reconnect loop。

恢复 Gateway 后需要手动重新启动桌面端。

自动重连单独立项，不在当前 AgentState 任务范围内。

## Environment / Troubleshooting

Windows 系统代理若指向 `127.0.0.1:7897`，当前 OpenClaw 环境可能触发 SSRF 防护：

`SsrFBlockedError`

表现为模型请求快速失败。

排查此类问题时，先确认并关闭该系统代理，再判断是否为 FJK Desktop 代码问题。

不要为了绕过 SSRF 防护去修改 FJK Desktop 或 OpenClaw 安全逻辑。

## Next Task

1. **优先修复 `GatewayChatAdapter` 快速失败竞态。**
   - 重点确认订阅与 `chat.send` 的先后顺序。
   - 保持真实流式能力不回归。
   - 修复后增加针对“秒失败”的测试和真实运行验证。
2. 完成后再处理 Approval UI，并真实验证 `waiting_approval`。
3. 后续补 Settings / Connection State / Log Viewer。
4. 单独回归 `npm run tauri build` 打包产物。

## Constraints Reminder

- Gateway WebSocket **必须留在 Rust 后端**（`apps/desktop/src-tauri/src/gateway.rs`）。
- 不要把 Gateway WebSocket 移回 WebView；带 `Origin` 的浏览器握手会触发 OpenClaw 不同的权限处理路径。
- token 不得进入前端、日志、文档或 Git。
- 不修改 OpenClaw Core 来绕过权限或 SSRF 安全机制。
- AgentState 是 Agent 行为状态唯一权威；桌宠只做表现层。
- 不重新建立 PetState → AgentState 的反向状态源。
- 未经过真实测试的 Approval 行为不得标记完成。
