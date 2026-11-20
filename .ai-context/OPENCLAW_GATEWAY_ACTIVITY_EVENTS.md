# OpenClaw Gateway 活动事件：Turn / Tool / Approval（P0-018~020）

> 版本：OpenClaw 2026.11.6
> 关联：P0-016（事件面/载荷）、P0-017（连接/认证）
> 关键更正：`session.started`/`session.ended`/`session.closed`/`session.stuck`/`session.turn.prepare`/`session.turn.commit` 是**内部事件**，不在 `GATEWAY_EVENTS` 客户端事件清单内。客户端可观测的 turn 生命周期由 **`agent` 事件**承载。

---

## P0-018 — Agent turn 事件

核心是 **`agent` 事件**（一个 `runId` = 一次运行）。封套见 P0-016。其 `stream` 分五类，构成一次完整 turn 的可观测信号：

| stream | data 关键字段 | 语义 |
|---|---|---|
| `lifecycle` | `phase`: `start` / `model` / `waiting-approval` / `approval-resolved` / `end` / `error` | **运行生命周期**（turn 开始/模型确定/待审批/审批解决/结束/出错） |
| `execution` | `state`: `running` / `waiting` / `unknown`；`wait.kind`: `approval`/`user_input`/`agent_messages`/`children`/`external` | **执行活动状态**（在跑/在等） |
| `tool` | `phase`: `start` / `result` / `end`；`toolCallId`/`name`/`result` | 单个工具调用 |
| `assistant` | `delta` 文本 | 助手流式文本 |
| `usage` | token 用量 | 用量统计 |

`lifecycle.phase` 的时间线：`start` →（`model`）→ … → `end`（正常）或 `error`（失败）；期间若需审批则插入 `waiting-approval` → `approval-resolved`。

会话级辅助信号：
- `session.typing` — `{ typing: boolean, actor, preview?, cursor? }`（输入中指示）
- `session.message` — 消息落盘事件（见 P0-016）

## P0-019 — Tool 执行事件

两层并存：

1. **`agent` 流 `tool`**（细粒度，每次工具调用）
   ```
   data = { phase: "start"|"result"|"end", toolCallId, name, result, ... }
   ```
   - `start` → 工具开始执行
   - `result` → 工具返回结果（含 `isError` 标志判断成败）
   - `end` → 结束

2. **`session.tool`**（会话级投影，广播给会话订阅者）
   - 在工具执行 `data.phase === "start" | "result"` 时随 `agent` 事件一起广播。
   - 载荷 `P` 含 run 信息（`runId`/`clientRunId` 等）。

> FJK 判断「working」：`agent` 流 `tool.phase=start` 或 `execution.state=running`；「completed」：`tool.phase=result`（结合 `isError` 判定成败）。

## P0-020 — Approval 事件

三类并存（从轻到重）：

1. **`agent` 流 `execution` 的 `data.approval`**（最轻量状态位）
   ```
   data.approval = { id, state: "pending" | "resolved" }
   ```
   以及 `lifecycle.phase` 的 `waiting-approval` / `approval-resolved`。

2. **`session.approval`**（会话级审批投影，`dist/operator-approval-session-events-*.mjs`）
   ```
   { sessionKey, sourceSessionKey?, updatedAtMs,
     phase: "pending" | "terminal",
     approval: <snapshot> }   // snapshot.status ∈ { "pending", 已解决 }
   ```
   订阅需 `operator.approvals` scope + paired device。

3. **`exec.approval.requested` / `exec.approval.resolved`**（Gateway 级审批事件）
   - 请求对象字段（`dist/bash-tools-*.mjs` 的 `createExecApprovalRequestRoute`）：
     `approvalId`、`approvalSlug`、`warningText`、`expiresAtMs`、`preResolvedDecision`、`initiatingSurface` 等。
   - 对应 `plugin.approval.requested/resolved`、`openclaw.approval.requested/resolved`。

> FJK 判断「waiting_approval」：任一 `requested` 事件 / `session.approval(phase=pending)` / `data.approval.state=pending`；「回到 working」：对应 `resolved`。

## 现状与下一步

- **P0-018~020 完成**：turn/tool/approval 三类活动事件的可观测载荷已归整确认。
- **下一步 P0-021**：定义 `agent`（lifecycle/execution/tool）+ `session.approval` + `exec.approval.*` → FJK AgentState 的正式映射规则。
