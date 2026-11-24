import { PetRuntimeProvider } from './runtime/PetRuntimeContext'
import { PetView } from './components/PetView'
import { DesktopTerminal } from './components/DesktopTerminal'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import './App.css'

export default function App() {
  return (
    <PetRuntimeProvider>
      <div className="app fjk-workspace">
        <WorkspaceSidebar />
        <main className="app-terminal fjk-main-workspace" aria-label="Agent 工作区">
          <DesktopTerminal />
        </main>
        <PetView />
      </div>
    </PetRuntimeProvider>
  )
}
