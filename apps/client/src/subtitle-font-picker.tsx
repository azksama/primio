import { useEffect, useState } from 'react'
import { Download, Trash2 } from './icons'
import { t } from './i18n'
import { fontsChanged, importFont, listFonts, loadFont, removeFont, selectedFontId, selectFont, type SubtitleFont } from './subtitle-fonts'

export function useSubtitleFonts() {
  const [fonts, setFonts] = useState<SubtitleFont[]>([])
  const [selected, setSelected] = useState(selectedFontId)
  useEffect(() => {
    let active = true
    const refresh = async () => {
      const items = await listFonts()
      await Promise.all(items.map(loadFont))
      if (active) { setFonts(items); setSelected(selectedFontId()) }
    }
    const update = () => { void refresh().catch(() => { if (active) { setFonts([]); setSelected('') } }) }
    update(); window.addEventListener(fontsChanged, update)
    return () => { active = false; window.removeEventListener(fontsChanged, update) }
  }, [])
  return { fonts, selected, family: fonts.some((f) => f.id === selected) ? 'primio-' + selected : undefined }
}
export function SubtitleFontImport({ selected }: { selected: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  return <div className="font-import">
    <label className="secondary file-picker">
      <Download size={18} /> {t('Importer une police')}
      <input type="file" accept=".ttf,.otf" disabled={busy} aria-label={t('Importer une police')} onChange={async (event) => {
        const input = event.currentTarget, file = input.files?.[0]
        if (!file) return
        setBusy(true); setError('')
        try { await importFont(file) } catch { setError(t('Police invalide. Choisissez un fichier TTF ou OTF de moins de 5 Mo (10 polices maximum).')) }
        finally { input.value = ''; setBusy(false) }
      }} />
    </label>
    {selected && <button className="icon" disabled={busy} aria-label={t('Supprimer la police importée')} onClick={async () => {
      setBusy(true); setError('')
      try { await removeFont(selected) } catch { setError(t('Impossible de supprimer la police.')) }
      finally { setBusy(false) }
    }}><Trash2 size={20} /></button>}
    <small>{t('TTF / OTF · 5 Mo maximum · Sur cet appareil')}</small>
    {error && <small role="alert">{error}</small>}
  </div>
}
export { selectFont }
