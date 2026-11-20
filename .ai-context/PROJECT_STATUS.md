# Project Status

## Current Phase
Phase 0 - OpenClaw technical validation

## Deepseek-pet

Verified:

- Existing pet runtime imported
- Runtime architecture audited
- PetStateMachine integration boundary identified
- FJK AgentState layer created
- AgentState → PetState adapter tested

## OpenClaw

Verified:

- OpenClaw 2026.11.6 installed
- Windows local Gateway
- Loopback bind: 127.0.0.1:18789
- Gateway RPC
- DeepSeek Provider
- deepseek/deepseek-flash
- CLI model inference
- Gateway model inference
- Windows system CA requirement
- Agent Runtime
- persistent Session
- Tool calls
- exec policy
- Control UI authentication
- interactive command approval
- Allow-once execution
- tool completion

## Security

Current exec policy:

allowlist
+
ask on miss
+
fallback deny

This policy remains the current project baseline.

Complex commands that cannot be safely bound by OpenClaw may be rejected before approval.

FJK Desktop must preserve this behavior.

## Git Strategy

Local Git commits required.

GitHub remote synchronization remains deferred.

## Next

Inspect real Gateway event semantics and determine the FJK Desktop Gateway Client contract.

Target architecture:

OpenClaw Gateway
→ Gateway Client
→ FJK AgentState Store
→ Desktop Terminal
→ Pet State Adapter
→ Deepseek-pet
