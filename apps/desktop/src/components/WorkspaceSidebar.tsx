import { useEffect, useState } from 'react'
import { usePetRuntimeContext } from '../runtime/PetRuntimeContext'

export type WorkspacePanel = 'session' | 'settings' | 'log' | 'connection'

export const WORKSPACE_PANEL_EVENT = 'fjk:workspace:open-panel'
export const WORKSPACE_QUICK_PROMPT_EVENT = 'fjk:workspace:quick-prompt'

export function openWorkspacePanel(panel: WorkspacePanel) {
  window.dispatchEvent(new CustomEvent<WorkspacePanel>(WORKSPACE_PANEL_EVENT, { detail: panel }))
}

function displaySessionName(key: string, isMain: boolean): string {
  if (isMain) return '主会话'
  const tail = key.split(':').filter(Boolean).slice(-1)[0] ?? key
  // No real session title exists in the observed runtime contract.
  // Show a neutral short identifier rather than pretending it is an AI-generated title.
  return `会话 · ${tail.slice(0, 8)}`
}

export function WorkspaceSidebar() {
  const { sessionList, settingsOverview, refreshSessions, createSession, switchSession,
    sending, mode, gatewayStatus, agentState } = usePetRuntimeContext()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void refreshSessions().catch(() => undefined)
    // refreshSessions 由 runtime 每次渲染重建，依赖它会造成请求风暴；只在挂载时同步一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connected = mode === 'gateway' && gatewayStatus.state === 'connected'
  const current = settingsOverview.sessionKey

  return (
    <aside className="fjk-sidebar" aria-label="FJK 工作区导航">
      <div className="fjk-brand">
        <div className="fjk-brand-mark" aria-hidden="true">✧</div>
        <div><strong>FJK Agent</strong><small>DESKTOP AI WORKSPACE</small></div>
      </div>

      <nav className="fjk-primary-nav" aria-label="主要功能">
        <button className="fjk-nav-item is-current" type="button" onClick={() => openWorkspacePanel('session')}>
          <span aria-hidden="true">◫</span> 会话
        </button>
        <button className="fjk-nav-item" type="button" onClick={() => openWorkspacePanel('settings')}>
          <span aria-hidden="true">⚙</span> 设置
        </button>
        <button className="fjk-nav-item" type="button" onClick={() => openWorkspacePanel('log')}>
          <span aria-hidden="true">≡</span> 日志
        </button>
        <button className="fjk-nav-item" type="button" onClick={() => openWorkspacePanel('connection')}>
          <span aria-hidden="true">⌁</span> 连接
        </button>
      </nav>

      <div className="fjk-session-heading">
        <div>会话列表 <span className="fjk-session-count">{sessionList.length}</span></div>
        <button type="button" className="fjk-icon-action" aria-label="新建会话" title="新建会话"
          disabled={!connected || sending}
          onClick={() => { setError(null); void createSession().catch(err => setError(String(err))) }}>＋</button>
      </div>
      <div className="fjk-session-list" aria-label="最近会话">
        {sessionList.length === 0 && <p className="fjk-sidebar-empty">暂无会话，点击上方 + 新建</p>}
        {sessionList.map((session) => {
          const active = session.key === current
          return <button key={session.key} type="button"
            className={`fjk-session-item${active ? ' is-active' : ''}`}
            title={session.key} aria-current={active ? 'page' : undefined}
            disabled={sending || active}
            onClick={() => { setError(null); void switchSession(session.key).catch(err => setError(String(err))) }}>
            <span className="fjk-session-icon" aria-hidden="true">▢</span>
            <span className="fjk-session-copy">
              <strong>{displaySessionName(session.key, session.isMain)}</strong>
              <small>{session.hasActiveRun ? '运行中' : session.updatedAt == null ? '暂无更新时间' : new Date(session.updatedAt).toLocaleString('zh-CN')}</small>
            </span>
            {active && <span className="fjk-active-pip" aria-hidden="true" />}
          </button>
        })}
        {error && <p className="fjk-sidebar-error" role="alert">{error}</p>}
      </div>

      <button className="fjk-sidebar-connection" type="button" onClick={() => openWorkspacePanel('connection')}>
        <span className={`fjk-connection-dot${connected ? ' is-online' : ''}`} aria-hidden="true" />
        <span>Gateway · {gatewayStatus.state === 'connected' ? '已连接' : gatewayStatus.state === 'connecting' ? '连接中' : gatewayStatus.state === 'unauthorized' ? '未授权' : gatewayStatus.state === 'offline' ? '离线' : gatewayStatus.state}</span>
        <span className="fjk-connection-arrow" aria-hidden="true">›</span>
      </button>
      <span className="fjk-sidebar-agent-sr" aria-live="polite">Agent 状态：{agentState}</span>
    </aside>
  )
}
