import { PetRuntimeProvider } from './runtime/PetRuntimeContext'
import { PetView } from './components/PetView'
import { DesktopTerminal } from './components/DesktopTerminal'
import './App.css'

export default function App() {
  return (
    <PetRuntimeProvider>
      <div className="app">
        <main className="app-terminal">
          <DesktopTerminal />
        </main>
        <PetView />
      </div>
    </PetRuntimeProvider>
  )
}
