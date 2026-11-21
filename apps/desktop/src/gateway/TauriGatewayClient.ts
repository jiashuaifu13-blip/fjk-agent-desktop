import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

import { GatewayError } from './GatewayError'
import type { GatewayEventFrame, GatewayTransport } from './types'

function createIdempotencyKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // fall through
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Gateway transport backed by the Rust side.
 *
 * The WebSocket itself lives in `src-tauri/src/gateway.rs`; this class only
 * forwards RPCs (`gateway_request`) and re-emits `gateway://event` frames, so
 * the WebView never opens a socket and never sees the gateway token.
 */
export class TauriGatewayClient implements GatewayTransport {
  private listeners = new Set<(event: GatewayEventFrame) => void>()
  private unlisten: (() => void) | null = null
  private disposed = false

  /** Runs the handshake and returns the gateway `hello-ok` payload. */
  async connect(): Promise<unknown> {
    if (!this.unlisten) {
      this.unlisten = await listen<GatewayEventFrame>('gateway://event', (event) => {
        if (this.disposed) return
        for (const listener of this.listeners) {
          listener(event.payload)
        }
      })
    }

    try {
      return await invoke<unknown>('gateway_connect')
    } catch (error) {
      throw GatewayError.from(error)
    }
  }

  async send(method: string, params?: unknown): Promise<unknown> {
    try {
      return await invoke<unknown>('gateway_request', {
        method,
        params: params ?? {},
      })
    } catch (error) {
      throw GatewayError.from(error)
    }
  }

  sendMessage(sessionKey: string, content: string): Promise<unknown> {
    return this.send('chat.send', {
      sessionKey,
      message: content,
      idempotencyKey: createIdempotencyKey(),
    })
  }

  onEvent(listener: (event: GatewayEventFrame) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  async disconnect(): Promise<void> {
    this.disposed = true
    this.unlisten?.()
    this.unlisten = null
    try {
      await invoke('gateway_disconnect')
    } catch {
      // The backend is already gone; nothing else to do.
    }
  }
}
