import { cleanDescription } from './content'
import { DialogShell } from './dialog-shell'
import { isDesktop } from './platform'
import { t, locale, appLanguages, languageName } from './i18n'
import { ProgressiveList } from './progressive'
import { findProgress, isWatched } from './progress'
import { MediaImage } from './media-image'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import {
  Check,
  ChevronDown,
  Puzzle,
  Play,
  Plus,
  Trash2,
  Pencil,
  UserRound,
  Info,
  X,
} from 'lucide-react'
import type { Meta, UserState, Settings, Progress } from './types'
import {
  languages,
  profileColors,
  avatars,
  avatarUrl,
  freeAvatar,
  seasons,
  switchProfile,
  snapshotState,
  defaults,
} from './preferences'

export function AddonIcon({ logo }: { logo?: string }) {
  const [failed, setFailed] = useState(false)
  const safe = logo && /^https:\/\//i.test(logo)
  return (
    <span className="addon-icon">
      {safe && !failed ? (
        <img
          src={logo}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <Puzzle />
      )}
    </span>
  )
}
export function Choice({
  label,
  separateLabel = false,
  value,
  options,
  onChange,
}: {
  label: string
  separateLabel?: boolean
  value: string
  options: readonly (readonly [string, string])[]
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const dismiss = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('keydown', escape)
    }
  }, [open])
  return (
    <div className={'choice' + (separateLabel ? ' separate-label' : '')} ref={container}>
      {separateLabel && <span className="filter-label">{label}</span>}
      <button
        className="row"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {!separateLabel && <span>{label}</span>}
        <span className="choice-value">
          <span>
            {appLanguages.some(([id, name]) => id === value && options.some((o) => o[1] === name))
              ? options.find(([id]) => id === value)?.[1]
              : languageName(value, options.find(([id]) => id === value)?.[1] ?? value)}
          </span>
          <ChevronDown />
        </span>
      </button>
      {open && (
        <div className="choice-options glass" role="group" aria-label={label}>
          {options.map(([id, name]) => (
            <button
              key={id}
              aria-pressed={value === id}
              className={value === id ? 'selected' : ''}
              onClick={() => {
                onChange(id)
                setOpen(false)
              }}
            >
              <span title={name}>
                {appLanguages.some(([value, label]) => value === id && name === label)
                  ? name
                  : languageName(id, name)}
              </span>
              {value === id && <Check size={17} />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
export function Toggle({
  unlined = false,
  label,
  checked,
  onChange,
}: {
  unlined?: boolean
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className={'row' + (unlined ? ' unlined' : '')}>
      <span>{label}</span>
      <button
        role="switch"
        aria-label={label}
        aria-checked={checked}
        className={'switch ' + (checked ? 'on' : '')}
        onClick={() => onChange(!checked)}
      >
        <span />
      </button>
    </div>
  )
}
export function Preferences({
  settings,
  onChange,
  section = 'player',
}: {
  section?: 'player' | 'options' | 'storage'
  settings: Settings
  onChange: (s: Settings) => void
}) {
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value })
  return (
    <>
      {section === 'player' && (
        <>
          <div className="subtitle-preview" role="img" aria-label={t('Aperçu des sous-titres')}>
            <small>{t('Aperçu des sous-titres')}</small>
            <span
              style={{
                fontFamily:
                  settings.subtitleFont === 'serif'
                    ? '"Noto Serif", serif'
                    : settings.subtitleFont === 'monospace'
                      ? '"Droid Sans Mono", monospace'
                      : 'Roboto, sans-serif',
                fontSize: settings.subtitleSize / 2,
                color: settings.subtitleColor,
                background: settings.subtitleBackground ? '#000B' : 'transparent',
                WebkitTextStroke: `${settings.subtitleOutline / 2}px black`,
                paintOrder: 'stroke fill',
              }}
            >
              {t('Votre histoire commence.')}
            </span>
          </div>
          <h2>{t('Lecture')}</h2>
          {!isDesktop() && (
            <Choice
              label={t('Lecteur par défaut')}
              value={settings.player}
              options={[
                ['internal', t('Intégré')],
                ['external', t('Lecteur externe')],
              ]}
              onChange={(v) => update('player', v as Settings['player'])}
            />
          )}
          <Choice
            label={t('Langue audio')}
            value={settings.audioLanguage}
            options={[['auto', t('Piste par défaut')], ...languages]}
            onChange={(v) => update('audioLanguage', v)}
          />
          <Toggle
            label={t('Afficher les sous-titres')}
            checked={settings.subtitles}
            onChange={(v) => update('subtitles', v)}
          />
          <Choice
            label={t('Langue des sous-titres')}
            value={settings.subtitleLanguage}
            options={[['auto', t('Piste par défaut')], ...languages]}
            onChange={(v) => update('subtitleLanguage', v)}
          />
          <Toggle
            label={t('Toujours utiliser le style Primio')}
            checked={settings.forceSubtitleStyle}
            onChange={(v) => update('forceSubtitleStyle', v)}
          />
          <Choice
            label={t('Taille des sous-titres')}
            value={String(settings.subtitleSize)}
            options={[
              ['32', t('Petite')],
              ['40', t('Moyenne')],
              ['48', t('Grande')],
              ['56', t('Très grande')],
            ]}
            onChange={(v) => update('subtitleSize', Number(v))}
          />
          <Choice
            label={t('Police')}
            value={settings.subtitleFont}
            options={[
              ['sans-serif', t('Sans empattement')],
              ['serif', t('Avec empattement')],
              ['monospace', t('Monospace')],
            ]}
            onChange={(v) => update('subtitleFont', v as Settings['subtitleFont'])}
          />
          <Choice
            label={t('Couleur')}
            value={settings.subtitleColor}
            options={[
              ['#FFFFFF', t('Blanc')],
              ['#F5DE93', t('Ivoire')],
              ['#BDE6FF', t('Bleu clair')],
              ['#BFE3C2', t('Vert clair')],
            ]}
            onChange={(v) => update('subtitleColor', v)}
          />
          <Choice
            label={t('Contour')}
            value={String(settings.subtitleOutline)}
            options={[
              ['0', t('Aucun')],
              ['1', t('Fin')],
              ['2', t('Moyen')],
              ['4', t('Épais')],
            ]}
            onChange={(v) => update('subtitleOutline', Number(v))}
          />
          <Toggle
            label={t('Fond des sous-titres')}
            checked={settings.subtitleBackground}
            onChange={(v) => update('subtitleBackground', v)}
          />
          {(['seekBackward', 'seekForward'] as const).map((key) => (
            <label className="range-field" key={key}>
              <span>
                {key === 'seekBackward' ? t('Reculer de') : t('Avancer de')}
                <strong>
                  {settings[key]} {t('secondes')}
                </strong>
              </span>
              <input
                aria-label={key === 'seekBackward' ? t('Durée du retour') : t('Durée de l’avance')}
                type="range"
                min="5"
                max="60"
                step="1"
                value={settings[key]}
                onChange={(e) => update(key, Number(e.target.value))}
              />
              <small>{t('5 s — 60 s · boutons et double toucher')}</small>
            </label>
          ))}
          <Choice
            label={t('Vitesse de lecture')}
            value={String(settings.playbackSpeed)}
            options={[
              ['0.5', '0,5×'],
              ['0.75', '0,75×'],
              ['1', t('Normale')],
              ['1.25', '1,25×'],
              ['1.5', '1,5×'],
              ['2', '2×'],
            ]}
            onChange={(v) => update('playbackSpeed', Number(v))}
          />
          <Toggle
            label={t('Décodage matériel')}
            checked={settings.hardwareDecoding}
            onChange={(v) => update('hardwareDecoding', v)}
          />
          <Toggle
            label={t('Reprendre à la dernière position')}
            checked={settings.rememberPosition}
            onChange={(v) => update('rememberPosition', v)}
          />
          <h2>{t('Enchaînement des épisodes')}</h2>
          <Toggle
            label={t('Épisode suivant automatiquement')}
            checked={settings.autoNextEpisode}
            onChange={(v) => update('autoNextEpisode', v)}
          />
          <Toggle
            label={t('Passer les intros · IntroDB')}
            checked={settings.skipIntro}
            onChange={(v) => update('skipIntro', v)}
          />
          <Toggle
            label={t('Openings et endings · AniSkip')}
            checked={settings.aniSkip}
            onChange={(v) => update('aniSkip', v)}
          />
          <Toggle
            label={t('Passer automatiquement les intros')}
            checked={settings.autoSkipIntro}
            onChange={(v) => update('autoSkipIntro', v)}
          />
        </>
      )}
      {section === 'storage' && (
        <>
          <Choice
            label={t('Cache vidéo sur disque')}
            value={String(settings.cacheSizeGb)}
            options={[
              ['0', t('Désactivé')],
              ['0.25', '250 Mo'],
              ['0.5', '500 Mo'],
              ['1', '1 Go'],
              ['2', '2 Go'],
              ['5', '5 Go'],
              ['10', '10 Go'],
            ]}
            onChange={(v) => update('cacheSizeGb', Number(v))}
          />
          <Toggle
            label={t('Télécharger uniquement en Wi-Fi')}
            checked={settings.downloadWifiOnly}
            onChange={(v) => update('downloadWifiOnly', v)}
          />
          <Toggle
            label={t('Supprimer les téléchargements après visionnage')}
            checked={settings.deleteWatchedDownloads}
            onChange={(v) => update('deleteWatchedDownloads', v)}
          />
          <p className="muted">{t('À partir de 95 % de lecture.')}</p>
          <Choice
            separateLabel
            label={t('Supprimer (sans visionnage) :')}
            value={String(settings.unwatchedDownloadDays)}
            options={[
              ['0', t('Jamais')],
              ...[1, 3, 7, 14, 30, 60, 90].map(
                (n) =>
                  [String(n), n === 1 ? t('Après 1 jour') : t('Après {n} jours', { n })] as [
                    string,
                    string,
                  ],
              ),
            ]}
            onChange={(v) => update('unwatchedDownloadDays', Number(v))}
          />
        </>
      )}
      {section === 'options' && (
        <>
          <h2>{t('Apparence et navigation')}</h2>
          <Choice
            label={t('Langue de l’application')}
            value={settings.uiLanguage}
            options={appLanguages}
            onChange={(v) => update('uiLanguage', v)}
          />
          {!isDesktop() && (
            <Choice
              label={t('Colonnes de contenus')}
              value={String(settings.contentColumns)}
              options={[
                ['3', '3'],
                ['4', '4'],
                ['5', '5'],
              ]}
              onChange={(v) => update('contentColumns', Number(v) as 3 | 4 | 5)}
            />
          )}
          <Toggle
            label={t('Afficher les titres et dates')}
            checked={settings.showPosterLabels}
            onChange={(v) => update('showPosterLabels', v)}
          />
          <Toggle
            label={t('Afficher les images et synopsis des épisodes')}
            checked={settings.showSpoilers}
            onChange={(v) => update('showSpoilers', v)}
          />
          <Toggle
            label={t('Afficher Reprendre sur l’accueil')}
            checked={settings.showContinue}
            onChange={(v) => update('showContinue', v)}
          />
          <Toggle
            label={t('Glisser entre les pages')}
            checked={settings.swipeNavigation}
            onChange={(v) => update('swipeNavigation', v)}
          />
          <Toggle
            label={t('Réduire les animations')}
            checked={settings.reduceMotion}
            onChange={(v) => update('reduceMotion', v)}
          />
          <Choice
            label={t('Taille des affiches')}
            value={settings.posterSize}
            options={[
              ['comfortable', t('Confortable')],
              ['compact', t('Compacte')],
            ]}
            onChange={(v) => update('posterSize', v as Settings['posterSize'])}
          />
        </>
      )}
    </>
  )
}
export function Episodes({
  meta,
  spoilers,
  progress,
  onToggleWatched,
  onPlay,
}: {
  meta: Meta
  spoilers: boolean
  progress: Progress[]
  onToggleWatched: (id: string) => void
  onPlay: (id: string) => void
}) {
  const [expanded, setExpanded] = useState<string[]>([])
  const [synopsis, setSynopsis] = useState<{ title: string; text: string } | null>(null)
  const available = seasons(meta),
    [season, setSeason] = useState(available.find((s) => s > 0) ?? available[0])
  const active = available.includes(season) ? season : available[0]
  return (
    <section className="episodes">
      <h2>{t('Épisodes')}</h2>
      {available.length > 1 && (
        <Choice
          label={t('Saison')}
          value={String(active)}
          options={available.map((s) => [
            String(s),
            s === 0 ? t('Hors-série') : t('Saison {n}', { n: s }),
          ])}
          onChange={(value) => setSeason(Number(value))}
        />
      )}
      <ProgressiveList
        key={meta.id + ':' + active}
        className="episode-list"
        batchSize={12}
        items={(meta.videos ?? [])
          .filter((v) => (v.season ?? 1) === active)
          .sort((a, b) => (a.episode ?? 0) - (b.episode ?? 0))}
        renderItem={(v) => {
          const date = v.released ? new Date(v.released) : null,
            validDate = date && !Number.isNaN(date.getTime()),
            future = validDate && date.getTime() > Date.now()
          const history = findProgress(progress, meta.type, v.id)
          const watched = isWatched(history)
          return (
            <div className="episode-entry" key={v.id}>
              <button className="episode-card" onClick={() => onPlay(v.id)}>
                <div className="episode-image">
                  {spoilers && v.thumbnail ? <MediaImage src={v.thumbnail} /> : null}
                  <Play />
                </div>
                <div className="episode-copy">
                  <strong>
                    {v.episode ? `${v.episode}. ` : ''}
                    {v.title || v.name || t('Épisode')}
                  </strong>
                  {spoilers && (v.overview || v.description) && (
                    <p className="episode-synopsis">
                      {expanded.includes(v.id)
                        ? cleanDescription(v.overview || v.description || '')
                        : Array.from(cleanDescription(v.overview || v.description || ''))
                            .slice(0, 300)
                            .join('')}
                      {!expanded.includes(v.id) &&
                      Array.from(v.overview || v.description || '').length > 300
                        ? '…'
                        : ''}
                    </p>
                  )}
                  <small>
                    {[
                      v.runtime ||
                        (v.duration
                          ? `${Math.ceil(v.duration / 60)} min`
                          : meta.runtime
                            ? `≈ ${meta.runtime}`
                            : undefined),
                      validDate
                        ? `${future ? t('Prévu le ') : ''}${date.toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </small>
                  {history && (
                    <small className="episode-status">
                      {watched
                        ? t('Vu')
                        : t('{n} min regardées', { n: Math.floor(history.position / 60) })}
                    </small>
                  )}
                  {history && !watched && (
                    <progress max={history.duration} value={history.position} />
                  )}
                </div>
              </button>
              {spoilers && Array.from(v.overview || v.description || '').length > 300 && (
                <button
                  className="episode-expand text-button"
                  aria-expanded={expanded.includes(v.id)}
                  onClick={() =>
                    setExpanded((s) =>
                      s.includes(v.id) ? s.filter((id) => id !== v.id) : [...s, v.id],
                    )
                  }
                >
                  {t(expanded.includes(v.id) ? 'Afficher moins' : 'Afficher la suite')}
                </button>
              )}
              <div className="episode-actions">
                <button
                  className={'episode-watched icon ' + (watched ? 'selected' : '')}
                  aria-label={
                    (watched ? t('Marquer non vu : ') : t('Marquer comme vu : ')) +
                    (v.title || v.name || t('Épisode'))
                  }
                  aria-pressed={watched}
                  onClick={() => onToggleWatched(v.id)}
                >
                  <Check size={18} />
                </button>
                {spoilers && (v.overview || v.description) && (
                  <button
                    className="icon glass episode-info"
                    aria-label={t('Synopsis') + ' · ' + (v.title || v.name)}
                    onClick={() =>
                      setSynopsis({
                        title: v.title || v.name || t('Épisode'),
                        text: cleanDescription(v.overview || v.description || ''),
                      })
                    }
                  >
                    <Info size={18} />
                  </button>
                )}
              </div>
            </div>
          )
        }}
      />
      {synopsis && (
        <EpisodeSynopsis
          title={synopsis.title}
          text={synopsis.text}
          onClose={() => setSynopsis(null)}
        />
      )}
    </section>
  )
}
function EpisodeSynopsis({
  title,
  text,
  onClose,
}: {
  title: string
  text: string
  onClose: () => void
}) {
  return (
    <DialogShell title={title} onClose={onClose}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="icon glass" aria-label={t('Fermer')} onClick={onClose}>
          <X />
        </button>
      </div>
      <Description text={text} />
    </DialogShell>
  )
}
export function Profiles({
  state,
  setState,
  connected,
  onSync,
  beforeRemove,
  onError,
}: {
  state: UserState
  setState: Dispatch<SetStateAction<UserState>>
  connected: boolean
  onSync: () => void
  beforeRemove: (id: string) => Promise<void>
  onError: (error: unknown) => void
}) {
  const [deleting, setDeleting] = useState(false)
  const [editing, setEditing] = useState<string | null>(null),
    [name, setName] = useState(''),
    [color, setColor] = useState(profileColors[0]),
    [avatar, setAvatar] = useState('01'),
    [removing, setRemoving] = useState<string | null>(null)
  const save = () => {
    if (!name.trim()) return
    setState((s) => {
      const current = snapshotState(s)
      const id = editing === 'new' ? crypto.randomUUID() : editing!
      if (current.profiles.some((p) => p.id !== id && p.avatar === avatar)) return s
      const profiles =
        editing === 'new'
          ? [
              ...current.profiles,
              {
                id,
                name: name.trim(),
                color,
                avatar,
                library: [],
                progress: [],
                settings: { ...defaults },
              },
            ]
          : current.profiles.map((p) =>
              p.id === id ? { ...p, name: name.trim(), color, avatar } : p,
            )
      return { ...current, profiles }
    })
    setEditing(null)
  }
  return (
    <section className="profiles">
      <div className="section-head">
        <h2>{t('Profils')}</h2>
        <small>{state.profiles.length}/6</small>
      </div>
      <div className="profile-grid">
        {state.profiles.map((p) => (
          <article
            className={'profile-card glass ' + (p.id === state.activeProfileId ? 'selected' : '')}
            key={p.id}
          >
            <button
              className="profile-pick"
              onClick={() => setState((s) => switchProfile(s, p.id))}
              aria-pressed={p.id === state.activeProfileId}
            >
              <span className="avatar" style={{ background: p.color, color: '#101110' }}>
                <img src={avatarUrl(p.avatar)} alt="" />
              </span>
              <strong>{p.name}</strong>
              <small className="profile-status">
                {p.id === state.activeProfileId ? t('Actif') : '\u00a0'}
              </small>
            </button>
            <div className="profile-actions">
              <button
                className="icon"
                aria-label={t('Modifier ') + p.name}
                onClick={() => {
                  setEditing(p.id)
                  setName(p.name)
                  setColor(p.color)
                  setAvatar(p.avatar ?? freeAvatar(state.profiles, p.id))
                }}
              >
                <Pencil size={17} />
              </button>
              {state.profiles.length > 1 && (
                <button
                  className="icon"
                  aria-label={t('Supprimer ') + p.name}
                  onClick={() => setRemoving(p.id)}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {state.profiles.length < 6 && (
        <button
          className="secondary"
          onClick={() => {
            setEditing('new')
            setName('')
            setColor(profileColors[state.profiles.length % profileColors.length])
            setAvatar(freeAvatar(state.profiles))
          }}
        >
          <Plus />
          {t('Ajouter un profil')}
        </button>
      )}
      {editing && (
        <form
          className="profile-editor glass"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label className="field">
            {t('Nom du profil')}
            <input
              autoFocus
              required
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <AvatarPicker
            value={avatar}
            profiles={state.profiles}
            editing={editing}
            onChange={setAvatar}
          />
          <button className="primary">{t('Enregistrer')}</button>
          <button type="button" className="secondary" onClick={() => setEditing(null)}>
            {t('Annuler')}
          </button>
        </form>
      )}
      {removing && (
        <div className="profile-editor glass" role="alert">
          <p>{t('Supprimer ce profil, sa liste et ses téléchargements sur cet appareil ?')}</p>
          <button
            className="secondary danger"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true)
              try {
                await beforeRemove(removing)
                setState((s) => {
                  const next =
                    s.activeProfileId === removing
                      ? switchProfile(s, s.profiles.find((p) => p.id !== removing)!.id)
                      : snapshotState(s)
                  return { ...next, profiles: next.profiles.filter((p) => p.id !== removing) }
                })
                setRemoving(null)
              } catch (error) {
                onError(error)
              } finally {
                setDeleting(false)
              }
            }}
          >
            {t('Supprimer le profil')}
          </button>
          <button className="secondary" disabled={deleting} onClick={() => setRemoving(null)}>
            {t('Annuler')}
          </button>
        </div>
      )}
      {connected && (
        <button className="row" onClick={onSync}>
          {t('Synchroniser les profils')}
          <Check />
        </button>
      )}
    </section>
  )
}

export function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  text = cleanDescription(text)
  const chars = Array.from(text)
  return (
    <div className="description">
      <p className="synopsis">
        {expanded || chars.length <= 300 ? text : chars.slice(0, 300).join('') + '…'}
      </p>
      {chars.length > 300 && (
        <button
          className="text-button description-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? t('Afficher moins') : t('Afficher la suite')}
        </button>
      )}
    </div>
  )
}

export function AvatarPicker({
  value,
  profiles,
  editing,
  onChange,
}: {
  value: string
  profiles: UserState['profiles']
  editing: string | null
  onChange: (avatar: string) => void
}) {
  return (
    <div className="avatar-picker" role="group" aria-label={t('Image du profil')}>
      {avatars.map((a) => {
        const used = profiles.some((p) => p.id !== editing && p.avatar === a)
        return (
          <button
            key={a}
            type="button"
            disabled={used}
            aria-label={t('Avatar {n}', { n: Number(a) }) + (used ? ' · ' + t('Déjà utilisé') : '')}
            aria-pressed={value === a}
            className={value === a ? 'selected' : ''}
            onClick={() => onChange(a)}
          >
            <img src={avatarUrl(a)} alt="" />
            {value === a && <Check />}
          </button>
        )
      })}
    </div>
  )
}
