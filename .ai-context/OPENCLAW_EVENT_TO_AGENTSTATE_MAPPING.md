# Gateway 事件 → FJK AgentState 映射（P0-021）

> 参考实现：`packages/agent-state/GatewayEventToAgentState.js`（含测试 `GatewayEventToAgentState.test.mjs`，27 用例通过）
> 依据：P0-016（事件载荷）、P0-017（连接/认证）、P0-018~020（turn/tool/approval）

## 1. 状态定义

`packages/agent-state/AgentStates.js`：`offline` / `idle` / `thinking` / `working` / `waiting_approval` / `completed` / `failed`。

## 2. 映射规则

### 2.1 活动事件 → AgentState

| Gateway 事件 | 条件 | → AgentState |
|---|---|---|
| `agent` stream=`lifecycle` | `phase=start` / `phase=model` | `thinking` |
| | `phase=waiting-approval` | `waiting_approval` |
| | `phase=approval-resolved` | `working` |
| | `phase=end` | `completed` |
| | `phase=error` | `failed` |
| `agent` stream=`execution` | `state=running` | `working` |
| | `state=waiting` + `wait.kind=approval` | `waiting_approval` |
| `agent` stream=`tool` | `phase=start` | `working` |
| | `phase=result/end` + `isError` | `failed` |
| | `phase=result/end`（无 error） | `working` |
| `agent` stream=`assistant` | 流式文本 | `working` |
| `exec.approval.requested` | — | `waiting_approval` |
| `exec.approval.resolved` | — | `working` |
| `session.approval` | `phase=pending` | `waiting_approval` |
| | `phase=terminal` | `working` |

其余事件（`session.message`、`session.typing`、`usage` 等）→ `null`（不改变状态）。

### 2.2 连接事件 → AgentState

| 事件 | → AgentState |
|---|---|
| `hello-ok` / `connect` | `idle` |
| `shutdown` / `close` / `disconnect` | `offline` |

连接状态由 Gateway Client 独立维护；`connectionEventToAgentState` 只做归一化。

## 3. 语义说明

- **权威来源**：`agent` 的 `lifecycle` 流是 turn 生命周期权威信号（`start/end/error/waiting-approval`）。
- **thinking vs working**：`lifecycle.start/model` = 模型推理中（thinking）；`execution.running` / `tool.start` / `assistant` 流式输出 = 活动执行（working）。两者的精确边界可在 Gateway Client 落地时用真实运行数据微调。
- **`session.typing` 不参与**：它是**用户**在共享会话里的输入指示（`actor` 是客户端），不是 Agent 自身状态。
- **失败判定**：`lifecycle.phase=error` 为权威失败信号；`tool.result` 的 `isError` 是辅助信号（工具失败不一定终结整个 run）。

## 4. 落地方式（后续）

Gateway Client 内部用一个 **reducer** 消费事件流：`nextState = gatewayEventToAgentState(event) ?? currentState`，连接事件走 `connectionEventToAgentState`。桌宠再经 `AgentToPetState.js`（已存在）映射到 PetState。

## 5. 状态

- **P0-021 完成**：映射规则已定义，含可运行的参考实现 + 测试。
- **下一步 P0-022**：定义 FJK Gateway Client 接口。
