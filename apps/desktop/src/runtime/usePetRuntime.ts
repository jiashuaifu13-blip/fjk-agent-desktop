import { useEffect, useState } from 'react'
import type { RefObject } from 'react'

import { PetDataLoader } from '../pet/PetDataLoader.js'
import { AnimationLibrary } from '../pet/AnimationLibrary.js'
import { AnimationCache } from '../pet/AnimationCache.js'
import { PetRenderer } from '../pet/PetRenderer.js'
import { PetAnimator } from '../pet/PetAnimator.js'
import { PetAudioManager } from '../pet/PetAudioManager.js'
import { PetStates } from '../pet/PetStates.js'
import { PetStateMachine } from '../pet/PetStateMachine.js'
import { PetHitTest } from '../pet/PetHitTest.js'
import { PetInteractionController } from '../pet/PetInteractionController.js'
import { ChatController } from '../chat/ChatController.js'
import { MockChatClient } from '../chat/MockChatClient.js'
import { AgentStates } from '@fjk/agent-state/AgentStates.js'
import { mapAgentStateToPetState } from '@fjk/agent-state/AgentToPetState.js'
import { createAgentStateReducer } from '@fjk/agent-state/AgentStateReducer.js'
import { GatewayChatAdapter } from '../gateway/GatewayChatAdapter'
import { TauriGatewayClient } from '../gateway/TauriGatewayClient'
import { toGatewayIssue } from '../gateway/GatewayError'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  status?: string
}

export interface ChatControllerLike {
  send(content: string): Promise<boolean>
  stop(): boolean
  clear(): void
  isGenerating: boolean
  onMessageChange: ((messages: ChatMessage[]) => void) | null
  onGeneratingChange: ((generating: boolean) => void) | null
  onBubbleChange: ((content: string) => void) | null
  onError: ((error: unknown) => void) | null
}

// Map the pet's presentation state back to the unified FJK AgentState
// vocabulary. Full event-driven mapping lands with the Gateway client (P0-021).
export type GatewayStatusState = 'connecting' | 'connected' | 'unauthorized' | 'offline' | 'mock'

export interface GatewayStatus {
  state: GatewayStatusState
  title: string
  detail: string
  hint?: string
}

export interface PetRuntime {
  chatController: ChatControllerLike | null
  petState: string
  agentState: string
  sending: boolean
  ready: boolean
  error: string | null
  mode: 'mock' | 'gateway'
  gatewayStatus: GatewayStatus
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  )
}

function pickMainSessionKey(list: unknown): string | null {
  const sessions =
    (list as { sessions?: Array<{ key?: string; isMain?: boolean }> } | null)?.sessions ?? []
  const main = sessions.find((session) => session.isMain) ?? sessions[0]
  return main?.key ?? null
}

