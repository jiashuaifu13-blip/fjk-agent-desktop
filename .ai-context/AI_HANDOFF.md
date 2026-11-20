# AI Handoff

## Current Phase
Phase 0

## Architecture Decision Reached

PetStateMachine.setState(...) is the verified pet integration boundary.

OpenClaw must not directly control animation assets.

A semantic adapter now exists:

AgentState
→ AgentToPetState
→ PetStateMachine

## Existing Mock AI

MockChatClient and ChatController are still present.

Do not remove them yet.

They currently provide a working standalone test route for the pet runtime.

## Next Task

Start OpenClaw investigation and determine the safest repository/runtime integration model.

Do not mix OpenClaw source directly into Deepseek-pet.
