import inter from './assets/fonts/inter.ttf?url'
import manrope from './assets/fonts/manrope.ttf?url'
import nunito from './assets/fonts/nunito.ttf?url'
import lora from './assets/fonts/lora.ttf?url'
import jetbrains from './assets/fonts/jetbrains.ttf?url'

export const bundledFonts = [
  { id: 'inter', name: 'Inter', family: 'Inter', url: inter },
  { id: 'manrope', name: 'Manrope', family: 'Manrope', url: manrope },
  { id: 'nunito', name: 'Nunito Sans', family: 'Nunito Sans', url: nunito },
  { id: 'lora', name: 'Lora', family: 'Lora', url: lora },
  { id: 'jetbrains', name: 'JetBrains Mono', family: 'JetBrains Mono', url: jetbrains },
] as const
export function bundledFontId(value?: string) {
  return value === 'serif'
    ? 'lora'
    : value === 'monospace'
      ? 'jetbrains'
      : bundledFonts.some((f) => f.id === value)
        ? value!
        : 'inter'
}
export const bundledFontFamily = (id?: string) => {
  const font = bundledFonts.find((f) => f.id === bundledFontId(id))!
  return `"${font.family}", ${font.id === 'lora' ? 'serif' : font.id === 'jetbrains' ? 'monospace' : 'sans-serif'}`
}
export async function loadBundledFont(id?: string) {
  const font = bundledFonts.find((f) => f.id === bundledFontId(id))!
  if (font.id === 'inter') return
  await document.fonts.load(`400 16px "${font.family}"`)
}
