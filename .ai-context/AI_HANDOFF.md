# AI Handoff

## Current Stage
Phase 0

## Major Milestone

OpenClaw has now been proven capable of serving as the FJK Agent Core.

Verified:

- Gateway
- DeepSeek model
- Agent
- Session
- Tools
- exec policy
- interactive approval
- tool result

## Approval Finding

Working chain:

Agent
→ exec
→ approval request
→ Control UI
→ Allow once
→ command
→ result

Complex shell commands may be rejected by OpenClaw's approval binder before an approval UI is produced.

Do not bypass this behavior.

## Current Architecture

OpenClaw
= Agent Core

FJK AgentState
= semantic shared state layer

Deepseek-pet
= pet runtime / presentation layer

Future FJK Desktop
= Gateway client + terminal + approval UI

## Next Task

Inspect real Gateway events.

The goal is to determine exactly which Gateway events should drive:

- idle
- thinking
- working
- waiting_approval
- completed
- failed

Do not begin large Desktop UI development before this event contract is known.
