import { useEffect, useRef, useState } from 'react'
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
  replaceMessages(messages: ChatMessage[]): void
  isGenerating: boolean
  onMessageChange: ((messages: ChatMessage[]) => void) | null
  onGeneratingChange: ((generating: boolean) => void) | null
  onBubbleChange: ((content: string) => void) | null
  onError: ((error: unknown) => void) | null
}

// Map the pet's presentation state back to the unified FJK AgentState
// vocabulary. Full event-driven mapping lands with the Gateway client (P0-021).
export type GatewayStatusState =
  | 'connecting'
  | 'connected'
  | 'unauthorized'
  | 'offline'
  | 'mock'

export interface GatewayStatus {
  state: GatewayStatusState
  title: string
  detail: string
  hint?: string
}

export type RuntimeLogLevel = 'info' | 'warn' | 'error'

export interface RuntimeLogEntry {
  id: number
  timestamp: number
  level: RuntimeLogLevel
  source: 'runtime' | 'gateway' | 'chat'
  message: string
  detail?: string
}

export interface ExecApproval {
  id: string
  commandText: string
  expiresAtMs?: number
}

export interface SettingsOverview {
  model: string | null
  toolCount: number | null
  toolProfile: string | null
  toolsEnabled: boolean | null
  executionMode: string | null
  sessionKey: string | null
  sessionCount: number | null
}

export interface SessionListItem {
  key: string
  sessionId: string | null
  isMain: boolean
  updatedAt: number | null
}

export interface SessionListItem {
  key: string
  sessionId: string | null
  isMain: boolean
  updatedAt: number | null
}

export interface PetRuntime {
  approval: ExecApproval | null
  resolveApproval(decision: 'allow-once' | 'deny'): Promise<void>

  chatController: ChatControllerLike | null
  petState: string
  agentState: string
  sending: boolean
  ready: boolean
  error: string | null
  mode: 'mock' | 'gateway'
  gatewayStatus: GatewayStatus

  runtimeLogs: RuntimeLogEntry[]
  clearRuntimeLogs(): void

  settingsOverview: SettingsOverview
  previousModel: string | null
  updateSessionModel(model: string): Promise<void>
  rollbackSessionModel(): Promise<void>
  sessionList: SessionListItem[]
  createSession(): Promise<string>
  deleteSession(
    sessionKey: string,
    expectedSessionId: string,
  ): Promise<void>
  switchSession(sessionKey: string): Promise<void>
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== 'undefined' &&
    Boolean(
      (
        window as unknown as {
          __TAURI_INTERNALS__?: unknown
        }
      ).__TAURI_INTERNALS__,
    )
  )
}

type GatewaySessionSummary = {
  key?: string
  sessionId?: string
  isMain?: boolean
  updatedAt?: number
  model?: string
  modelName?: string
  toolCount?: number
  tools?: unknown[]
  toolProfile?: string
  toolsEnabled?: boolean
  executionMode?: string
  metadata?: {
    model?: string
    modelName?: string
    toolCount?: number
    tools?: unknown[]
    toolProfile?: string
    toolsEnabled?: boolean
    executionMode?: string
  }
}

function getGatewaySessions(
  list: unknown,
): GatewaySessionSummary[] {
  const sessions =
    (
      list as {
        sessions?: GatewaySessionSummary[]
      } | null
    )?.sessions

  return Array.isArray(sessions)
    ? sessions
    : []
}

function pickMainSession(
  list: unknown,
): GatewaySessionSummary | null {
  const sessions = getGatewaySessions(list)

  return (
    sessions.find(
      (session) => session.isMain,
    ) ??
    sessions[0] ??
    null
  )
}

function pickMainSessionKey(
  list: unknown,
): string | null {
  return pickMainSession(list)?.key ?? null
}

