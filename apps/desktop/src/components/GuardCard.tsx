import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface GuardStatus {
  exists: boolean
  path: string
  allow: number
  deny: number
  protected: number
  projectRoots: number
}

interface GuardResult {
  ok: boolean
  exec_mode: string
  allow_count: number
  deny_count: number
  protected_count: number
  backups: string[]
  message: string
}

function hasTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function GuardCard() {
  const [status, setStatus] = useState<GuardStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!hasTauri()) return

    try {
      setStatus((await invoke('guard_status')) as GuardStatus)
    } catch {
      // 忽略
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const apply = async () => {
    if (!hasTauri() || busy) return

    setBusy(true)
    setNote('正在启用审批保护…')

    try {
      const result = (await invoke('guard_apply_default')) as GuardResult
      await refresh()
      setNote(result.message)
    } catch (error) {
      setNote('启用失败：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="connection-state-row">
      <span className="connection-state-key">审批保护</span>

      <div className="connection-state-value">
        <div>
          {status?.exists
            ? '已启用 · 规则 ' + status.allow + ' / ' + status.deny + ' / ' + status.protected
            : '未启用（新机器默认不会弹审批卡）'}
        </div>

        <div className="fjk-persona-actions">
          <button type="button" className="fjk-persona-primary" disabled={busy} onClick={() => void apply()}>
            {busy ? '处理中…' : status?.exists ? '重新应用审批基线' : '一键启用审批保护'}
          </button>
        </div>

        <div className="fjk-persona-hint">
          写入只读放行、危险命令拒绝、系统目录保护，并把网关执行模式设为 ask（危险操作会弹审批卡）。
        </div>

        {note && <div className="fjk-persona-note">{note}</div>}
      </div>
    </div>
  )
}
