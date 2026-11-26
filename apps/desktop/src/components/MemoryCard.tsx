import { useCallback, useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface MemoryStatus {
  script_path: string
  script_ready: boolean
  agents_block: boolean
  memory_md_bytes: number
  memory_md_lines: number
  daily_files: number
  archived_files: number
  warn: string | null
}

function hasTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function MemoryCard() {
  const [status, setStatus] = useState<MemoryStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!hasTauri()) return

    try {
      setStatus((await invoke('memory_status')) as MemoryStatus)
    } catch {
      // 忽略
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const setup = async () => {
    if (!hasTauri() || busy) return

    setBusy(true)
    setNote('正在初始化长期记忆…')

    try {
      const next = (await invoke('memory_setup')) as MemoryStatus
      setStatus(next)
      setNote('已初始化：写入脚本 + AGENTS 记忆规范已就绪')
    } catch (error) {
      setNote('初始化失败：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setBusy(false)
    }
  }

  const openDir = async () => {
    if (!hasTauri()) return

    try {
      await invoke('memory_open_dir')
    } catch (error) {
      setNote('打开失败：' + (error instanceof Error ? error.message : String(error)))
    }
  }

  const archive = async () => {
    if (!hasTauri() || busy) return

    setBusy(true)

    try {
      const moved = (await invoke('memory_archive_old', { days: 90 })) as number
      await refresh()
      setNote('已归档 ' + moved + ' 个 90 天前的每日笔记')
    } catch (error) {
      setNote('归档失败：' + (error instanceof Error ? error.message : String(error)))
    } finally {
      setBusy(false)
    }
  }

  const ready = status?.script_ready === true && status?.agents_block === true

  return (
    <div className="connection-state-row">
      <span className="connection-state-key">长期记忆</span>

      <div className="connection-state-value">
        <div>
          {ready
            ? '已启用 · MEMORY.md ' + status?.memory_md_lines + ' 行 · 每日笔记 ' + status?.daily_files + ' 个'
            : '未启用（缺写入脚本或 AGENTS 规范）'}
        </div>

        <div className="fjk-persona-actions">
          <button type="button" className="fjk-persona-primary" disabled={busy} onClick={() => void setup()}>
            {busy ? '处理中…' : ready ? '重新初始化' : '一键初始化记忆'}
          </button>

          <button type="button" className="fjk-persona-secondary" disabled={busy} onClick={() => void openDir()}>
            打开记忆目录
          </button>

          <button type="button" className="fjk-persona-secondary" disabled={busy} onClick={() => void archive()}>
            归档旧笔记(90天)
          </button>
        </div>

        <div className="fjk-persona-hint">
          初始化会把写入脚本释放到 bin 目录，并在 AGENTS.md 注入记忆规范（标记块，不覆盖你的内容）。
        </div>

        {status?.warn && <div className="fjk-persona-note">{status.warn}</div>}
        {note && <div className="fjk-persona-note">{note}</div>}
      </div>
    </div>
  )
}
