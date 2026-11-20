# OpenClaw Agent / Session / Tool / Approval Validation

## Date
2026-11-20

## Status
PASS

---

## 1. Agent Runtime

Verified a real OpenClaw Agent turn through the local Gateway.

Provider:
DeepSeek

Model:
deepseek/deepseek-flash

---

## 2. Session Persistence

Test session:

fjk-phase0-test

The same session was reused across multiple Agent turns.

The Agent correctly recalled the prior requested phrase:

FJK_AGENT_OK

This verifies:

Gateway
→ Agent Runtime
→ Session
→ Provider
→ Model
→ Response

---

## 3. Tool Runtime

The Agent successfully invoked OpenClaw tools.

Observed tools included:

- exec
- write
- read

The earlier headless run demonstrated that file tools can execute independently of shell exec approval.

---

## 4. Exec Policy

Current policy:

security=allowlist
ask=on-miss
askFallback=deny

This policy is intentionally retained.

Do NOT change the default trusted development policy to:

security=full
ask=off

without an explicit architecture/security decision.

---

## 5. Headless Approval Behavior

A headless CLI Agent run attempted to use exec.

Because the command required approval and no interactive approval surface was attached, OpenClaw correctly blocked execution.

Observed behavior:

Headless runs cannot wait for interactive exec approval.

This confirms that approval-dependent exec operations require an attached approval-capable UI.

---

## 6. Control UI Approval

OpenClaw Control UI was connected to:

ws://127.0.0.1:18789

The Agent requested:

cmd.exe /c echo FJK_APPROVAL_OK

OpenClaw generated a command approval card.

The UI entered a visible waiting-for-approval state.

The user selected:

Allow once

The command executed successfully.

Result:

Exit code:
0

Stdout:
FJK_APPROVAL_OK

No file or project data was modified.

---

## 7. Verified Approval Chain

The following complete chain is now verified:

Agent request
↓
exec tool
↓
command policy
↓
allowlist miss
↓
approval request
↓
Control UI
↓
waiting_approval
↓
user Allow once
↓
exec execution
↓
tool result
↓
Agent completion

---

## 8. Approval Binder Security Boundary

A previous command containing shell metacharacters was rejected before approval:

cmd.exe /c "echo|set /p=FJK_APPROVAL_OK>%TEMP%\fjk-openclaw-approval-test.txt"

Observed error:

SYSTEM_RUN_DENIED:
approval cannot safely bind this command

Important:

The Approval system does not simply present every arbitrary shell command to the user.

Commands that OpenClaw cannot safely bind or preview may be rejected before an approval request is generated.

The FJK Desktop approval implementation must preserve this OpenClaw security boundary.

It must NOT bypass the binder.

---

## 9. FJK AgentState Implications

The following real runtime states can now be derived from OpenClaw events:

Agent processing
→ thinking / working

Approval requested
→ waiting_approval

Approval granted + command running
→ working

Tool result success
→ completed

Tool failure / denial
→ failed or appropriate recoverable state

These events will later feed:

OpenClaw Gateway
→ FJK AgentState
→ Desktop Terminal
→ Pet State Adapter
→ Deepseek-pet

---

## 10. Phase 0 Result

The major OpenClaw core capabilities required by FJK Agent are now proven:

- Gateway
- real model inference
- Agent Runtime
- Session persistence
- Tool calls
- exec security policy
- human approval
- approval UI
- tool completion

Next phase:

Inspect and capture Gateway event semantics for FJK Desktop integration.
