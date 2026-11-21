import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { usePetRuntimeContext } from '../runtime/PetRuntimeContext'
import type { ChatMessage } from '../runtime/PetRuntimeContext'
import { toGatewayIssue } from '../gateway/GatewayError'
import type { GatewayIssue } from '../gateway/GatewayError'

export function DesktopTerminal() {
  const { approval, resolveApproval, chatController, sending, agentState, ready, error, mode, gatewayStatus } =
    usePetRuntimeContext()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [lastError, setLastError] = useState<GatewayIssue | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chatController) return

    chatController.onMessageChange = (next: ChatMessage[]) => {
      setMessages([...next])
    }

    return () => {
      chatController.onMessageChange = null
    }
  }, [chatController])

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  const unauthorized = gatewayStatus.state === 'unauthorized'
  const offline = agentState === 'offline'
  const connected = Boolean(chatController) && ready && !error && !unauthorized && !offline

  const modeLabel = unauthorized
    ? 'Gateway · 未授权'
    : offline
      ? mode === 'gateway'
        ? 'Gateway · 离线'
        : '离线 · Mock'
      : mode === 'gateway'
        ? 'Gateway'
        : 'Mock 模式'

  const modeTone = unauthorized || offline ? 'warn' : mode === 'gateway' ? 'ok' : undefined

  const noticeTitle =
    offline && gatewayStatus.state !== 'offline'
      ? '网关连接已断开'
      : gatewayStatus.title

  const noticeDetail =
    offline && gatewayStatus.state !== 'offline'
      ? '桌面端不会自动重连，请重启应用。'
      : gatewayStatus.detail

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!chatController || sending) return

    const text = input.trim()
    if (!text) return

    setInput('')
    setLastError(null)

    try {
      await chatController.send(text)
    } catch (err) {
      console.error('[FJK] send failed:', err)
      setLastError(toGatewayIssue(err))
    }
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!sending) {
        e.currentTarget.form?.requestSubmit()
      }
    }
  }

  return (
    <section className="terminal">
      <header className="terminal-header">
        <div className="terminal-title">
          <span className="terminal-dot" data-state={agentState} />
          FJK Agent Terminal
        </div>

        <div className="terminal-meta">
          <span className={`terminal-mode${modeTone ? ` terminal-mode-${modeTone}` : ''}`}>
            {modeLabel}
          </span>
          <span className="terminal-agent">agent: {agentState}</span>
        </div>
      </header>

      {(unauthorized || offline) && (
        <div className={`terminal-notice terminal-notice-${unauthorized ? 'warn' : 'info'}`}>
          <div className="notice-title">{noticeTitle}</div>
          <div className="notice-detail">{noticeDetail}</div>
          {gatewayStatus.hint && <div className="notice-hint">{gatewayStatus.hint}</div>}
        </div>
      )}

      {approval && <div className="terminal-notice terminal-notice-warn"><div className="notice-title">审批请求</div><div className="notice-detail"><code>{approval.commandText}</code></div>{approval.expiresAtMs && <div className="notice-hint">过期 {new Date(approval.expiresAtMs).toLocaleTimeString()}</div>}<div className="terminal-actions"><button type="button" onClick={() => void resolveApproval('allow-once')}>允许</button><button type="button" onClick={() => void resolveApproval('deny')}>拒绝</button></div></div>}
      <div ref={listRef} className="terminal-messages">
        {messages.length === 0 && (
          <div className="terminal-empty">
            {ready ? '向桌宠说点什么吧。' : '正在启动桌宠…'}
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`msg msg-${m.role}`}>
            <div className="msg-role">{m.role === 'user' ? 'You' : 'Agent'}</div>
            <div className="msg-content">{m.content || '…'}</div>
          </div>
        ))}

        {sending && (
          <div className="msg msg-assistant">
            <div className="msg-content msg-streaming">▍</div>
          </div>
        )}
      </div>

      {lastError && (
        <div className="terminal-error">
          <div className="error-title">发送失败：{lastError.title}</div>
          <div className="error-detail">{lastError.detail}</div>
          {lastError.hint && <div className="error-hint">{lastError.hint}</div>}
          <details className="error-raw">
            <summary>原始错误</summary>
            <code>{lastError.raw}</code>
          </details>
        </div>
      )}

      <form className="terminal-input" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            unauthorized
              ? '未授权，暂时无法发送'
              : connected
                ? '输入消息，Enter 发送'
                : offline
                  ? mode === 'gateway'
                    ? '网关已断开，请重启桌面端'
                    : '网关离线，当前为 Mock 对话'
                  : '等待桌宠就绪…'
          }
          disabled={!connected || sending}
          rows={2}
        />

        <div className="terminal-actions">
          <button type="submit" disabled={!connected || sending || !input.trim()}>
            发送
          </button>
          <button type="button" disabled={!chatController || !sending} onClick={() => chatController?.stop()}>
            停止
          </button>
          <button type="button" disabled={!chatController} onClick={() => chatController?.clear()}>
            清空
          </button>
        </div>
      </form>
    </section>
  )
}

