import type { GatewayEventFrame, GatewayTransport } from './types'


interface ChatRequest {
  message: string
  signal?: AbortSignal
  onStart?: () => void | Promise<void>
  onToken?: (token: string) => void
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


  async send(request: ChatRequest): Promise<void> {

    const {
      message,
      signal,
      onStart,
      onToken,
    } = request


    const sessionKey =
      await this.resolveSessionKey()


    const result =
      await this.client.sendMessage(
        sessionKey,
        message
      )


    const runId =
      (result as { runId?: string } | undefined)?.runId


    if (!runId) {
      return
    }


    return new Promise<void>((resolve, reject) => {

      let started = false
      let cleaned = false


      const cleanup = () => {
        if (cleaned) return
        cleaned = true
        unsubscribe()
        signal?.removeEventListener('abort', onAbort)
      }


      const onAbort = () => {
        cleanup()
        reject(
          new DOMException(
            'The operation was aborted',
            'AbortError'
          )
        )
      }


      const unsubscribe =
        this.client.onEvent((event: GatewayEventFrame) => {

          if (
            event.type !== 'agent' ||
            event.runId !== runId
          ) {
            return
          }


          const {
            stream,
            data,
          } = event


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
              resolve()
            } else if (data?.phase === 'error') {
              cleanup()
              reject(
                new Error('agent run failed')
              )
            }
          }
        })


      signal?.addEventListener('abort', onAbort)
    })
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
