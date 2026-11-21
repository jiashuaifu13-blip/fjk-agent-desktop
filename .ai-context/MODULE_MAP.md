# Module Map

| Module | Location | Responsibility | Status |
|---|---|---|---|
| Project Guide | /FJK_AGENT_PROJECT_GUIDE.md | Long-term project guidance | Existing |
| AI Context | /.ai-context/ | Project state and AI handoff | Existing |
| Deepseek-pet | /Deepseek-pet/ | Existing pet runtime and assets | Existing |
| PetStateMachine | /Deepseek-pet/frontend/src/pet/PetStateMachine.js | Pet presentation state transitions | Existing |
| PetAnimator | /Deepseek-pet/frontend/src/pet/PetAnimator.js | Animation playback | Existing |
| PetRenderer | /Deepseek-pet/frontend/src/pet/PetRenderer.js | Canvas rendering | Existing |
| ChatController | /Deepseek-pet/frontend/src/chat/ChatController.js | Current pet chat orchestration | Existing / temporary |
| MockChatClient | /Deepseek-pet/frontend/src/chat/MockChatClient.js | Current mock AI transport | Existing / temporary |
| AgentStates | /packages/agent-state/AgentStates.js | Unified FJK execution state definitions | Added |
| AgentToPetState | /packages/agent-state/AgentToPetState.js | FJK AgentState → existing PetState adapter | Added |
| GatewayEventToAgentState | /packages/agent-state/GatewayEventToAgentState.js | Gateway event → AgentState mapping | Added |
| OpenClaw | TBD | Agent Core | Not integrated |
| Gateway Client | /packages/gateway-client/ | FJK Gateway Client interface (types) | Interface defined |
| FJK Desktop | /apps/desktop/ | Tauri 2 + React + TS desktop shell | In progress |
| Pet runtime (migrated) | /apps/desktop/src/pet/ | Pet canvas runtime, copied from Deepseek-pet | Migrated |
| Chat runtime (migrated) | /apps/desktop/src/chat/ | ChatController + MockChatClient | Migrated |
| Gateway transport (Rust) | /apps/desktop/src-tauri/src/gateway.rs | Protocol v4 WS client: handshake, RPC correlation, event pump; Tauri commands `gateway_info` / `gateway_connect` / `gateway_request` / `gateway_disconnect` | Added / verified |
| TauriGatewayClient | /apps/desktop/src/gateway/TauriGatewayClient.ts | Frontend transport over the Rust bridge (`gateway://event`) | Added / verified |
| GatewayChatAdapter | /apps/desktop/src/gateway/GatewayChatAdapter.ts | Gateway streaming → `ChatController` transport shape | Updated |
| GatewayError | /apps/desktop/src/gateway/GatewayError.ts | Gateway error → unauthorized / not_paired / offline / ... vocabulary | Added / verified |
| Gateway types | /apps/desktop/src/gateway/types.ts | `GatewayTransport` / `GatewayEventFrame` | Added |
| PetRuntime | /apps/desktop/src/runtime/ | React wrapper (usePetRuntime + context), gateway status | Added |
| DesktopTerminal | /apps/desktop/src/components/DesktopTerminal.tsx | Terminal UI, real gateway chat, status banner | Updated |
| PetView | /apps/desktop/src/components/PetView.tsx | Pet canvas host | Added |
| Extensions | TBD | Blog / Files / Git / GitHub | Not started |
