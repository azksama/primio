import { api } from './platform'
import { version } from '../package.json'
export function redactDiagnostic(value: string) {
  return value
    .slice(0, 32768)
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[URL]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[EMAIL]')
    .replace(/\b(Bearer|Basic)\s+[^\s"']+/gi, '$1 [REDACTED]')
    .replace(
      /((?:access.?token|refresh.?token|token|password|secret|api.?key|auth.?key)["']?\s*[=:]\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;}]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/(?:[A-Z]:\\|\/data\/|\/storage\/|\/home\/|\/Users\/)[^\s"']+/g, '[PATH]')
}
export type Diagnostic = { id: string; time: number; kind: string; detail: string }
const key = 'primio-diagnostics-v1'
export function diagnostics(): Diagnostic[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]').slice(-20)
  } catch {
    return []
  }
}
export function recordDiagnostic(kind: string, error: unknown) {
  try {
    const detail = redactDiagnostic(
      error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack ?? ''}`
        : String(error),
    )
    localStorage.setItem(
      key,
      JSON.stringify(
        [
          ...diagnostics(),
          { id: crypto.randomUUID(), time: Date.now(), kind: kind.slice(0, 40), detail },
        ].slice(-20),
      ),
    )
  } catch {}
}
export function clearDiagnostics() {
  localStorage.removeItem(key)
}
export function installDiagnostics() {
  window.addEventListener('error', (e) => recordDiagnostic('javascript', e.error ?? e.message))
  window.addEventListener('unhandledrejection', (e) => recordDiagnostic('promise', e.reason))
}
export async function sendDiagnostics(token: string, detail: string) {
  return api<{ id: string }>(
    '/account/diagnostics',
    'POST',
    {
      version,
      platform: /Android/i.test(navigator.userAgent) ? 'android' : 'windows',
      detail: redactDiagnostic(detail),
    },
    token,
  )
}
