/** Event / transport shapes shared by the Tauri gateway bridge and the adapter. */

export interface GatewayEventFrame {
  type: string
  runId?: string
  stream?: string
  data?: {
    phase?: string
    delta?: string
    text?: string
    isError?: boolean
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface GatewayTransport {
  connect?(): Promise<unknown>
  send(method: string, params?: unknown): Promise<unknown>
  sendMessage(sessionKey: string, content: string): Promise<unknown>
  onEvent(listener: (event: GatewayEventFrame) => void): () => void
  disconnect?(): void | Promise<void>
}
