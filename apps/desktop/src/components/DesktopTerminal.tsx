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

  const listRef =
    useRef<HTMLDivElement>(
      null,
    )

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

    if (el) {
      el.scrollTop =
        el.scrollHeight
    }
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
              logViewerOpen
            }
            aria-controls="runtime-log-viewer"
            onClick={() => {
              setLogViewerOpen(
                (
                  current,
                ) =>
                  !current,
              )
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
              setConnectionPanelOpen(
                (
                  current,
                ) =>
                  !current,
              )
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
              当前版本尚未提供独立的一键重连接口。
              如 Gateway
              已断开，请确认
              OpenClaw Gateway
              正常运行后重启
              FJK Desktop，
              桌面端会在启动阶段重新建立连接。
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