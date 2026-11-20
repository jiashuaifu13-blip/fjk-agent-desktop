import { useEffect, useRef, useState } from 'react'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { usePetRuntimeContext } from '../runtime/PetRuntimeContext'
import type { ChatMessage } from '../runtime/PetRuntimeContext'

export function DesktopTerminal() {
  const { chatController, sending, agentState, ready, error } = usePetRuntimeContext()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
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

  const connected = Boolean(chatController) && ready && !error

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!chatController || sending) return
    const text = input.trim()
    if (!text) return
    setInput('')
    try {
      await chatController.send(text)
    } catch (err) {
      console.error('[FJK] send failed:', err)
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
          <span className="terminal-mode">Mock 模式</span>
          <span className="terminal-agent">agent: {agentState}</span>
        </div>
      </header>

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

      <form className="terminal-input" onSubmit={handleSubmit}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={connected ? '输入消息，Enter 发送' : '等待桌宠就绪…'}
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
