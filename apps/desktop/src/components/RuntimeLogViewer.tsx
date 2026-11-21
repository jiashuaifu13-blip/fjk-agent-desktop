import { useEffect, useRef } from 'react'

import { usePetRuntimeContext } from '../runtime/PetRuntimeContext'

interface RuntimeLogViewerProps {
  open: boolean
  onClose(): void
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(
    undefined,
    {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    },
  )
}

export function RuntimeLogViewer({
  open,
  onClose,
}: RuntimeLogViewerProps) {
  const {
    runtimeLogs,
    clearRuntimeLogs,
  } = usePetRuntimeContext()

  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    const body = bodyRef.current

    if (body) {
      body.scrollTop = body.scrollHeight
    }
  }, [open, runtimeLogs])

  if (!open) {
    return null
  }

  return (
    <section
      className="runtime-log-viewer"
      aria-label="运行日志"
    >
      <header className="runtime-log-header">
        <div>
          <div className="runtime-log-title">
            Log Viewer
          </div>

          <div className="runtime-log-subtitle">
            最近 {runtimeLogs.length} 条运行事件
          </div>
        </div>

        <div className="runtime-log-actions">
          <button
            type="button"
            disabled={runtimeLogs.length === 0}
            onClick={clearRuntimeLogs}
          >
            清空
          </button>

          <button
            type="button"
            onClick={onClose}
          >
            关闭
          </button>
        </div>
      </header>

      <div
        ref={bodyRef}
        className="runtime-log-body"
      >
        {runtimeLogs.length === 0 ? (
          <div className="runtime-log-empty">
            暂无运行日志
          </div>
        ) : (
          runtimeLogs.map((entry) => (
            <article
              key={entry.id}
              className={`runtime-log-entry runtime-log-entry-${entry.level}`}
            >
              <div className="runtime-log-meta">
                <time
                  className="runtime-log-time"
                  dateTime={new Date(
                    entry.timestamp,
                  ).toISOString()}
                >
                  {formatTime(entry.timestamp)}
                </time>

                <span
                  className={`runtime-log-level runtime-log-level-${entry.level}`}
                >
                  {entry.level.toUpperCase()}
                </span>

                <span className="runtime-log-source">
                  {entry.source}
                </span>
              </div>

              <div className="runtime-log-message">
                {entry.message}
              </div>

              {entry.detail && (
                <pre className="runtime-log-detail">
                  {entry.detail}
                </pre>
              )}
            </article>
          ))
        )}
      </div>

      <footer className="runtime-log-footer">
        仅显示 FJK Desktop
        当前进程记录的最近 200 条事件；
        重启应用后清空。
      </footer>
    </section>
  )
}