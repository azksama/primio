import React from 'react'
import { installDiagnostics } from './diagnostics'
installDiagnostics()
import { createRoot } from 'react-dom/client'
import App from './App'
import { DesktopShell } from './desktop'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/cormorant-garamond/latin-400.css'
import './style.css'
import './neumorphic.css'
import { isAndroid } from './platform'
if (isAndroid()) {
  document.documentElement.classList.add('native-android')
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover')
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DesktopShell>
      <App />
    </DesktopShell>
  </React.StrictMode>,
)
