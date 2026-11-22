import {
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
  readOpenClawStatus,
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

import type {
  GatewayIssue,
} from '../gateway/GatewayError'

import {
  RuntimeLogViewer,
} from './RuntimeLogViewer'

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

  const [openclawStatus, setOpenclawStatus] =
    useState<OpenClawStatus | null>(null)

  const [openclawCheckNote, setOpenclawCheckNote] =
    useState<string | null>(null)

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
                <div>{settingsOverview.model ?? '未提供'}</div>
                <input value={modelDraft} placeholder="输入不同的已允许模型" onChange={(e) => setModelDraft(e.target.value)} />
                <button type="button" disabled={!settingsOverview.model || !modelDraft.trim()} onClick={async () => {
                  setModelWriteStatus(`原值：${settingsOverview.model ?? '未提供'}`)
                  try { await updateSessionModel(modelDraft); setModelDraft(''); setModelWriteStatus('模型修改成功；已记录原值，可回滚') }
                  catch (err) { setModelWriteStatus(`修改失败：${err instanceof Error ? err.message : String(err)}`) }
                }}>保存模型</button>
                <button type="button" disabled={!previousModel} onClick={async () => {
                  try { await rollbackSessionModel(); setModelWriteStatus('已回滚到原模型') }
                  catch (err) { setModelWriteStatus(`回滚失败：${err instanceof Error ? err.message : String(err)}`) }
                }}>回滚模型</button>
                {modelWriteStatus && <div>{modelWriteStatus}</div>}
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
        {messages.length ===
          0 && (
          <div className="terminal-empty">
            {ready
              ? '向桌宠说点什么吧。'
              : '正在启动桌宠…'}
          </div>
        )}

        {messages.map(
          (m) => (
            <div
              key={m.id}
              className={`msg msg-${m.role}`}
            >
              <div className="msg-role">
                {m.role ===
                'user'
                  ? 'You'
                  : 'Agent'}
              </div>

              <div className="msg-content">
                {m.content ||
                  '…'}
              </div>
            </div>
          ),
        )}

        {sending && (
          <div className="msg msg-assistant">
            <div className="msg-content msg-streaming">
              ▍
            </div>
          </div>
        )}
      </div>

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