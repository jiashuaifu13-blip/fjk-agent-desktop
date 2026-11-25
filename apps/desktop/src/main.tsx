import { createRoot } from 'react-dom/client'
import App from './App'
import './App.css'
import './LivingWorkspace.css'
import './AnimeTheme.css'

// Note: intentionally NOT wrapped in <StrictMode>. The pet runtime is an
// imperative canvas pipeline (fetch + requestAnimationFrame + audio) whose
// effects run twice under StrictMode in dev, causing double animation.
createRoot(document.getElementById('root')!).render(<App />)
