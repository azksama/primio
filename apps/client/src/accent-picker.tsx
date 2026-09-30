import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { Check } from './icons'
import { t } from './i18n'

export function hsvColor(h: number, s: number, v: number) {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255)
  }
  return '#' + [f(5), f(3), f(1)].map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function colorHsv(value: string) {
  const rgb = /^#[0-9a-f]{6}$/i.test(value) ? value.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255) : [1, 1, 1]
  const [r, g, b] = rgb, max = Math.max(...rgb), min = Math.min(...rgb), d = max - min
  const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s: max ? d / max : 0, v: max }
}

export function OledAccentPicker({ value = '#FFFFFF', active = true, staged = false, onChange }: { value?: string; active?: boolean; staged?: boolean; onChange: (value: string) => void }) {
  const [draft, setDraft] = useState(value), [saved, setSaved] = useState(false)
  useEffect(() => { setDraft(value); setSaved(false) }, [value])
  const change = (next: string) => { setDraft(next); setSaved(false); if (staged) onChange(next) }
  const hsv = colorHsv(draft)
  const hue = useRef(hsv.h)
  if (hsv.s > 0) hue.current = hsv.h
  const h = hsv.s ? hsv.h : hue.current
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - box.left - box.width / 2, y = event.clientY - box.top - box.height / 2
    const angle = (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360
    hue.current = angle
    change(hsvColor(angle, Math.min(1, Math.hypot(x, y) / (box.width / 2)), hsv.v || 1))
  }
  return <section className="oled-customization" aria-label={t('Personnaliser OLED')}>
    <div className="section-head"><h2>{t('Couleur secondaire OLED')}</h2>
      <button className="accent-reset" onClick={() => change('#FFFFFF')}>{t('Réinitialiser')}</button>
    </div>
    <p className="muted">{t('Choisissez une couleur, puis enregistrez pour l’appliquer aux boutons et aux icônes.')}</p>
    <div className="accent-editor">
      <div className="color-wheel" role="slider" tabIndex={0} aria-label={t('Teinte et saturation')}
        aria-valuemin={0} aria-valuemax={360} aria-valuenow={Math.round(h)} aria-valuetext={draft}
        onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); point(event) }}
        onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) point(event) }}
        onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)}
        onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const angle = (h + (event.key === 'ArrowLeft' ? -3 : event.key === 'ArrowRight' ? 3 : 0) + 360) % 360
          const s = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : Math.max(0, Math.min(1, hsv.s + (event.key === 'ArrowUp' ? .05 : event.key === 'ArrowDown' ? -.05 : 0)))
          hue.current = angle
          change(hsvColor(angle, s, hsv.v || 1))
        }}>
        <span className="color-wheel-cursor" style={{ left: `${50 + Math.sin(h * Math.PI / 180) * hsv.s * 48}%`, top: `${50 - Math.cos(h * Math.PI / 180) * hsv.s * 48}%`, background: draft } as CSSProperties} />
      </div>
      <div className="accent-settings">
        <label>{t('Luminosité')}<input type="range" min="10" max="100" value={Math.round(hsv.v * 100)} onChange={event => change(hsvColor(h, hsv.s, Number(event.target.value) / 100))} /></label>
        <label>{t('Couleur')}<input className="accent-hex" type="text" aria-label={t('Couleur hexadécimale')} key={draft} defaultValue={draft} maxLength={7} onBlur={event => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) change(event.target.value.toUpperCase()); else event.target.value = draft }} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur() }} /></label>
        <div className="accent-preview" style={{ '--preview-accent': draft } as CSSProperties}><span className="accent-preview-dot" /><span>{t('Aperçu')}</span><span className="accent-preview-track" /></div>
      </div>
    </div>
    {!staged && <div className="accent-save"><button className="primary" onClick={() => { onChange(draft); setSaved(true) }}><Check size={18} />{t('Enregistrer')}</button>
      <span className="muted" role="status">{saved || draft === value && active ? t('Couleur appliquée') : draft === value ? t('Couleur enregistrée') : t('Modifications non enregistrées')}</span>
    </div>}
  </section>
}
