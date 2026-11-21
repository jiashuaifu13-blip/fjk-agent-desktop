# Tasks

## DOING

- Phase 1：Terminal 从 Mock 切换到真实 Gateway（已完成连接与授权链路，待补 Settings / Connection State / Log Viewer）。

## TODO

- Gateway Client 事件 → AgentState 的真实驱动（P0-021 的映射目前只用于连接状态）。
- Settings / Connection State / Log Viewer。
- Approval UI。
- 设备配对（device identity）作为浏览器端接入的可选路径。

## BLOCKED

None.

## DONE

### P1-001
Gateway transport moved to Rust (`src-tauri/src/gateway.rs`), removing the
WebView `Origin` header that made OpenClaw clear operator scopes. Tauri commands:
`gateway_info` / `gateway_connect` / `gateway_request` / `gateway_disconnect`;
token stays in the backend. Verified with a real chat round-trip.

### P1-002
Gateway error mapping (`src/gateway/GatewayError.ts`) + UI: unauthorized /
not-paired / origin-rejected / offline / timeout / config states, banner, mode
badge and structured chat error block. Assertions pass.


### P0-001
Project guide established.

### P0-002
AI context system established.

### P0-003
Local Git baseline established.

### P0-004
Deepseek-pet imported.

### P0-005
Deepseek-pet architecture audited.

### P0-006
Pet runtime integration boundary identified.

### P0-007
FJK AgentState adapter created and tested.

### P0-008
OpenClaw installed.

### P0-009
Windows Gateway validated.

### P0-010
DeepSeek Provider configured.

### P0-011
Real model inference validated.

### P0-012
Gateway model transport validated.

### P0-013
Agent Runtime validated.

### P0-014
Session persistence validated.

### P0-015
Tool + interactive Approval complete chain validated.

### P0-016
Real Gateway event semantics inspected (OPENCLAW_GATEWAY_EVENT_SEMANTICS.md).

### P0-017
Gateway authentication and connection contract identified (OPENCLAW_GATEWAY_AUTH_CONTRACT.md).

### P0-018
Agent turn events identified (OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md).

### P0-019
Tool execution events identified (OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md).

### P0-020
Approval request / resolution events identified (OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md).

### P0-021
Gateway Event → FJK AgentState mapping defined (OPENCLAW_EVENT_TO_AGENTSTATE_MAPPING.md + packages/agent-state/GatewayEventToAgentState.js).

### P0-022
FJK Gateway Client interface defined (OPENCLAW_GATEWAY_CLIENT_INTERFACE.md + packages/gateway-client).

### P0-023
Phase 0 technical selection report produced (OPENCLAW_TECH_SELECTION.md).
