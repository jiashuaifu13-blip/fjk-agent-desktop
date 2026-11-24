import {
  memo,
  useEffect,
  useRef,
  useState,
} from 'react'

import type {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react'

import {
  usePetRuntimeContext,
} from '../runtime/PetRuntimeContext'

import {
  configureCustomProvider,
  customListModels,
  listProviderModels,
  mergeProviderModels,
  readOpenClawStatus,
  saveApiKey,
  setApiKeyViaGateway,
} from '../system/openclawStatus'

import type {
  OpenClawStatus,
} from '../system/openclawStatus'

import type {
  ChatMessage,
} from '../runtime/PetRuntimeContext'

import {
  toGatewayIssue,
} from '../gateway/GatewayError'

import { queueDefaultModelSync } from '../system/defaultModelSync'

import type {
  GatewayIssue,
} from '../gateway/GatewayError'

import { WorkspaceWelcome } from './WorkspaceWelcome'
import {
  WORKSPACE_PANEL_EVENT,
  WORKSPACE_QUICK_PROMPT_EVENT,
} from './WorkspaceSidebar'
import {
  RuntimeLogViewer,
} from './RuntimeLogViewer'

const MessageRow = memo(function MessageRow({
  message,
}: {
  message: ChatMessage
}) {
  return (
    <div
      className={`msg msg-${message.role}`}
    >
      <div className="msg-role">
        {message.role === 'user' ? 'You' : 'Agent'}
      </div>

      <div className="msg-content">
        {message.content || '…'}
      </div>
    </div>
  )
})


export function DesktopTerminal() {
  const {
    chatController,
    sending,
    agentState,
    ready,
    error,
    mode,
    gatewayStatus,
    settingsOverview,
    previousModel,
    updateSessionModel,
    rollbackSessionModel,
    sessionList,
    createSession,
    deleteSession,
    switchSession,
    loadOlderHistory,
    petRelation,
    policyInfo,
    appPolicy,
    reloadAppPolicy,
    openPolicy,
    revealPolicy,
    createPolicyTemplate,
    execPolicy,
    approvalMode,
    setApprovalMode,
    autoApproveUntil,
    enableAutoApprove,
    readExecPolicy,
    applyExecMode,
    refreshSessions,
    abortSession,
    approval,
    resolveApproval,
  } =
    usePetRuntimeContext()

  const [
    messages,
    setMessages,
  ] =
    useState<ChatMessage[]>(
      [],
    )

  const [
    input,
    setInput,
  ] =
    useState('')

  const [
    lastError,
    setLastError,
  ] =
    useState<
      GatewayIssue | null
    >(null)

  const [
    connectionPanelOpen,
    setConnectionPanelOpen,
  ] =
    useState(false)

    const [
    logViewerOpen,
    setLogViewerOpen,
  ] =
    useState(false)

  const [
    settingsPanelOpen,
    setSettingsPanelOpen,
  ] =
    useState(false)

  const [
    sessionPanelOpen,
    setSessionPanelOpen,
  ] =
    useState(false)

  type PanelName =
    | 'session'
    | 'settings'
    | 'log'
    | 'connection'

  const togglePanel = (
    panel: PanelName,
  ) => {
    const isOpen =
      (panel === 'session' &&
        sessionPanelOpen) ||
      (panel === 'settings' &&
        settingsPanelOpen) ||
      (panel === 'log' &&
        logViewerOpen) ||
      (panel === 'connection' &&
        connectionPanelOpen)

    // 互斥：任何时刻最多只开一个面板
    setSessionPanelOpen(
      !isOpen && panel === 'session',
    )
    setSettingsPanelOpen(
      !isOpen && panel === 'settings',
    )
    setLogViewerOpen(
      !isOpen && panel === 'log',
    )
    setConnectionPanelOpen(
      !isOpen && panel === 'connection',
    )
  }

  // FJK Living Workspace UI bridge: open existing panel logic, never duplicate RPC calls.
  useEffect(() => {
    const onPanel = (event: Event) => {
      const panel = (event as CustomEvent<string>).detail
      if (!['session', 'settings', 'log', 'connection'].includes(panel)) {
        return
      }

      // 复用仓库已有互斥开关：再次点击同一入口会关闭面板。
      togglePanel(panel as PanelName)
    }

    const onQuick = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt: string; action: string }>).detail

      if (!detail) {
        return
      }

      if (detail.action === 'log') {
        setSessionPanelOpen(false)
        setSettingsPanelOpen(false)
        setLogViewerOpen(true)
        setConnectionPanelOpen(false)
      } else if (detail.action === 'fill' && typeof detail.prompt === 'string') {
        setInput(detail.prompt)
      }
    }

    window.addEventListener(WORKSPACE_PANEL_EVENT, onPanel)
    window.addEventListener(WORKSPACE_QUICK_PROMPT_EVENT, onQuick)

    return () => {
      window.removeEventListener(WORKSPACE_PANEL_EVENT, onPanel)
      window.removeEventListener(WORKSPACE_QUICK_PROMPT_EVENT, onQuick)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [togglePanel])

  const [modelDraft, setModelDraft] =
    useState('')

  const [
    modelWriteStatus,
    setModelWriteStatus,
  ] =
    useState<string | null>(null)

  const [
    sessionSwitchError,
    setSessionSwitchError,
  ] =
    useState<string | null>(null)

  const [approvalBusy, setApprovalBusy] = useState(false)
  const [approvalError, setApprovalError] = useState<string | null>(null)

  const [openclawStatus, setOpenclawStatus] =
    useState<OpenClawStatus | null>(null)

  const [waitingSeconds, setWaitingSeconds] =
    useState(0)

  const [openclawCheckNote, setOpenclawCheckNote] =
    useState<string | null>(null)

  const [apiKeyProvider, setApiKeyProvider] =
    useState('deepseek')
  const [customId, setCustomId] =
    useState('newapi')
  const [customBaseUrl, setCustomBaseUrl] =
    useState('')
  const [customModels, setCustomModels] =
    useState('')
  const [customStatus, setCustomStatus] =
    useState<string | null>(null)
  const [apiKeyDraft, setApiKeyDraft] =
    useState('')
  const [apiKeyStatus, setApiKeyStatus] =
    useState<string | null>(null)

  const waitingForFirstToken =
    sending &&
    (messages.length === 0 ||
      messages[messages.length - 1]?.role === 'user' ||
      (messages[messages.length - 1]?.role === 'assistant' &&
        !messages[messages.length - 1]?.content))

  useEffect(() => {
    if (!waitingForFirstToken) {
      setWaitingSeconds(0)
      return
    }

    const startedAt = Date.now()
    const timer = setInterval(() => {
      setWaitingSeconds(
        Math.max(1, Math.round((Date.now() - startedAt) / 1000)),
      )
    }, 500)

    return () => clearInterval(timer)
  }, [waitingForFirstToken])

  useEffect(() => {
    if (!sessionPanelOpen) {
      return
    }

    refreshSessions().catch(() => undefined)

    const timer = setInterval(() => {
      refreshSessions().catch(() => undefined)
    }, 8000)

    return () => clearInterval(timer)
  }, [sessionPanelOpen])

  useEffect(() => {
    readExecPolicy().catch(() => undefined)
  }, [])

  const refreshOpenclawStatus = () => {
    setOpenclawCheckNote(null)

    void readOpenClawStatus()
      .then((status) => {
        setOpenclawStatus(status)

        if (!status) {
          setOpenclawCheckNote(null)
          return
        }

        setOpenclawCheckNote(
          status.installed
            ? `已安装 OpenClaw ${status.version ?? '（版本未知）'}`
            : '未检测到 OpenClaw',
        )
      })
      .catch(() => {
        setOpenclawStatus(null)
        setOpenclawCheckNote('检测失败')
      })
  }

  useEffect(() => {
    if (!settingsPanelOpen) {
      return
    }

    refreshOpenclawStatus()
  }, [settingsPanelOpen])

  useEffect(() => {
    if (!sessionPanelOpen) {
      setSessionSwitchError(null)
    }
  }, [sessionPanelOpen])

  const listRef =
    useRef<HTMLDivElement>(
      null,
    )

  const olderScrollRef =
    useRef<{ height: number; top: number } | null>(
      null,
    )

  const loadingOlderRef = useRef(false)

  useEffect(() => {
    if (!chatController) {
      return
    }

    chatController.onMessageChange =
      (
        next:
          ChatMessage[],
      ) => {
        setMessages([
          ...next,
        ])
      }

    return () => {
      chatController.onMessageChange =
        null
    }
  }, [chatController])

  useEffect(() => {
    const el =
      listRef.current

    if (!el) {
      return
    }

    const pending =
      olderScrollRef.current

    if (pending) {
      olderScrollRef.current = null
      el.scrollTop =
        el.scrollHeight - pending.height + pending.top
      return
    }

    el.scrollTop =
      el.scrollHeight
  }, [messages, sending])

  const unauthorized =
    gatewayStatus.state ===
    'unauthorized'

  const offline =
    agentState ===
    'offline'

  const connected =
    Boolean(
      chatController,
    ) &&
    ready &&
    !error &&
    !unauthorized &&
    !offline

  const modeLabel =
    unauthorized
      ? 'Gateway · 未授权'
      : offline
        ? mode ===
          'gateway'
          ? 'Gateway · 离线'
          : '离线 · Mock'
        : mode ===
            'gateway'
          ? 'Gateway'
          : 'Mock 模式'

  const modeTone =
    unauthorized ||
    offline
      ? 'warn'
      : mode ===
          'gateway'
        ? 'ok'
        : undefined

  const noticeTitle =
    offline &&
    gatewayStatus.state !==
      'offline'
      ? '网关连接已断开'
      : gatewayStatus.title

  const noticeDetail =
    offline &&
    gatewayStatus.state !==
      'offline'
      ? '桌面端当前未连接到 Gateway。'
      : gatewayStatus.detail

  const connectionLabel =
    (() => {
      switch (
        gatewayStatus.state
      ) {
        case 'connected':
          return '已连接'

        case 'connecting':
          return '连接中'

        case 'unauthorized':
          return '未授权'

        case 'offline':
          return '离线'

        case 'mock':
          return 'Mock'

        default:
          return gatewayStatus.state
      }
    })()

  const connectionTone =
    gatewayStatus.state ===
    'connected'
      ? 'ok'
      : gatewayStatus.state ===
          'connecting'
        ? 'pending'
        : gatewayStatus.state ===
            'mock'
          ? 'neutral'
          : 'error'

  const latestErrorTitle =
    lastError?.title ??
    (
      gatewayStatus.state ===
        'offline' ||
      gatewayStatus.state ===
        'unauthorized'
        ? gatewayStatus.title
        : null
    )

  const latestErrorDetail =
    lastError?.detail ??
    (
      gatewayStatus.state ===
        'offline' ||
      gatewayStatus.state ===
        'unauthorized'
        ? gatewayStatus.detail
        : null
    )

  const latestErrorHint =
    lastError?.hint ??
    (
      gatewayStatus.state ===
        'offline' ||
      gatewayStatus.state ===
        'unauthorized'
        ? gatewayStatus.hint
        : undefined
    )

  const handleSubmit =
    async (
      e:
        FormEvent<HTMLFormElement>,
    ) => {
      e.preventDefault()

      if (
        !chatController ||
        sending
      ) {
        return
      }

      const text =
        input.trim()

      if (!text) {
        return
      }

      setInput('')
      setLastError(null)

      try {
        await chatController.send(
          text,
        )
      } catch (err) {
        console.error(
          '[FJK] send failed:',
          err,
        )

        setLastError(
          toGatewayIssue(
            err,
          ),
        )
      }
    }

  const handleKeyDown =
    (
      e:
        ReactKeyboardEvent<HTMLTextAreaElement>,
    ) => {
      if (
        e.key ===
          'Enter' &&
        !e.shiftKey
      ) {
        e.preventDefault()

        if (!sending) {
          e.currentTarget
            .form
            ?.requestSubmit()
        }
      }
    }

  return (
    <section className="terminal">
      <header className="terminal-header">
        <div className="terminal-title">
          <span
            className="terminal-dot"
            data-state={
              agentState
            }
          />

          FJK Agent Terminal
        </div>

        <div className="terminal-meta">
          <button
            type="button"
            className="connection-state-trigger"
            aria-expanded={
              sessionPanelOpen
            }
            aria-controls="session-list-panel"
            onClick={() => {
              togglePanel('session')
            }}
          >
            会话
          </button>

          <button
            type="button"
            className="connection-state-trigger"
            aria-expanded={
              settingsPanelOpen
            }
            aria-controls="settings-overview-panel"
            onClick={() => {
              togglePanel('settings')
            }}
          >
            设置
          </button>

          <button
            type="button"
            className="connection-state-trigger"
            aria-expanded={
              logViewerOpen
            }
            aria-controls="runtime-log-viewer"
            onClick={() => {
              togglePanel('log')
            }}
          >
            日志
          </button>

          <button
            type="button"
            className="connection-state-trigger"
            aria-expanded={
              connectionPanelOpen
            }
            aria-controls="connection-state-panel"
            onClick={() => {
              togglePanel('connection')
            }}
          >
            连接状态
          </button>

          <span
            className={`terminal-mode${
              modeTone
                ? ` terminal-mode-${modeTone}`
                : ''
            }`}
          >
            {modeLabel}
          </span>

          <span className="terminal-agent">
            agent:{' '}
            {agentState}
          </span>
        </div>
      </header>

      <div id="runtime-log-viewer">
        <RuntimeLogViewer
          open={
            logViewerOpen
          }
          onClose={() => {
            setLogViewerOpen(
              false,
            )
          }}
        />
            </div>

      {settingsPanelOpen && (
        <section
          id="settings-overview-panel"
          className="connection-state-panel"
          aria-label="Settings 只读概览"
        >
          <div className="connection-state-heading">
            <div>
              <div className="connection-state-title">
                Settings
              </div>

              <div className="connection-state-subtitle">
                当前运行配置只读概览
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
              }}
            >
              <button
                type="button"
                className="connection-state-trigger"
                onClick={refreshOpenclawStatus}
              >
                重新检测
              </button>

              {openclawCheckNote && (
                <span className="connection-state-copy">
                  {openclawCheckNote}
                </span>
              )}

              <span className="connection-state-badge connection-state-badge-neutral">
                模型可写
              </span>
            </div>
          </div>

          <div className="connection-state-grid">
            <div className="connection-state-row">
              <span className="connection-state-key">
                模型
              </span>

              <div className="connection-state-value">
                <div>
                  {settingsOverview.model ?? '未提供'}
                  {settingsOverview.provider
                    ? `（${settingsOverview.provider}）`
                    : ''}
                </div>
                <input value={modelDraft} placeholder="输入不同的已允许模型" onChange={(e) => setModelDraft(e.target.value)} />
                <button type="button" disabled={!settingsOverview.model || !modelDraft.trim()} onClick={async () => {
                  const draft = modelDraft.trim()

                  setModelWriteStatus(`原值：${settingsOverview.model ?? '未提供'}`)

                  try {
                    await updateSessionModel(draft)
                    setModelDraft('')

                    const qualified = draft.includes('/')
                      ? draft
                      : `${settingsOverview.provider ?? ''}/${draft}`

                    setModelWriteStatus(
                      `当前会话已切换为 ${draft}；全局默认后台同步中…`,
                    )

                    queueDefaultModelSync(qualified, (result) => {
                      setModelWriteStatus(
                        result.ok
                          ? `当前会话=${draft}，全局默认=${qualified}（新会话也用它）`
                          : `会话已切换，但全局默认同步失败：${(result.error ?? '').slice(0, 160)}`,
                      )
                    })
                  } catch (err) {
                    setModelWriteStatus(`修改失败：${err instanceof Error ? err.message : String(err)}`)
                  }
                }}>保存模型</button>
                <button type="button" disabled={!previousModel} onClick={async () => {
                  try { await rollbackSessionModel(); setModelWriteStatus('已回滚到原模型') }
                  catch (err) { setModelWriteStatus(`回滚失败：${err instanceof Error ? err.message : String(err)}`) }
                }}>回滚模型</button>
                {modelWriteStatus && <div>{modelWriteStatus}</div>}
                <div className="connection-state-copy">
                  自定义 provider 的模型请写成 provider/model（例如 newapi/grok-4.7）；只写模型名会被当成 deepseek 的模型。
                </div>
              </div>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                工具数量
              </span>

              <span className="connection-state-value">
                {settingsOverview.toolCount ??
                  '未提供'}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                工具 Profile
              </span>
              <span className="connection-state-value">
                {settingsOverview.toolProfile ??
                  '未提供'}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                工具开关
              </span>
              <span className="connection-state-value">
                {settingsOverview.toolsEnabled === null
                  ? '未提供'
                  : settingsOverview.toolsEnabled
                    ? '启用'
                    : '禁用'}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                执行模式
              </span>
              <span className="connection-state-value">
                {settingsOverview.executionMode ??
                  '未提供'}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                审批模式
              </span>
              <span className="connection-state-value">
                {approvalMode === 'strict' ? '全部人工确认' : '分级（只读自动/危险自动拒）'}
                <button
                  type="button"
                  className="connection-state-trigger"
                  onClick={() => {
                    setApprovalMode(approvalMode === 'strict' ? 'tiered' : 'strict')
                  }}
                >
                  {approvalMode === 'strict' ? '切到分级' : '切到全部人工'}
                </button>
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                执行权限
              </span>
              <span className="connection-state-value">
                {execPolicy.mode || '未配置'}
                {execPolicy.security
                  ? ` · ${execPolicy.security}/${execPolicy.ask}`
                  : ''}
                {` · 白名单 ${execPolicy.allowCount} 条`}
                {execPolicy.mode && execPolicy.mode !== 'ask'
                  ? ' · ⚠ 网关自动批准，不会弹卡片'
                  : ''}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                权限策略
              </span>
              <span className="connection-state-value">
                <button
                  type="button"
                  className="connection-state-trigger"
                  onClick={() => {
                    const ok = window.confirm(
                      '切到 auto 后，网关会自行批准命令，\n不再弹审批卡片；\n危险命令与受保护路径规则也会失效。\n\n确定切换吗？',
                    )

                    if (ok) {
                      void applyExecMode('auto')
                    }
                  }}
                >
                  自动批准（不弹卡，慎用）
                </button>
                <button
                  type="button"
                  className="connection-state-trigger"
                  onClick={() => {
                    void applyExecMode('ask')
                  }}
                >
                  切到 ask（逐条审批）
                </button>
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                限时自动批准
              </span>
              <span className="connection-state-value">
                {autoApproveUntil > Date.now()
                  ? `剩余 ${Math.ceil((autoApproveUntil - Date.now()) / 60000)} 分钟`
                  : '未启用'}
                <button
                  type="button"
                  className="connection-state-trigger"
                  onClick={() => {
                    enableAutoApprove(30)
                  }}
                >
                  开启 30 分钟
                </button>
                <button
                  type="button"
                  className="connection-state-trigger"
                  onClick={() => {
                    enableAutoApprove(0)
                  }}
                >
                  立即关闭
                </button>
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                策略来源
              </span>
              <span className="connection-state-value">
                {appPolicy.source === 'file'
                  ? '自定义（policy.json）'
                  : appPolicy.source === 'invalid'
                    ? '⚠ 文件无效，已回退默认'
                    : '内置默认'}
                <button
                  type="button"
                  className="connection-state-trigger"
                  onClick={() => {
                    void createPolicyTemplate().then((message) => {
                      setModelWriteStatus(message)
                    })
                  }}
                >
                  生成模板
                </button>
                <button
                  type="button"
                  className="connection-state-trigger"
                  onClick={() => {
                    void reloadAppPolicy()
                  }}
                >
                  重新加载
                </button>
                <button
                  type="button"
                  className="connection-state-trigger"
                  onClick={() => {
                    void openPolicy().then((message) => {
                      setModelWriteStatus(
                        message ? `打开策略文件失败：${message}` : '已打开 policy.json，改完点「重新加载」',
                      )
                    })
                  }}
                >
                  打开文件
                </button>
                <button
                  type="button"
                  className="connection-state-trigger"
                  onClick={() => {
                    void revealPolicy().then((message) => {
                      if (message) {
                        setModelWriteStatus(`打开目录失败：${message}`)
                      }
                    })
                  }}
                >
                  打开目录
                </button>
                <div className="connection-state-copy">
                  策略文件说明：这是你的「本机审批规则」，可以自定义
                  allow（自动放行）/ deny（直接拒绝）/ protected（禁止触碰的目录）/
                  projectRoots（允许操作的项目目录，跨目录写入会被拒绝）/ grants（临时授权）。
                  改完保存 → 点「重新加载」立即生效。注意 JSON 里 Windows 路径要写成双反斜杠，
                  例如 D:\\pet-desp 要写成 "D:\\\\pet-desp"。
                </div>
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                有效授权
              </span>
              <span className="connection-state-value">
                {appPolicy.grants} 个（policy.json 的 grants，到期自动失效）
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                项目范围
              </span>
              <span className="connection-state-value">
                在 policy.json 里设置 {'"'}projectRoots{'"'}（空数组 = 不限制）；
                启用后跨项目只读需审批、跨项目写删直接拒绝。
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                自动放行规则
              </span>
              <span className="connection-state-value">
                {policyInfo.allow}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                危险拒绝规则
              </span>
              <span className="connection-state-value">
                {policyInfo.deny}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                最近判定
              </span>
              <span className="connection-state-value">
                {policyInfo.last ?? '暂无'}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                OpenClaw
              </span>
              <span className="connection-state-value">
                {openclawStatus === null
                  ? '未检测'
                  : openclawStatus.installed
                    ? '已安装'
                    : '未安装'}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                OpenClaw 版本
              </span>
              <span className="connection-state-value">
                {openclawStatus?.version ?? '未提供'}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                网关状态
              </span>
              <span className="connection-state-value">
                {openclawStatus === null
                  ? '未检测'
                  : openclawStatus.gatewayRunning
                    ? '运行中'
                    : '未运行'}
              </span>
            </div>

            {openclawStatus?.installed && (
              <div className="connection-state-section">
                <div className="connection-state-section-title">
                  OpenClaw 已检测到
                </div>

                <div className="connection-state-copy">
                  已安装 OpenClaw {openclawStatus.version ?? '（版本未知）'}；网关
                  {openclawStatus.gatewayRunning ? '正在运行' : '未运行'}。
                </div>

                {openclawStatus.cliPath && (
                  <div className="connection-state-copy">
                    CLI：<code>{openclawStatus.cliPath}</code>
                  </div>
                )}
              </div>
            )}

            {openclawStatus && !openclawStatus.installed && (
              <div className="connection-state-section">
                <div className="connection-state-section-title">
                  还没安装 OpenClaw
                </div>

                <div className="connection-state-copy">
                  在 PowerShell 里执行：
                </div>

                <div className="connection-state-copy">
                  <code>npm i -g openclaw</code>
                </div>

                <div className="connection-state-copy">
                  装好后执行 <code>openclaw onboard</code> 配置模型与 API Key，再点「重新检测」。
                </div>
              </div>
            )}

            {openclawStatus &&
              openclawStatus.installed &&
              !openclawStatus.configFound && (
                <div className="connection-state-section">
                  <div className="connection-state-section-title">
                    OpenClaw 已安装，还没配置
                  </div>

                  <div className="connection-state-copy">
                    执行 <code>openclaw onboard</code> 完成模型与 API Key 配置；完成后点「重新检测」。
                  </div>
                </div>
              )}

            {openclawStatus &&
              openclawStatus.installed &&
              openclawStatus.configFound &&
              !openclawStatus.gatewayRunning && (
                <div className="connection-state-section">
                  <div className="connection-state-section-title">
                    网关没有运行
                  </div>

                  <div className="connection-state-copy">
                    执行 <code>openclaw daemon start</code>（或前台 <code>openclaw gateway --port 18789</code>），再点「重新检测」。
                  </div>
                </div>
              )}

            <div className="connection-state-section">
              <div className="connection-state-section-title">
                模型与密钥
              </div>

              <div className="connection-state-copy">
                API Key 只写入本机 OpenClaw 凭据，不会存到应用配置里。
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                  marginTop: 8,
                }}
              >
                <input
                  value={apiKeyProvider}
                  list="provider-options"
                  placeholder="provider（如 deepseek / anthropic / xai）"
                  onChange={(event) => setApiKeyProvider(event.target.value)}
                  style={{ width: 170 }}
                />

                <datalist id="provider-options">
                  <option value="deepseek" />
                  <option value="anthropic" />
                  <option value="openai" />
                  <option value="xai" />
                  <option value="google" />
                  <option value="openrouter" />
                  <option value="groq" />
                  <option value="moonshot" />
                  <option value="zhipu" />
                  <option value="alibaba" />
                  <option value="mistral" />
                  <option value="together" />
                  <option value="deepinfra" />
                  <option value="cerebras" />
                  <option value="cohere" />
                </datalist>

                <input
                  type="password"
                  value={apiKeyDraft}
                  placeholder="粘贴 API Key"
                  autoComplete="off"
                  onChange={(event) => setApiKeyDraft(event.target.value)}
                />

                <button
                  type="button"
                  className="connection-state-trigger"
                  disabled={!apiKeyDraft.trim()}
                  onClick={() => {
                    setApiKeyStatus('正在写入…')

                    const pendingKey = apiKeyDraft.trim()
                    const provider = apiKeyProvider

                    void (async () => {
                      let written = await setApiKeyViaGateway(provider, pendingKey)

                      if (!written.ok) {
                        const cli = await saveApiKey(provider, pendingKey)

                        written = {
                          ok: cli?.ok === true,
                          error: cli?.ok === true
                            ? null
                            : `RPC: ${written.error ?? '失败'}；CLI: ${(cli?.stderr || cli?.stdout || '无输出').slice(0, 100)}`,
                          cleanedUp: written.cleanedUp,
                        }
                      }

                      setApiKeyDraft('')

                      if (!written.ok) {
                        setApiKeyStatus(`写入失败：${(written.error ?? '未知').slice(0, 180)}`)
                        return
                      }

                      const cleanedNote = written.cleanedUp
                        ? `（已移除旧的 ${written.cleanedUp} 凭据）`
                        : ''

                      setApiKeyStatus(`已写入 OpenClaw 凭据${cleanedNote}，正在检查可用模型…`)

                      try {
                        const checked = await listProviderModels(provider, pendingKey)

                        if (!checked) {
                          setApiKeyStatus('已写入 OpenClaw 凭据（当前环境无法校验模型）')
                        } else if (checked.supported === false) {
                          setApiKeyStatus('已写入 OpenClaw 凭据（该 provider 未内置校验，请在对话里验证）')
                        } else if (checked.ok && checked.models.length > 0) {
                          setApiKeyStatus(
                            `已写入；可用模型：${checked.models.slice(0, 6).join(', ')}，正在登记到目录…`,
                          )

                          try {
                            const merged = await mergeProviderModels(
                              provider,
                              checked.models,
                            )

                            if (merged.ok) {
                              setApiKeyStatus(
                                `已写入并登记 ${merged.kept.length} 个模型（新增 ${merged.added.length}）` +
                                  (merged.added.length > 0
                                    ? `：${merged.added.slice(0, 5).join(', ')}`
                                    : ''),
                              )
                            } else {
                              setApiKeyStatus(
                                `已写入，但登记模型失败：${(merged.error ?? '未知').slice(0, 160)}`,
                              )
                            }
                          } catch (mergeError) {
                            setApiKeyStatus(
                              `已写入，但登记模型异常：${mergeError instanceof Error ? mergeError.message : String(mergeError)}`,
                            )
                          }
                        } else if (checked.ok) {
                          setApiKeyStatus('已写入；但 provider 没有返回模型列表')
                        } else {
                          setApiKeyStatus(
                            `已写入，但校验失败（HTTP ${checked.status ?? '?'}）：${(checked.error ?? '未知').slice(0, 140)}`,
                          )
                        }
                      } catch (error) {
                        setApiKeyStatus(
                          `已写入；校验异常：${error instanceof Error ? error.message : String(error)}`,
                        )
                      }

                      refreshOpenclawStatus()
                    })().catch((error) => {
                      setApiKeyStatus(
                        `写入异常：${error instanceof Error ? error.message : String(error)}`,
                      )
                    })
                  }}
                >
                  保存密钥
                </button>
              </div>

              {apiKeyStatus && (
                <div className="connection-state-copy">
                  {apiKeyStatus}
                </div>
              )}

              <div className="connection-state-copy" style={{ marginTop: 12 }}>
                自定义 OpenAI 兼容服务（如 New API / one-api 中转）：
              </div>

              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <input
                  value={customId}
                  placeholder="provider id"
                  onChange={(event) => setCustomId(event.target.value)}
                  style={{ width: 110 }}
                />
                <input
                  value={customBaseUrl}
                  placeholder="Base URL（如 https://xxx.hf.space）"
                  onChange={(event) => setCustomBaseUrl(event.target.value)}
                  style={{ width: 240 }}
                />
                <input
                  value={customModels}
                  placeholder="模型 id，逗号分隔"
                  onChange={(event) => setCustomModels(event.target.value)}
                  style={{ width: 220 }}
                />
                <button
                  type="button"
                  className="connection-state-trigger"
                  disabled={!customId.trim() || !customBaseUrl.trim() || !apiKeyDraft.trim()}
                  onClick={() => {
                    setCustomStatus('正在校验…')

                    const provider = customId.trim().toLowerCase()
                    const baseUrl = customBaseUrl.trim()
                    const key = apiKeyDraft.trim()

                    void (async () => {
                      const checked = await customListModels(baseUrl, key)

                      if (!checked) {
                        setCustomStatus('当前环境无法校验')
                        return
                      }

                      if (!checked.ok) {
                        setCustomStatus(
                          `校验失败（HTTP ${checked.status ?? '0'}）：${(checked.error ?? '未知').slice(0, 160)}`,
                        )
                        return
                      }

                      const typed = customModels
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean)

                      const ids = typed.length > 0 ? typed : checked.models.slice(0, 20)

                      setCustomStatus(`校验通过，可用模型 ${checked.models.length} 个；正在写入…`)

                      const keyWritten = await setApiKeyViaGateway(provider, key)

                      if (!keyWritten.ok) {
                        setCustomStatus(
                          `写入凭据失败：${(keyWritten.error ?? '未知').slice(0, 160)}`,
                        )
                        return
                      }

                      const configured = await configureCustomProvider(provider, baseUrl, ids)

                      setCustomStatus(
                        configured.ok
                          ? `已写入自定义 provider「${provider}」，模型：${ids.slice(0, 6).join(', ')}`
                          : `写入 provider 配置失败：${(configured.error ?? '未知').slice(0, 160)}`,
                      )

                      setApiKeyDraft('')
                      refreshOpenclawStatus()
                    })().catch((error) => {
                      setCustomStatus(
                        `异常：${error instanceof Error ? error.message : String(error)}`,
                      )
                    })
                  }}
                >
                  保存自定义
                </button>
              </div>

              {customStatus && (
                <div className="connection-state-copy">
                  {customStatus}
                </div>
              )}

              <div className="connection-state-copy">
                若写入失败，可在终端执行 <code>openclaw models auth paste-api-key --provider {apiKeyProvider}</code> 手动粘贴。
              </div>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                桌宠亲密度
              </span>
              <span className="connection-state-value">
                {petRelation.affinity}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                认识天数
              </span>
              <span className="connection-state-value">
                {petRelation.days}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                互动次数
              </span>
              <span className="connection-state-value">
                {petRelation.clicks + petRelation.chats}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                当前 Session
              </span>

              <span
                className="connection-state-value"
                title={
                  settingsOverview.sessionKey ??
                  '未选择 Session'
                }
              >
                {settingsOverview.sessionKey ??
                  '未选择'}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                Session 总数
              </span>

              <span className="connection-state-value">
                {settingsOverview.sessionCount ??
                  '未提供'}
              </span>
            </div>
          </div>

          <div className="connection-state-section">
            <div className="connection-state-section-title">
              数据来源
            </div>

            <div className="connection-state-copy">
              本页展示启动阶段 Gateway
              sessions.list 已返回的信息；
              仅允许修改当前 Session 的模型。
              Gateway 未返回的字段统一显示“未提供”。
            </div>
          </div>
        </section>
      )}

      {sessionPanelOpen && (
        <section
          id="session-list-panel"
          className="connection-state-panel"
          aria-label="会话列表"
        >
          <div className="connection-state-heading">
            <div>
              <div className="connection-state-title">
                会话
              </div>

              <div className="connection-state-subtitle">
                sessions.list 只读列表
              </div>
            </div>

            <button
              type="button"
              className="connection-state-trigger"
              disabled={
                sending ||
                mode !== 'gateway' ||
                gatewayStatus.state !==
                  'connected'
              }
              onClick={() => {
                setLastError(null)
                void createSession().catch(
                  (err) => {
                    setLastError(
                      toGatewayIssue(err),
                    )
                  },
                )
              }}
            >
              新建会话
            </button>
          </div>

          <div className="connection-state-grid">
            {sessionList.length === 0 && (
              <div className="connection-state-copy">
                暂无会话
              </div>
            )}

            {sessionList.map((session) => (
              <div
                className="connection-state-row session-list-row"
                key={session.key}
              >
                <span className="connection-state-key">
                  {session.isMain ? 'MAIN' : 'SESSION'}
                  {session.hasActiveRun ? ' · 运行中' : ''}
                </span>

                <span className="connection-state-value session-list-value">
                  {session.key}
                  {' · sessionId: '}
                  {session.sessionId ?? '未提供'}
                  {session.key ===
                  settingsOverview.sessionKey
                    ? '（当前使用）'
                    : ''}
                  {' · '}
                  {session.updatedAt === null
                    ? '未提供'
                    : new Date(
                        session.updatedAt,
                      ).toLocaleString()}
                </span>

                  {session.hasActiveRun && (
                    <button
                      type="button"
                      className="connection-state-trigger"
                      onClick={() => {
                        setSessionSwitchError(null)

                        void abortSession(session.key).catch((err) => {
                          setSessionSwitchError(
                            err instanceof Error
                              ? err.message
                              : String(err),
                          )
                        })
                      }}
                    >
                      强制停止
                    </button>
                  )}

                  {session.key !==
                    settingsOverview.sessionKey && (
                    <button
                      type="button"
                      className="connection-state-trigger"
                      disabled={sending}
                      onClick={() => {
                        setSessionSwitchError(
                          null,
                        )
                        void switchSession(
                          session.key,
                        ).catch((err) => {
                          setSessionSwitchError(
                            err instanceof Error
                              ? err.message
                              : String(err),
                          )
                        })
                      }}
                    >
                      切换
                    </button>
                  )}

                  {!session.isMain &&
                    session.key !==
                      settingsOverview.sessionKey &&
                    session.sessionId && (
                      <button
                        type="button"
                        className="connection-state-trigger"
                        disabled={sending}
                        onClick={() => {
                          const confirmed =
                            window.confirm(
                              `确认删除会话？\n\nkey: ${session.key}\nsessionId: ${session.sessionId}\n\n将先归档，再永久删除。此操作不可撤销。`,
                            )

                          if (!confirmed) {
                            return
                          }

                          setSessionSwitchError(
                            null,
                          )

                          const sid = session.sessionId

                          if (!sid) {
                            return
                          }

                          void deleteSession(
                            session.key,
                            sid,
                          ).catch((err) => {
                            setSessionSwitchError(
                              err instanceof Error
                                ? err.message
                                : String(err),
                            )
                          })
                        }}
                      >
                        删除
                      </button>
                    )}
              </div>
            ))}
          </div>

          {sessionSwitchError && (
            <div className="connection-state-section">
              <div className="connection-state-error">
                <div className="connection-state-error-title">
                  会话操作失败
                </div>

                <div className="connection-state-copy">
                  {sessionSwitchError}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {connectionPanelOpen && (
        <section
          id="connection-state-panel"
          className="connection-state-panel"
          aria-label="Gateway 连接状态"
        >
          <div className="connection-state-heading">
            <div>
              <div className="connection-state-title">
                Connection
                State
              </div>

              <div className="connection-state-subtitle">
                OpenClaw
                Gateway
                当前连接信息
              </div>
            </div>

            <span
              className={`connection-state-badge connection-state-badge-${connectionTone}`}
            >
              {
                connectionLabel
              }
            </span>
          </div>

          <div className="connection-state-grid">
            <div className="connection-state-row">
              <span className="connection-state-key">
                Gateway
              </span>

              <span className="connection-state-value">
                {
                  gatewayStatus.title
                }
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                模式
              </span>

              <span className="connection-state-value">
                {mode ===
                'gateway'
                  ? 'Gateway'
                  : 'Mock'}
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                Agent
              </span>

              <span className="connection-state-value">
                {
                  agentState
                }
              </span>
            </div>

            <div className="connection-state-row">
              <span className="connection-state-key">
                Terminal
              </span>

              <span className="connection-state-value">
                {ready
                  ? 'Ready'
                  : 'Starting'}
              </span>
            </div>
          </div>

          <div className="connection-state-section">
            <div className="connection-state-section-title">
              连接说明
            </div>

            <div className="connection-state-copy">
              {
                gatewayStatus.detail
              }
            </div>

            {gatewayStatus.hint && (
              <div className="connection-state-hint">
                {
                  gatewayStatus.hint
                }
              </div>
            )}
          </div>

          <div className="connection-state-section">
            <div className="connection-state-section-title">
              最近错误
            </div>

            {latestErrorTitle ? (
              <div className="connection-state-error">
                <div className="connection-state-error-title">
                  {
                    latestErrorTitle
                  }
                </div>

                {latestErrorDetail && (
                  <div className="connection-state-copy">
                    {
                      latestErrorDetail
                    }
                  </div>
                )}

                {latestErrorHint && (
                  <div className="connection-state-hint">
                    {
                      latestErrorHint
                    }
                  </div>
                )}

                {lastError?.raw && (
                  <details className="connection-state-raw">
                    <summary>
                      原始错误
                    </summary>

                    <code>
                      {
                        lastError.raw
                      }
                    </code>
                  </details>
                )}
              </div>
            ) : (
              <div className="connection-state-empty">
                暂无错误
              </div>
            )}
          </div>

          <div className="connection-state-section">
            <div className="connection-state-section-title">
              重连
            </div>

            <div className="connection-state-copy">
              断线后会自动重连：按 1s / 2s / 4s / 8s / 15s
              退避尝试，共 5 次；成功后自动恢复当前
              Session、审批订阅与连接状态。
              连续 5 次失败才需要手动重启 FJK Desktop。
            </div>
          </div>
        </section>
      )}

      {(unauthorized ||
        offline) && (
        <div
          className={`terminal-notice terminal-notice-${
            unauthorized
              ? 'warn'
              : 'info'
          }`}
        >
          <div className="notice-title">
            {
              noticeTitle
            }
          </div>

          <div className="notice-detail">
            {
              noticeDetail
            }
          </div>

          {gatewayStatus.hint && (
            <div className="notice-hint">
              {
                gatewayStatus.hint
              }
            </div>
          )}
        </div>
      )}

      <div
        ref={listRef}
        className="terminal-messages"
        onScroll={() => {
          const el = listRef.current

          if (
            !el ||
            el.scrollTop > 40 ||
            loadingOlderRef.current
          ) {
            return
          }

          loadingOlderRef.current = true
          olderScrollRef.current = {
            height: el.scrollHeight,
            top: el.scrollTop,
          }

          void loadOlderHistory()
            .then((count) => {
              if (!count) {
                olderScrollRef.current = null
              }
            })
            .catch(() => {
              olderScrollRef.current = null
            })
            .finally(() => {
              loadingOlderRef.current = false
            })
        }}
      >
        {messages.length === 0 && !sending && (
          <div className="terminal-empty">
            <WorkspaceWelcome ready={ready} />
          </div>
        )}

        {messages.map((m) => (
          <MessageRow key={m.id} message={m} />
        ))}

        {sending && (
          <div className="msg msg-assistant">
            <div className="msg-content msg-streaming">
              {waitingForFirstToken
                ? `等待模型响应… ${waitingSeconds}s`
                : '▍'}
            </div>
          </div>
        )}
      </div>

      {approval && (
        <div className="terminal-notice terminal-notice-warn">
          <div className="notice-title">
            审批请求
            {approval.risk && (
              <span
                className="connection-state-badge connection-state-badge-neutral"
                style={{ marginLeft: 8 }}
              >
                {approval.risk}
                {approval.operation ? ` · ${approval.operation}` : ''}
              </span>
            )}
          </div>
          <div className="notice-detail">
            <code>{approval.commandText || '（无命令文本）'}</code>
          </div>
          {approval.resource && approval.resource !== 'unknown' && (
            <div className="notice-hint">目标：{approval.resource}</div>
          )}
          {approval.expiresAtMs && (
            <div className="notice-hint">
              过期时间 {new Date(approval.expiresAtMs).toLocaleTimeString()}
            </div>
          )}
          <div className="terminal-actions">
            <button
              type="button"
              disabled={approvalBusy}
              onClick={() => {
                setApprovalBusy(true)
                setApprovalError(null)

                void resolveApproval('allow-once')
                  .catch((err) => {
                    setApprovalError(
                      err instanceof Error ? err.message : String(err),
                    )
                  })
                  .finally(() => setApprovalBusy(false))
              }}
            >
              允许一次
            </button>
            <button
              type="button"
              disabled={approvalBusy}
              onClick={() => {
                setApprovalBusy(true)
                setApprovalError(null)

                void resolveApproval('allow-once', 30)
                  .catch((err) => {
                    setApprovalError(
                      err instanceof Error ? err.message : String(err),
                    )
                  })
                  .finally(() => setApprovalBusy(false))
              }}
            >
              允许并记住 30 分钟
            </button>
            <button
              type="button"
              disabled={approvalBusy}
              onClick={() => {
                setApprovalBusy(true)
                setApprovalError(null)

                void resolveApproval('deny')
                  .catch((err) => {
                    setApprovalError(
                      err instanceof Error ? err.message : String(err),
                    )
                  })
                  .finally(() => setApprovalBusy(false))
              }}
            >
              拒绝
            </button>
          </div>
          {approvalError && (
            <div className="notice-hint">操作失败：{approvalError}</div>
          )}
        </div>
      )}

      {lastError && (
        <div className="terminal-error">
          <div className="error-title">
            发送失败：
            {
              lastError.title
            }
          </div>

          <div className="error-detail">
            {
              lastError.detail
            }
          </div>

          {lastError.hint && (
            <div className="error-hint">
              {
                lastError.hint
              }
            </div>
          )}

          <details className="error-raw">
            <summary>
              原始错误
            </summary>

            <code>
              {
                lastError.raw
              }
            </code>
          </details>
        </div>
      )}

      <form
        className="terminal-input"
        onSubmit={
          handleSubmit
        }
      >
        <textarea
          value={input}
          onChange={(e) => {
            setInput(
              e.target.value,
            )
          }}
          onKeyDown={
            handleKeyDown
          }
          placeholder={
            unauthorized
              ? '未授权，暂时无法发送'
              : connected
                ? '输入消息，Enter 发送'
                : offline
                  ? mode ===
                    'gateway'
                    ? '网关已断开，请重启桌面端'
                    : '网关离线，当前为 Mock 对话'
                  : '等待桌宠就绪…'
          }
          disabled={
            !connected ||
            sending
          }
          rows={2}
        />

        <div className="terminal-actions">
          <button
            type="submit"
            disabled={
              !connected ||
              sending ||
              !input.trim()
            }
          >
            发送
          </button>

          <button
            type="button"
            disabled={
              !chatController ||
              !sending
            }
            onClick={() => {
              chatController?.stop()
            }}
          >
            停止
          </button>

          <button
            type="button"
            disabled={
              !chatController
            }
            onClick={() => {
              chatController?.clear()
            }}
          >
            清空
          </button>
        </div>
      </form>
    </section>
  )
}