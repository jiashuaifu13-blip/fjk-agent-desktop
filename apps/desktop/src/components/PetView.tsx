import { useEffect, useState } from 'react'
import { usePetRuntimeContext } from '../runtime/PetRuntimeContext'

export function PetView() {
  const {
    canvasRef,
    rootRef,
    petState,
    agentState,
    ready,
    error,
    petSpeech,
    petEmotion,
    approval,
    resolveApproval,
  } = usePetRuntimeContext()

  const [typed, setTyped] = useState('')
  const [approvalBusy, setApprovalBusy] = useState(false)

  useEffect(() => {
    if (!petSpeech) {
      setTyped('')
      return
    }

    let index = 0
    setTyped('')

    const timer = setInterval(() => {
      index += 1
      setTyped(petSpeech.slice(0, index))

      if (index >= petSpeech.length) {
        clearInterval(timer)
      }
    }, 30)

    return () => clearInterval(timer)
  }, [petSpeech])

  return (
    <div className="pet-stage">
      <div ref={rootRef} className="pet-root">
        <div
          className={`pet-speech pet-speech-${petEmotion}`}
          hidden={!petSpeech}
          aria-live="polite"
        >
          {typed}
        </div>

        <canvas ref={canvasRef} className="pet-canvas" />
      </div>

      {approval && (
        <div className="pet-approval" role="dialog" aria-label="审批请求">
          <div className="pet-approval-title">
            需要你的确认
            {approval.risk && (
              <span className="pet-approval-risk">
                {approval.risk}
                {approval.operation ? ` · ${approval.operation}` : ''}
              </span>
            )}
          </div>
          <div className="pet-approval-command" title={approval.commandText}>
            {approval.commandText.length > 72
              ? `${approval.commandText.slice(0, 72)}…`
              : approval.commandText}
          </div>
          <div className="pet-approval-actions">
            <button
              type="button"
              disabled={approvalBusy}
              onClick={() => {
                setApprovalBusy(true)

                void resolveApproval('allow-once').finally(() =>
                  setApprovalBusy(false),
                )
              }}
            >
              允许一次
            </button>
            <button
              type="button"
              disabled={approvalBusy}
              onClick={() => {
                setApprovalBusy(true)

                void resolveApproval('deny').finally(() =>
                  setApprovalBusy(false),
                )
              }}
            >
              拒绝
            </button>
          </div>
          <div className="pet-approval-hint">
            完整信息见左侧终端；任一处处理后此处同步消失
          </div>
        </div>
      )}

      <div className="pet-badge">
        {error ? (
          <span className="pet-badge-error">启动失败</span>
        ) : !ready ? (
          <span className="pet-badge-loading">加载中…</span>
        ) : (
          <span className="pet-badge-state">
            {agentState}
            <em>/</em>
            {petState}
          </span>
        )}
      </div>
    </div>
  )
}
