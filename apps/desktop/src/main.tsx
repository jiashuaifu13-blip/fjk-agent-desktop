import { createRoot } from 'react-dom/client'
import App from './App'
import './App.css'
import './LivingWorkspace.css'
import './AnimeTheme.css'
import './AnimeP1.css'
import './AnimeP2.css'
import './AnimeP3.css'

// Note: intentionally NOT wrapped in <StrictMode>. The pet runtime is an
// imperative canvas pipeline (fetch + requestAnimationFrame + audio) whose
// effects run twice under StrictMode in dev, causing double animation.
createRoot(document.getElementById('root')!).render(<App />)
