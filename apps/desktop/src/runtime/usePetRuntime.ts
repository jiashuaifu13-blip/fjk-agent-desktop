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
import { PetActionSelector } from '../pet/PetActionSelector.js'
import { PetMemoryStore } from '../pet/PetMemoryStore.js'
import { TauriPetMemoryBackend } from '../pet/TauriPetMemoryBackend.js'
import { PetEmotionEngine } from '../pet/PetEmotionEngine.js'
import { PetHitTest } from '../pet/PetHitTest.js'
import { PetInteractionController } from '../pet/PetInteractionController.js'
import { ChatController } from '../chat/ChatController.js'
import { createCommandPolicy } from '../policy/CommandPolicy'
import {
  addPolicyGrant,
  loadAppPolicy,
  openPolicyFile,
  revealPolicyFile,
  writePolicyTemplate,
} from '../system/appPolicy'
import { appendAudit, describeCommand } from '../system/auditLog'
import { getExecPolicy, setExecMode } from '../system/openclawStatus'
import { MockChatClient } from '../chat/MockChatClient.js'
import { AgentStates } from '@fjk/agent-state/AgentStates.js'
import { mapAgentStateToPetAction } from '@fjk/agent-state/AgentToPetState.js'
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
  prependMessages(messages: ChatMessage[]): void
  isGenerating: boolean
  onMessageChange: ((messages: ChatMessage[]) => void) | null
  onGeneratingChange: ((generating: boolean) => void) | null
  onBubbleChange: ((content: string) => void) | null
  onError: ((error: unknown) => void) | null
  pauseWatchdog?(): void
  resumeWatchdog?(): void
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
  source: 'runtime' | 'gateway' | 'chat' | 'pet'
  message: string
  detail?: string
}

export interface ExecApproval {
  id: string
  risk?: string
  operation?: string
  resource?: string
  commandText: string
  expiresAtMs?: number
}

export interface SettingsOverview {
  model: string | null
  provider: string | null
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
  hasActiveRun: boolean
  updatedAt: number | null
}

export interface SessionListItem {
  key: string
  sessionId: string | null
  isMain: boolean
  hasActiveRun: boolean
  updatedAt: number | null
}

export interface PetRuntime {
  approval: ExecApproval | null
  approvalMode: 'tiered' | 'strict'
  autoApproveUntil: number
  enableAutoApprove(minutes: number): void
  setApprovalMode(mode: 'tiered' | 'strict'): void
  appPolicy: {
    grants: number
    source: 'file' | 'defaults' | 'invalid'
    path: string
    error: string | null
  }
  reloadAppPolicy(): Promise<void>
  openPolicy(): Promise<string>
  revealPolicy(): Promise<string>
  createPolicyTemplate(): Promise<string>
  execPolicy: {
    mode: string
    host: string
    security: string
    ask: string
    allowCount: number
  }
  readExecPolicy(): Promise<void>
  applyExecMode(mode: string): Promise<void>
  policyInfo: {
    allow: number
    deny: number
    last: string | null
  }
  resolveApproval(
    decision: 'allow-once' | 'deny',
    grantMinutes?: number,
  ): Promise<void>

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
  petRelation: {
    affinity: number
    days: number
    clicks: number
    chats: number
  }
  petSpeech: string | null
  petEmotion: string
  createSession(): Promise<string>
  deleteSession(
    sessionKey: string,
    expectedSessionId: string,
  ): Promise<void>
  switchSession(sessionKey: string): Promise<void>
  refreshSessions(): Promise<void>
  abortSession(sessionKey: string): Promise<void>
  loadOlderHistory(): Promise<number>
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
  modelProvider?: string
  hasActiveRun?: boolean
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

  const provider =
    typeof main?.modelProvider === 'string' &&
    main.modelProvider.trim().length > 0
      ? main.modelProvider
      : null