export function usePetRuntime(
  canvasRef: RefObject<HTMLCanvasElement>,
  rootRef: RefObject<HTMLDivElement>,
): PetRuntime {
  const [chatController, setChatController] = useState<ChatControllerLike | null>(null)
  const [petState, setPetState] = useState<string>(PetStates.BOOT)
  const [agentState, setAgentState] = useState<string>(AgentStates.OFFLINE)
  const [sending, setSending] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'mock' | 'gateway'>('mock')
  const [gatewayStatus, setGatewayStatus] = useState<GatewayStatus>({
    state: 'connecting',
    title: '正在连接网关…',
    detail: '桌面端通过后端通道连接 OpenClaw Gateway。',
  })

  useEffect(() => {
    let cancelled = false
    let animator: { stop(): Promise<void> } | null = null
    let interaction: { mount(): void; destroy(): void } | null = null
    let gatewayClient: TauriGatewayClient | null = null
    let agentStore: ReturnType<typeof createAgentStateReducer> | null = null
    let unsubscribeAgentStore: (() => void) | null = null
    let unsubscribeGatewayEvent: (() => void) | null = null
    let unsubscribeConnectionState: (() => void) | null = null
    let approvalSubscriptionKey: string | null = null

    async function boot() {
      const canvas = canvasRef.current
      const root = rootRef.current
      if (!canvas || !root) return

      const loader = new PetDataLoader()
      const { actions } = await loader.load()
      if (cancelled) return

      const library = new AnimationLibrary(actions)
      const cache = new AnimationCache()
      const renderer = new PetRenderer(canvas)
      const audio = new PetAudioManager()
      // `audioManager` defaults to `null` in the plain-JS PetAnimator, which TS
      // infers as `null`; cast the options object to sidestep the inference.
      animator = new PetAnimator({ renderer, library, cache, audioManager: audio } as any)
      const stateMachine = new PetStateMachine({ animator })

      stateMachine.onStateChange = ({ to }: { to: string }) => {
        if (!cancelled) setPetState(to)
      }
      stateMachine.onStateError = (err: unknown) => {
        console.error('[FJK] pet state error:', err)
      }
      const store = createAgentStateReducer()
      agentStore = store
      unsubscribeAgentStore = store.subscribe(async (snapshot: { state: string }) => {
        if (cancelled) return
        setAgentState((current) => current === snapshot.state ? current : snapshot.state)
        const nextPetState = mapAgentStateToPetState(snapshot.state)
        if (nextPetState === stateMachine.currentState) return
        try { await stateMachine.setState(nextPetState, { reason: `agent:${snapshot.state}` }) } catch (err) { console.error('[FJK] agent-to-pet state error:', err) }
      })

      let client: {
        send(req: {
          message: string
          signal?: AbortSignal
          onStart?: () => void | Promise<void>
          onToken?: (token: string) => void
        }): Promise<unknown>
      } = new MockChatClient()

      if (isTauriRuntime()) {
        const gateway = new TauriGatewayClient()
        gatewayClient = gateway
        unsubscribeGatewayEvent = gateway.onEvent((event) => store.dispatch({ type: 'gateway/event', event }))
        unsubscribeConnectionState = gateway.onConnectionState((payload) => store.dispatch({ type: 'connection/state', state: payload.state }))

        try {
          await gateway.connect()

          // A successful handshake does not imply usable permissions: the
          // gateway can keep the socket but grant zero operator scopes. Probe
          // one cheap read so the UI can surface that state up front.
          let sessionKey: string | null = null
          try {
            const list = await gateway.send('sessions.list', {})
            sessionKey = pickMainSessionKey(list)
            if (!cancelled) {
              setMode('gateway')
              setGatewayStatus({
                state: 'connected',
                title: '网关已连接',
                detail: '已通过后端通道连接 OpenClaw Gateway。',
              })
            }
          } catch (probeError) {
            const issue = toGatewayIssue(probeError)
            console.warn('[FJK] gateway permission probe failed:', issue.kind, issue.detail)
            if (!cancelled) {
              setMode('gateway')
              setGatewayStatus({
                // Only a permission problem blocks sending; anything else is a
                // transient failure that the next request may still recover from.
                state:
                  issue.kind === 'unauthorized' || issue.kind === 'not_paired'
                    ? 'unauthorized'
                    : 'offline',
                title: issue.title,
                detail: issue.detail,
                hint: issue.hint,
              })
            }
          }

          client = new GatewayChatAdapter(gateway, sessionKey)

          // Register this connection as an approval subscriber for the current
          // session so `session.approval` events are actually delivered here.
          // Failure is non-fatal: chat still works without approval delivery.
          if (sessionKey) {
            try {
              await gateway.send('sessions.messages.subscribe', {
                key: sessionKey,
                includeApprovals: true,
              })
              approvalSubscriptionKey = sessionKey
            } catch (subscribeError) {
              console.warn('[FJK] approval subscription failed:', subscribeError)
            }
          }
        } catch (connectError) {
          const issue = toGatewayIssue(connectError)
          console.warn('[FJK] gateway connect failed, falling back to mock:', issue.kind, issue.detail)
          await gateway.disconnect()
          gatewayClient = null
          client = new MockChatClient()
          if (!cancelled) {
            setMode('mock')
            setGatewayStatus({
              state: 'offline',
              title: issue.title,
              detail: issue.detail,
              hint: issue.hint,
            })
          }
        }
      } else if (!cancelled) {
        store.dispatch({ type: 'connection/state', state: 'connected' })
        setMode('mock')
        setGatewayStatus({
          state: 'mock',
          title: 'Mock 模式',
          detail: '未检测到 Tauri 运行时，使用本地模拟对话。',
        })
      }

      const controller = new ChatController({ client, dispatchAgentAction: (action: unknown) => store.dispatch(action) }) as ChatControllerLike

      controller.onGeneratingChange = (generating: boolean) => {
        if (!cancelled) setSending(generating)
      }

      controller.onError = (err: unknown) => {
        console.error('[FJK] chat error:', err)
      }

      const hitTest = new PetHitTest({ canvas, alphaThreshold: 25 })
      interaction = new PetInteractionController({
        root,
        canvas,
        stateMachine,
        hitTest,
        dragThreshold: 6,
      })
      interaction.mount()

      await stateMachine.setState(PetStates.IDLE, { reason: 'application-ready' })

      if (!cancelled) {
        setChatController(controller)
        setReady(true)
      }
    }

    boot().catch((err: unknown) => {
      console.error('[FJK] pet boot failed:', err)
      if (!cancelled) {
        setError(err instanceof Error ? err.message : String(err))
      }
    })

    return () => {
      cancelled = true
      if (approvalSubscriptionKey && gatewayClient) {
        void gatewayClient
          .send('sessions.messages.unsubscribe', { key: approvalSubscriptionKey })
          .catch(() => undefined)
      }
      unsubscribeGatewayEvent?.()
      unsubscribeConnectionState?.()
      unsubscribeAgentStore?.()
      agentStore?.dispose()
      interaction?.destroy()
      void animator?.stop()
      void gatewayClient?.disconnect()
    }
  }, [canvasRef, rootRef])

  return { chatController, petState, agentState, sending, ready, error, mode, gatewayStatus }
}
