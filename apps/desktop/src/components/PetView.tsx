import { usePetRuntimeContext } from '../runtime/PetRuntimeContext'

export function PetView() {
  const { canvasRef, rootRef, petState, agentState, ready, error } = usePetRuntimeContext()

  return (
    <div className="pet-stage">
      <div ref={rootRef} className="pet-root">
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
