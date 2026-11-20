import { createContext, useContext, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { usePetRuntime } from './usePetRuntime'
import type { PetRuntime } from './usePetRuntime'

export type { ChatMessage, ChatControllerLike } from './usePetRuntime'

interface PetRuntimeContextValue extends PetRuntime {
  canvasRef: RefObject<HTMLCanvasElement>
  rootRef: RefObject<HTMLDivElement>
}

const PetRuntimeContext = createContext<PetRuntimeContextValue | null>(null)

export function PetRuntimeProvider({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const runtime = usePetRuntime(canvasRef, rootRef)

  return (
    <PetRuntimeContext.Provider value={{ canvasRef, rootRef, ...runtime }}>
      {children}
    </PetRuntimeContext.Provider>
  )
}

export function usePetRuntimeContext(): PetRuntimeContextValue {
  const ctx = useContext(PetRuntimeContext)
  if (!ctx) {
    throw new Error('usePetRuntimeContext must be used within a PetRuntimeProvider')
  }
  return ctx
}
