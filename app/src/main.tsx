import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { listenForNotificationClicks } from './lib/notifications'
import { initTheme } from './lib/theme'

initTheme()
listenForNotificationClicks()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
