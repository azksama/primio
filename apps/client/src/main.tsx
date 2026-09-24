import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { DesktopShell } from './desktop'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/cormorant-garamond/latin-400.css'
import './style.css'
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesktopShell>
      <App />
    </DesktopShell>
  </React.StrictMode>,
)
