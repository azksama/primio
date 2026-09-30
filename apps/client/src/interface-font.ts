import { useEffect } from 'react'
import { bundledFontFamily, loadBundledFont } from './bundled-fonts'
import { fontsChanged, listFonts, loadFont, selectedInterfaceFontId } from './subtitle-fonts'

export function useInterfaceFont(font?: string) {
  useEffect(() => {
    let active = true,
      revision = 0
    const refresh = async () => {
      const current = ++revision
      const id = selectedInterfaceFontId()
      let family: string | undefined
      if (id) {
        const custom = (await listFonts()).find((f) => f.id === id)
        if (custom) family = `"${await loadFont(custom)}", sans-serif`
      }
      if (!family && font) {
        await loadBundledFont(font)
        family = bundledFontFamily(font)
      }
      if (!active || current !== revision) return
      family
        ? document.documentElement.style.setProperty('--user-font', family)
        : document.documentElement.style.removeProperty('--user-font')
    }
    const update = () => {
      void refresh().catch(() => {
        if (active) document.documentElement.style.removeProperty('--user-font')
      })
    }
    update()
    window.addEventListener(fontsChanged, update)
    return () => {
      active = false
      window.removeEventListener(fontsChanged, update)
    }
  }, [font])
}
