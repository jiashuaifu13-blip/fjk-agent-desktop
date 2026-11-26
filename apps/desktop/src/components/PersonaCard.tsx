import { useCallback, useEffect, useRef, useState } from 'react'
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

interface CardPreview {
  ok: boolean
  format: string
  name: string
  summary: string
  tags: string[]
  first_mes: string
  fields: string[]
  warnings: string[]
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

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000

  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }

  return window.btoa(binary)
}

export function PersonaCard({ onApplied }: { onApplied: () => Promise<void> | void }) {
  const [status, setStatus] = useState<PersonaStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

  const applyDefault = async () => {
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

  const pickCardFile = () => {
    fileRef.current?.click()
  }

  const importCardFile = async (file: File) => {
    if (!hasTauri() || busy) return

    setBusy(true)
    setNote(`正在解析 ${file.name}…`)

    try {
      const buffer = new Uint8Array(await file.arrayBuffer())
      const dataBase64 = toBase64(buffer)

      const preview = (await invoke('persona_preview_card', {
        dataBase64,
        fileName: file.name,
      })) as CardPreview

      const lines = [
        `角色：${preview.name}`,
        `格式：${preview.format}`,
        preview.tags.length > 0 ? `标签：${preview.tags.join('、')}` : '',
        preview.summary ? `简介：${preview.summary}` : '',
        preview.first_mes ? `开场白：${preview.first_mes}` : '',
        preview.warnings.length > 0 ? `注意：${preview.warnings.join('；')}` : '',
        '',
        '导入后会覆盖当前人格（原文件自动备份），并新建会话以生效。',
        '继续吗？',
      ].filter(Boolean)

      if (!window.confirm(lines.join('\n'))) {
        setNote('已取消导入')
        setBusy(false)
        return
      }

      const result = (await invoke('persona_import_card', {
        dataBase64,
        fileName: file.name,
      })) as ImportResult

      await refresh()
      setNote(result.message + (result.backups.length > 0 ? `（已备份 ${result.backups.length} 个）` : ''))
      await onApplied()
    } catch (error) {
      setNote(`导入失败：${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="connection-state-row">
      <span className="connection-state-key">人格卡</span>

      <div className="connection-state-value">
        <div>
          {status?.installed
            ? `已导入 · ${
                status.version === 'imported' ? '外部卡' : `v${status.version ?? '?'}`
              } · ${formatTime(status.applied_at)}`
            : '尚未导入（新机器默认没有人格）'}
        </div>

        <div className="fjk-persona-actions">
          <button type="button" className="fjk-persona-primary" disabled={busy} onClick={() => void applyDefault()}>
            {busy ? '处理中…' : status?.installed ? '重新导入默认人格' : '一键导入默认人格'}
          </button>

          <button type="button" className="fjk-persona-secondary" disabled={busy} onClick={pickCardFile}>
            导入人格卡（.png / .json）
          </button>

          <input
            ref={fileRef}
            type="file"
            accept=".png,.json,.txt,.md,application/json,image/png,text/plain,text/markdown"
            style={{ display: 'none' }}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importCardFile(file)
            }}
          />
        </div>

        <div className="fjk-persona-hint">
          支持 Character Card V2/V3（PNG 内嵌 / JSON）与纯文本提示词（.txt / .md）。导入后会归档当前对话并新建会话，让人格立刻生效；原文件自动备份。
        </div>

        {note && <div className="fjk-persona-note">{note}</div>}
      </div>
    </div>
  )
}
