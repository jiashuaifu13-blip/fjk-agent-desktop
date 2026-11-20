# OpenClaw Gateway 事件语义（P0-016）

> 版本：OpenClaw 2026.11.6
> 来源：安装包 `dist/`（编译产物，含 `//#region src/...` 原始路径注释）
> 方法：直接读源码 + 精确 grep（CodeGraph 默认跳过 `dist/` 构建产物，故本任务用源码定位）

## 1. 结论速览

OpenClaw Gateway 用**一个 `agent` 事件**承载 Agent 单次运行的完整生命周期（这是驱动 FJK AgentState 的核心），再配合若干 **session 级事件**承载消息/工具/审批/输入状态。协议 v4，事件走 `broadcastToConnIds`（定向广播）+ 订阅模型。

驱动 FJK AgentState 的关键信号已定位：

| FJK AgentState | 主要事件信号 |
|---|---|
| `thinking` | `agent` 流 `lifecycle.phase=start`（开始运行）/ `session.typing` |
| `working` | `agent` 流 `execution.state=running` / `tool.phase=start` / `session.tool` |
| `waiting_approval` | `exec.approval.requested` / `session.approval(phase=pending)` / `agent` 流 `lifecycle.phase=waiting-approval` |
| `completed` | `agent` 流 `lifecycle.phase=end` / `tool.phase=result` / `exec.approval.resolved` |
| `failed` | `agent` 流 `lifecycle.phase=error` / `session.error` |
| `idle` | 无活动（lifecycle end 后回落） |

（完整映射见 P0-021。）

## 2. 完整事件面（GATEWAY_EVENTS）

源文件 `src/gateway/events.ts` → `dist/events-BxTs-VBE.mjs`，`GATEWAY_EVENTS` 数组约 80 个事件名。按域分类：

**连接/心跳**：`connect.challenge`、`hello-ok`（隐含在握手）、`health`、`heartbeat`、`shutdown`、`gateway.suspension`、`socket.drain`、`tick`、`presence`

**Agent 运行**：`agent`、`chat`、`chat.metadata.changed`、`models.snapshot`、`agent.identity.changed`

**会话（session.*）**：`session.message`、`session.typing`、`session.tool`、`session.approval`、`session.operation`、`session.narration`、`session.observer`、`session.suggestion`、`session.reaction`、`session.sharing`、`session.sharing.evidence`

**会话列表/进程（sessions.*）**：`sessions.changed`、`sessions.processes.changed`

**审批**：`exec.approval.requested`、`exec.approval.resolved`、`plugin.approval.requested`、`plugin.approval.resolved`、`openclaw.approval.requested`、`openclaw.approval.resolved`、`question.requested`、`question.resolved`

**其它**：`update.available`、`update.run.changed`、`cron`、`cron.inventory.changed`、`task.suggestion`、`node.*`、`device.pair.*`、`users.prefs.changed`、`skills.changed`、`plugins.changed`、`terminal.data`、`terminal.exit`、`progressCard.changed`、`mentions.changed`、`mentions.failed` 等

> 注：RPC **方法名**（`sessions.create`/`sessions.send`/`sessions.list` 等）与**事件名**是两个命名空间。上面是事件名（server→client 推送）。

## 3. 核心事件 `agent`（最重要的生命周期事件）

源：`src/infra/agent-events.ts` → `dist/agent-events-D4f1SVjv.mjs`；发射点 `dist/server-chat-VehBeJOJ.mjs`。

统一封套（enrich 后）：
```
{
  runId, sessionId?, sessionKey?, agentId?,
  stream,          // 事件类别
  data,            // 流相关载荷
  seq,             // 每次运行内自增序号
  ts               // 时间戳
}
```

**`stream` 取值**（实测）：
- `lifecycle` — 运行生命周期（最重要）
- `execution` — 执行/工具活动状态
- `tool` — 单工具调用
- `usage` — token 用量
- `assistant` — 助手文本流（含 delta）

**`lifecycle` 流的 `data.phase`**：
- `start` — 开始（`data.startedAt` 为必填时间戳）
- `model` — 模型确定（`data.provider` + `data.model`）
- `waiting-approval` — 进入待审批
- `approval-resolved` — 审批已解决
- `end` — 正常结束
- `error` — 出错结束（`data` 含错误信息）

**`execution` 流的 `data`**：
- `data.state`: `running` | `waiting` | `unknown`
- `data.wait.kind`（当 waiting）: `approval` | `user_input` | `agent_messages` | `children` | `external`
- `data.approval`: `{ id, state: "pending" | "resolved" }`
- `data.executionId` / `data.sourceId` / `data.invalidate`

