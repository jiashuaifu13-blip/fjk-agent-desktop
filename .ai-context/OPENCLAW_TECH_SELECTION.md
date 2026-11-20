# Phase 0 技术选型报告（P0-023）

> 日期：2026-11-20
> 版本：OpenClaw 2026.11.6
> 结论：**GO —— OpenClaw 可作为 FJK Agent Core**

## 1. 结论

OpenClaw 满足 FJK Agent 的核心需求，选型通过。依据：

- 本地 Windows 可稳定运行（Gateway + Agent Runtime + Session + Tool + Approval 全链路已实测跑通）。
- 提供规范的客户端接入协议（WebSocket + protocol v4 + token 认证 + 事件订阅），FJK Desktop 无需修改 OpenClaw Core。
- 事件面完整覆盖 FJK 桌宠需要的状态驱动信号（turn/tool/approval）。

## 2. 已验证清单

| 项 | 状态 | 依据文档 |
|---|---|---|
| Windows 本地运行 | ✅ | OPENCLAW_ENVIRONMENT.md |
| DeepSeek 模型推理 | ✅ | 真实验证 |
| Agent Runtime / Session 持久化 | ✅ | 真实验证 |
| Tool + Approval 完整链路 | ✅ | OPENCLAW_AGENT_TOOL_APPROVAL_VALIDATION.md |
| Gateway 协议 v4 | ✅ | OPENCLAW_GATEWAY_PROTOCOL_AUDIT.md |
| 事件面 + 载荷语义 | ✅ | OPENCLAW_GATEWAY_EVENT_SEMANTICS.md |
| 认证/连接契约 | ✅ | OPENCLAW_GATEWAY_AUTH_CONTRACT.md |
| turn/tool/approval 事件 | ✅ | OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md |
| 事件→AgentState 映射 | ✅ | OPENCLAW_EVENT_TO_AGENTSTATE_MAPPING.md |

## 3. 集成方案（FJK Desktop 如何接入）

```
OpenClaw Gateway（本地）
   │  WebSocket / protocol v4 / token 认证
   ▼
FJK GatewayClient（packages/gateway-client，接口已定义）
   │  connect.challenge → hello(token) → hello-ok
   │  sessions.subscribe / sessions.messages.subscribe
   ▼
事件 reducer（packages/agent-state/GatewayEventToAgentState）
   │  agent lifecycle/execution/tool + session.approval + exec.approval.*
   ▼
FJK AgentState（offline/idle/thinking/working/waiting_approval/completed/failed）
   │  AgentToPetState 适配器（已存在）
   ▼
PetStateMachine → 桌宠动画
```

核心原则（遵守总纲）：
- 只走 Gateway 公开协议，**不读/写 OpenClaw 内部数据库或运行时状态文件**。
- Adapter 优先，不修改 OpenClaw Core。
- 桌宠与管理终端共享同一 `GatewayClient` + `AgentState`。

## 4. 关键设计决策

1. **事件权威来源**：`agent` 事件的 `lifecycle` 流（`start/end/error/waiting-approval`）是 turn 生命周期的权威信号；`execution`/`tool` 流补充 working 细节。
2. **认证**：token 制（`gateway.auth.token`），从本地配置运行时读取，**不入 Git、不硬编码**。
3. **角色/权限**：FJK Desktop 用 `role: operator`，按需申请 scope（`operator.sessions.read` / `operator.approvals` 等 10 个封闭 scope）。
4. **状态层**：`packages/agent-state` 持有统一状态 + 映射；`packages/gateway-client` 持有接口契约（Phase 1 实现）。

## 5. 风险与应对

| 风险 | 应对 |
|---|---|
| auth token 泄漏 | token 仅存 `~/.openclaw/openclaw.json`，FJK 运行时注入，Git 忽略 |
| OpenClaw 升级导致协议变化 | 锁定 protocol v4；`hello-ok.features` 声明能力，客户端按能力降级 |
| 审批/会话 scope 粒度 | 初始只申请最小 scope，按需扩展 |
| `agent` 事件 thinking/working 边界模糊 | v1 映射已定，落地时用真实运行数据微调（见映射文档 §3） |
| VS Build Tools 安装慢（国内 CDN） | 已解决（已装）；新环境部署需预留时间或用代理 |

## 6. 交付物汇总

代码：
- `packages/agent-state/` — `AgentStates.js`、`AgentToPetState.js`（+测试）、`GatewayEventToAgentState.js`（+测试，P0-021）
- `packages/gateway-client/` — `types.ts`、`GatewayClient.ts`（接口，P0-022）
- `apps/desktop/` — Tauri 2 + React 前端最小闭环（Phase 1 前置，已建）

文档（.ai-context/）：
- `OPENCLAW_GATEWAY_EVENT_SEMANTICS.md`、`OPENCLAW_GATEWAY_AUTH_CONTRACT.md`、`OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md`、`OPENCLAW_EVENT_TO_AGENTSTATE_MAPPING.md`、`OPENCLAW_GATEWAY_CLIENT_INTERFACE.md`、本报告

## 7. 下一步

Phase 0 全部完成（P0-001~023）。进入 **Phase 1**：
1. 实现 `GatewayClient`（WebSocket 握手 + 订阅 + 事件 reducer）。
2. 把 `apps/desktop` 的 `DesktopTerminal` 从 Mock 换成真 Gateway 连接。
3. 补齐 Settings / Connection State / Log Viewer。
