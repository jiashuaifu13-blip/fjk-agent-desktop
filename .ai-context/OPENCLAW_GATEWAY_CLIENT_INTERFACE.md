# FJK Gateway Client 接口（P0-022）

> 类型定义：`packages/gateway-client/types.ts`（wire 事件类型）、`packages/gateway-client/GatewayClient.ts`（接口）
> 依据：P0-016（事件）、P0-017（握手/认证）、P0-021（映射）

## 1. 定位

`packages/gateway-client/` 是 FJK Desktop 与 OpenClaw Gateway 通信的**接口契约**（类型 + 接口签名）。本阶段只定义接口，**不实现**——具体 WebSocket 客户端（握手 + 订阅 + 事件 reducer）在 Phase 1 落地。

## 2. 事件类型（types.ts）

固化了 P0-016 的 wire 载荷：

- `AgentEvent` — `agent` 事件（`stream`: lifecycle/execution/tool/usage/assistant）
- `SessionApprovalEvent` / `ExecApprovalEvent` — 审批
- `SessionTypingEvent` / `SessionMessageEvent` / `SessionsChangedEvent` — 会话
- `HelloOkEvent` / `ConnectChallengeEvent` / `ShutdownEvent` — 连接/握手
- `GatewayEvent` — 联合类型（含兜底 catch-all）

## 3. 客户端接口（GatewayClient.ts）

```ts
interface GatewayClient {
  readonly state: AgentState
  readonly connected: boolean

  connect(options: GatewayClientOptions): Promise<void>   // 握手：connect.challenge → hello(token) → hello-ok
  disconnect(): void

  onStateChange(listener: (s: AgentState) => void): () => void
  onEvent(listener: (e: GatewayEvent) => void): () => void

  subscribeSessions(filter?): Promise<unknown>
  subscribeSessionMessages(options): Promise<unknown>     // 含 includeApprovals/initialHistory
  unsubscribeSessionMessages(key): void

  sendMessage(sessionKey, content): Promise<unknown>
  stop(sessionKey): void
}
```

## 4. 状态流转（与 P0-021 衔接）

- 客户端内部维护 `state`，消费事件流用 reducer：`next = gatewayEventToAgentState(event) ?? current`。
- 连接事件用 `connectionEventToAgentState`（`hello-ok` → idle，`shutdown/close` → offline）。
- 状态变化通过 `onStateChange` 通知上层（桌宠经 `AgentToPetState` 映射）。

## 5. 未决/待 Phase 1 细化

- `subscribeSessions` / `subscribeSessionMessages` 的精确返回结构（含 `approvalReplay`、`initialHistory`）。
- `sendMessage` 对应 RPC（`sessions.send`）的完整参数与响应。
- 审批操作的 RPC 方法（`exec.approvals.*`）——需据 `exec.approval.requested` 载荷补全。

## 6. 状态

- **P0-022 完成**：接口契约已定义（类型 + 签名），待 Phase 1 实现。
- **下一步 P0-023**：Phase 0 最终技术选型报告。