**`tool` 流的 `data`**：
- `data.phase`: `start` | `result` | `end`
- `data.toolCallId` / `data.name` / `data.result`

## 4. Session 事件载荷

### 4.1 `session.message`
源：`src/gateway/server-session-events.ts` → `dist/server-session-events-DjLAlnc6.mjs`
```
{
  sessionKey, agentId?, message,      // message 为投影后的聊天消息
  messageSeq?, messageId?, runId?,
  transcriptPosition?,
  sessionSnapshot                    // 含 activeRunState
}
```

### 4.2 `session.typing`
源：`src/gateway/server-methods/sessions-typing.ts` → `dist/sessions-suggestions-BJFSp6CB.mjs`
```
{ sessionKey, sessionId, agentId, actor, typing: boolean, preview?, cursor?, ts }
```

### 4.3 `session.tool`
源：`dist/server-chat-VehBeJOJ.mjs`（`t("session.tool", P, ...)`）
在工具执行 `data.phase === "start" | "result"` 时广播，载荷 `P` 含 run 信息（runId/clientRunId 等）。是对 `agent` 流 `tool` 的会话级投影。

### 4.4 `session.operation`
源：`src/gateway/server-methods/sessions-shared.ts` → `dist/sessions-shared-Dt1uT8JM.mjs`
**语义是「会话压缩」操作**（不是 Agent 回合）：
```
{ operationId, operation: "compact", phase: "start"|"end",
  sessionKey, agentId, completed?, reason?, ts }
```

### 4.5 `session.approval`
源：`src/gateway/operator-approval-session-events.ts` → `dist/operator-approval-session-events-DpZZvDoA.mjs`
```
{
  sessionKey, sourceSessionKey?, updatedAtMs,
  phase: "pending" | "terminal",
  approval: <snapshot>          // snapshot.status ∈ { "pending", 已解决 }
}
```

### 4.6 `sessions.changed`
源：同 `server-session-events`
```
{ sessionKey, agentId?, phase, ts, messageId?, messageSeq?, ...sessionSnapshot }
```
`phase` 目前见 `"message"`；`sessionSnapshot` 含 `activeRunState`（运行态快照）。

### 4.7 会话生命周期（注意：内部事件，非客户端可订阅）
`session.created` / `session.started` / `session.updated` / `session.ended` / `session.closed` / `session.error` / `session.stuck` / `session.turn.prepare` / `session.turn.commit`

> 这些是 worker/actor **内部事件**，不在 `GATEWAY_EVENTS` 客户端事件清单内。客户端可观测的 turn 生命周期由 `agent` 事件的 `lifecycle` 流承载（见 OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md）。

## 5. 审批事件（三类并存）

1. **`exec.approval.requested` / `exec.approval.resolved`** — Gateway 级审批事件（`dist/channel-server-90Epuwdr.mjs`、`dist/server-CDUXLTiq.mjs`）。请求对象字段（`dist/bash-tools-dO_aOnC4.mjs` 的 `createExecApprovalRequestRoute`）：`approvalId`、`approvalSlug`、`warningText`、`expiresAtMs`、`preResolvedDecision`、`initiatingSurface` 等。
2. **`session.approval`** — 会话级审批投影（见 4.5）。
3. **`agent` 流 `execution` 的 `data.approval`** — `{ id, state: pending|resolved }`，是最轻量的状态信号。

## 6. 订阅方法（RPC）

源：`src/gateway/server-methods/sessions-subscriptions.ts` → `dist/sessions-subscriptions-B9ZXlBHz.mjs`

- `sessions.subscribe` — 订阅会话列表（params：`includeMessageBodies` + 列表过滤）
- `sessions.messages.subscribe` — 订阅单会话消息（params：`key`、`includeApprovals`、`mode`、`subscriptionId`、`initialHistory`）
- `sessions.messages.unsubscribe` — 退订

## 7. 现状与下一步

- **P0-016 完成**：事件面 + 关键事件载荷语义已查清。
- **下一步 P0-017**：Gateway 认证与连接契约（`connect.challenge` / `hello-ok` 握手 + scope）。
- **P0-021**：据本文做 `agent`/`session.*`/`exec.approval.*` → FJK AgentState 的正式映射。

> CodeGraph 备注：已对 OpenClaw 包建索引，但默认跳过 `dist/`（构建产物）仅索引 54 个源文件；OpenClaw 实际代码在 `dist/`（编译产物、变量名打乱），故本任务用源码 grep 定位。后续若要 CodeGraph 索引 FJK 仓库（干净源码），另行执行 `codegraph init /d/pet-desp`。
