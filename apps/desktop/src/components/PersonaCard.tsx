import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface PersonaStatus {
  installed: boolean
  version: string | null
  applied_at: number | null
  source: string | null
  workspace: string
  message: string
}

interface ImportResult {
  ok: boolean
  version: string
  applied: string[]
  backups: string[]
  message: string
}

function hasTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function formatTime(ms: number | null): string {
  if (!ms) return '—'
  try {
    return new Date(ms).toLocaleString('zh-CN')
  } catch {
    return '—'
  }
}

export function PersonaCard({ onApplied }: { onApplied: () => Promise<void> | void }) {
  const [status, setStatus] = useState<PersonaStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!hasTauri()) return

    try {
      const next = (await invoke('persona_status')) as PersonaStatus
      setStatus(next)
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
    setNote('正在导入默认人格…')

    try {
      const result = (await invoke('persona_import_default')) as ImportResult

      await refresh()

      setNote(
        `${result.message}（已写入：${result.applied.join('、')}）` +
          (result.backups.length > 0 ? `；备份 ${result.backups.length} 个` : ''),
      )

      await onApplied()
    } catch (error) {
      setNote(`导入失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="connection-state-row">
      <span className="connection-state-key">人格卡</span>

      <div className="connection-state-value">
        <div>
          {status?.installed
            ? `已导入 · v${status.version ?? '?'} · ${formatTime(status.applied_at)}`
            : '尚未导入（新机器默认没有人格）'}
        </div>

        <div className="fjk-persona-actions">
          <button type="button" className="fjk-persona-primary" disabled={busy} onClick={() => void apply()}>
            {busy ? '导入中…' : status?.installed ? '重新导入默认人格' : '一键导入默认人格'}
          </button>

          <span className="fjk-persona-hint">
            导入后会归档当前对话并新建会话，让人格立刻生效；原文件自动备份。
          </span>
        </div>

        {note && <div className="fjk-persona-note">{note}</div>}
      </div>
    </div>
  )
}
