import type { PrimioPlugin, PrimioTheme } from '@primio/sdk'

export type ResolvedTheme = Required<PrimioTheme>

const graphite: ResolvedTheme = {
  background: '#101110', surface: '#1D1E1C', accent: '#DAD4C5',
  text: '#F3F1EB', muted: '#B7B8B1', border: '#454641',
  radius: 16, glassOpacity: 0.78, font: 'Inter',
  material: 'glass', colorScheme: 'dark', shadowLight: '#383B40', shadowDark: '#17191D',
}

function selectedTheme(plugins: readonly PrimioPlugin[]) {
  return plugins.filter(p => p.enabled !== false && p.permissions.includes('theme') && p.theme).at(-1)?.theme
}

export function resolveTheme(plugins: readonly PrimioPlugin[]): ResolvedTheme {
  const theme = selectedTheme(plugins)
  return {
    ...graphite,
    ...(theme?.colorScheme === 'light' ? { shadowLight: '#FFFFFF', shadowDark: '#B6B6B2' } : {}),
    ...theme,
  }
}

export function applyTheme(plugins: readonly PrimioPlugin[]) {
  const theme = resolveTheme(plugins)
  const root = document.documentElement
  for (const key of ['background', 'surface', 'accent', 'text', 'muted'] as const)
    root.style.setProperty('--' + key, theme[key])
  root.style.setProperty('--line', selectedTheme(plugins)?.border ?? '#ffffff24')
  root.style.setProperty('--plugin-radius', theme.radius + 'px')
  root.style.setProperty('--plugin-glass', String(theme.glassOpacity))
  root.style.setProperty('--plugin-font', theme.font === 'serif' ? 'Georgia, serif' : theme.font === 'monospace' ? 'monospace' : 'Inter, Arial, sans-serif')
  root.style.setProperty('--shadow-light', theme.shadowLight)
  root.style.setProperty('--shadow-dark', theme.shadowDark)
  root.style.colorScheme = theme.colorScheme
  root.dataset.material = theme.material
  root.dataset.colorScheme = theme.colorScheme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.background)
  return theme
}
