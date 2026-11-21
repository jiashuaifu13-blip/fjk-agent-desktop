# AI Handoff

## Current Stage

Phase 1（桌面框架）进行中 / Phase 2 部分完成。真实 Gateway 对话已在桌面端跑通。

## Last Change (2026-11-20)

### Problem

桌面端通过 WebView 内的 WebSocket 连接 Gateway。握手带 `Origin` 头，
OpenClaw 2026.11.6 会把它判定为浏览器客户端；对「共享 token + 无设备身份」的连接，
网关会清空全部 operator scopes：

- 握手仍然成功（`hello-ok`），界面显示「Gateway」；
- 第一个 RPC `sessions.list` 返回 `FORBIDDEN / MISSING_SCOPE operator.read`。

同 token、同 client.id/mode、同 scopes 的 Node 直连（无 Origin）完全正常；
加上 `Origin: http://localhost:5173` 即可复现截图报错。

### Fix

1. **WS 连接移到 Rust**（`apps/desktop/src-tauri/src/gateway.rs`）：
   - 协议 v4：`connect.challenge` → `connect` → `hello-ok`；
   - `req/res` 关联、事件转发（`gateway://event`）、连接状态（`gateway://state`）；
   - 原生 socket 无 `Origin`，网关走本地后端路径，保留请求的 scopes；
   - token 只在后端读取，不再下发给 WebView（`read_gateway_config` 已删除）。
2. **前端传输层**：`TauriGatewayClient` 通过 `gateway_connect` / `gateway_request`
   转发；`GatewayChatAdapter` 改为面对 `GatewayTransport`。
3. **错误映射**：`GatewayError.ts` 把网关错误分类为
   `unauthorized` / `not_paired` / `origin_rejected` / `offline` / `timeout` /
   `config` / `protocol` / `unknown`，UI 显示标题、详情、建议和可展开的原始负载；
   模式徽标区分 `Gateway` / `Gateway · 未授权` / `离线 · Mock`。
4. **启动权限探测**：连上后立刻 `sessions.list`，无权限时在启动阶段就提示，
   而不是等用户发第一条消息。

## Verified

- `cargo build` 通过；`tsc && vite build` 通过。
- 桌面端连接后网关日志无 `missing scope` / `FORBIDDEN`。
- 真实对话往返成功（「hfhf」「你好」均收到 agent 回复）。
- 错误映射 8 条断言全部通过（MISSING_SCOPE / 设备身份 / token / Origin / 离线 /
  超时 / 配置 / 字符串负载）。

## Next Task

1. 用 Gateway 事件真正驱动 `AgentState`（thinking / working / waiting_approval /
   completed / failed），替换当前由桌宠状态反推的临时映射。
2. Settings / Connection State / Log Viewer。
3. Approval UI（`exec.approval.*` / `question.*`）。
4. 打包产物回归：`npm run tauri build` 后验证窗口与连接（dev 模式已验证）。

## Constraints Reminder

- 不要在 WebView 内重新打开 Gateway WebSocket（会退回缺权限状态）。
- 不要为了「修权限」去改 OpenClaw Core 或放大 scopes 请求；服务端会覆盖。
- token 不得进入前端、日志或 Git。
