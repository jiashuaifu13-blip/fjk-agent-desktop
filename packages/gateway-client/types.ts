/**
 * OpenClaw Gateway wire types (protocol v4).
 *
 * Codifies the event payloads captured in:
 *   .ai-context/OPENCLAW_GATEWAY_EVENT_SEMANTICS.md
 *   .ai-context/OPENCLAW_GATEWAY_AUTH_CONTRACT.md
 *   .ai-context/OPENCLAW_GATEWAY_ACTIVITY_EVENTS.md
 */

export type AgentStream =
  | 'lifecycle'
  | 'execution'
  | 'tool'
  | 'usage'
  | 'assistant'

export type LifecyclePhase =
  | 'start'
  | 'model'
  | 'waiting-approval'
  | 'approval-resolved'
  | 'end'
  | 'error'

export type ExecutionState = 'running' | 'waiting' | 'unknown'

export type WaitKind =
  | 'approval'
  | 'user_input'
  | 'agent_messages'
  | 'children'
  | 'external'

export interface AgentEvent {
  type: 'agent'
  runId: string
  sessionId?: string
  sessionKey?: string
  agentId?: string
  stream: AgentStream
  data: Record<string, unknown>
  seq: number
  ts: number
}

export interface SessionApprovalEvent {
  type: 'session.approval'
  sessionKey: string
  sourceSessionKey?: string
  phase: 'pending' | 'terminal'
  approval: { id: string; status: string }
  updatedAtMs: number
}

export interface ExecApprovalEvent {
  type: 'exec.approval.requested' | 'exec.approval.resolved'
  approvalId: string
  [key: string]: unknown
}

export interface SessionTypingEvent {
  type: 'session.typing'
  sessionKey: string
  sessionId: string
  agentId?: string
  typing: boolean
  actor: unknown
  preview?: string
  cursor?: unknown
  ts: number
}

export interface SessionMessageEvent {
  type: 'session.message'
  sessionKey: string
  agentId?: string
  message: unknown
  messageSeq?: number
  messageId?: string
  runId?: string
  sessionSnapshot?: unknown
}

export interface SessionsChangedEvent {
  type: 'sessions.changed'
  sessionKey: string
  agentId?: string
  phase: string
  ts: number
  [key: string]: unknown
}

export interface HelloOkEvent {
  type: 'hello-ok'
  protocol: 4
  server: {
    version: string
    buildId?: string
    bootId: string
    connId: string
    controlUiBuildSource?: string
  }
  features: {
    methods: string[]
    events: string[]
    capabilities: string[]
  }
}

export interface ConnectChallengeEvent {
  type: 'connect.challenge'
  nonce: string
  ts: number
  capabilities: string[]
}

export interface ShutdownEvent {
  type: 'shutdown'
}

export type GatewayEvent =
  | AgentEvent
  | SessionApprovalEvent
  | ExecApprovalEvent
  | SessionTypingEvent
  | SessionMessageEvent
  | SessionsChangedEvent
  | HelloOkEvent
  | ConnectChallengeEvent
  | ShutdownEvent
  | { type: string; [key: string]: unknown }
