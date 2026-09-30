import type { PrimioPlugin, PrimioTheme } from '@primio/sdk'

export type ResolvedTheme = Required<PrimioTheme>

const graphite: ResolvedTheme = {
  background: '#101110', surface: '#1D1E1C', accent: '#DAD4C5',
  text: '#F3F1EB', muted: '#B7B8B1', border: '#454641',
  radius: 16, glassOpacity: 0.78, font: 'Inter',
  material: 'glass', colorScheme: 'dark', shadowLight: '#383B40', shadowDark: '#17191D',
}

export function readableAccent(accent: string, surface: string) {
  const channels = (color: string) => color.slice(1).match(/../g)!.map(v => parseInt(v, 16))
  const luminance = (rgb: number[]) => {
    const linear = rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
  }
  const rgb = channels(accent), background = luminance(channels(surface))
  for (let step = 0; step <= 20; step++) {
    const candidate = rgb.map(v => Math.round(v + (255 - v) * step / 20)), foreground = luminance(candidate)
    if ((Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) >= 5.5)
      return '#' + candidate.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase()
  }
  return '#FFFFFF'
}

function selectedPlugin(plugins: readonly PrimioPlugin[]) {
  return plugins.filter(p => p.enabled !== false && p.permissions.includes('theme') && p.theme).at(-1)
}

export function resolveTheme(plugins: readonly PrimioPlugin[], oledAccent?: string): ResolvedTheme {
  const selected = selectedPlugin(plugins), theme = selected?.theme
  const oled = selected?.id === 'primio.oled'
  const accent = oled && /^#[0-9a-f]{6}$/i.test(oledAccent ?? '') ? oledAccent! : undefined
  return {
    ...graphite,
    ...(theme?.colorScheme === 'light' ? { shadowLight: '#FFFFFF', shadowDark: '#B6B6B2' } : {}),
    ...theme,
    ...(accent ? { accent, border: accent } : {}),
  }
}

export function applyTheme(plugins: readonly PrimioPlugin[], oledAccent?: string) {
  const theme = resolveTheme(plugins, oledAccent)
  const root = document.documentElement
  for (const key of ['background', 'surface', 'accent', 'text', 'muted'] as const)
    root.style.setProperty('--' + key, theme[key])
  const rgb = theme.accent.slice(1).match(/../g)!.map(v => parseInt(v, 16))
  root.style.setProperty('--accent-rgb', rgb.join(' '))
  root.style.setProperty('--accent-ui', selectedPlugin(plugins)?.id === 'primio.oled' ? readableAccent(theme.accent, theme.surface) : theme.accent)
  const linear = rgb.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
  root.style.setProperty('--accent-ink', luminance > .179 ? '#101110' : '#FFFFFF')
  root.style.setProperty('--line', selectedPlugin(plugins)?.id === 'primio.oled' ? `rgb(${rgb.join(' ')} / .32)` : selectedPlugin(plugins)?.theme?.border ?? '#ffffff24')
  root.style.setProperty('--plugin-radius', theme.radius + 'px')
  root.style.setProperty('--plugin-glass', String(theme.glassOpacity))
  root.style.setProperty('--plugin-font', theme.font === 'serif' ? 'Georgia, serif' : theme.font === 'monospace' ? 'monospace' : 'Inter, Arial, sans-serif')
  root.style.setProperty('--shadow-light', theme.shadowLight)
  root.style.setProperty('--shadow-dark', theme.shadowDark)
  root.style.colorScheme = theme.colorScheme
  root.dataset.material = theme.material
  root.dataset.colorScheme = theme.colorScheme
  root.dataset.theme = selectedPlugin(plugins)?.id ?? 'primio.graphite'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme.background)
  return theme
}
