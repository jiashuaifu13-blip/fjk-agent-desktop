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
| FJK Desktop | TBD | Windows management terminal and host | Not started |
| Extensions | TBD | Blog / Files / Git / GitHub | Not started |
