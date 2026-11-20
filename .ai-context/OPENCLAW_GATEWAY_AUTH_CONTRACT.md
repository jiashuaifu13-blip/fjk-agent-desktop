# OpenClaw Gateway 认证与连接契约（P0-017）

> 版本：OpenClaw 2026.11.6
> 来源：`dist/ws-connection-C61wOCGm.mjs`、`dist/client-cecYKgQa.mjs`、`dist/operator-scopes-CULmYfyY.mjs`、`dist/message-handler-Cn4QPvRk.mjs`

## 1. 传输与协议

- **传输**：WebSocket（本地 gateway）。
- **协议版本**：v4（`minProtocol = maxProtocol = 4`）。旧 node 协议用 v3。
- 客户端声明 `minProtocol` / `maxProtocol`，服务端在 `hello-ok` 里回 `protocol: 4`。

## 2. 握手时序

```
Client                          Gateway
   │  WS upgrade                    │
   │◄──────────────────────────────│  connect.challenge { nonce, ts, capabilities }
   │  hello { connect:{ minProtocol, │
   │          maxProtocol, role,     │
   │          token, nonce(回显),    │
   │          challengeTs, client }  │
   │──────────────────────────────►│  校验 token → 解析 role + scopes
   │◄──────────────────────────────│  hello-ok { protocol:4, server, features }
```

要点：
- `connect.challenge` 的 `nonce` 由客户端在 `hello` 中**原样回显**（配合 `challengeTs`，作存活/防重放）。
- 服务端校验通过后推进 `auth_validated` 握手阶段，并以 `role` + `scopes` 建立客户端身份。

## 3. 认证

- **模式**：`gateway.auth.mode`，取值 `token`（本地实测）或 `none`（无认证）。
- **凭据**：`gateway.auth.token`（`~/.openclaw/openclaw.json` 中配置）。客户端在 `hello` 的 `connect.token` 字段带上它。
- 服务端用 token 解析出 `role` 和 `scopes`。

> ⚠️ 安全：token 是密钥，仅存于 `~/.openclaw/openclaw.json`，**禁止写入 Git 或硬编码进 FJK 源码**。FJK Desktop 应从本地配置/用户输入读取，走运行时注入。

## 4. 角色（role）

- `operator` — 管理端（FJK Desktop 默认用这个）
- `worker` — 远程 worker
- `node` — 节点

## 5. 操作权限范围（operator scopes，封闭集合）

源 `src/gateway/operator-scopes.ts`。token 中的 scope 会被 `normalizeOperatorScopeList` 过滤到这个封闭集合：

| scope | 含义（推断） |
|---|---|
| `operator.admin` | 管理（最高） |
| `operator.read` | 全局读 |
| `operator.write` | 全局写 |
| `operator.sessions.read` | 读会话 |
| `operator.sessions.write` | 写会话 |
| `operator.approvals` | 审批操作 |
| `operator.questions` | 问题/询问 |
| `operator.pairing` | 设备配对 |
| `operator.talk` | 语音对话 |
| `operator.talk.secrets` | 语音密钥 |

订阅相关约束（已在 `sessions-subscriptions` 看到）：
- `sessions.messages.subscribe` 带 `includeApprovals` 需要 `operator.approvals` scope（且要求 paired device）。
- 会话读取受 `operator.sessions.read` / `operator.read` 约束。

## 6. hello-ok 响应

```jsonc
{
  "type": "hello-ok",
  "protocol": 4,
  "server": { "version", "buildId", "bootId", "connId", "controlUiBuildSource" },
  "features": {
    "methods": [/* 可用 RPC 方法 */],
    "events": [/* 可用事件（见 P0-016 的 GATEWAY_EVENTS） */],
    "capabilities": [/* 服务端能力位 */]
  }
}
```

## 7. FJK Desktop Gateway Client 的接入要求

1. 连本地 gateway 的 WebSocket。
2. 等 `connect.challenge`，取 `nonce`/`ts`。
3. 发 `hello`：`connect = { minProtocol: 4, maxProtocol: 4, role: "operator", token, nonce, challengeTs, client }`。
4. 收 `hello-ok`，记录 `connId`、可用 `methods`/`events`/`capabilities`。
5. 之后按需 `sessions.subscribe` / `sessions.messages.subscribe` 建立事件订阅（见 P0-016）。
6. token 从本地配置读取，不硬编码、不入 Git。

## 8. 现状与下一步

- **P0-017 完成**：传输/协议/握手/认证/scope/角色契约已查清。
- **下一步 P0-018~020**：Agent turn 事件、Tool 执行事件、Approval 请求/解决事件（P0-016 已覆盖大部分载荷，可据此细化）。
- **P0-022**：据本文定义 FJK Gateway Client 接口。
