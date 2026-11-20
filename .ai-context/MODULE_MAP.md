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
| OpenClaw | TBD | Agent Core | Not integrated |
| Gateway Client | TBD | OpenClaw desktop communication | Not started |
| FJK Desktop | /apps/desktop/ | Tauri 2 + React + TS desktop shell | In progress |
| Pet runtime (migrated) | /apps/desktop/src/pet/ | Pet canvas runtime, copied from Deepseek-pet | Migrated |
| Chat runtime (migrated) | /apps/desktop/src/chat/ | ChatController + MockChatClient | Migrated |
| PetRuntime | /apps/desktop/src/runtime/ | React wrapper (usePetRuntime + context) | Added |
| DesktopTerminal | /apps/desktop/src/components/DesktopTerminal.tsx | Terminal UI, mock chat | Added |
| PetView | /apps/desktop/src/components/PetView.tsx | Pet canvas host | Added |
| Extensions | TBD | Blog / Files / Git / GitHub | Not started |
