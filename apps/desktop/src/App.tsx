import { useEffect, useState } from 'react'
import { PetRuntimeProvider } from './runtime/PetRuntimeContext'
import { PetView } from './components/PetView'
import { DesktopTerminal } from './components/DesktopTerminal'
import { SetupWizard } from './components/SetupWizard'
import { StyleLab } from './components/StyleLab'
import { PerfHud } from './components/PerfHud'
import { isSetupCompleted } from './system/setupState'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import './App.css'

export default function App() {
  const [showWizard, setShowWizard] = useState(() => !isSetupCompleted())
  const [showLab, setShowLab] = useState(false)

  useEffect(() => {
    const open = () => setShowLab(true)
    window.addEventListener('fjk-open-style-lab', open)
    return () => window.removeEventListener('fjk-open-style-lab', open)
  }, [])

  return (
    <PetRuntimeProvider>
      <div className="app fjk-workspace">
        <WorkspaceSidebar />
        <main className="app-terminal fjk-main-workspace" aria-label="Agent 工作区">
          <DesktopTerminal />
        </main>
        <PetView />
        {showWizard && <SetupWizard onDone={() => setShowWizard(false)} />}
        {showLab && <StyleLab onClose={() => setShowLab(false)} />}
        <PerfHud />
      </div>
    </PetRuntimeProvider>
  )
}
