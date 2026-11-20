# FJK AgentState Architecture

## Purpose

FJK Agent requires one shared runtime state model.

Both:

- Desktop Terminal
- AI Pet

must consume the same normalized AgentState.

The pet must never independently infer the real Agent execution state.

---

# 1. Verified Deepseek-pet Runtime

The current Deepseek-pet startup flow is:

PetDataLoader
↓
AnimationLibrary
↓
AnimationCache
↓
PetRenderer
↓
PetAudioManager
↓
PetAnimator
↓
PetStateMachine

The actual pet state entry API is:

PetStateMachine.setState(...)

This is the selected integration boundary.

---

# 2. Existing Pet States

Current Deepseek-pet states are:

- BOOT
- IDLE
- THINKING
- SPEAKING
- WALKING
- INTERACT
- DRAGGING
- ERROR

These are presentation/runtime states.

They are NOT identical to Agent execution states.

---

# 3. FJK Agent States

FJK defines:

- offline
- idle
- thinking
- working
- waiting_approval
- completed
- failed

These describe Agent execution.

---

# 4. Adapter Boundary

Correct architecture:

OpenClaw Event
↓
FJK AgentState
↓
AgentToPetState Adapter
↓
PetStateMachine.setState(...)
↓
PetAnimator
↓
PetRenderer

Incorrect architecture:

OpenClaw
↓
specific animation filename

The Agent must never know about spritesheet filenames.

---

# 5. Current Temporary Mapping

| AgentState | PetState |
|---|---|
| offline | ERROR |
| idle | IDLE |
| thinking | THINKING |
| working | SPEAKING |
| waiting_approval | IDLE |
| completed | INTERACT |
| failed | ERROR |

These mappings are temporary where dedicated pet states or animation resources do not yet exist.

They may be refined later without changing OpenClaw integration.

---

# 6. Chat Boundary

Current Deepseek-pet contains:

MockChatClient
+
ChatController

This is currently a standalone test/chat implementation.

It is NOT the final FJK Agent architecture.

Future production flow:

Desktop/Pet Input
↓
FJK Gateway Client
↓
OpenClaw Gateway
↓
Agent
↓
Streaming Events
↓
FJK AgentState
↓
Terminal + Pet

MockChatClient should remain available temporarily for pet-runtime testing until OpenClaw integration is verified.

Do not delete it yet.

---

# 7. Important Constraint

Do not modify:

- PetRenderer
- PetAnimator
- PetStateMachine

just to support OpenClaw.

The adapter layer must absorb the semantic difference between Agent execution states and pet presentation states.