function readSettingsOverview(
  list: unknown,
): SettingsOverview {
  const sessions = getGatewaySessions(list)
  const main = pickMainSession(list)

  const model =
    main?.model ??
    main?.modelName ??
    main?.metadata?.model ??
    main?.metadata?.modelName ??
    null

  const directToolCount =
    typeof main?.toolCount === 'number'
      ? main.toolCount
      : null

  const metadataToolCount =
    typeof main?.metadata?.toolCount === 'number'
      ? main.metadata.toolCount
      : null

  const toolCount =
    directToolCount ??
    (
      Array.isArray(main?.tools)
        ? main.tools.length
        : null
    ) ??
    metadataToolCount ??
    (
      Array.isArray(main?.metadata?.tools)
        ? main.metadata.tools.length
        : null
    )

  const toolProfile =
    main?.toolProfile ??
    main?.metadata?.toolProfile ??
    null

  const toolsEnabled =
    typeof main?.toolsEnabled === 'boolean'
      ? main.toolsEnabled
      : typeof main?.metadata?.toolsEnabled === 'boolean'
        ? main.metadata.toolsEnabled
        : null

  const executionMode =
    main?.executionMode ??
    main?.metadata?.executionMode ??
    null

  return {
    model:
      typeof model === 'string' &&
      model.trim().length > 0
        ? model
        : null,

    toolCount,

    toolProfile:
      typeof toolProfile === 'string' &&
      toolProfile.trim().length > 0
        ? toolProfile
        : null,

    toolsEnabled,

    executionMode:
      typeof executionMode === 'string' &&
      executionMode.trim().length > 0
        ? executionMode
        : null,

    sessionKey:
      main?.key ?? null,

    sessionCount:
      sessions.length,
  }
}

function readSessionList(
  list: unknown,
): SessionListItem[] {
  return getGatewaySessions(list)
    .map((session) => ({
      key:
        typeof session?.key === 'string'
          ? session.key
          : '',
      sessionId:
        typeof session?.sessionId === 'string' &&
        session.sessionId.length > 0
          ? session.sessionId
          : null,
      isMain: session?.isMain === true,
      updatedAt:
        typeof session?.updatedAt === 'number'
          ? session.updatedAt
          : null,
    }))
    .filter((item) => item.key.length > 0)
}

function readChatHistoryMessages(
  history: unknown,
): ChatMessage[] {
  const rawMessages =
    (
      history as {
        messages?: unknown[]
      } | null
    )?.messages

  if (!Array.isArray(rawMessages)) {
    return []
  }

  return rawMessages.flatMap(
    (rawMessage, index): ChatMessage[] => {
      if (
        !rawMessage ||
        typeof rawMessage !== 'object'
      ) {
        return []
      }

      const message =
        rawMessage as {
          id?: unknown
          role?: unknown
          content?: unknown
          text?: unknown
        }

      if (
        message.role !== 'user' &&
        message.role !== 'assistant'
      ) {
        return []
      }

      let content = ''

      if (Array.isArray(message.content)) {
        content = message.content
          .map((part) => {
            if (
              !part ||
              typeof part !== 'object'
            ) {
              return ''
            }

            const block =
              part as {
                type?: unknown
                text?: unknown
              }

            if (
              block.type !== 'text' ||
              typeof block.text !== 'string'
            ) {
              return ''
            }

            return block.text
          })
          .filter((text) => text.length > 0)
          .join('\n')
      } else if (
        typeof message.content === 'string'
      ) {
        content = message.content
      } else if (
        typeof message.text === 'string'
      ) {
        content = message.text
      }

      if (!content) {
        return []
      }

      return [
        {
          id:
            typeof message.id === 'string' &&
            message.id.length > 0
              ? message.id
              : `history-${index}`,
          role: message.role,
          content,
          status: 'done',
        },
      ]
    },
  )
}

