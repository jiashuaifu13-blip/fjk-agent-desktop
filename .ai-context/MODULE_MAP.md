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
| CommandPolicy | /apps/desktop/src/policy/CommandPolicy.ts | exec 审批分级（allow/deny/ask、受保护路径、strict/tiered） | Added / verified |
| Exec policy (Rust) | /apps/desktop/src-tauri/src/exec_policy.rs | 读取/切换 `tools.exec.mode`（deny/allowlist/ask/auto/full） | Added |
| Approval pipeline | /apps/desktop/src/runtime/usePetRuntime.ts | `session.approval` → 分级 → 卡片 / 自动 resolve / 提醒 | Added / verified |
| Permission Plan (docs) | /.ai-context/PERMISSION_SYSTEM_PLAN.md | 权限系统差距分析与分期计划（仅第一阶段排期） | Added |
| Audit log | TBD（P1-020） | 审批/执行审计 JSONL（`approvals.jsonl`，脱敏 + 轮转） | Planned / phase 1 |
| Risk Engine | TBD（P1-024） | L0–L4 风险判定与原因 | Planned / deferred |
| Scope Manager | TBD（P1-025/27） | Global / Agent / Project / Task 范围校验 | Planned / deferred |
| Grant Manager | TBD（P1-026） | 临时授权范围、有效期、撤销 | Planned / deferred |
| Pet approval card | TBD（P1-028） | 桌宠紧凑审批卡（与终端共享 approvalId） | Planned / deferred |
| Security Center | TBD（P1-029） | 审计查询 / 筛选 / 导出 | Planned / deferred |
| Extensions | TBD | Blog / Files / Git / GitHub | Not started |
