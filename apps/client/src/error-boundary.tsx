import { Component, type ErrorInfo, type ReactNode } from 'react'
import { recordDiagnostic } from './diagnostics'
import { t } from './i18n'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error, info: ErrorInfo) {
    recordDiagnostic('crash', `${error.name}\n${error.stack ?? ''}\n${info.componentStack ?? ''}`)
  }
  render() {
    if (!this.state.failed) return this.props.children
    return <main className="recovery-screen"><h1>{t('Primio a rencontré un problème')}</h1>
      <p>{t('Relancez l’interface pour retrouver votre bibliothèque.')}</p>
      <button className="primary" onClick={() => window.location.reload()}>{t('Relancer')}</button></main>
  }
}
