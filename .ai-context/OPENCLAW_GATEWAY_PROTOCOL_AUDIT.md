# OpenClaw Gateway Protocol Audit

## Installed Version

OpenClaw 2026.11.6

## Gateway Protocol

Verified client protocol:

minProtocol = 4
maxProtocol = 4

FJK Desktop Gateway Client must therefore target protocol v4 for the currently validated OpenClaw version.

## Verified Event / RPC Symbols

Real symbol counts from the installed OpenClaw dist package:

- hello-ok: 8
- agent: 72455
- chat: 9061
- session.message: 51
- session.operation: 5
- session.tool: 25
- session.approval: 4
- sessions.changed: 50
- exec.approval.requested: 7
- exec.approval.resolved: 4
- sessions.subscribe: 28
- sessions.messages.subscribe: 17
- sessions.messages.unsubscribe: 9
- shutdown: 844

## Important Integration Events

FJK Desktop must investigate and consume at minimum:

- hello-ok
- session.message
- session.operation
- session.tool
- session.approval
- sessions.changed
- exec.approval.requested
- exec.approval.resolved

## Session Subscription

Verified available:

- sessions.subscribe
- sessions.messages.subscribe
- sessions.messages.unsubscribe

## Architecture Rule

FJK Desktop must communicate through the OpenClaw Gateway public protocol.

It must not read or mutate OpenClaw internal databases or runtime state files directly.

The exact event → FJK AgentState mapping will be finalized after runtime event capture.

## Current Status

PASS

Static protocol inspection is complete.

Runtime event semantics have been captured and documented in
OPENCLAW_GATEWAY_EVENT_SEMANTICS.md (P0-016).

Next:
P0-021 — define Gateway Event → FJK AgentState mapping.