export function usePetRuntime(
  canvasRef: RefObject<HTMLCanvasElement>,
  rootRef: RefObject<HTMLDivElement>,
): PetRuntime {
  const gatewayClientRef =
    useRef<TauriGatewayClient | null>(null)

  const gatewayChatAdapterRef =
    useRef<GatewayChatAdapter | null>(null)

  const activeSessionKeyRef =
    useRef<string | null>(null)

  const reconnectEnabledRef = useRef(false)
  const reconnectRunningRef = useRef(false)
  const reconnectTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null)

  const [approval, setApproval] =
    useState<ExecApproval | null>(null)

  const [chatController, setChatController] =
    useState<ChatControllerLike | null>(null)

  const [petState, setPetState] =
    useState<string>(PetStates.BOOT)

  const [agentState, setAgentState] =
    useState<string>(AgentStates.OFFLINE)

  const [sending, setSending] = useState(false)
  const [ready, setReady] = useState(false)

  const [error, setError] =
    useState<string | null>(null)

  const [mode, setMode] =
    useState<'mock' | 'gateway'>('mock')

  const [gatewayStatus, setGatewayStatus] =
    useState<GatewayStatus>({
      state: 'connecting',
      title: '正在连接网关…',
      detail:
        '桌面端通过后端通道连接 OpenClaw Gateway。',
    })

  const [runtimeLogs, setRuntimeLogs] =
    useState<RuntimeLogEntry[]>([])

  const [
    settingsOverview,
    setSettingsOverview,
  ] = useState<SettingsOverview>({
    model: null,
    toolCount: null,
    sessionKey: null,
    sessionCount: null,
    toolProfile: null,
    toolsEnabled: null,
    executionMode: null,
  })

  const [previousModel, setPreviousModel] =
    useState<string | null>(null)

  const [sessionList, setSessionList] =
    useState<SessionListItem[]>([])

  const runtimeLogIdRef = useRef(0)

  const appendRuntimeLog = (
    level: RuntimeLogLevel,
    source: RuntimeLogEntry['source'],
    message: string,
    detail?: string,
  ) => {
    runtimeLogIdRef.current += 1

    const entry: RuntimeLogEntry = {
      id: runtimeLogIdRef.current,
      timestamp: Date.now(),
      level,
      source,
      message,
      detail,
    }

    setRuntimeLogs((current) => {
      const next = [...current, entry]

      // Keep only the latest 200 entries so the
      // in-memory viewer does not grow without bound.
      return next.length > 200
        ? next.slice(next.length - 200)
        : next
    })
  }

  const clearRuntimeLogs = () => {
    setRuntimeLogs([])
  }

  useEffect(() => {
    let cancelled = false

    let animator: {
      stop(): Promise<void>
    } | null = null

    let interaction: {
      mount(): void
      destroy(): void
    } | null = null

    let gatewayClient:
      | TauriGatewayClient
      | null = null

    let agentStore:
      | ReturnType<typeof createAgentStateReducer>
      | null = null

    let unsubscribeAgentStore:
      | (() => void)
      | null = null

    let unsubscribeGatewayEvent:
      | (() => void)
      | null = null

    let unsubscribeConnectionState:
      | (() => void)
      | null = null

    let approvalSubscriptionKey:
      | string
      | null = null

    async function boot() {
      appendRuntimeLog(
        'info',
        'runtime',
        'FJK Desktop runtime starting',
      )

      const canvas = canvasRef.current
      const root = rootRef.current

      if (!canvas || !root) {
        return
      }

      const loader = new PetDataLoader()

      const { actions } =
        await loader.load()

      if (cancelled) {
        return
      }

      const library =
        new AnimationLibrary(actions)

      const cache =
        new AnimationCache()

      const renderer =
        new PetRenderer(canvas)

      const audio =
        new PetAudioManager()

      // `audioManager` defaults to `null` in the plain-JS
      // PetAnimator, which TS infers as `null`; cast the
      // options object to sidestep the inference.
      animator = new PetAnimator({
        renderer,
        library,
        cache,
        audioManager: audio,
      } as any)

      const stateMachine =
        new PetStateMachine({
          animator,
        })

      stateMachine.onStateChange = ({
        to,
      }: {
        to: string
      }) => {
        if (!cancelled) {
          setPetState(to)
        }
      }

      stateMachine.onStateError = (
        err: unknown,
      ) => {
        console.error(
          '[FJK] pet state error:',
          err,
        )
      }

      const store =
        createAgentStateReducer()

      agentStore = store

      unsubscribeAgentStore =
        store.subscribe(
          async (snapshot: {
            state: string
          }) => {
            if (cancelled) {
              return
            }

            setAgentState((current) =>
              current === snapshot.state
                ? current
                : snapshot.state,
            )

            const nextPetState =
              mapAgentStateToPetState(
                snapshot.state,
              )

            if (
              nextPetState ===
              stateMachine.currentState
            ) {
              return
            }

            try {
              await stateMachine.setState(
                nextPetState,
                {
                  reason:
                    `agent:${snapshot.state}`,
                },
              )
            } catch (err) {
              console.error(
                '[FJK] agent-to-pet state error:',
                err,
              )
            }
          },
        )

      let client: {
        send(req: {
          message: string
          signal?: AbortSignal
          onStart?:
            () => void | Promise<void>
          onToken?:
            (token: string) => void
        }): Promise<unknown>
      } = new MockChatClient()

      if (isTauriRuntime()) {
        appendRuntimeLog(
          'info',
          'runtime',
          'Tauri runtime detected',
        )

        const gateway =
          new TauriGatewayClient()

        gatewayClient = gateway
        gatewayClientRef.current =
          gateway

        unsubscribeGatewayEvent =
          gateway.onEvent((event) => {
            store.dispatch({
              type: 'gateway/event',
              event,
            })

            if (
              event.type !==
              'session.approval'
            ) {
              return
            }

            const a =
              event.approval as
                | {
                    id?: string
                    presentation?: {
                      kind?: string
                      commandText?: string
                      expiresAtMs?: number
                    }
                  }
                | undefined

            if (
              event.phase ===
                'pending' &&
              a?.id &&
              a.presentation?.kind ===
                'exec'
            ) {
              setApproval({
                id: a.id,
                commandText:
                  a.presentation
                    .commandText ?? '',
                expiresAtMs:
                  a.presentation
                    .expiresAtMs,
              })
            } else if (
              event.phase ===
                'terminal' &&
              a?.id
            ) {
              setApproval((current) =>
                current?.id === a.id
                  ? null
                  : current,
              )
            }
          })

        const waitForReconnectDelay = (
          delayMs: number,
        ) =>
          new Promise<void>((resolve) => {
            reconnectTimerRef.current =
              setTimeout(() => {
                reconnectTimerRef.current = null
                resolve()
              }, delayMs)
          })

        const runAutoReconnect = async () => {
          if (
            cancelled ||
            !reconnectEnabledRef.current ||
            reconnectRunningRef.current
          ) {
            return
          }

          reconnectRunningRef.current = true

          const delays =
            [1000, 2000, 4000, 8000, 15000]

          setGatewayStatus({
            state: 'connecting',
            title: '正在自动重连…',
            detail:
              'Gateway 连接已断开，正在尝试恢复。',
          })

          for (
            let attempt = 0;
            attempt < delays.length;
            attempt += 1
          ) {
            const jitter =
              Math.floor(Math.random() * 250)

            await waitForReconnectDelay(
              delays[attempt] + jitter,
            )

            if (
              cancelled ||
              !reconnectEnabledRef.current
            ) {
              reconnectRunningRef.current = false
              return
            }

            try {
              await gateway.connect()

              let list: unknown = null
              let availableSessions: SessionListItem[] = []

              for (
                let sessionAttempt = 0;
                sessionAttempt < 5;
                sessionAttempt += 1
              ) {
                list =
                await gateway.send(
                  'sessions.list',
                  {},
                )

                availableSessions =
                  readSessionList(list)

                if (availableSessions.length > 0) {
                  break
                }

                if (sessionAttempt < 4) {
                  await new Promise<void>((resolve) => {
                    setTimeout(resolve, 1000)
                  })
                }
              }

              if (availableSessions.length === 0) {
                throw new Error(
                  'No session available after reconnect after 5 retries',
                )
              }

              const sessions =
                readSessionList(list)

              const preferredKey =
                activeSessionKeyRef.current

              const targetKey =
                preferredKey &&
                sessions.some(
                  (session) =>
                    session.key === preferredKey,
                )
                  ? preferredKey
                  : pickMainSessionKey(list)

              if (!targetKey) {
                throw new Error(
                  'No session available after reconnect',
                )
              }

              await gateway.send(
                'sessions.messages.subscribe',
                {
                  key: targetKey,
                  includeApprovals: true,
                },
              )

              const adapter =
                gatewayChatAdapterRef.current

              if (!adapter) {
                throw new Error(
                  'Gateway session adapter unavailable after reconnect',
                )
              }

              adapter.setSessionKey(targetKey)
              activeSessionKeyRef.current =
                targetKey
              approvalSubscriptionKey =
                targetKey

              const overview =
                readSettingsOverview(list)

              setSettingsOverview({
                ...overview,
                sessionKey: targetKey,
              })
              setSessionList(sessions)
              setApproval(null)
              setError(null)
              setMode('gateway')
              setGatewayStatus({
                state: 'connected',
                title: '网关已连接',
                detail:
                  '自动重连成功，Session 与审批订阅已恢复。',
              })

              if (reconnectTimerRef.current) {
                clearTimeout(
                  reconnectTimerRef.current,
                )
                reconnectTimerRef.current = null
              }

              appendRuntimeLog(
                'info',
                'gateway',
                'Gateway auto reconnect succeeded',
                `attempt=${attempt + 1}; session=${targetKey}; approvals=true`,
              )

              reconnectRunningRef.current = false
              return
            } catch (reconnectError) {
              appendRuntimeLog(
                'warn',
                'gateway',
                'Gateway auto reconnect attempt failed',
                `attempt=${attempt + 1}/${delays.length}; ${
                  reconnectError instanceof Error
                    ? reconnectError.message
                    : String(reconnectError)
                }`,
              )
            }
          }

          reconnectRunningRef.current = false
          reconnectEnabledRef.current = false

          if (!cancelled) {
            setApproval(null)
            setGatewayStatus({
              state: 'offline',
              title: '自动重连失败',
              detail:
                '连续 5 次自动重连均失败。',
              hint:
                '请手动重启 FJK Desktop。',
            })
            setError(
              '自动重连失败，请手动重启',
            )
            appendRuntimeLog(
              'error',
              'gateway',
              'Gateway auto reconnect stopped',
              'attempts=5; manual restart required',
            )
          }
        }

        unsubscribeConnectionState =
          gateway.onConnectionState(
            (payload) => {
              store.dispatch({
                type: 'connection/state',
                state: payload.state,
              })

              if (
                payload.state === 'offline' &&
                reconnectEnabledRef.current &&
                !cancelled
              ) {
                void runAutoReconnect()
              }
            },
          )

        try {
          appendRuntimeLog(
            'info',
            'gateway',
            'Connecting to OpenClaw Gateway',
          )

          await gateway.connect()

          appendRuntimeLog(
            'info',
            'gateway',
            'Gateway handshake completed',
          )

          // A successful handshake does not imply usable
          // permissions: the gateway can keep the socket
          // but grant zero operator scopes. Probe one cheap
          // read so the UI can surface that state up front.
          let sessionKey:
            | string
            | null = null

          try {
            const list =
              await gateway.send(
                'sessions.list',
                {},
              )

            sessionKey =
              pickMainSessionKey(list)
            activeSessionKeyRef.current =
              sessionKey

            if (!cancelled) {
              setSettingsOverview(
                readSettingsOverview(list),
              )
              setSessionList(
                readSessionList(list),
              )
              setSessionList(
                readSessionList(list),
              )
            }

            appendRuntimeLog(
              'info',
              'gateway',
              'Gateway permission probe succeeded',
              sessionKey
                ? `session=${sessionKey}`
                : 'No session selected',
            )

            if (!cancelled) {
              setMode('gateway')

              setGatewayStatus({
                state: 'connected',
                title:
                  '网关已连接',
                detail:
                  '已通过后端通道连接 OpenClaw Gateway。',
              })
            }
          } catch (probeError) {
            const issue =
              toGatewayIssue(
                probeError,
              )

            console.warn(
              '[FJK] gateway permission probe failed:',
              issue.kind,
              issue.detail,
            )

            appendRuntimeLog(
              'warn',
              'gateway',
              `Gateway permission probe failed: ${issue.kind}`,
              issue.detail,
            )

            if (!cancelled) {
              setMode('gateway')

              setGatewayStatus({
                // Only a permission problem blocks sending;
                // anything else is a transient failure that
                // the next request may still recover from.
                state:
                  issue.kind ===
                    'unauthorized' ||
                  issue.kind ===
                    'not_paired'
                    ? 'unauthorized'
                    : 'offline',

                title:
                  issue.title,

                detail:
                  issue.detail,

                hint:
                  issue.hint,
              })
            }
          }

          const adapter =
            new GatewayChatAdapter(
              gateway,
              sessionKey,
            )

          gatewayChatAdapterRef.current =
            adapter

          client = adapter

          // Register this connection as an approval
          // subscriber for the current session so
          // `session.approval` events are actually delivered.
          // Failure is non-fatal: chat still works without
          // approval delivery.
          if (sessionKey) {
            try {
              await gateway.send(
                'sessions.messages.subscribe',
                {
                  key:
                    sessionKey,
                  includeApprovals:
                    true,
                },
              )

              approvalSubscriptionKey =
                sessionKey

              appendRuntimeLog(
                'info',
                'gateway',
                'Session message subscription active',
                `session=${sessionKey}; approvals=true`,
              )
            } catch (
              subscribeError
            ) {
              console.warn(
                '[FJK] approval subscription failed:',
                subscribeError,
              )

              appendRuntimeLog(
                'warn',
                'gateway',
                'Session message subscription failed',
                subscribeError instanceof
                  Error
                  ? subscribeError.message
                  : String(
                      subscribeError,
                    ),
              )
            }
          }
          reconnectEnabledRef.current = true
        } catch (
          connectError
        ) {
          const issue =
            toGatewayIssue(
              connectError,
            )

          console.warn(
            '[FJK] gateway connect failed, falling back to mock:',
            issue.kind,
            issue.detail,
          )

          appendRuntimeLog(
            'error',
            'gateway',
            `Gateway connection failed: ${issue.kind}`,
            issue.detail,
          )

          await gateway.disconnect()

          gatewayClient = null
          gatewayClientRef.current =
            null

          client =
            new MockChatClient()

          if (!cancelled) {
            setMode('mock')

            setGatewayStatus({
              state:
                'offline',
              title:
                issue.title,
              detail:
                issue.detail,
              hint:
                issue.hint,
            })
          }
        }
      } else if (!cancelled) {
        appendRuntimeLog(
          'info',
          'runtime',
          'Browser runtime detected; using Mock chat',
        )

        store.dispatch({
          type:
            'connection/state',
          state:
            'connected',
        })

        setMode('mock')

        setGatewayStatus({
          state:
            'mock',
          title:
            'Mock 模式',
          detail:
            '未检测到 Tauri 运行时，使用本地模拟对话。',
        })
      }

      const controller =
        new ChatController({
          client,

          dispatchAgentAction:
            (action: unknown) =>
              store.dispatch(action),
        }) as ChatControllerLike

      controller.onGeneratingChange =
        (
          generating: boolean,
        ) => {
          if (!cancelled) {
            setSending(
              generating,
            )
          }
        }

      controller.onError = (
        err: unknown,
      ) => {
        console.error(
          '[FJK] chat error:',
          err,
        )

        appendRuntimeLog(
          'error',
          'chat',
          'Chat request failed',
          err instanceof Error
            ? err.message
            : String(err),
        )
      }

      const hitTest =
        new PetHitTest({
          canvas,
          alphaThreshold: 25,
        })

      interaction =
        new PetInteractionController({
          root,
          canvas,
          stateMachine,
          hitTest,
          dragThreshold: 6,
        })

      interaction.mount()

      await stateMachine.setState(
        PetStates.IDLE,
        {
          reason:
            'application-ready',
        },
      )

      if (!cancelled) {
        setChatController(
          controller,
        )

        setReady(true)

        appendRuntimeLog(
          'info',
          'runtime',
          'FJK Desktop runtime ready',
        )
      }
    }

    boot().catch(
      (err: unknown) => {
        console.error(
          '[FJK] pet boot failed:',
          err,
        )

        appendRuntimeLog(
          'error',
          'runtime',
          'Runtime boot failed',
          err instanceof Error
            ? err.message
            : String(err),
        )

        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : String(err),
          )
        }
      },
    )

    return () => {
      cancelled = true
      reconnectEnabledRef.current = false
      reconnectRunningRef.current = false

      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
      }

      if (
        approvalSubscriptionKey &&
        gatewayClient
      ) {
        void gatewayClient
          .send(
            'sessions.messages.unsubscribe',
            {
              key:
                approvalSubscriptionKey,
            },
          )
          .catch(
            () => undefined,
          )
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

  const writeSessionModel = async (model: string) => {
    const gateway =
      gatewayClientRef.current
    const key =
      settingsOverview.sessionKey

    if (!gateway || !key) {
      throw new Error('Gateway/session unavailable')
    }

    await gateway.send(
      'sessions.patch',
      {
        key,
        model,
      },
    )

    const list =
      await gateway.send(
        'sessions.list',
        {},
      )

    setSettingsOverview(
      readSettingsOverview(list),
    )
    setSessionList(
      readSessionList(list),
    )
  }

  const updateSessionModel = async (
    model: string,
  ) => {
    const next =
      model.trim()
    const current =
      settingsOverview.model

    if (!current) {
      throw new Error(
        'Current model is unavailable; refusing write',
      )
    }

    if (
      !next ||
      next === current
    ) {
      throw new Error(
        'Model must be non-empty and different from current value',
      )
    }

    await writeSessionModel(next)
    setPreviousModel(current)
  }

  const rollbackSessionModel = async () => {
    if (!previousModel) {
      throw new Error(
        'No previous model recorded',
      )
    }

    const original =
      previousModel

    await writeSessionModel(original)
    setPreviousModel(null)
  }

  const createSession = async (): Promise<string> => {
    const gateway =
      gatewayClientRef.current

    if (!gateway) {
      throw new Error('Gateway unavailable')
    }

    const result =
      await gateway.send(
        'sessions.create',
        {},
      )

    const key =
      (
        result as {
          key?: string
        } | null
      )?.key

    if (!key) {
      throw new Error(
        'sessions.create returned no key',
      )
    }

    const list =
      await gateway.send(
        'sessions.list',
        {},
      )

    const refreshedSessions =
      readSessionList(list)
    const refreshedOverview =
      readSettingsOverview(list)

    setSessionList(
      refreshedSessions,
    )
    setSettingsOverview(
      (current) => ({
        ...current,
        sessionCount:
          refreshedOverview.sessionCount,
      }),
    )

    appendRuntimeLog(
      'info',
      'gateway',
      'Session created',
      `session=${key}`,
    )

    return key
  }

  const deleteSession = async (
    sessionKey: string,
    expectedSessionId: string,
  ): Promise<void> => {
    const gateway =
      gatewayClientRef.current

    if (!gateway) {
      throw new Error('Gateway unavailable')
    }

    const target =
      sessionList.find(
        (session) =>
          session.key === sessionKey,
      )

    if (!target) {
      throw new Error(
        'Session is not in the current session list',
      )
    }

    if (target.isMain) {
      throw new Error(
        'Main session cannot be deleted',
      )
    }

    if (
      sessionKey ===
      settingsOverview.sessionKey
    ) {
      throw new Error(
        'Current session cannot be deleted',
      )
    }

    if (
      !expectedSessionId ||
      target.sessionId !==
        expectedSessionId
    ) {
      throw new Error(
        'Session id changed; refresh before deleting',
      )
    }

    await gateway.send(
      'sessions.patch',
      {
        key: sessionKey,
        archived: true,
        expectedSessionId,
      },
    )

    await gateway.send(
      'sessions.delete',
      {
        key: sessionKey,
        expectedSessionId,
      },
    )

    const list =
      await gateway.send(
        'sessions.list',
        {},
      )

    const refreshedSessions =
      readSessionList(list)

    const refreshedOverview =
      readSettingsOverview(list)

    setSessionList(
      refreshedSessions,
    )

    setSettingsOverview(
      (current) => ({
        ...current,
        sessionCount:
          refreshedOverview.sessionCount,
      }),
    )

    appendRuntimeLog(
      'info',
      'gateway',
      'Session deleted',
      `session=${sessionKey}; sessionId=${expectedSessionId}`,
    )
  }

  const switchSession = async (
    sessionKey: string,
  ) => {
    const targetKey = sessionKey.trim()
    const currentKey =
      settingsOverview.sessionKey
    const gateway =
      gatewayClientRef.current
    const adapter =
      gatewayChatAdapterRef.current

    if (!gateway || !adapter) {
      throw new Error('Gateway/session adapter unavailable')
    }

    if (sending) {
      throw new Error('Cannot switch session while a run is active')
    }

    if (
      !targetKey ||
      !sessionList.some(
        (session) => session.key === targetKey,
      )
    ) {
      throw new Error('Target session is not in the current session list')
    }

    if (targetKey === currentKey) {
      return
    }

    await gateway.send(
      'sessions.messages.subscribe',
      {
        key: targetKey,
        includeApprovals: true,
      },
    )

    let historyMessages: ChatMessage[]

    try {
      const history =
        await gateway.send(
          'chat.history',
          {
            sessionKey: targetKey,
            limit: 100,
          },
        )

      historyMessages =
        readChatHistoryMessages(history)
    } catch (historyError) {
      chatController?.replaceMessages([])

      await gateway
        .send(
          'sessions.messages.unsubscribe',
          {
            key: targetKey,
          },
        )
        .catch(() => undefined)

      throw historyError
    }

    try {
      if (currentKey) {
        await gateway.send(
          'sessions.messages.unsubscribe',
          {
            key: currentKey,
          },
        )
      }

      adapter.setSessionKey(targetKey)
      activeSessionKeyRef.current =
        targetKey
      setApproval(null)
      setSettingsOverview((current) => ({
        ...current,
        sessionKey: targetKey,
      }))
      chatController?.replaceMessages(historyMessages)

      appendRuntimeLog(
        'info',
        'gateway',
        'Active session changed',
        `session=${targetKey}; approvals=true`,
      )
    } catch (error) {
      await gateway
        .send(
          'sessions.messages.unsubscribe',
          {
            key: targetKey,
          },
        )
        .catch(() => undefined)

      throw error
    }
  }

  const resolveApproval = async (
    decision:
      | 'allow-once'
      | 'deny',
  ) => {
    const id =
      approval?.id

    const gateway =
      gatewayClientRef.current

    if (!id || !gateway) {
      return
    }

    await gateway.send(
      'exec.approval.resolve',
      {
        id,
        decision,
      },
    )
  }

  return {
    approval,
    resolveApproval,

    chatController,
    petState,
    agentState,
    sending,
    ready,
    error,
    mode,
    gatewayStatus,

    runtimeLogs,
    clearRuntimeLogs,

    settingsOverview,
    previousModel,
    updateSessionModel,
    rollbackSessionModel,
    sessionList,
    createSession,
    deleteSession,
    switchSession,
  }
}