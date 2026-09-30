import { Choice } from './components'
import { bundledFonts, bundledFontFamily } from './bundled-fonts'
import { SubtitleFontImport, useSubtitleFonts } from './subtitle-font-picker'
import { selectedInterfaceFontId, selectInterfaceFont } from './subtitle-fonts'
import { t } from './i18n'
import type { Settings } from './types'

export function InterfaceFonts({
  settings,
  onChange,
}: {
  settings: Settings
  onChange: (font: Settings['interfaceFont']) => void
}) {
  const imported = useSubtitleFonts(),
    selected = selectedInterfaceFontId()
  const custom = imported.fonts.find((f) => f.id === selected)
  return (
    <section className="interface-font-settings">
      <Choice
        floating
        label={t('Police de l’interface')}
        value={custom?.id ?? settings.interfaceFont ?? 'inter'}
        options={[
          ...bundledFonts.map((f) => [f.id, f.name] as [string, string]),
          ...imported.fonts.map((f) => [f.id, f.family] as [string, string]),
        ]}
        onChange={(id) => {
          const local = imported.fonts.some((f) => f.id === id)
          selectInterfaceFont(local ? id : '')
          if (!local) onChange(id as Settings['interfaceFont'])
        }}
      />
      <div
        className="interface-font-preview"
        style={{
          fontFamily: custom ? `primio-${custom.id}` : bundledFontFamily(settings.interfaceFont),
        }}
      >
        <strong>{t('Votre prochaine découverte')}</strong>
        <span>{t('Films, séries et animes. À votre rythme.')}</span>
        <small>Primio · Aa Bb Cc · 0123456789</small>
      </div>
      <SubtitleFontImport selected={custom?.id ?? ''} target="interface" />
    </section>
  )
}
