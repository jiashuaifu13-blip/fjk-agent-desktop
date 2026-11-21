# Changelog

## 2026-11-20

### Added
- FJK_AGENT_PROJECT_GUIDE.md
- .ai-context/AI_CONTEXT.md
- .ai-context/PROJECT_STATUS.md
- .ai-context/TASKS.md
- .ai-context/DECISIONS.md
- .ai-context/CHANGELOG.md
- .ai-context/MODULE_MAP.md
- .ai-context/AI_HANDOFF.md

### Phase 1 — Gateway transport moved into Rust

#### Why
The desktop WebSocket carried the WebView `Origin` header. OpenClaw 2026.11.6
classifies such a handshake as a browser client, and for token auth without a
device identity it clears every unbound operator scope. The result was a
successful `hello-ok` plus `FORBIDDEN / MISSING_SCOPE operator.read` on the first
RPC (`sessions.list`).

Reproduced with the same token/scopes: no `Origin` header works, `Origin:
http://localhost:5173` reproduces the exact error payload.

#### Added
- `apps/desktop/src-tauri/src/gateway.rs` — native OpenClaw Gateway client
  (protocol v4): challenge handshake, request/response correlation, event pump,
  connection state events. The socket has no `Origin` header, so the gateway
  keeps it on the local backend path and honours the requested operator scopes.
- Tauri commands: `gateway_info`, `gateway_connect`, `gateway_request`,
  `gateway_disconnect`. Errors are returned as the gateway's own
  `{ code, message, details }` payload.
- `apps/desktop/src/gateway/TauriGatewayClient.ts` — frontend transport over the
  commands, re-emitting `gateway://event` frames.
- `apps/desktop/src/gateway/GatewayError.ts` — gateway error → user-facing
  vocabulary (`unauthorized`, `not_paired`, `origin_rejected`, `offline`,
  `timeout`, `config`, `protocol`, `unknown`).
- `apps/desktop/src/gateway/types.ts` — `GatewayTransport` / `GatewayEventFrame`.
- Gateway status notice + mode badge (`Gateway · 未授权`, `离线 · Mock`) and a
  chat error block with title / detail / hint / raw payload.

#### Changed
- `read_gateway_config` removed: the token no longer reaches the WebView.
- `usePetRuntime` probes `sessions.list` after connecting, so a scope-less
  connection is surfaced at startup instead of on the first message.
- `GatewayChatAdapter` now targets `GatewayTransport` and accepts a resolved
  session key.
- `ChatController` no longer hardcodes "模拟聊天发生错误。".

#### Verified
- `cargo build` and `tsc && vite build` pass.
- Desktop connects through the Rust bridge; gateway log shows the connection
  with **no** `missing scope` / `FORBIDDEN` afterwards.
- Real round-trip in the app: 「hfhf」and「你好」both received agent replies.
- Error mapping assertions pass for MISSING_SCOPE, device-identity, token
  mismatch, origin rejection, offline, timeout, config and string payloads.
