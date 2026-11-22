import type { GatewayEventFrame, GatewayTransport } from './types'


interface ChatRequest {
  message: string
  signal?: AbortSignal
  onStart?: () => void | Promise<void>
  onToken?: (token: string) => void
  onStage?: (stage: string) => void
}


/**
 * Adapts the OpenClaw GatewayClient into the streaming transport shape
 * that ChatController expects: send({ message, signal, onStart, onToken }).
 *
 * The adapter resolves the main session key lazily, sends via `chat.send`,
 * and streams `agent` (stream=assistant) deltas until lifecycle end/error.
 */
export class GatewayChatAdapter {

  private sessionKey: string | null = null


  constructor(
    private client: GatewayTransport,
    initialSessionKey: string | null = null,
  ) {
    this.sessionKey = initialSessionKey
  }

  setSessionKey(sessionKey: string): void {
    const next = sessionKey.trim()

    if (!next) {
      throw new Error('session key is required')
    }

    this.sessionKey = next
  }


  async send(request: ChatRequest): Promise<void> {

    const {
      message,
      signal,
      onStart,
      onToken,
      onStage,
    } = request


    const sessionKey =
      await this.resolveSessionKey()


    let runId: string | null = null
    let started = false
    let cleaned = false

    const bufferedEvents: GatewayEventFrame[] = []


    let resolveRun: () => void = () => undefined
    let rejectRun: (reason?: unknown) => void = () => undefined

    const finished =
      new Promise<void>((resolve, reject) => {
        resolveRun = resolve
        rejectRun = reject
      })


    let unsubscribe: () => void = () => undefined


    const cleanup = () => {
      if (cleaned) return
      cleaned = true
      unsubscribe()
      signal?.removeEventListener('abort', onAbort)
    }


    const onAbort = () => {
      cleanup()
      rejectRun(
        new DOMException(
          'The operation was aborted',
          'AbortError'
        )
      )
    }


    const processEvent = (
      event: GatewayEventFrame
    ) => {

      if (
        cleaned ||
        event.type !== 'agent' ||
        (
          typeof event.sessionKey === 'string' &&
          event.sessionKey !== sessionKey
        ) ||
        event.runId !== runId
      ) {
        return
      }


      const {
        stream,
        data,
      } = event


      if (stream === 'lifecycle') {
        const phase = (data as { phase?: string } | undefined)?.phase

        if (phase === 'start') {
          onStage?.('已发送，等待模型…')
        }

        if (phase === 'model') {
          onStage?.('模型处理中…')
        }
      }

      if (stream === 'execution') {
        const state = (data as { state?: string } | undefined)?.state

        if (state === 'running') {
          onStage?.('生成中…')
        }
      }

      if (stream === 'assistant') {

        if (!started) {
          started = true
          void onStart?.()
        }

        const delta =
          data?.delta ?? data?.text ?? ''

        if (delta) {
          onToken?.(delta)
        }

        return
      }


      if (stream === 'lifecycle') {

        if (data?.phase === 'end') {
          cleanup()
          resolveRun()
        } else if (data?.phase === 'error') {
          cleanup()
          rejectRun(
            new Error('agent run failed')
          )
        }
      }
    }


    unsubscribe =
      this.client.onEvent((event: GatewayEventFrame) => {

        if (
          event.type !== 'agent' ||
          (
            typeof event.sessionKey === 'string' &&
            event.sessionKey !== sessionKey
          )
        ) {
          return
        }

        if (!runId) {
          bufferedEvents.push(event)
          return
        }

        processEvent(event)
      })


    signal?.addEventListener('abort', onAbort)

    if (signal?.aborted) {
      onAbort()
    }


    try {
      const result =
        await this.client.sendMessage(
          sessionKey,
          message
        )

      runId =
        (result as { runId?: string } | undefined)?.runId ??
        null

      if (!runId) {
        cleanup()
        return
      }


      for (const event of bufferedEvents.splice(0)) {
        processEvent(event)

        if (cleaned) {
          break
        }
      }


      await finished
    } catch (error) {
      cleanup()
      throw error
    }
  }


  private async resolveSessionKey(): Promise<string> {

    if (this.sessionKey) {
      return this.sessionKey
    }


    const list =
      await this.client.send(
        'sessions.list',
        {}
      )


    const sessions =
      (list as {
        sessions?: Array<{
          key?: string
          isMain?: boolean
        }>
      })?.sessions ?? []


    const main =
      sessions.find((s) => s.isMain) ?? sessions[0]


    const key = main?.key


    if (!key) {
      throw new Error('no session available')
    }


    this.sessionKey = key

    return key
  }
}