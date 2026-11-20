import type {
  GatewayEvent,
} from './types.js'


export type AgentState =
  | 'offline'
  | 'idle'
  | 'thinking'
  | 'working'
  | 'waiting_approval'
  | 'completed'
  | 'failed'


export interface GatewayClientOptions {
  url: string
  token?: string
  role?: 'operator'
  protocol?: 4
}


export interface SessionSubscriptionOptions {
  key: string
  includeApprovals?: boolean
  initialHistory?: boolean
}


/**
 * P0-022 initial interface.
 *
 * The concrete WebSocket implementation (handshake + subscription +
 * event reducer from packages/agent-state) lands in Phase 1.
 */
export interface GatewayClient {

  readonly state: AgentState
  readonly connected: boolean


  connect(options: GatewayClientOptions): Promise<void>

  disconnect(): void


  onStateChange(listener: (state: AgentState) => void): () => void

  onEvent(listener: (event: GatewayEvent) => void): () => void


  subscribeSessions(filter?: Record<string, unknown>): Promise<unknown>

  subscribeSessionMessages(
    options: SessionSubscriptionOptions
  ): Promise<unknown>

  unsubscribeSessionMessages(key: string): void


  sendMessage(
    sessionKey: string,
    content: string
  ): Promise<unknown>

  stop(sessionKey: string): void
}
