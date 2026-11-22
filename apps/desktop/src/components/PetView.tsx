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
  } = usePetRuntimeContext()

  const [typed, setTyped] = useState('')

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
