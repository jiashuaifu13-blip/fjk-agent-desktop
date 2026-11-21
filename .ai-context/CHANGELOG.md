# Changelog

## 2026-11-21 — Approval deny 回归

### Verified
- deny 路径：点击「拒绝」后 `exec.approval.resolved` 记录 `decision:"deny"`、`resolvedBy:"FJK Desktop"`，
  命令未执行（`Exec denied ... user-denied`，会话记录无执行输出）。
- allow 路径（此前）：`whoami` 执行，`exitCode=0`，482ms。

### Notes
- 审批约 38 秒内必须处理，超时后 run 中止、审批被清理（`APPROVAL_NOT_FOUND`），属预期行为。
- 首次 `echo` 尝试被策略拒绝（`SYSTEM_RUN_DENIED: approval requires a resolved executable`），
  改用可解析的可执行文件后才进入审批流程。

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

### Phase 1 — Gateway-driven AgentState

#### Added
- `packages/agent-state/AgentStateReducer.js` — unified AgentState reducer/service
  consuming local request actions, Gateway events and connection state.
- Reducer timing is injectable through `now` / `setTimeout` / `clearTimeout`.
- Terminal `completed` / `failed` states hold for 1500 ms before returning to
  `idle`; epoch protection prevents an old timer from overwriting a new run.
- `apps/desktop/src/gateway/TauriGatewayClient.ts` now exposes an independent
  `onConnectionState()` channel for `gateway://state`.

#### Changed
- `apps/desktop/src/chat/ChatController.js` no longer holds or directly writes
  `PetStateMachine`; it dispatches `local/request-started` and
  `local/request-settled` actions.
- `apps/desktop/src/runtime/usePetRuntime.ts` now owns the AgentState store.
  The single Agent-driven pet path is:
  `AgentState → AgentToPetState → PetStateMachine.setState`.
  A separate boot initialization `setState(IDLE)` remains.
- `apps/desktop/src/components/DesktopTerminal.tsx` now reflects runtime
  `offline` state in its badge, notice and input availability.

#### Fixed
- Runtime Gateway disconnect now produces a visible `Gateway · 离线` state,
  disconnect notice and disabled input instead of leaving the terminal looking
  connected. UI fix commit: `1dc315a`.

#### Verified
- `AgentStateReducer` tests: **10/10 passed**.
- T1: real streaming conversation passed; observed
  `thinking → working → completed → idle`, with pet state following.
- T2: sending a new request within the 1500 ms terminal hold did not produce an
  old-timer `idle` flicker.
- T3: stopping Gateway during runtime produced `offline`; terminal showed the
  offline state and disabled input.
- T4: after restarting Gateway and restarting the desktop app, the normal
  connected path recovered successfully.
- Approval / `waiting_approval` desktop path remains **unverified**.

#### Known issue
- **Unfixed:** very fast model failures can leave the UI in `thinking`.
  Current diagnosis: `GatewayChatAdapter` performs `chat.send` before installing
  the per-run event subscription, so a run that fails immediately can emit and
  lose its `lifecycle error` before the adapter begins listening.
  This is intentionally left for a separate task.

#### Ops note
- A Windows system proxy at `127.0.0.1:7897` can trigger OpenClaw SSRF
  protection (`SsrFBlockedError`) and make model requests fail immediately.
  During diagnosis, disable that system proxy first before treating the failure
  as an application regression.

### Phase 1 — Release build regression

#### Verified
- Ran `npm run tauri build` from `apps/desktop`.
- Frontend production output generated successfully in `apps/desktop/dist/`:
  12 files, approximately 11.6 MB, including `index.html`, `assets` and pet
  resources.
- Rust release build generated:
  `apps/desktop/src-tauri/target/release/fjk-desktop.exe`.
- Release executable size: **20.24 MB**.
- Release executable build timestamp: **13:20:32**.
- Direct release-exe validation passed:
  - window opened normally with no white screen or crash;
  - connected to local Gateway with `Gateway` badge and `agent: idle`;
  - real streaming `chat.send` completed successfully;
  - observed runId `83a787ed`;
  - closing the window terminated the `fjk-desktop` process with no residual
    process left behind.
- During this release validation, Gateway logs showed
  `SsrFBlockedError = 0`.

#### Boundary
- `apps/desktop/src-tauri/tauri.conf.json` still has `bundle.active = false`.
- This regression validates the standalone release executable only.
- No NSIS or MSI installer was generated or validated in this task.
- Installer/bundling validation remains a separate task.

### Phase 1 — NSIS installer regression

#### Added
- Enabled Tauri NSIS bundling in `apps/desktop/src-tauri/tauri.conf.json`:
  `bundle.active = true`, `targets = ["nsis"]`, explicit 5-icon list,
  `windows.nsis.installMode = "currentUser"`.

#### Verified
- `npm run tauri build` succeeded and produced
  `target/release/bundle/nsis/FJK Agent_0.1.0_x64-setup.exe` (**13.22 MB**).
- Silent install (`/S`) exited 0; installed to `%LOCALAPPDATA%\FJK Agent`
  (`fjk-desktop.exe` 20.2 MB + `uninstall.exe`); Start Menu shortcut created.
- Installed app launched, connected to the local Gateway, and completed a real
  chat turn (runId `0c46a932`).
- Silent uninstall (`uninstall.exe /S`) exited 0; install directory and shortcut
  removed; no residual process.

#### Boundary
- The installer is unsigned; SmartScreen "unknown publisher" is expected.
- MSI packaging, code signing and auto-update are not part of this task.
## 2026-11-21 — Approval card and approval subscription

### Added
- Added `sessions.messages.subscribe` with `includeApprovals` to receive approval lifecycle events.
- Added Approval card UI with “允许” / “拒绝” actions.
- Related commits: `55d5b08`, `0675933`.

### Fixed
- `caps` must be placed at the top level of the connect payload. Placing `caps` inside `client` causes `invalid-handshake`.

### Verified
- allow path verified end-to-end: Approval card → allow → `whoami` executed successfully with `exitCode=0` in `482ms` → approval removed.
- Observed approval events: `exec.approval.requested`, `session.approval` (`pending` → `terminal`), `exec.approval.resolved`.
- Resolve method: `exec.approval.resolve { id, decision }`.
- deny path: 未验证。