  return {
    model:
      typeof model === 'string' &&
      model.trim().length > 0
        ? model
        : null,
    provider,

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
      hasActiveRun: session?.hasActiveRun === true,
      updatedAt:
        typeof session?.updatedAt === 'number'
          ? session.updatedAt
          : null,
    }))
    .filter((item) => item.key.length > 0)
}

function readOverviewForActiveSession(
  list: unknown,
  activeKey: string | null,
): SettingsOverview {

  const overview =
    readSettingsOverview(list)

  if (!activeKey) {
    return overview
  }

  const row =
    getGatewaySessions(list).find(
      (session) => session.key === activeKey,
    )

  if (!row) {
    return overview
  }

  const model =
    row.model ??
    row.modelName ??
    row.metadata?.model ??
    row.metadata?.modelName ??
    null

  const provider =
    typeof row.modelProvider === 'string' &&
    row.modelProvider.trim().length > 0
      ? row.modelProvider
      : null

  return {
    ...overview,
    sessionKey: row.key ?? activeKey,
    provider,
    model:
      typeof model === 'string' &&
      model.trim().length > 0
        ? model
        : null,
  }
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

function readHistoryOlderCursor(history: unknown): string | null {
  const cursor =
    (history as { olderCursor?: unknown } | null)?.olderCursor

  return typeof cursor === 'string' && cursor.length > 0 ? cursor : null
}

function readHistoryHasMore(history: unknown): boolean {
  return (history as { hasMore?: unknown } | null)?.hasMore === true
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

  const emotionRef = useRef<PetEmotionEngine | null>(null)

  const workStatesRef = useRef<string[]>([
    'thinking',
    'working',
    'waiting_approval',
  ])

  const [petRelation, setPetRelation] = useState({
    affinity: 0,
    days: 0,
    clicks: 0,
    chats: 0,
  })

  const [petSpeech, setPetSpeech] =
    useState<string | null>(null)

  const [petEmotion, setPetEmotion] =
    useState<string>('neutral')

  const speechTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null)
  const wasSendingRef = useRef(false)

  const commandPolicyRef = useRef<ReturnType<typeof createCommandPolicy> | null>(null)

  const settingsOverviewRef = useRef<SettingsOverview>({
    model: null,
    provider: null,
    toolCount: null,
    sessionKey: null,
    sessionCount: null,
    toolProfile: null,
    toolsEnabled: null,
    executionMode: null,
  })

  const historySessionKeyRef =
    useRef<string | null>(null)

  const historyOlderCursorRef =
    useRef<string | null>(null)

  const historyHasMoreRef =
    useRef(false)

  const historyLoadingOlderRef =
    useRef(false)

  const reconnectEnabledRef = useRef(false)
  const reconnectRunningRef = useRef(false)
  const reconnectTimerRef =
    useRef<ReturnType<typeof setTimeout> | null>(null)

  const [approval, setApproval] =
    useState<ExecApproval | null>(null)

  const [execPolicy, setExecPolicy] = useState({
    mode: '',
    host: '',
    security: '',
    ask: '',
    allowCount: 0,
  })

  const [approvalMode, setApprovalModeState] = useState<
    'tiered' | 'strict'
  >(() => {
    try {
      const raw = window.localStorage.getItem('fjk-approval-mode-v1')

      return raw === 'strict' ? 'strict' : 'tiered'
    } catch {
      return 'tiered'
    }
  })

  const [autoApproveUntil, setAutoApproveUntil] = useState<number>(() => {
    try {
      const raw = window.localStorage.getItem('fjk-auto-approve-until-v1')
      const value = raw ? Number(raw) : 0

      return Number.isFinite(value) && value > Date.now() ? value : 0
    } catch {
      return 0
    }
  })

  const [appPolicy, setAppPolicy] = useState({
    source: 'defaults' as 'file' | 'defaults' | 'invalid',
    path: '',
    error: null as string | null,
    grants: 0,
  })

  const [policyInfo, setPolicyInfo] = useState({
    allow: 0,
    deny: 0,
    last: null as string | null,
  })

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
    provider: null,
    toolCount: null,
    sessionKey: null,
    sessionCount: null,
    toolProfile: null,
    toolsEnabled: null,
    executionMode: null,
  })

  const [previousModel, setPreviousModel] =
    useState<string | null>(null)

  useEffect(() => {
    settingsOverviewRef.current = settingsOverview
  }, [settingsOverview])

  useEffect(() => {
    const engine = emotionRef.current

    if (!engine) {
      return
    }

    engine.setMode(
      workStatesRef.current.includes(agentState)
        ? 'work'
        : 'daily',
    )
  }, [agentState])

  useEffect(() => {
    const engine = emotionRef.current

    if (!engine) {
      return
    }

    if (sending && !wasSendingRef.current) {
      engine.note('chatStart')
    }

    if (!sending && wasSendingRef.current) {
      engine.note('chatEnd')
    }

    wasSendingRef.current = sending
  }, [sending])

  // 审批出现时：桌宠提示 + 惊讶情绪（气泡保留更久）
  useEffect(() => {
    if (!approval) {
      return
    }

    setPetSpeech('有事要你确认！')
    setPetEmotion('surprised')

    if (speechTimerRef.current) {
      clearTimeout(speechTimerRef.current)
    }

    speechTimerRef.current = setTimeout(() => {
      setPetSpeech(null)
      speechTimerRef.current = null
    }, 8000)
  }, [approval])

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
      unmount(): void
    } | null = null

    let detachPetEmotion: (() => void) | null = null

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

      let character: unknown = null

      try {
        character = await loader.loadJson(
          'character.json',
        )
      } catch (characterError) {
        console.warn(
          '[FJK] character card unavailable:',
          characterError,
        )
      }

      if (cancelled) {
        return
      }

      const library =
        new AnimationLibrary(actions)

      const actionSelector =
        new PetActionSelector({ library })

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
          actionSelector,
        })

      const petMemory = new PetMemoryStore({
        character,
        backend: new TauriPetMemoryBackend(),
      } as any)

      await petMemory.hydrate()

      workStatesRef.current =
        ((character as any)?.mode?.workStates as string[] | undefined) ??
        workStatesRef.current

      const emotion = new PetEmotionEngine({
        character: (character ?? {}) as Record<string, unknown>,
        memory: petMemory,
        onChange: ({
          emotion: emotionName,
          tags,
          line,
        }: {
          emotion: string
          tags: string[]
          line?: string | null
        }) => {
          if (!Array.isArray(tags) || tags.length === 0) {
            return
          }

          appendRuntimeLog(
            'info',
            'pet',
            `Pet emotion: ${emotionName}`,
            `tags=${tags.join(',')}`,
          )

          setPetEmotion(emotionName)

          if (typeof line === 'string' && line.length > 0) {
            setPetSpeech(line)

            if (speechTimerRef.current) {
              clearTimeout(speechTimerRef.current)
            }

            const duration = Math.min(
              9000,
              Math.max(3500, 1200 + line.length * 220),
            )

            speechTimerRef.current = setTimeout(() => {
              setPetSpeech(null)
              speechTimerRef.current = null
            }, duration)
          }

          setPetRelation({
            affinity:
              (petMemory as any).data?.affinity ?? 0,
            days: Math.max(
              1,
              Math.ceil(
                (Date.now() -
                  ((petMemory as any).data?.firstMetAt ??
                    Date.now())) /
                  86400000,
              ),
            ),
            clicks:
              (petMemory as any).data?.counters?.clicks ?? 0,
            chats:
              (petMemory as any).data?.counters?.chats ?? 0,
          })

          // Agent 状态优先：只有 IDLE / ERROR 时情绪才能接管动画
          if (
            (stateMachine.currentState as string) !== PetStates.IDLE &&
            (stateMachine.currentState as string) !== PetStates.ERROR
          ) {
            return
          }

          void stateMachine
            .setState(PetStates.EMOTION, {
              tags,
              force: true,
              reason: `emotion:${emotionName}`,
            } as any)
            .catch(() => undefined)
        },
      } as any)

      emotionRef.current = emotion

      if (
        typeof (petMemory as any).isReunion === 'function' &&
        (petMemory as any).isReunion()
      ) {
        emotion.setEmotion('happy')

        appendRuntimeLog(
          'info',
          'pet',
          'Pet reunion greeting',
          `affinity=${(petMemory as any).data?.affinity ?? 0}`,
        )
      }

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

            const nextPetAction =
              mapAgentStateToPetAction(
                snapshot.state,
              )

            const nextPetState =
              nextPetAction.state

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
                  tags: nextPetAction.tags,
                  reason:
                    `agent:${snapshot.state}`,
                } as any,
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

        const policyState = await loadAppPolicy()

        setAppPolicy({
          source: policyState.source,
          path: policyState.path,
          error: policyState.error,
          grants: policyState.rules.grants.filter(
            (grant) => grant.expiresAt > Date.now(),
          ).length,
        })

        if (policyState.source === 'invalid') {
          appendRuntimeLog(
            'warn',
            'gateway',
            'Policy file invalid',
            (policyState.error ?? 'unknown').slice(0, 160),
          )
        }

        commandPolicyRef.current = createCommandPolicy(
          policyState.rules,
        )

        const policySummary = commandPolicyRef.current?.summary()

        setPolicyInfo((current) => ({
          ...current,
          allow: policySummary?.allow ?? 0,
          deny: policySummary?.deny ?? 0,
        }))

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
                    status?: string
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
              const commandText =
                a.presentation.commandText ?? ''

              const descriptor =
                describeCommand(commandText)

              void appendAudit({
                phase: 'requested',
                approvalId: a.id,
                sessionKey: (event as { sessionKey?: string }).sessionKey ?? null,
                tool: 'exec',
                operation: descriptor.operation,
                resource: descriptor.resource,
                risk: descriptor.risk,
                result: 'pending',
                command: commandText,
                expiresAtMs: a.presentation.expiresAtMs ?? null,
              })

              const activePolicy =
                commandPolicyRef.current ?? createCommandPolicy()

              const classified =
                activePolicy.classify(commandText, approvalMode)

              const autoActive = Date.now() < autoApproveUntil

              const verdict =
                classified.decision === 'ask' && autoActive
                  ? { decision: 'allow' as const, reason: '会话限时自动批准' }
                  : classified

              setPolicyInfo((current) => ({
                ...current,
                last: `${verdict.decision}：${commandText.slice(0, 80)}`,
              }))

              if (verdict.decision === 'ask') {
                notifyApproval()
              }

              setApproval({
                id: a.id,
                risk: descriptor.risk,
                operation: descriptor.operation,
                resource: descriptor.resource,
                commandText,
                expiresAtMs:
                  a.presentation.expiresAtMs,
              })

              /*
               * 等待审批期间暂停首字看门狗：
               * 审批耗时由人决定，不能算成模型超时。
               */
              controller.pauseWatchdog?.()

              if (verdict.decision !== 'ask') {
                appendRuntimeLog(
                  verdict.decision === 'deny' ? 'warn' : 'info',
                  'gateway',
                  `Policy auto-${verdict.decision}`,
                  `${verdict.reason}; command=${commandText.slice(0, 120)}`,
                )

                void appendAudit({
                  phase: 'decided',
                  approvalId: a.id,
                  sessionKey: (event as { sessionKey?: string }).sessionKey ?? null,
                  tool: 'exec',
                  operation: descriptor.operation,
                  resource: descriptor.resource,
                  risk: descriptor.risk,
                  decision:
                    verdict.decision === 'deny'
                      ? 'deny'
                      : 'allow-once',
                  reason: `${autoActive ? 'timed-auto' : 'policy-auto'}：${verdict.reason}`,
                  command: commandText,
                })

                void gateway
                  .send('exec.approval.resolve', {
                    id: a.id,
                    decision:
                      verdict.decision === 'deny'
                        ? 'deny'
                        : 'allow-once',
                  })
                  .then(() => {
                    setApproval((current) =>
                      current?.id === a.id ? null : current,
                    )
                  })
                  .catch((error) => {
                    appendRuntimeLog(
                      'warn',
                      'gateway',
                      'Policy auto-resolve failed',
                      String(
                        (error as Error)?.message ?? error,
                      ).slice(0, 160),
                    )
                  })

                return
              }
            } else if (
              event.phase ===
                'terminal' &&
              a?.id
            ) {
              controller.resumeWatchdog?.()

              void appendAudit({
                phase: 'settled',
                approvalId: a.id,
                sessionKey: (event as { sessionKey?: string }).sessionKey ?? null,
                tool: 'exec',
                result: a.status ?? 'unknown',
              })

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
                readOverviewForActiveSession(list, activeSessionKeyRef.current)

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

              void syncPendingApproval()

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

            const savedKey =
              (() => {
                try {
                  return window.localStorage.getItem(
                    'fjk-last-session-v1',
                  )
                } catch {
                  return null
                }
              })()

            const savedAvailable =
              Boolean(savedKey) &&
              getGatewaySessions(list).some(
                (session) => session.key === savedKey,
              )

            sessionKey = savedAvailable
              ? savedKey
              : pickMainSessionKey(list)
            activeSessionKeyRef.current =
              sessionKey

            if (!cancelled) {
              setSettingsOverview(
                readOverviewForActiveSession(list, activeSessionKeyRef.current),
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

              activeSessionKeyRef.current = sessionKey
              void syncPendingApproval()
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

      ;(controller as any).onDispatch = (targetKey: string) => {
        const current = settingsOverviewRef.current

        appendRuntimeLog(
          'info',
          'chat',
          'Chat send',
          `session=${targetKey}; model=${current.model ?? 'n/a'}; provider=${current.provider ?? 'n/a'}`,
        )
      }

      ;(controller as any).onTiming = (
        timing: { ttftMs: number | null; totalMs: number },
      ) => {
        appendRuntimeLog(
          'info',
          'chat',
          'Chat latency',
          `ttft=${timing.ttftMs === null ? 'n/a' : timing.ttftMs + 'ms'}; total=${timing.totalMs}ms`,
        )
      }

      ;(controller as any).onMood = (
        mood: string,
        intensity: number,
      ) => {
        emotion.applyAgentMood(mood, intensity)
      }

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

      let pointerDownAt = 0
      let pointerDownX = 0
      let pointerDownY = 0
      let pointerDragged = false

      const handlePetClick = () => {
        emotion.registerClick()
      }

      const handlePetDoubleClick = () => {
        emotion.note('doubleClick')
      }

      const handlePetPointerDown = (event: PointerEvent) => {
        pointerDownAt = Date.now()
        pointerDownX = event.clientX
        pointerDownY = event.clientY
        pointerDragged = false
      }

      const handlePetPointerMove = (event: PointerEvent) => {
        if (!pointerDownAt || pointerDragged) {
          return
        }

        const dx = event.clientX - pointerDownX
        const dy = event.clientY - pointerDownY

        if (dx * dx + dy * dy > 64) {
          pointerDragged = true
          emotion.note('dragStart')
        }
      }

      const handlePetPointerUp = () => {
        if (pointerDragged) {
          emotion.note('dragEnd')
        }

        pointerDownAt = 0
        pointerDragged = false
      }

      root.addEventListener('click', handlePetClick)
      root.addEventListener('dblclick', handlePetDoubleClick)
      root.addEventListener('pointerdown', handlePetPointerDown)
      root.addEventListener('pointermove', handlePetPointerMove)
      root.addEventListener('pointerup', handlePetPointerUp)

      detachPetEmotion = () => {
        root.removeEventListener('click', handlePetClick)
        root.removeEventListener('dblclick', handlePetDoubleClick)
        root.removeEventListener('pointerdown', handlePetPointerDown)
        root.removeEventListener('pointermove', handlePetPointerMove)
        root.removeEventListener('pointerup', handlePetPointerUp)
        emotion.dispose()
      }

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

        const bootGateway = gatewayClientRef.current
        const bootSessionKey = activeSessionKeyRef.current

        if (bootGateway && bootSessionKey) {
          try {
            const initialHistory =
              await bootGateway.send(
                'chat.history',
                {
                  sessionKey: bootSessionKey,
                  limit: 50,
                },
              )

            controller.replaceMessages(
              readChatHistoryMessages(initialHistory),
            )

            historySessionKeyRef.current = bootSessionKey
            historyOlderCursorRef.current =
              readHistoryOlderCursor(initialHistory)
            historyHasMoreRef.current =
              readHistoryHasMore(initialHistory)
          } catch (initialHistoryError) {
            console.warn(
              '[FJK] initial history load failed:',
              initialHistoryError,
            )
          }
        }

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
      detachPetEmotion?.()
      interaction?.unmount()

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
      readOverviewForActiveSession(list, activeSessionKeyRef.current),
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
      readOverviewForActiveSession(list, activeSessionKeyRef.current)

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
      readOverviewForActiveSession(list, activeSessionKeyRef.current)

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

  const setApprovalMode = (mode: 'tiered' | 'strict'): void => {
    setApprovalModeState(mode)

    try {
      window.localStorage.setItem('fjk-approval-mode-v1', mode)
    } catch {
      // ignore storage failures
    }
  }

  const enableAutoApprove = (minutes: number): void => {
    const until = minutes > 0 ? Date.now() + minutes * 60_000 : 0

    setAutoApproveUntil(until)

    try {
      window.localStorage.setItem('fjk-auto-approve-until-v1', String(until))
    } catch {
      // ignore storage failures
    }
  }

  const notifyApproval = (): void => {
    try {
      void import('@tauri-apps/api/window')
        .then(({ getCurrentWindow }) => {
          const win = getCurrentWindow()

          void win.requestUserAttention(2).catch(() => undefined)
          void win.setFocus().catch(() => undefined)
        })
        .catch(() => undefined)
    } catch {
      // ignore attention failures
    }
  }

  const readExecPolicy = async (): Promise<void> => {

    const status = await getExecPolicy()

    const gateway = gatewayClientRef.current

    let security = ''
    let ask = ''
    let allowCount = 0

    if (gateway) {
      try {
        const approvals = (await gateway.send('exec.approvals.get', {})) as {
          file?: {
            defaults?: { security?: string; ask?: string }
            agents?: Record<string, { allowlist?: unknown[] }>
          }
        }

        security = approvals?.file?.defaults?.security ?? ''
        ask = approvals?.file?.defaults?.ask ?? ''
        allowCount =
          approvals?.file?.agents?.main?.allowlist?.length ?? 0
      } catch {
        // 读取失败不阻塞其它信息
      }
    }

    if (status?.mode && status.mode !== 'ask') {
      appendRuntimeLog(
        'warn',
        'gateway',
        'Policy inactive',
        `tools.exec.mode=${status.mode}：网关自行批准，不会弹审批卡片`,
      )
    }

    setExecPolicy({
      mode: status?.mode ?? '',
      host: status?.host ?? '',
      security,
      ask,
      allowCount,
    })
  }

  const applyExecMode = async (mode: string): Promise<void> => {

    const result = await setExecMode(mode)

    appendRuntimeLog(
      result.ok ? 'info' : 'warn',
      'gateway',
      'Exec mode changed',
      result.ok ? `mode=${mode}` : `fail: ${result.error ?? ''}`,
    )

    await readExecPolicy()
  }


  const syncPendingApproval = async (): Promise<void> => {

    const gateway = gatewayClientRef.current
    const key = activeSessionKeyRef.current

    if (!gateway || !key) {
      return
    }

    try {
      const list = (await gateway.send('exec.approval.list', {})) as Array<{
        id?: string
        sessionKey?: string
        expiresAtMs?: number
        request?: { sessionKey?: string; command?: string }
      }>

      const items = Array.isArray(list) ? list : []

      const match = items.find((item) => {
        const itemKey =
          item?.sessionKey ?? item?.request?.sessionKey ?? null

        return itemKey === key && typeof item?.id === 'string'
      })

      if (match?.id) {
        const matchId = match.id

        setApproval((current) => {
          if (current?.id === matchId) {
            return current
          }

          const descriptor = describeCommand(
            match.request?.command ?? '',
          )

          return {
            id: matchId,
            risk: descriptor.risk,
            operation: descriptor.operation,
            resource: descriptor.resource,
            commandText: match.request?.command ?? '',
            expiresAtMs: match.expiresAtMs,
          }
        })

        appendRuntimeLog(
          'info',
          'gateway',
          'Pending approval restored',
          `id=${matchId}; session=${key}`,
        )

        return
      }

      setApproval((current) => {
        if (!current) {
          return current
        }

        const stillPending = items.some((item) => item?.id === current.id)

        return stillPending ? current : null
      })
    } catch (error) {
      appendRuntimeLog(
        'warn',
        'gateway',
        'Pending approval sync failed',
        String((error as Error)?.message ?? error).slice(0, 160),
      )
    }
  }


  const reloadAppPolicy = async (): Promise<void> => {

    const policyState = await loadAppPolicy()

    setAppPolicy({
      source: policyState.source,
      path: policyState.path,
      error: policyState.error,
      grants: policyState.rules.grants.filter(
        (grant) => grant.expiresAt > Date.now(),
      ).length,
    })

    commandPolicyRef.current = createCommandPolicy(policyState.rules)

    appendRuntimeLog(
      policyState.source === 'invalid' ? 'warn' : 'info',
      'gateway',
      'Policy reloaded',
      `source=${policyState.source}; allow=${policyState.rules.allow.length}; deny=${policyState.rules.deny.length}; protected=${policyState.rules.protected.length}`,
    )
  }

  const openPolicy = async (): Promise<string> => {

    const error = await openPolicyFile()

    if (!error) {
      appendRuntimeLog(
        'info',
        'gateway',
        'Policy file opened',
        'policy.json',
      )
    }

    return error
  }

  const revealPolicy = async (): Promise<string> => {

    return await revealPolicyFile()
  }

  const createPolicyTemplate = async (): Promise<string> => {

    const result = await writePolicyTemplate()

    appendRuntimeLog(
      result.ok ? 'info' : 'warn',
      'gateway',
      'Policy template written',
      result.ok ? `path=${result.path}` : String(result.error ?? '').slice(0, 160),
    )

    return result.ok ? result.path : `失败：${result.error ?? '未知'}`
  }

  const refreshSessions = async (): Promise<void> => {

    const gateway = gatewayClientRef.current

    if (!gateway) {
      return
    }

    const list = await gateway.send('sessions.list', {})

    setSessionList(readSessionList(list))
    setSettingsOverview(
      readOverviewForActiveSession(
        list,
        activeSessionKeyRef.current,
      ),
    )
  }


  const abortSession = async (
    sessionKey: string,
  ): Promise<void> => {

    const gateway = gatewayClientRef.current

    if (!gateway) {
      throw new Error('Gateway unavailable')
    }

    await gateway.send('sessions.abort', {
      key: sessionKey,
      clearQueued: true,
    })

    appendRuntimeLog(
      'warn',
      'gateway',
      'Session aborted by user',
      `session=${sessionKey}`,
    )

    await refreshSessions()
  }


  const loadOlderHistory = async (): Promise<number> => {
    const gateway = gatewayClientRef.current
    const sessionKey = settingsOverview.sessionKey

    if (!gateway || !sessionKey) {
      return 0
    }

    if (historySessionKeyRef.current !== sessionKey) {
      historySessionKeyRef.current = sessionKey
      historyOlderCursorRef.current = null
      historyHasMoreRef.current = false
    }

    if (
      !historyHasMoreRef.current ||
      !historyOlderCursorRef.current ||
      historyLoadingOlderRef.current
    ) {
      return 0
    }

    historyLoadingOlderRef.current = true

    try {
      const cursor = historyOlderCursorRef.current

      const history = await gateway.send(
        'chat.history',
        {
          sessionKey,
          cursor,
          limit: 50,
        },
      )

      // 请求返回期间如果已切走，不污染新会话
      if (activeSessionKeyRef.current !== sessionKey) {
        return 0
      }

      const olderMessages =
        readChatHistoryMessages(history)

      const page = history as {
        olderCursor?: unknown
        hasMore?: unknown
      }

      historySessionKeyRef.current = sessionKey
      historyOlderCursorRef.current =
        page.hasMore === true &&
        typeof page.olderCursor === 'string' &&
        page.olderCursor.length > 0
          ? page.olderCursor
          : null
      historyHasMoreRef.current =
        page.hasMore === true &&
        historyOlderCursorRef.current !== null

      chatController?.prependMessages(
        olderMessages,
      )

      return olderMessages.length
    } finally {
      historyLoadingOlderRef.current = false
    }
  }

  const switchSession = async (
    sessionKey: string,
  ) => {    const targetKey = sessionKey.trim()
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

    void syncPendingApproval()

    let historyMessages: ChatMessage[]

    try {
      const history =
        await gateway.send(
          'chat.history',
          {
            sessionKey: targetKey,
            limit: 50,
          },
        )

      historyMessages =
        readChatHistoryMessages(history)

      historySessionKeyRef.current = targetKey
      historyOlderCursorRef.current =
        readHistoryOlderCursor(history)
      historyHasMoreRef.current =
        readHistoryHasMore(history)
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

      try {
        window.localStorage.setItem(
          'fjk-last-session-v1',
          targetKey,
        )
      } catch {
        // ignore storage failures
      }

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
    grantMinutes?: number,
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

    const commandText =
      approval?.commandText ?? ''

    const descriptor =
      describeCommand(commandText)

    if (grantMinutes && decision === 'allow-once') {
      const escaped = commandText.replace(
        /[.*+?^${}()|[\]\\]/g,
        (match) => `\\${match}`,
      )

      const created = await addPolicyGrant(
        `^${escaped}$`,
        descriptor.resource === 'unknown' ? null : descriptor.resource,
        grantMinutes,
      ).catch(() => null)

      if (created?.ok && created.grant) {
        await reloadAppPolicy()

        void appendAudit({
          phase: 'grant',
          approvalId: id,
          sessionKey: activeSessionKeyRef.current,
          tool: 'exec',
          operation: descriptor.operation,
          resource: descriptor.resource,
          risk: descriptor.risk,
          decision: 'allow-once',
          reason: `grant:${created.grant.id} (${grantMinutes}m)`,
          command: commandText,
        })
      } else if (created) {
        appendRuntimeLog(
          'warn',
          'gateway',
          'Grant save failed',
          String(created.error ?? '').slice(0, 160),
        )
      }
    }

    void appendAudit({
      phase: 'decided',
      approvalId: id,
      sessionKey: activeSessionKeyRef.current,
      tool: 'exec',
      operation: descriptor.operation,
      resource: descriptor.resource,
      risk: descriptor.risk,
      decision,
      reason: 'user',
      command: commandText,
    })
  }

  return {
    approval,
    policyInfo,
    execPolicy,
    appPolicy,
    reloadAppPolicy,
    openPolicy,
    revealPolicy,
    createPolicyTemplate,
    approvalMode,
    autoApproveUntil,
    enableAutoApprove,
    setApprovalMode,
    readExecPolicy,
    applyExecMode,
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
    refreshSessions,
    abortSession,
    loadOlderHistory,
    petRelation,
    petSpeech,
    petEmotion,
  }
}