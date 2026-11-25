import { useCallback, useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'

interface RepairStep {
  id: string
  label: string
  status: string
  detail: string | null
  elapsed_ms: number | null
}

interface RepairSnapshot {
  running: boolean
  finished: boolean
  ok: boolean
  needs_install: boolean
  steps: RepairStep[]
  message: string
}

function hasTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

const ICON: Record<string, string> = {
  pending: '○',
  running: '◐',
  done: '✔',
  failed: '✘',
}

export function ConnectionRepair() {
  const [snapshot, setSnapshot] = useState<RepairSnapshot | null>(null)
  const [starting, setStarting] = useState(false)
  const timer = useRef<number | null>(null)

  const stopPolling = useCallback(() => {
    if (timer.current) {
      window.clearInterval(timer.current)
      timer.current = null
    }
  }, [])

  useEffect(() => stopPolling, [stopPolling])

  const poll = useCallback(async () => {
    try {
      const next = (await invoke('gateway_repair_status')) as RepairSnapshot
      setSnapshot(next)

      if (next.finished) {
        stopPolling()
        setStarting(false)
      }
    } catch {
      // 单次失败忽略
    }
  }, [stopPolling])

  const start = async () => {
    if (!hasTauri()) return

    setStarting(true)
    stopPolling()

    try {
      await invoke('gateway_repair')
    } catch (error) {
      setStarting(false)
      setSnapshot({
        running: false,
        finished: true,
        ok: false,
        needs_install: false,
        steps: [],
        message: error instanceof Error ? error.message : String(error),
      })
      return
    }

    void poll()
    timer.current = window.setInterval(() => {
      void poll()
    }, 600)
  }

  const installWizard = () => {
    window.dispatchEvent(new Event('fjk-open-setup'))
  }

  const steps = snapshot?.steps ?? []
  const running = starting || snapshot?.running === true
  const failed = snapshot?.finished === true && snapshot?.ok !== true

  return (
    <div className="fjk-repair">
      <div className="fjk-repair-head">
        <div>
          <strong>一键修复连接</strong>
          <small>自动查找并启动网关，不需要你懂命令行</small>
        </div>

        <button
          type="button"
          className="fjk-repair-btn"
          onClick={() => void start()}
          disabled={running}
        >
          {running ? '修复中…' : failed || snapshot ? '再试一次' : '一键修复连接'}
        </button>
      </div>

      {steps.length > 0 && (
        <ul className="fjk-repair-steps">
          {steps.map((step) => (
            <li key={step.id} className={`is-${step.status}`}>
              <span className="fjk-repair-icon" aria-hidden="true">
                {ICON[step.status] ?? '○'}
              </span>

              <span className="fjk-repair-label">{step.label}</span>

              {step.detail && <span className="fjk-repair-detail">{step.detail}</span>}

              {typeof step.elapsed_ms === 'number' && step.status === 'done' && (
                <span className="fjk-repair-time">{(step.elapsed_ms / 1000).toFixed(1)}s</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {snapshot?.message && (
        <div className={`fjk-repair-message${failed ? ' is-warn' : ''}`}>{snapshot.message}</div>
      )}

      {snapshot?.needs_install && (
        <button type="button" className="fjk-repair-secondary" onClick={installWizard}>
          打开安装向导
        </button>
      )}
    </div>
  )
}
