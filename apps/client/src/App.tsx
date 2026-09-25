import {
  EmailVerification,
  type VerificationChallenge,
  type Authenticated,
} from './email-verification'
import { usePlaybackSync, mergePlaybackState } from './playback-sync'
import { ContinueCard } from './continue-card'
import { defaultSort } from './catalog-sort'
import { UpdatePanel } from './update-panel'
import { ImportPanel } from './import-panel'
import { Collections, collectionKey } from './collections'
import { DiagnosticsPanel } from './diagnostics-panel'
import { recordDiagnostic } from './diagnostics'
import { useTvMode } from './tv'
import { IntegrationsPanel } from './integrations-panel'
import { CastPanel, type CastTarget } from './cast-panel'
import { useAnimeClassification } from './anime-classification'
import { equivalentSources, rememberSource } from './source-preferences'
import { PasswordField } from './password-field'
import { CopyTitle } from './copy-title'
import { DialogShell } from './dialog-shell'
import { trailerUrl } from './content'
import { TrailerPlayer } from './trailer-player'
import { ViewingHistory } from './history'
import { SeasonalAnime, seasonOptions, currentSeason } from './seasonal'
import { Sources } from './sources'
import { t } from './i18n'
import { ReleaseCalendar, NotificationCenter, useReleases, titleWatched } from './releases'
import { GroupedSearch } from './search'
import { setLocale } from './i18n'
import { Recommendations } from './recommendations'
import { Onboarding } from './onboarding'
import { episodeQueue, playbackTitle } from './episodes'
import { version } from '../package.json'
import { MediaImage, CardSkeleton } from './media-image'
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  Home,
  Bell,
  CalendarDays,
  Settings as SettingsIcon,
  History,
  SlidersHorizontal,
  Compass,
  Bookmark,
  Puzzle,
  Search,
  UserRound,
  ArrowLeft,
  Plus,
  Play,
  Check,
  X,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Trash2,
  Clapperboard,
  Download,
  WifiOff,
  LoaderCircle,
  Sparkles,
  Copy,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { activatePlugin, pluginSchema, rankSources, type PrimioPlugin } from '@primio/sdk'
import { getCurrent, onOpenUrl } from '@tauri-apps/plugin-deep-link'
import { parseDeepLink } from './deeplinks'
import { skipSegments } from './skip'
import { Downloads, playerOptions, type OfflineItem } from './downloads'
import { Choice, Toggle, Description } from './components'
import { AddonIcon, Episodes, Preferences, Profiles } from './components'
import {
  audioPreference,
  createState,
  avatarUrl,
  normalizeState,
  switchProfile,
  snapshotState,
  durationLabel,
  matchesCategory,
  isAnime,
} from './preferences'
import { catalogTargets } from './catalog-pager'
import {
  findProgress,
  isWatched,
  resumePosition,
  recordProgress,
  mergeNativeProgress,
  type NativeProgress,
} from './progress'
import { CatalogFeed, ProgressiveList, Deferred, useDebounced } from './progressive'
import { catalog, inspectAddon, metadata, streams, subtitles, playbackUrl } from './addons'
import { api, openLink, readSecure, writeSecure, isAndroid, scrollToTop } from './platform'
import type { Addon, Meta, Stream, UserState, Subtitle } from './types'

const empty = createState()
type Tab =
  | 'diagnostics'
  | 'integrations'
  | 'calendar'
  | 'notifications'
  | 'home'
  | 'explore'
  | 'library'
  | 'addons'
  | 'settings'
  | 'plugins'
  | 'anime'
  | 'account'
  | 'player'
  | 'options'
  | 'history'
  | 'downloads'
type Playback = { meta: Meta; videoId: string; stream: Stream; subs: Subtitle[]; url: string }
const message = (e: unknown) =>
  e instanceof Error
    ? e.message
    : typeof e === 'object' && e && 'message' in e
      ? String(e.message)
      : String(e)
const minutes = durationLabel
function Dialog({
  title,
  children,
  onClose,
  error,
}: {
  error?: string
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <DialogShell title={title} onClose={onClose}>
      <div className="dialog-head">
        <h2>{title}</h2>
        <button className="icon" aria-label={t('Fermer')} onClick={onClose}>
          <X />
        </button>
      </div>
      {error && (
        <p className="dialog-error" role="alert">
          {error}
        </p>
      )}
      {children}
    </DialogShell>
  )
}
function Empty({
  title,
  children,
  action,
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <Clapperboard />
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  )
}
export default function App() {
  const [trailer, setTrailer] = useState<{ url: string; name: string } | null>(null)
  const [playbackSyncPaused, setPlaybackSyncPaused] = useState(false)
  const [profileGate, setProfileGate] = useState(false)
  const [startupProfile, setStartupProfile] = useState('ask')
  const startupChecked = useRef('')
  const handledEpisode = useRef('')
  const episodeRequest = useRef<(event: NativeProgress) => void>(() => {})
  const [onboarding, setOnboarding] = useState(false)
  const [tab, setTab] = useState<Tab>('home'),
    [state, setState] = useState<UserState>(empty),
    [ready, setReady] = useState(false)
  const [addons, setAddons] = useState<Addon[]>([]),
    [catalogue, setCatalogue] = useState<Meta[]>([])
  const [skipOpen, setSkipOpen] = useState(false)
  const [genre, setGenre] = useState('')
  const sort = state.settings.explorerSort ?? defaultSort
  const [pluginCatalogs, setPluginCatalogs] = useState<Addon[]>([])
  const catalogAddons = useMemo(() => [...addons, ...pluginCatalogs], [addons, pluginCatalogs])
  useAnimeClassification(state, setState, catalogAddons, ready)
  const [catalogChoice, setCatalogChoice] = useState('all'),
    [manifestCopy, setManifestCopy] = useState('')
  const [libraryFilter, setLibraryFilter] = useState('all'),
    [termsOpen, setTermsOpen] = useState(false)
  const [collectionId, setCollectionId] = useState('')
  useTvMode(state.settings.tvMode)
  const [slideDirection, setSlideDirection] = useState('left')
  const touchStart = useRef<{ x: number; y: number } | null>(null)
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [query, setQuery] = useState(''),
    [kind, setKind] = useState('movie')
  const animeFilter = tab === 'anime' || kind === 'anime'
  const [detailLoading, setDetailLoading] = useState(false)
  const [selected, setSelected] = useState<Meta | null>(null),
    [sourceTarget, setSourceTarget] = useState<{ meta: Meta; id: string } | null>(null)
  const [sourceList, setSourceList] = useState<Stream[]>([]),
    [sourceLoading, setSourceLoading] = useState(false),
    [sourceError, setSourceError] = useState('')
  const [launching, setLaunching] = useState(false)
  const launchLock = useRef(false)
  const [addOpen, setAddOpen] = useState(false),
    [addonInput, setAddonInput] = useState(''),
    [candidate, setCandidate] = useState<Addon | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false),
    [register, setRegister] = useState(false),
    [token, setToken] = useState(''),
    [email, setEmail] = useState(''),
    [authBusy, setAuthBusy] = useState(false)
  const [syncVersion, setSyncVersion] = useState(0),
    [conflict, setConflict] = useState<{ version: number; state: UserState } | null>(null),
    [syncing, setSyncing] = useState(false)
  const [plugins, setPlugins] = useState<PrimioPlugin[]>([]),
    [pluginCandidate, setPluginCandidate] = useState<PrimioPlugin | null>(null),
    [pluginPage, setPluginPage] = useState<{ plugin: PrimioPlugin; id: string } | null>(null)
  const [playback, setPlayback] = useState<Playback | null>(null),
    [deleteOpen, setDeleteOpen] = useState(false),
    [online, setOnline] = useState(navigator.onLine)
  const videoRef = useRef<HTMLVideoElement>(null),
    sourceSequence = useRef(0),
    detailSequence = useRef(0)
  const searchQuery = useDebounced(query)
  const [pendingLink, setPendingLink] = useState('')
  const [addonsLoading, setAddonsLoading] = useState(true)
  setLocale(state.settings.uiLanguage)
  const releases = useReleases(
    state,
    catalogAddons,
    ready && !addonsLoading,
    token ? email : 'local',
  )
  const currentPlayback = useRef<Playback | null>(null)
  usePlaybackSync(state, setState, token, ready && !conflict && !playbackSyncPaused)
  currentPlayback.current = playback
  const notify = (text: string) => {
    setToast(text)
    setTimeout(() => setToast(''), 4500)
  }
  const fail = (e: unknown) => setError(t(message(e)))
  useEffect(() => {
    ;(async () => {
      try {
        const saved = await readSecure('state'),
          session = await readSecure('session'),
          installed = await readSecure('plugins'),
          onboarded = await readSecure('onboarding')
        setOnboarding(onboarded !== 'done')
        if (saved) setState(normalizeState(JSON.parse(saved)))
        if (session) {
          const s = JSON.parse(session)
          setToken(s.token ?? '')
          setEmail(s.email ?? '')
          setSyncVersion(s.version ?? 0)
        }
        if (installed) setPlugins(JSON.parse(installed).map((p: unknown) => pluginSchema.parse(p)))
      } catch {
        setError(t('Impossible de restaurer les données locales.'))
      } finally {
        setReady(true)
      }
    })()
  }, [])
  useEffect(() => {
    if (!ready) return
    const timer = setTimeout(() => {
      writeSecure('state', JSON.stringify(snapshotState(state))).catch(fail)
    }, 400)
    return () => clearTimeout(timer)
  }, [state, ready])
  useEffect(() => {
    if (ready)
      writeSecure('session', JSON.stringify({ token, email, version: syncVersion })).catch(fail)
  }, [token, email, syncVersion, ready])
  useEffect(() => {
    if (ready) writeSecure('plugins', JSON.stringify(plugins)).catch(fail)
    const t = plugins.filter((p) => p.permissions.includes('theme')).at(-1)?.theme
    for (const [k, v] of Object.entries({
      background: '#101110',
      surface: '#1D1E1C',
      accent: '#DAD4C5',
      text: '#F3F1EB',
      ...t,
    }))
      document.documentElement.style.setProperty('--' + k, v)
  }, [plugins, ready])
  useEffect(() => {
    document.documentElement.dataset.motion = state.settings.reduceMotion ? 'reduced' : 'full'
  }, [state.settings.reduceMotion])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  useEffect(() => {
    if (!ready) return
    let active = true
    setAddonsLoading(true)
    setBusy(true)
    Promise.allSettled(
      state.addons.map(async (installed) => ({
        ...(await inspectAddon(installed.url)),
        enabled: installed.enabled,
      })),
    )
      .then((r) => {
        if (!active) return
        setAddons(r.flatMap((x) => (x.status === 'fulfilled' ? [x.value] : [])))
        if (r.some((x) => x.status === 'rejected'))
          setError(t('Certains addons sont indisponibles. Vos liens installés sont conservés.'))
      })
      .finally(() => {
        if (active) {
          setBusy(false)
          setAddonsLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [state.addons, ready])
  useEffect(() => {
    let active = true
    const providers = addons.filter((a) => a.enabled)
    if (!providers.length) {
      setCatalogue([])
      return
    }
    setBusy(true)
    Promise.allSettled(
      providers.flatMap((a) =>
        (a.manifest.catalogs ?? [])
          .filter((c) => c.type === 'movie' && !c.extra?.some((e) => e.isRequired))
          .slice(0, 2)
          .map((c) => catalog(a, c.type, c.id)),
      ),
    )
      .then((r) => {
        if (active) {
          const items = r.flatMap((x) => (x.status === 'fulfilled' ? x.value : []))
          setCatalogue([...new Map(items.map((m) => [m.type + ':' + m.id, m])).values()])
          if (!items.length && r.some((x) => x.status === 'rejected'))
            setError(t('Le catalogue est indisponible. Réessayez dans un instant.'))
        }
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [addons])
  useEffect(() => {
    if (!ready || !isTauri()) return
    let active = true
    const restore = async () => {
      try {
        const raw = await readSecure('playerProgress')
        if (raw && active) {
          const event = JSON.parse(raw) as NativeProgress
          if ((event.context?.accountId ?? 'local') === (token ? email : 'local'))
            setState((s) => mergeNativeProgress(s, event))
        }
      } catch (e) {
        fail(e)
      }
    }
    void restore()
    window.addEventListener('focus', restore)
    document.addEventListener('visibilitychange', restore)
    const unlisten = listen<NativeProgress>('player-progress', (e) => {
      if ((e.payload.context?.accountId ?? 'local') === (token ? email : 'local'))
        setState((s) => mergeNativeProgress(s, e.payload))
      if (e.payload.requestedVideoId) episodeRequest.current(e.payload)
      if (e.payload.closed && currentPlayback.current?.videoId === e.payload.context?.videoId)
        setPlayback(null)
    })
    const unlistenError = listen<string>('player-error', (e) => {
      recordDiagnostic('player', e.payload)
      setPlayback(null)
      fail(e.payload)
    })
    return () => {
      active = false
      window.removeEventListener('focus', restore)
      document.removeEventListener('visibilitychange', restore)
      unlisten.then((fn) => fn())
      unlistenError.then((fn) => fn())
    }
  }, [ready, token, email])
  useEffect(() => {
    let active = true
    const blocks = plugins
      .filter((p) => p.permissions.includes('pages'))
      .flatMap((p) =>
        (p.pages ?? []).flatMap((page) =>
          page.blocks.filter((b) => b.kind === 'catalog').map((block) => ({ plugin: p, block })),
        ),
      )
    Promise.allSettled(
      blocks.map(async ({ plugin, block }) => {
        const addon = await inspectAddon(block.manifest)
        return {
          ...addon,
          manifest: {
            ...addon.manifest,
            name: plugin.name,
            catalogs: (addon.manifest.catalogs ?? [])
              .filter((c) => c.type === block.type && c.id === block.catalogId)
              .map((c) => ({ ...c, name: block.title })),
          },
        }
      }),
    ).then((results) => {
      if (active)
        setPluginCatalogs(results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])))
    })
    return () => {
      active = false
    }
  }, [plugins])
  useEffect(() => {
    if (!isTauri()) return
    let disposed = false
    const receive = (urls: string[]) => {
      if (!disposed && urls[0]) {
        if (urls[0] === 'primio://notifications') setTab('notifications')
        else setPendingLink(urls[0])
      }
    }
    const listener = onOpenUrl(receive)
    getCurrent()
      .then((urls) => urls && receive(urls))
      .catch(fail)
    return () => {
      disposed = true
      listener.then((fn) => fn())
    }
  }, [])
  useEffect(() => {
    if (!ready || !pendingLink) return
    try {
      const link = parseDeepLink(pendingLink)
      if (link.kind === 'meta' && addonsLoading) return
      setPendingLink('')
      if (link.kind === 'addon') {
        setAddonInput(link.url)
        setCandidate(null)
        setAddOpen(true)
      } else if (link.kind === 'integrations') {
        setTab('integrations')
      } else {
        void details({ id: link.id, type: link.type, name: t('Chargement…') })
      }
    } catch (e) {
      setPendingLink('')
      fail(e)
    }
  }, [pendingLink, ready, addons, addonsLoading])
  const [castTarget, setCastTarget] = useState<CastTarget | null>(null)
  function saveProgress(p: Playback, position: number, duration: number) {
    setState((s) => ({
      ...s,
      progress: recordProgress(s.progress, p.meta, p.videoId, position, duration),
    }))
  }
  function toggleWatched(meta: Meta, videoId: string) {
    setState((s) => {
      const previous = findProgress(s.progress, meta.type, videoId)
      const watched = !isWatched(previous)
      const duration = previous?.duration || 1
      return {
        ...s,
        progress: recordProgress(
          s.progress,
          meta,
          videoId,
          watched ? duration : 0,
          duration,
          Date.now(),
          watched,
        ),
      }
    })
  }

  function moveAddon(index: number, delta: number) {
    setState((s) => {
      const addons = [...s.addons]
      const target = index + delta
      if (target < 0 || target >= addons.length) return s
      ;[addons[index], addons[target]] = [addons[target], addons[index]]
      return { ...s, addons }
    })
  }
  useEffect(() => {
    const account = token ? email.toLowerCase() : 'local'
    if (!ready || onboarding || startupChecked.current === account) return
    startupChecked.current = account
    void readSecure('startupProfile')
      .then((raw) => {
        if (startupChecked.current !== account) return
        const saved = raw ? JSON.parse(raw) : null
        const id = saved?.account === account ? saved.profileId : 'ask'
        setStartupProfile(state.profiles.some((p) => p.id === id) ? id : 'ask')
        if (state.profiles.some((p) => p.id === id)) setState((s) => switchProfile(s, id))
        else if (state.profiles.length > 1) setProfileGate(true)
      })
      .catch(fail)
  }, [ready, onboarding, token, email, state.profiles])
  async function setAutomaticProfile(id: string) {
    try {
      await writeSecure(
        'startupProfile',
        JSON.stringify({ account: token ? email : 'local', profileId: id }),
      )
      setStartupProfile(id)
    } catch (e) {
      fail(e)
    }
  }
  function goBack() {
    if (selected) {
      ++detailSequence.current
      setSelected(null)
    } else if (pluginPage) setPluginPage(null)
    else navigate(tab === 'calendar' ? 'library' : tab === 'notifications' ? 'home' : 'settings')
    setSlideDirection('right')
    scrollToTop()
  }
  function navigate(next: Tab) {
    const order: Tab[] = ['home', 'explore', 'library', 'settings']
    setSlideDirection(order.indexOf(next) >= order.indexOf(tab) ? 'left' : 'right')
    ++detailSequence.current
    setDetailLoading(false)
    setTab(next)
    setCatalogChoice('all')
    setGenre('')
    setSelected(null)
    setPluginPage(null)
    setError('')
    scrollToTop()
  }
  async function details(meta: Meta) {
    const seq = ++detailSequence.current
    setSelected(meta)
    setDetailLoading(true)
    scrollToTop()
    const m = await metadata(catalogAddons, meta)
    if (seq === detailSequence.current) {
      setSelected(m)
      setDetailLoading(false)
    }
  }
  function bookmark(meta: Meta) {
    setState((s) => ({
      ...s,
      library: s.library.some((x) => x.id === meta.id && x.type === meta.type)
        ? s.library.filter((x) => !(x.id === meta.id && x.type === meta.type))
        : [
            {
              id: meta.id,
              type: meta.type,
              name: meta.name,
              poster: meta.poster,
              category: isAnime(meta) ? ('anime' as const) : undefined,
            },
            ...s.library,
          ],
    }))
  }
  useEffect(() => {
    if (!ready || !isTauri()) return
    const snapshot = snapshotState(state)
    void writeSecure(
      'downloadPolicy',
      JSON.stringify({
        accountId: token ? email : 'local',
        profiles: snapshot.profiles.map((p) => ({
          id: p.id,
          days: p.settings.unwatchedDownloadDays,
          watched: p.progress.filter(isWatched).map((v) => ({ type: v.type, videoId: v.videoId })),
        })),
      }),
    ).catch(fail)
  }, [
    ready,
    state.profiles,
    state.settings.unwatchedDownloadDays,
    state.progress,
    state.activeProfileId,
    token,
    email,
  ])
  async function chooseSources(meta: Meta, id = meta.id, preferredAddon?: string) {
    setSourceTarget({ meta, id })
    setSourceList([])
    setSourceError('')
    setSourceLoading(true)
    const seq = ++sourceSequence.current
    try {
      const [r, fullMeta] = await Promise.all([
        streams(catalogAddons, meta.type, id),
        meta.logo ? Promise.resolve(meta) : metadata(catalogAddons, meta),
      ])
      if (seq !== sourceSequence.current) return
      meta = fullMeta
      setSourceTarget({ meta, id })
      const matching = equivalentSources(rankSources(r.items, plugins), state.settings, meta)
      const ranked = matching.items
      setSourceList(ranked)
      const nextStream = preferredAddon ? matching.equivalent : undefined
      if (nextStream) {
        await play(nextStream, { meta, id })
        return
      }
      setSourceError(
        r.failed
          ? r.failed + ' fournisseur(s) indisponible(s).'
          : r.providers
            ? ''
            : t('Ajoutez un addon de sources pour ce contenu.'),
      )
    } catch (e) {
      setSourceError(message(e))
    } finally {
      if (seq === sourceSequence.current) setSourceLoading(false)
    }
  }
  episodeRequest.current = (event) => {
    if (
      !event.requestedVideoId ||
      !event.actionId ||
      handledEpisode.current === event.actionId ||
      !playback ||
      (event.context?.accountId ?? 'local') !== (token ? email : 'local') ||
      event.context.profileId !== state.activeProfileId
    )
      return
    handledEpisode.current = event.actionId
    const current = playback
    setPlayback(null)
    void chooseSources(
      current.meta,
      event.requestedVideoId,
      event.autoPlay ? current.stream.addonName : undefined,
    )
  }
  async function play(stream: Stream, override?: { meta: Meta; id: string }) {
    if ((!sourceTarget && !override) || launchLock.current) return
    launchLock.current = true
    setLaunching(true)
    const sequence = sourceSequence.current
    try {
      const url = playbackUrl(stream)
      if (stream.externalUrl && !stream.url) {
        await openLink(url)
        return
      }
      const target = override ?? sourceTarget!
      const subs = [
        ...(stream.subtitles ?? []),
        ...(await subtitles(catalogAddons, target.meta.type, target.id)),
      ]
      const segments = await Promise.race([
        skipSegments(target.meta, target.id, state.settings),
        new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 4000)),
      ])
      if (sequence !== sourceSequence.current) return
      const p = { meta: target.meta, videoId: target.id, stream, url, subs }
      setPlayback(p)
      const position = state.settings.rememberPosition
        ? resumePosition(state.progress, target.meta.type, target.id)
        : 0
      if (isTauri()) {
        await invoke('play_media', {
          url,
          title: playbackTitle(target.meta, target.id),
          external: state.settings.player === 'external' && isAndroid(),
          position,
          playerExtra: JSON.stringify({
            ...episodeQueue(target.meta, target.id),
            ...playerOptions(state.settings),
          }),
          progressContext: JSON.stringify({
            profileId: state.activeProfileId,
            accountId: token ? email : 'local',
            meta: {
              id: target.meta.id,
              type: target.meta.type,
              name: target.meta.name,
              poster: target.meta.poster,
              category: target.meta.category,
              seasonCount:
                target.meta.seasonCount ??
                (target.meta.videos
                  ? new Set(
                      target.meta.videos
                        .filter((v) => (v.season ?? 1) > 0)
                        .map((v) => v.season ?? 1),
                    ).size
                  : undefined),
              videos: target.meta.videos?.filter((v) => v.id === target.id),
            },
            videoId: target.id,
          }),
          headers: stream.behaviorHints?.proxyHeaders?.request ?? {},
          subtitles: subs,
          language: audioPreference(state.settings, target.meta),
          subtitleLanguage: state.settings.subtitleLanguage,
          seekBackward: state.settings.seekBackward,
          seekForward: state.settings.seekForward,
          subtitleSize: state.settings.subtitleSize,
          playbackSpeed: state.settings.playbackSpeed,
          hardwareDecoding: state.settings.hardwareDecoding,
          showSubtitles: state.settings.subtitles,
          cacheSizeGb: state.settings.cacheSizeGb,
          skipSegments: segments,
          autoSkipIntro: state.settings.autoSkipIntro,
        })
        if (state.settings.player === 'external' && isAndroid()) setPlayback(null)
      } else if (state.settings.player === 'external') {
        setPlayback(null)
        throw Error(t('Le choix des lecteurs externes est disponible dans l’application Android.'))
      }
      setState((s) => ({
        ...s,
        settings: rememberSource(s.settings, target.meta, target.id, stream),
      }))
      setSourceTarget(null)
    } catch (e) {
      setPlayback(null)
      setSourceError(message(e))
    } finally {
      launchLock.current = false
      setLaunching(false)
    }
  }
  async function downloadSource(stream: Stream) {
    if (!sourceTarget) return
    if (!isTauri()) {
      notify(t('Les téléchargements sont disponibles sur Android.'))
      return
    }
    try {
      const url = playbackUrl(stream)
      if (!stream.url) throw Error(t('Cette source ouvre un service externe.'))
      const episode = sourceTarget.meta.videos?.find((v) => v.id === sourceTarget.id)
      const title =
        sourceTarget.meta.name +
        (episode ? ' · S' + (episode.season ?? 1) + ' E' + (episode.episode ?? 1) : '')
      await invoke('download_start', {
        url,
        title,
        metadata: {
          meta: {
            id: sourceTarget.meta.id,
            type: sourceTarget.meta.type,
            name: sourceTarget.meta.name,
            poster: sourceTarget.meta.poster,
            logo: sourceTarget.meta.logo,
            category: sourceTarget.meta.category,
          },
          videoId: sourceTarget.id,
          profileId: state.activeProfileId,
          accountId: token ? email : 'local',
        },
        headers: stream.behaviorHints?.proxyHeaders?.request ?? {},
        wifiOnly: state.settings.downloadWifiOnly,
      })
      notify(t('Téléchargement ajouté à Ma liste'))
    } catch (e) {
      setSourceError(message(e))
    }
  }
  async function playOffline(item: OfflineItem) {
    try {
      const p: Playback = {
        meta: item.meta.meta,
        videoId: item.meta.videoId,
        stream: {},
        url: '',
        subs: [],
      }
      setPlayback(p)
      await invoke('play_download', {
        id: item.id,
        options: {
          ...playerOptions(state.settings),
          title: item.title,
          ...episodeQueue(item.meta.meta, item.meta.videoId),
          context: {
            profileId: state.activeProfileId,
            accountId: token ? email : 'local',
            meta: item.meta.meta,
            videoId: item.meta.videoId,
          },
          position: state.settings.rememberPosition
            ? resumePosition(state.progress, item.meta.meta.type, item.meta.videoId)
            : 0,
        },
      })
    } catch (e) {
      setPlayback(null)
      fail(e)
    }
  }
  async function copyManifest(url: string) {
    try {
      if (isTauri()) await invoke('copy_text', { text: url })
      else await navigator.clipboard.writeText(url)
      notify(t('Lien du manifeste copié'))
    } catch {
      setManifestCopy(url)
    }
  }
  async function checkAddon(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      setCandidate(await inspectAddon(addonInput))
    } catch (e) {
      fail(e)
    } finally {
      setBusy(false)
    }
  }
  function installAddon(a: Addon) {
    if (a.manifest.behaviorHints?.configurationRequired) {
      setError(t('Configurez cet addon sur son site, puis collez le manifeste configuré.'))
      return
    }
    setState((s) => ({
      ...s,
      addons: [...s.addons.filter((x) => x.url !== a.url), { url: a.url, enabled: true }],
    }))
    setCandidate(null)
    setAddOpen(false)
    setAddonInput('')
    notify(a.manifest.name + t(' installé'))
  }
  const [verification, setVerification] = useState<
    (VerificationChallenge & { register: boolean }) | null
  >(null)
  async function finishAuthentication(result: Authenticated, address: string, signup: boolean) {
    setPlaybackSyncPaused(true)
    setToken(result.token)
    setEmail(address)
    setAuthOpen(false)
    setVerification(null)
    const next = signup
      ? {
          ...state,
          profiles: state.profiles.map((p) =>
            p.id === state.activeProfileId ? { ...p, name: result.user.username ?? p.name } : p,
          ),
        }
      : state
    if (signup) setState(next)
    try {
      const remote = await api<{ version: number; state: UserState | null }>(
        '/account/sync',
        'GET',
        undefined,
        result.token,
      )
      setSyncVersion(remote.version)
      if (remote.state) setConflict({ ...remote, state: remote.state })
      else {
        const saved = await api<{ version: number }>(
          '/account/sync',
          'PUT',
          { version: remote.version, state: snapshotState(next) },
          result.token,
        )
        setSyncVersion(saved.version)
      }
      notify(signup ? t('Compte créé') : t('Connexion réussie'))
    } finally {
      setPlaybackSyncPaused(false)
    }
  }
  const nativeAuthActive = useRef(false)
  useEffect(() => {
    if (!authOpen || !isAndroid() || nativeAuthActive.current) return
    nativeAuthActive.current = true
    void invoke<
      (Authenticated | VerificationChallenge) & {
        cancelled?: boolean
        email: string
        register: boolean
      }
    >('native_auth', { register })
      .then(async (result) => {
        if (result.cancelled) return
        if ('verificationRequired' in result) {
          setVerification(result)
          return
        }
        await finishAuthentication(result, result.email, result.register)
      })
      .catch(fail)
      .finally(() => {
        nativeAuthActive.current = false
        setAuthOpen(false)
      })
  }, [authOpen, register])
  async function authenticate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const f = new FormData(e.currentTarget)
    setAuthBusy(true)
    setError('')
    try {
      const email = String(f.get('email')).trim().toLowerCase(),
        password = String(f.get('password'))
      if (register && password !== f.get('passwordConfirmation'))
        throw Error(t('Les mots de passe ne correspondent pas.'))
      const result = await api<Authenticated | VerificationChallenge>(
        '/auth/' + (register ? 'signup' : 'login'),
        'POST',
        {
          emailVerification: true,
          email,
          password,
          ...(register
            ? {
                fullName: null,
                username: String(f.get('username')),
                passwordConfirmation: String(f.get('passwordConfirmation')),
                termsAccepted: f.get('terms') === 'on',
                termsVersion: '2026-09-23',
              }
            : {}),
        },
      )
      if ('verificationRequired' in result) {
        setAuthOpen(false)
        setVerification({ ...result, register })
      } else await finishAuthentication(result, email, register)
    } catch (e) {
      fail(e)
    } finally {
      setAuthBusy(false)
    }
  }
  async function sync() {
    if (!token) {
      setAuthOpen(true)
      return
    }
    setSyncing(true)
    setError('')
    try {
      const remote = await api<{ version: number; state: UserState | null }>(
        '/account/sync',
        'GET',
        undefined,
        token,
      )
      if (remote.version !== syncVersion && remote.state) {
        setConflict({ ...remote, state: remote.state })
        return
      }
      const merged = mergePlaybackState(state, remote.state?.profiles ?? [])
      const result = await api<{ version: number }>(
        '/account/sync',
        'PUT',
        { version: syncVersion, state: snapshotState(merged) },
        token,
      )
      setState((current) => mergePlaybackState(current, merged.profiles))
      setSyncVersion(result.version)
      notify(t('Bibliothèque synchronisée'))
    } catch (e) {
      if ((e as { status?: number }).status === 401) {
        setToken('')
        setAuthOpen(true)
      }
      fail(e)
    } finally {
      setSyncing(false)
    }
  }
  async function logout() {
    try {
      if (token) await api('/account/logout', 'POST', undefined, token)
      setToken('')
      setEmail('')
      setSyncVersion(0)
      setState(createState())
      notify(t('Déconnecté'))
    } catch (e) {
      fail(e)
    }
  }
  const hero = catalogue[0],
    saved = (m: Meta) => state.library.some((x) => x.id === m.id && x.type === m.type)
  const poster = (m: Meta) => (
    <button
      key={m.type + ':' + m.id}
      className="poster"
      aria-label={m.name}
      onClick={() => details(m)}
    >
      <MediaImage src={m.poster} />
      {isWatched(findProgress(state.progress, m.type, m.id)) && (
        <span className="watched-badge">
          <Check size={14} /> {t('Vu')}
        </span>
      )}
      <strong>{m.name}</strong>
      <small>{m.releaseInfo ?? (m.type === 'series' ? t('Série') : t('Film'))}</small>
    </button>
  )
  const visibleLibrary = state.library.filter(
    (m) =>
      (!(state.collections ?? []).some(c => c.id === collectionId) || (state.collections ?? []).find(c => c.id === collectionId)!.items.includes(collectionKey(m))) &&
      matchesCategory(m, libraryFilter) &&
      (!state.settings.hideWatched || !titleWatched(m, state.progress, releases.metas)),
  )
  const heading = (
    title: string,
    back = !['home', 'explore', 'library', 'settings'].includes(tab),
  ) => (
    <header className="page-head">
      {back && (
        <button className="icon glass back-button" aria-label={t('Retour')} onClick={goBack}>
          <ArrowLeft />
        </button>
      )}
      <h1>{title}</h1>
      {tab === 'library' && (
        <button className="icon" aria-label={t('Sorties')} onClick={() => navigate('calendar')}>
          <CalendarDays />
        </button>
      )}
    </header>
  )
  const navigationTab =
    tab === 'notifications'
      ? 'home'
      : tab === 'calendar'
        ? 'library'
        : tab === 'anime'
          ? 'explore'
          : ['home', 'explore', 'library'].includes(tab)
            ? tab
            : 'settings'
  return (
    <div
      className={
        'app posters-' +
        state.settings.posterSize +
        (state.settings.showPosterLabels ? '' : ' hide-poster-labels')
      }
      style={{ '--content-columns': state.settings.contentColumns } as React.CSSProperties}
    >
      {!ready && (
        <div className="boot-screen" role="status">
          <img src="/brand/primio.png" alt="Primio" />
          <span className="wordmark">PRIMIO</span>
          <span className="boot-spinner" />
        </div>
      )}
      {!online && (
        <div className="offline">
          <WifiOff size={16} /> {t('Hors connexion · votre liste reste disponible')}
        </div>
      )}
      {error && (
        <div className="notice" role="alert">
          {error}
          <button className="icon" aria-label={t('Fermer le message')} onClick={() => setError('')}>
            <X size={18} />
          </button>
        </div>
      )}
      <div
        inert={onboarding || profileGate}
        key={selected?.id ?? pluginPage?.id ?? tab}
        className={'page-slide slide-' + slideDirection}
        onTouchStart={(e) => {
          touchStart.current = null
          if (
            !state.settings.swipeNavigation ||
            e.touches.length !== 1 ||
            (e.target instanceof Element &&
              e.target.closest('input,.poster-rail,.chips,.continue-grid,.choice-options'))
          )
            return
          touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        }}
        onTouchEnd={(e) => {
          const start = touchStart.current
          touchStart.current = null
          if (!start || !e.changedTouches[0]) return
          const dx = e.changedTouches[0].clientX - start.x,
            dy = e.changedTouches[0].clientY - start.y
          if (
            dx > 80 &&
            dx > Math.abs(dy) * 1.8 &&
            (selected || pluginPage || !['home', 'explore', 'library', 'settings'].includes(tab))
          ) {
            goBack()
            return
          }
          const pages: Tab[] = ['home', 'explore', 'library', 'settings']
          const i = pages.indexOf(tab)
          if (i >= 0 && Math.abs(dx) > 80 && Math.abs(dx) > Math.abs(dy) * 1.8) {
            const next = pages[i + (dx < 0 ? 1 : -1)]
            if (next) {
              e.preventDefault()
              navigate(next)
            }
          }
        }}
        onTouchCancel={() => {
          touchStart.current = null
        }}
        onTouchMove={(e) => {
          const start = touchStart.current
          const point = e.touches[0]
          if (start && point && Math.abs(point.clientY - start.y) > 16) touchStart.current = null
        }}
      >
        {selected ? (
          <main className="detail">
            <div className="detail-art">
              <MediaImage src={selected.background ?? selected.poster} eager />
              <div className="detail-toolbar">
                <button
                  className="icon glass"
                  aria-label={t('Retour')}
                  onClick={() => {
                    ++detailSequence.current
                    setSelected(null)
                  }}
                >
                  <ArrowLeft />
                </button>
                <div className="detail-actions">
                  {trailerUrl(selected) && (
                    <button
                      className="icon glass"
                      aria-label={t('Bande-annonce')}
                      onClick={() => setTrailer({ url: trailerUrl(selected), name: selected.name })}
                    >
                      <Clapperboard />
                    </button>
                  )}
                  <button
                    className="icon glass"
                    aria-label={
                      saved(selected) ? t('Retirer de ma liste') : t('Ajouter à ma liste')
                    }
                    onClick={() => bookmark(selected)}
                  >
                    <Bookmark fill={saved(selected) ? 'currentColor' : 'none'} />
                  </button>
                </div>
              </div>
            </div>
            <section className="detail-copy">
              <span className="eyebrow">
                {isAnime(selected) ? 'ANIME' : selected.type === 'series' ? t('SÉRIE') : 'FILM'}{' '}
                {selected.imdbRating && (
                  <span className="imdb-rating">IMDb · ★ {selected.imdbRating}/10</span>
                )}
              </span>
              <CopyTitle
                title={selected.name}
                onCopied={() => notify(t('Titre copié'))}
                onError={fail}
              />
              <p className="muted">
                {[selected.releaseInfo, selected.runtime].filter(Boolean).join(' · ')}
              </p>
              {!!selected.genres?.length && (
                <div className="chips detail-genres">
                  {selected.genres.map((g) => (
                    <button
                      key={g}
                      onClick={() => {
                        const type = isAnime(selected) ? 'anime' : selected.type
                        navigate('explore')
                        setKind(type)
                        setQuery('')
                        setGenre(g)
                      }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              )}
              <button
                className="primary"
                onClick={() =>
                  selected.videos?.length
                    ? chooseSources(
                        selected,
                        state.progress.find(
                          (p) =>
                            p.id === selected.id &&
                            p.type === selected.type &&
                            !isWatched(p) &&
                            p.position > 0,
                        )?.videoId ??
                          selected.videos.find(
                            (v) => !isWatched(findProgress(state.progress, selected.type, v.id)),
                          )?.id ??
                          selected.videos[0].id,
                      )
                    : chooseSources(selected)
                }
              >
                <Play />{' '}
                {state.progress.some(
                  (p) =>
                    p.id === selected.id &&
                    p.type === selected.type &&
                    !isWatched(p) &&
                    p.position > 0,
                )
                  ? t('Reprendre')
                  : t('Regarder')}
              </button>
              {!selected.videos?.length && (
                <button
                  className="watched-toggle secondary"
                  aria-pressed={isWatched(findProgress(state.progress, selected.type, selected.id))}
                  onClick={() => toggleWatched(selected, selected.id)}
                >
                  <Check size={18} />
                  {isWatched(findProgress(state.progress, selected.type, selected.id))
                    ? t('Vu · Marquer non vu')
                    : t('Marquer comme vu')}
                </button>
              )}
              {detailLoading ? (
                <div
                  className="detail-skeleton"
                  role="status"
                  aria-label={t('Chargement de la fiche')}
                >
                  <span className="skeleton skeleton-title" />
                  <span className="skeleton skeleton-title" />
                  <span className="skeleton skeleton-caption" />
                </div>
              ) : (
                selected.description && (
                  <Description key={'description:' + selected.id} text={selected.description} />
                )
              )}
              {selected.cast?.length || selected.director?.length ? (
                <dl className="content-credits">
                  {!!selected.director?.length && (
                    <div>
                      <dt>{t('Réalisation')}</dt>
                      <dd>{selected.director.join(', ')}</dd>
                    </div>
                  )}
                  {!!selected.cast?.length && (
                    <div>
                      <dt>{t('Distribution')}</dt>
                      <dd>{selected.cast.join(', ')}</dd>
                    </div>
                  )}
                </dl>
              ) : null}
              {selected.videos?.length ? (
                <Episodes
                  key={'episodes:' + selected.id}
                  meta={selected}
                  spoilers={state.settings.showSpoilers}
                  progress={state.progress}
                  onToggleWatched={(id) => toggleWatched(selected, id)}
                  onPlay={(id) => chooseSources(selected, id)}
                />
              ) : null}
            </section>
          </main>
        ) : pluginPage ? (
          <main>
            {heading(
              pluginPage.plugin.pages?.find((p) => p.id === pluginPage.id)?.title ?? t('Plugin'),
              true,
            )}
            <section className="page-content">
              {pluginPage.plugin.pages
                ?.find((p) => p.id === pluginPage.id)
                ?.blocks.map((block, i) =>
                  block.kind === 'text' ? (
                    <p key={i}>{block.text}</p>
                  ) : block.kind === 'link' ? (
                    <button key={i} className="row" onClick={() => openLink(block.url).catch(fail)}>
                      {block.label}
                      <ExternalLink />
                    </button>
                  ) : (
                    <PluginCatalog key={i} block={block} onSelect={details} />
                  ),
                )}
            </section>
          </main>
        ) : tab === 'home' ? (
          <main>
            <section className="hero">
              <MediaImage src={hero?.background ?? hero?.poster ?? '/art/hero.png'} eager />
              <header className="hero-head">
                <span className="wordmark">PRIMIO</span>
                <div>
                  <button
                    className="icon glass"
                    aria-label={t('Rechercher')}
                    onClick={() => navigate('explore')}
                  >
                    <Search />
                  </button>
                  <button
                    className="icon glass"
                    aria-label={t('Notifications')}
                    onClick={() => navigate('notifications')}
                  >
                    <Bell />
                  </button>
                </div>
              </header>
              <div className="hero-copy">
                <span className="eyebrow">{t('À LA UNE')}</span>
                <h1 className="serif">{hero?.name ?? t('Votre cinéma, autrement.')}</h1>
                <p>
                  {hero
                    ? [hero.releaseInfo, ...(hero.genres ?? []).slice(0, 1)]
                        .filter(Boolean)
                        .join(' · ')
                    : t('Tous vos univers, au même endroit.')}
                </p>
                <div className="hero-actions">
                  <button
                    className="primary"
                    disabled={busy && !hero}
                    onClick={() => (hero ? details(hero) : navigate('addons'))}
                  >
                    <Play />
                    {hero ? t('Découvrir') : t('Explorer les addons')}
                  </button>
                  {hero && (
                    <button
                      className="icon glass large"
                      aria-label={saved(hero) ? t('Retirer de ma liste') : t('Ajouter à ma liste')}
                      onClick={() => bookmark(hero)}
                    >
                      <Bookmark fill={saved(hero) ? 'currentColor' : 'none'} />
                    </button>
                  )}
                </div>
              </div>
            </section>
            {state.settings.showContinue &&
              state.progress.some((p) => !isWatched(p) && p.position > 0) && (
                <section className="shelf">
                  <div className="section-head">
                    <h2>{t('Reprendre')}</h2>
                    <button onClick={() => navigate('library')}>{t('Tout voir')}</button>
                  </div>
                  <div className="continue-grid">
                    {state.progress
                      .filter((p) => !isWatched(p) && p.position > 0)
                      .sort((a, b) => b.updatedAt - a.updatedAt)
                      .slice(0, 10)
                      .map((p) => (
                        <ContinueCard
                          key={p.type + p.videoId}
                          item={p}
                          addons={catalogAddons}
                          onPlay={() => chooseSources(p, p.videoId)}
                        />
                      ))}
                  </div>
                </section>
              )}
            <section className="shelf">
              <div className="section-head">
                <h2>{t('À découvrir')}</h2>
                <button onClick={() => navigate('explore')}>{t('Tout voir')}</button>
              </div>
              {busy && !catalogue.length ? (
                <div className="skeleton-grid" aria-label={t('Chargement du catalogue')}>
                  {[1, 2, 3].map((i) => (
                    <CardSkeleton key={i} />
                  ))}
                </div>
              ) : catalogue.length ? (
                <div className="poster-rail">{catalogue.slice(1, 13).map(poster)}</div>
              ) : (
                <Empty
                  title={t('Votre cinéma commence ici')}
                  action={
                    <button className="secondary" onClick={() => navigate('addons')}>
                      <Plus /> {t('Ajouter un addon')}
                    </button>
                  }
                >
                  {t('Installez vos catalogues et sources favoris.')}
                </Empty>
              )}
            </section>
            {(['movie', 'series', 'anime'] as const).map((category) => (
              <Recommendations
                key={state.activeProfileId + category}
                category={category}
                addons={catalogAddons}
                library={state.library}
                renderItem={poster}
                onExplore={() => {
                  navigate('explore')
                  setKind(category)
                }}
              />
            ))}
            {plugins.some((p) => p.pages?.length) && (
              <section className="shelf">
                <h2>{t('Vos espaces')}</h2>
                {plugins.flatMap((p) =>
                  (p.pages ?? []).map((page) => (
                    <button
                      key={p.id + page.id}
                      className="row"
                      onClick={() => setPluginPage({ plugin: p, id: page.id })}
                    >
                      {page.title}
                      <ChevronRight />
                    </button>
                  )),
                )}
              </section>
            )}
          </main>
        ) : tab === 'explore' || tab === 'anime' ? (
          <main>
            {heading(tab === 'anime' ? t('Animes') : t('Explorer'))}
            <section className="page-content">
              <label className="search-box">
                <Search />
                <input
                  placeholder={t('Films, séries, envies…')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label={t('Rechercher un titre')}
                />
                {query && (
                  <button
                    className="icon"
                    aria-label={t('Effacer la recherche')}
                    onClick={() => setQuery('')}
                  >
                    <X />
                  </button>
                )}
              </label>
              <div className="explorer-filters">
                <Choice
                  separateLabel
                  label={t('Type')}
                  value={animeFilter ? 'anime' : kind}
                  options={[
                    ['movie', t('Films')],
                    ['anime', t('Animes')],
                    ['series', t('Séries')],
                  ]}
                  onChange={(v) => {
                    setKind(v)
                    setTab('explore')
                    setCatalogChoice('all')
                    setGenre('')
                  }}
                />
                <Choice
                  separateLabel
                  label={t('Catalogue')}
                  value={catalogChoice}
                  options={[
                    ['all', t('Tous')],
                    ...(animeFilter ? [['seasonal', t('Par saison')] as [string, string]] : []),
                    ...Array.from(
                      new Map(
                        catalogTargets(
                          catalogAddons,
                          kind,
                          'all',
                          searchQuery,
                          animeFilter,
                          genre,
                          true,
                        ).map(({ addon, catalog: c }) => [
                          addon.url + '|' + c.type + '|' + c.id,
                          [
                            addon.url + '|' + c.type + '|' + c.id,
                            addon.manifest.name + ' · ' + (c.name ?? c.id),
                          ] as [string, string],
                        ]),
                      ).values(),
                    ),
                  ]}
                  onChange={(v) => {
                    setCatalogChoice(v)
                    setGenre(v === 'seasonal' ? currentSeason() : '')
                  }}
                />
                <Choice
                  separateLabel
                  label={t('Genre')}
                  value={genre}
                  options={
                    catalogChoice === 'seasonal'
                      ? seasonOptions()
                      : [
                          ['', t('Tous')],
                          ...Array.from(
                            new Set(
                              catalogTargets(
                                catalogAddons,
                                kind,
                                catalogChoice,
                                searchQuery,
                                animeFilter,
                                '',
                                true,
                              ).flatMap(
                                ({ catalog: c }) =>
                                  c.extra?.find((e) => e.name === 'genre')?.options ?? [],
                              ),
                            ),
                          )
                            .filter((g) => !/^\d{4}$/.test(g))
                            .sort((a, b) => a.localeCompare(b))
                            .map((g) => [g, g] as [string, string]),
                        ]
                  }
                  onChange={setGenre}
                />
              </div>
              <div className="explorer-sort">
                <Choice
                  label={t('Trier par')}
                  value={sort.key}
                  options={[
                    ['default', t('Par défaut')],
                    ['rating', t('Note')],
                    ['name', t('Nom')],
                    ['year', t('Année')],
                  ]}
                  onChange={(key) =>
                    setState((s) => ({
                      ...s,
                      settings: {
                        ...s.settings,
                        explorerSort: { ...sort, key: key as typeof sort.key },
                      },
                    }))
                  }
                />
                <button
                  className="sort-direction"
                  aria-label={t(sort.direction === 'asc' ? 'Croissant' : 'Décroissant')}
                  title={t(sort.direction === 'asc' ? 'Croissant' : 'Décroissant')}
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      settings: {
                        ...s.settings,
                        explorerSort: {
                          ...sort,
                          direction: sort.direction === 'asc' ? 'desc' : 'asc',
                        },
                      },
                    }))
                  }
                >
                  {sort.direction === 'asc' ? <ArrowUp /> : <ArrowDown />}
                  <span>{t(sort.direction === 'asc' ? 'Croissant' : 'Décroissant')}</span>
                </button>
              </div>
              {catalogChoice === 'seasonal' && animeFilter ? (
                <SeasonalAnime
                  key={genre + searchQuery}
                  season={genre || currentSeason()}
                  query={searchQuery}
                  renderItem={poster}
                  sort={sort}
                />
              ) : searchQuery ? (
                <GroupedSearch
                  choice={catalogChoice}
                  addons={catalogAddons}
                  query={searchQuery}
                  genre={genre}
                  renderItem={poster}
                  sort={sort}
                />
              ) : (
                <CatalogFeed
                  key={JSON.stringify([
                    tab,
                    kind,
                    catalogChoice,
                    genre,
                    searchQuery,
                    catalogAddons,
                  ])}
                  targets={catalogTargets(
                    catalogAddons,
                    kind,
                    catalogChoice,
                    searchQuery,
                    animeFilter,
                    genre,
                  )}
                  genre={genre}
                  query={searchQuery}
                  renderItem={poster}
                  sort={sort}
                  empty={
                    <Empty title={t('Aucun résultat')}>
                      {tab === 'anime' ? (
                        <>
                          {t('Aucun catalogue anime.')}
                          <button
                            className="secondary"
                            onClick={() => {
                              setAddonInput('https://anime-kitsu.strem.fun/manifest.json')
                              setAddOpen(true)
                              setCandidate(null)
                            }}
                          >
                            {t('Ajouter Anime Kitsu')}
                          </button>
                        </>
                      ) : (
                        t(
                          'Essayez un autre titre ou ajoutez un catalogue compatible avec la recherche.',
                        )
                      )}
                    </Empty>
                  }
                />
              )}
            </section>
          </main>
        ) : tab === 'calendar' ? (
          <main>
            {heading(t('Sorties'))}
            <section className="page-content">
              <ReleaseCalendar releases={releases} onSelect={details} />
            </section>
          </main>
        ) : tab === 'notifications' ? (
          <main>
            {heading(t('Notifications'))}
            <section className="page-content">
              <NotificationCenter
                releases={releases}
                settings={state.settings}
                onSettings={(settings) => setState((s) => ({ ...s, settings }))}
                onSelect={details}
              />
            </section>
          </main>
        ) : tab === 'library' ? (
          <main>
            {heading(t('Ma liste'))}
            <section className="page-content">
              <div className="section-head">
                <p className="muted">
                  {t(state.library.length === 1 ? '{n} titre' : '{n} titres', {
                    n: state.library.length,
                  })}
                </p>
                <button onClick={sync} disabled={syncing}>
                  <RefreshCw size={16} /> {t('Synchroniser')}
                </button>
              </div>
              <Collections state={state} setState={setState} selected={collectionId} onSelect={setCollectionId}/>
              <div className="chips" role="group" aria-label={t('Filtrer ma liste')}>
                {[
                  ['all', t('Tous')],
                  ['movie', t('Films')],
                  ['series', t('Séries')],
                  ['anime', t('Animes')],
                ].map(([id, label]) => (
                  <button
                    key={id}
                    aria-pressed={libraryFilter === id}
                    className={libraryFilter === id ? 'selected' : ''}
                    onClick={() => setLibraryFilter(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Toggle
                unlined
                label={t('Masquer les contenus vus')}
                checked={state.settings.hideWatched}
                onChange={(hideWatched) =>
                  setState((s) => ({ ...s, settings: { ...s.settings, hideWatched } }))
                }
              />
              {visibleLibrary.length ? (
                <ProgressiveList
                  key={state.activeProfileId + libraryFilter + collectionId}
                  items={visibleLibrary}
                  renderItem={poster}
                  className="poster-grid"
                />
              ) : (
                <Empty title={t('Gardez une place pour vos envies')}>
                  {t('Touchez le marque-page d’un film ou d’une série pour le retrouver ici.')}
                </Empty>
              )}
            </section>
          </main>
        ) : tab === 'addons' ? (
          <main>
            {heading(t('Vos addons'))}
            <section className="page-content addon-content">
              <p className="intro">{t('Un cinéma à votre image.')}</p>
              <p className="muted">
                {t('Catalogues, sources et sous-titres, réunis dans Primio.')}
              </p>
              <button
                className="primary"
                onClick={() => {
                  setAddOpen(true)
                  setCandidate(null)
                }}
              >
                <Plus /> {t('Ajouter un addon')}
              </button>
              <div className="section-head">
                <h2>{t('Installés')}</h2>
                <span className="muted">{state.addons.length}</span>
              </div>
              {state.addons.map((item, index) => {
                const a = addons.find((a) => a.url === item.url)
                return (
                  <article className="addon-card glass" key={item.url}>
                    <div className="row unlined">
                      <AddonIcon key={a?.manifest.logo} logo={a?.manifest.logo} />
                      <div className="grow">
                        <h3>{a?.manifest.name ?? new URL(item.url).hostname}</h3>
                        <small>{a?.manifest.version ?? t('Indisponible')}</small>
                      </div>
                      <button
                        role="switch"
                        aria-checked={item.enabled}
                        aria-label={t('Activer ') + (a?.manifest.name ?? t('l’addon'))}
                        className={'switch ' + (item.enabled ? 'on' : '')}
                        onClick={() =>
                          setState((s) => ({
                            ...s,
                            addons: s.addons.map((x) =>
                              x.url === item.url ? { ...x, enabled: !x.enabled } : x,
                            ),
                          }))
                        }
                      >
                        <span />
                      </button>
                    </div>
                    <div className="addon-actions">
                      <button
                        className="icon"
                        title={t('Copier le manifeste')}
                        aria-label={t('Copier le manifeste')}
                        onClick={() => copyManifest(item.url)}
                      >
                        <Copy size={18} />
                      </button>
                      <div className="addon-order">
                        <button
                          className="icon"
                          aria-label={t('Monter ') + (a?.manifest.name ?? 'cet addon')}
                          disabled={index === 0}
                          onClick={() => moveAddon(index, -1)}
                        >
                          <ArrowUp />
                        </button>
                        <span>
                          {t('Priorité')} {index + 1}
                        </span>
                        <button
                          className="icon"
                          aria-label={t('Descendre ') + (a?.manifest.name ?? 'cet addon')}
                          disabled={index === state.addons.length - 1}
                          onClick={() => moveAddon(index, 1)}
                        >
                          <ArrowDown />
                        </button>
                      </div>
                      <button
                        className="icon"
                        aria-label={t('Désinstaller ') + (a?.manifest.name ?? 'cet addon')}
                        onClick={() =>
                          setState((s) => ({
                            ...s,
                            addons: s.addons.filter((x) => x.url !== item.url),
                          }))
                        }
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                    <Description
                      limit={140}
                      text={a?.manifest.description ?? t('Le manifeste n’a pas pu être chargé.')}
                    />
                    <div className="addon-tools">
                      {a?.manifest.behaviorHints?.configurable && (
                        <button
                          className="secondary"
                          onClick={() =>
                            openLink(item.url.replace(/\/manifest.json$/, '/configure')).catch(fail)
                          }
                        >
                          <ExternalLink />
                          {t('Configurer')}
                        </button>
                      )}
                    </div>
                    <div className="section-head">
                      <div className="badges">
                        {a?.manifest.resources.map((r) => (
                          <span key={typeof r === 'string' ? r : r.name}>
                            {typeof r === 'string' ? r : r.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </article>
                )
              })}
              {!state.addons.length && (
                <Empty title={t('Aucun addon installé')}>
                  {t('Ajoutez un manifeste Stremio pour commencer.')}
                </Empty>
              )}
              <button className="row" onClick={() => navigate('plugins')}>
                <Puzzle /> {t('Plugins Primio')}
                <ChevronRight />
              </button>
            </section>
          </main>
        ) : tab === 'plugins' ? (
          <main>
            {heading(t('Plugins Primio'))}
            <section className="page-content addon-content">
              <p className="intro">{t('Faites de Primio le vôtre.')}</p>
              <p className="muted">{t('Thèmes, espaces, catalogues et classement des sources.')}</p>
              <article className="addon-card glass">
                <div className="row unlined">
                  <Sparkles />
                  <div className="grow">
                    <h3>Primio Intro Skipper</h3>
                    <small>Plugin intégré · 0.2.0</small>
                  </div>
                  <Check />
                </div>
                <p className="muted">{t('Passer les intros et les génériques.')}</p>
                <button className="secondary" onClick={() => setSkipOpen(true)}>
                  {t('Configurer le saut des génériques')}
                </button>
              </article>
              <label className="primary file-picker">
                <Download /> {t('Installer un plugin')}
                <input
                  type="file"
                  accept=".json,.primio"
                  onChange={async (e) => {
                    try {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 250000) throw Error(t('Plugin trop volumineux.'))
                      setPluginCandidate(pluginSchema.parse(JSON.parse(await file.text())))
                    } catch (e) {
                      fail(e)
                    } finally {
                      e.target.value = ''
                    }
                  }}
                />
              </label>
              {plugins.map((p) => (
                <article className="addon-card glass" key={p.id}>
                  <h3>
                    {p.name} <small>{p.version}</small>
                  </h3>
                  <Description text={p.description ?? ''} />
                  <small>
                    {t('Par')} {p.author}
                  </small>
                  <div className="section-head">
                    <div className="badges">
                      {p.permissions.map((x) => (
                        <span key={x}>{x}</span>
                      ))}
                    </div>
                    <button
                      className="icon"
                      aria-label={t('Désinstaller ') + p.name}
                      onClick={() => setPlugins((list) => list.filter((x) => x.id !== p.id))}
                    >
                      <Trash2 />
                    </button>
                  </div>
                  {p.addons?.map((a) => (
                    <button
                      className="row"
                      key={a.manifest}
                      onClick={() => {
                        setAddonInput(a.manifest)
                        setAddOpen(true)
                        setCandidate(null)
                      }}
                    >
                      {a.name}
                      <Plus />
                    </button>
                  ))}
                  {p.pages?.map((page) => (
                    <button
                      className="row"
                      key={page.id}
                      onClick={() => setPluginPage({ plugin: p, id: page.id })}
                    >
                      {page.title}
                      <ChevronRight />
                    </button>
                  ))}
                </article>
              ))}
              {!plugins.length && (
                <Empty title={t('Un espace à personnaliser')}>
                  {t(
                    'Installez un fichier de plugin Primio pour ajouter de nouvelles possibilités.',
                  )}
                </Empty>
              )}
            </section>
          </main>
        ) : (
          <main>
            {heading(
              (
                {
                  settings: t('Paramètres'),
                  diagnostics: t('Diagnostic'),
                  integrations: t('Services connectés'),
                  account: t('Compte et profils'),
                  player: t('Lecteur'),
                  options: t('Options'),
                  history: t('Historique'),
                  downloads: t('Téléchargements'),
                } as Record<string, string>
              )[tab] ?? t('Paramètres'),
            )}
            <section
              className={
                'page-content settings-content' + (tab === 'settings' ? ' settings-hub' : '')
              }
            >
              {tab === 'settings' && (
                <>
                  <div className="settings-intro">
                    <img src="/brand/primio.png" alt="" />
                    <div>
                      <h2>{t('À votre image')}</h2>
                      <p className="muted">
                        {state.profiles.find((p) => p.id === state.activeProfileId)?.name}
                      </p>
                    </div>
                  </div>
                  {(
                    [
                      [
                        UserRound,
                        'account',
                        t('Compte et profils'),
                        t('Connexion, synchronisation et profils'),
                      ],
                      [Puzzle, 'addons', t('Addons'), t('Catalogues et sources')],
                      [SlidersHorizontal, 'diagnostics', t('Diagnostic'), t('Rapports et assistance')],
                      [RefreshCw, 'integrations', t('Services connectés'), 'Trakt · AniList · MyAnimeList'],
                      [Sparkles, 'plugins', t('Plugins'), t('Personnaliser Primio')],
                      [Play, 'player', t('Lecteur'), t('Lecture et sous-titres')],
                      [History, 'history', t('Historique'), t('Retrouver vos visionnages')],
                      [
                        Download,
                        'downloads',
                        t('Téléchargements'),
                        t('Vidéos hors connexion et stockage'),
                      ],
                      [SlidersHorizontal, 'options', t('Options'), t('Apparence et navigation')],
                    ] as const
                  ).map(([Icon, id, label, description]) => (
                    <button key={id} className="settings-link glass" onClick={() => navigate(id)}>
                      <Icon />
                      <span>
                        <strong>{label}</strong>
                        <small>{description}</small>
                      </span>
                      <ChevronRight />
                    </button>
                  ))}
                  <button className="settings-link glass" onClick={() => setImportOpen(true)}>
                    <Download />
                    <span>
                      <strong>{t('Importer une bibliothèque')}</strong>
                      <small>Stremio · MyAnimeList · AniList · Trakt</small>
                    </span>
                    <ChevronRight />
                  </button>
                  <button className="row" onClick={() => setProfileGate(true)}>
                    {t('Changer de profil')}
                    <UserRound />
                  </button>
                  <button className="row" onClick={() => setOnboarding(true)}>
                    {t('Revoir le guide de bienvenue')}
                    <ChevronRight />
                  </button>
                  <div className="about">
                    <span className="wordmark">PRIMIO</span>
                    {isTauri() && (
                      <button
                        className="secondary"
                        onClick={() => window.dispatchEvent(new Event('primio-check-update'))}
                      >
                        {t('Rechercher une mise à jour')}
                      </button>
                    )}
                    <p>
                      {t('Version')} {version}
                    </p>
                  </div>
                </>
              )}
              {tab === 'account' && (
                <>
                  {' '}
                  <article className="account-card glass">
                    <UserRound />
                    <div>
                      <h2>{token ? t('Votre compte') : t('Votre cinéma vous suit')}</h2>
                      <p>{token ? email : t('Retrouvez votre liste et votre progression.')}</p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => (token ? sync() : setAuthOpen(true))}
                      disabled={syncing}
                    >
                      {token ? t('Synchroniser') : t('Se connecter')}
                    </button>
                  </article>
                  <Choice
                    label={t('Profil au démarrage')}
                    value={
                      state.profiles.some((p) => p.id === startupProfile) ? startupProfile : 'ask'
                    }
                    options={[
                      ['ask', t('Toujours demander')],
                      ...state.profiles.map((p) => [p.id, p.name] as [string, string]),
                    ]}
                    onChange={setAutomaticProfile}
                  />
                  <button className="secondary" onClick={() => setProfileGate(true)}>
                    {t('Changer de profil')}
                  </button>
                  <Profiles
                    state={state}
                    setState={setState}
                    connected={!!token}
                    onSync={sync}
                    onError={fail}
                    beforeRemove={async (profileId) => {
                      if (!isTauri()) return
                      const { items } = await invoke<{ items: OfflineItem[] }>('download_list')
                      for (const item of items.filter(
                        (i) =>
                          i.meta.profileId === profileId &&
                          i.meta.accountId === (token ? email : 'local'),
                      )) {
                        await invoke('download_remove', { id: item.id })
                      }
                    }}
                  />
                  <h2>{t('Compte')}</h2>
                  {token ? (
                    <>
                      <button className="row" onClick={logout}>
                        {t('Se déconnecter')}
                        <ChevronRight />
                      </button>
                      <button className="row danger" onClick={() => setDeleteOpen(true)}>
                        {t('Supprimer mon compte')}
                        <Trash2 />
                      </button>
                    </>
                  ) : (
                    <button className="row" onClick={() => setAuthOpen(true)}>
                      {t('Créer un compte ou se connecter')}
                      <ChevronRight />
                    </button>
                  )}
                </>
              )}
              {tab === 'diagnostics' && <DiagnosticsPanel token={token}/>}
              {tab === 'integrations' && <IntegrationsPanel token={token} profileId={state.activeProfileId}/>}
              {(tab === 'player' || tab === 'options') && (
                <Preferences
                  section={tab}
                  settings={state.settings}
                  onChange={(settings) => setState((s) => ({ ...s, settings }))}
                />
              )}
              {tab === 'history' && (
                <ViewingHistory
                  items={state.progress}
                  onPlay={(p) => chooseSources(p, p.videoId)}
                  onRemove={(p) =>
                    setState((s) => ({
                      ...s,
                      progress: s.progress.filter(
                        (x) => x.videoId !== p.videoId || x.type !== p.type,
                      ),
                    }))
                  }
                />
              )}
              {tab === 'downloads' && (
                <>
                  {' '}
                  <Downloads
                    accountId={token ? email : 'local'}
                    profileId={state.activeProfileId}
                    onPlay={playOffline}
                    onError={fail}
                  />
                  <Preferences
                    section="storage"
                    settings={state.settings}
                    onChange={(settings) => setState((s) => ({ ...s, settings }))}
                  />
                </>
              )}
            </section>
          </main>
        )}
      </div>
      {!onboarding && !profileGate && (
        <nav className="bottom-nav glass" aria-label={t('Navigation principale')}>
          {(
            [
              [Home, 'home', t('Accueil')],
              [Compass, 'explore', t('Explorer')],
              [Bookmark, 'library', t('Ma liste')],
              [SettingsIcon, 'settings', t('Paramètres')],
            ] as const
          ).map(([Icon, id, label]) => (
            <button
              key={id}
              className={navigationTab === id && !selected ? 'active' : ''}
              aria-current={navigationTab === id && !selected ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              <Icon />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      {ready && profileGate && !onboarding && (
        <div className="profile-picker">
          <header className="onboarding-top">
            <span className="wordmark">PRIMIO</span>
            <button className="icon" aria-label={t('Fermer')} onClick={() => setProfileGate(false)}>
              <X />
            </button>
          </header>
          <main>
            <h1 className="serif">{t('Qui regarde ?')}</h1>
            <div className="profile-grid">
              {state.profiles.map((p) => (
                <button
                  className="profile-card glass"
                  key={p.id}
                  onClick={() => {
                    setState((s) => switchProfile(s, p.id))
                    setProfileGate(false)
                    navigate('home')
                  }}
                >
                  <span className="profile-avatar" style={{ background: p.color }}>
                    <img src={avatarUrl(p.avatar)} alt="" />
                  </span>
                  <strong>{p.name}</strong>
                  {p.id === state.activeProfileId && <small>{t('Dernier profil utilisé')}</small>}
                </button>
              ))}
            </div>
          </main>
        </div>
      )}
      {ready && onboarding && (
        <Onboarding
          state={state}
          setState={setState}
          connected={!!token}
          onAccount={() => {
            setRegister(true)
            setAuthOpen(true)
          }}
          onAddon={() => {
            setCandidate(null)
            setAddOpen(true)
          }}
          onFinish={async () => {
            try {
              await writeSecure('onboarding', 'done')
              setOnboarding(false)
              navigate('home')
            } catch (e) {
              fail(e)
            }
          }}
        />
      )}
      {castTarget && <CastPanel target={castTarget} onClose={() => setCastTarget(null)} onProgress={(position, duration) => setState(s => s.activeProfileId === castTarget.profileId ? { ...s, progress: recordProgress(s.progress, castTarget.meta, castTarget.videoId, position, duration) } : { ...s, profiles: s.profiles.map(p => p.id === castTarget.profileId ? { ...p, progress: recordProgress(p.progress, castTarget.meta, castTarget.videoId, position, duration) } : p) })} />}
      {sourceTarget && (
        <Dialog
          title={t('Choisir une source')}
          onClose={() => {
            ++sourceSequence.current
            setSourceTarget(null)
          }}
        >
          <p className="muted">{sourceTarget.meta.name}</p>
          {launching && (
            <div className="loading" role="status">
              <LoaderCircle />
              {t('Préparation de la source…')}
            </div>
          )}
          {sourceLoading ? (
            <div className="loading">
              <LoaderCircle /> {t('Recherche des sources…')}
            </div>
          ) : (
            <>
              {sourceError && (
                <p role="status" className="muted">
                  {sourceError}
                </p>
              )}
              {sourceList.length ? (
                <Sources
                  key={sourceTarget.id}
                  items={sourceList}
                  filters={state.settings.sourceFilters}
                  onFiltersChange={(sourceFilters) =>
                    setState((s) => ({ ...s, settings: { ...s.settings, sourceFilters } }))
                  }
                  busy={launching}
                  onPlay={play}
                  onDownload={downloadSource}
                  onCast={isTauri() ? stream => { setCastTarget({ meta: sourceTarget.meta, videoId: sourceTarget.id, stream, position: findProgress(state.progress, sourceTarget.meta.type, sourceTarget.id)?.position ?? 0, profileId: state.activeProfileId }); setSourceTarget(null) } : undefined}
                />
              ) : (
                <Empty
                  title={t('Pas encore de source')}
                  action={
                    <button
                      className="secondary"
                      onClick={() => {
                        setSourceTarget(null)
                        navigate('addons')
                      }}
                    >
                      <Plus /> {t('Gérer les addons')}
                    </button>
                  }
                >
                  {t('Vos addons n’ont retourné aucun lien pour ce titre.')}
                </Empty>
              )}
            </>
          )}
        </Dialog>
      )}
      {addOpen && (
        <Dialog
          title={candidate ? t('Installer cet addon') : t('Ajouter un addon')}
          error={error}
          onClose={() => setAddOpen(false)}
        >
          {candidate ? (
            <>
              <div className="addon-preview-head">
                <AddonIcon key={candidate.manifest.logo} logo={candidate.manifest.logo} />
                <h2>{candidate.manifest.name}</h2>
              </div>
              <Description text={candidate.manifest.description ?? ''} />
              <p className="muted">
                {t('Fourni par')} {new URL(candidate.url).hostname}
                {t('. Ce fournisseur recevra vos recherches et les titres consultés.')}
              </p>
              <div className="badges">
                {candidate.manifest.resources.map((r) => (
                  <span key={typeof r === 'string' ? r : r.name}>
                    {typeof r === 'string' ? r : r.name}
                  </span>
                ))}
              </div>
              {candidate.manifest.behaviorHints?.configurable && (
                <button
                  className="secondary"
                  onClick={() =>
                    openLink(candidate.url.replace(/\/manifest.json$/, '/configure')).catch(fail)
                  }
                >
                  <ExternalLink /> {t('Configurer')}
                </button>
              )}
              <button className="primary" onClick={() => installAddon(candidate)}>
                <Plus /> {t('Installer')}
              </button>
            </>
          ) : (
            <form onSubmit={checkAddon}>
              <p className="muted">{t('Collez le lien du manifeste d’un addon Stremio.')}</p>
              <label className="field">
                {t('Lien du manifeste')}
                <input
                  autoFocus
                  required
                  value={addonInput}
                  onChange={(e) => setAddonInput(e.target.value)}
                  placeholder="https://…/manifest.json"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </label>
              <button className="primary" disabled={busy}>
                {busy ? <LoaderCircle /> : <Plus />} {t('Vérifier l’addon')}
              </button>
            </form>
          )}
        </Dialog>
      )}
      {skipOpen && (
        <Dialog title={t('Configurer le saut des génériques')} onClose={() => setSkipOpen(false)}>
          <Preferences
            section="skip"
            settings={state.settings}
            onChange={(settings) => setState((s) => ({ ...s, settings }))}
          />
        </Dialog>
      )}
      <UpdatePanel ready={ready && !onboarding && !profileGate} />
      {importOpen && (
        <Dialog title={t('Importer une bibliothèque')} onClose={() => setImportOpen(false)}>
          <ImportPanel
            state={state}
            setState={setState}
            onDone={() => {
              setImportOpen(false)
              notify(t('Import terminé'))
            }}
          />
        </Dialog>
      )}
      {manifestCopy && (
        <Dialog title={t('Lien du manifeste')} onClose={() => setManifestCopy('')}>
          <p className="muted">
            {t(
              'Ce lien peut contenir une clé personnelle. Copiez-le uniquement vers une destination de confiance.',
            )}
          </p>
          <textarea
            readOnly
            className="manifest-link"
            value={manifestCopy}
            onFocus={(e) => e.target.select()}
          />
        </Dialog>
      )}
      {trailer && <TrailerPlayer {...trailer} onClose={() => setTrailer(null)} />}
      {verification && (
        <EmailVerification
          initial={verification}
          onClose={() => setVerification(null)}
          onVerified={(result) =>
            finishAuthentication(result, verification.email, verification.register)
          }
        />
      )}
      {authOpen && !isAndroid() && (
        <Dialog
          title={register ? t('Créer un compte') : t('Bon retour')}
          error={error}
          onClose={() => setAuthOpen(false)}
        >
          <form onSubmit={authenticate}>
            {register && (
              <label className="field">
                {t('Nom d’utilisateur')}
                <input
                  name="username"
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z0-9_]+"
                  placeholder={t('Votre pseudonyme')}
                />
                <small>{t('3 à 32 lettres, chiffres ou _')}</small>
              </label>
            )}
            <label className="field">
              {t('Adresse e-mail')}
              <input name="email" type="email" autoComplete="email" required maxLength={254} />
            </label>
            <label className="field">
              {t('Mot de passe')}
              <PasswordField
                name="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={register ? 12 : 1}
                maxLength={128}
                required
              />
            </label>
            {register && (
              <>
                <p className="muted">{t('12 caractères minimum.')}</p>
                <label className="field">
                  {t('Confirmer le mot de passe')}
                  <PasswordField
                    name="passwordConfirmation"
                    autoComplete="new-password"
                    minLength={12}
                    maxLength={128}
                    required
                  />
                </label>
                <label className="terms-check">
                  <input name="terms" type="checkbox" required />
                  <span>
                    {t('J’accepte les')}{' '}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => setTermsOpen(true)}
                    >
                      {t('conditions d’utilisation')}
                    </button>
                    .
                  </span>
                </label>
              </>
            )}
            <button className="primary" disabled={authBusy}>
              {authBusy ? <LoaderCircle /> : null}
              {register ? t('Créer mon compte') : t('Se connecter')}
            </button>
            <button type="button" className="text-button" onClick={() => setRegister(!register)}>
              {register ? t('Déjà un compte ? Se connecter') : t('Créer un compte')}
            </button>
          </form>
        </Dialog>
      )}
      {termsOpen && (
        <Dialog title={t('Conditions d’utilisation')} onClose={() => setTermsOpen(false)}>
          <p>{t('Version du 23 septembre 2026 · Préversion Primio.')}</p>
          <p>
            {t(
              'Primio est un lecteur et un gestionnaire de catalogues. L’application ne fournit pas de droit d’accès aux œuvres. Utilisez uniquement des sources auxquelles vous êtes autorisé à accéder et respectez les conditions de leurs fournisseurs.',
            )}
          </p>
          <p>
            {t(
              'Les addons sont des services tiers : leurs fournisseurs reçoivent les recherches et les demandes de contenus. Vous choisissez les addons installés et pouvez les retirer à tout moment.',
            )}
          </p>
          <p>
            {t(
              'Votre pseudonyme, votre e-mail et un mot de passe haché servent à gérer votre compte. Les listes, profils, préférences et progressions sont synchronisés à votre demande et chiffrés côté serveur. Vous pouvez supprimer votre compte et ses données depuis les préférences.',
            )}
          </p>
          <p>
            {t(
              'Cette préversion peut évoluer ou connaître des interruptions. Les versions et le suivi du projet sont disponibles sur GitHub : azksama/primio.',
            )}
          </p>
        </Dialog>
      )}
      {conflict && (
        <Dialog title={t('Bibliothèque synchronisée')} onClose={() => setConflict(null)}>
          <p>
            {t(
              'Le compte contient une autre version de votre bibliothèque. Choisissez celle à conserver sur cet appareil.',
            )}
          </p>
          <button
            className="primary"
            onClick={() => {
              startupChecked.current = ''
              setState(normalizeState(conflict.state))
              setSyncVersion(conflict.version)
              setConflict(null)
              notify(t('Bibliothèque du compte récupérée'))
            }}
          >
            {t('Récupérer celle du compte')}
          </button>
          <button
            className="secondary"
            onClick={async () => {
              try {
                const r = await api<{ version: number }>(
                  '/account/sync',
                  'PUT',
                  { version: conflict.version, state: snapshotState(state) },
                  token,
                )
                setSyncVersion(r.version)
                setConflict(null)
                notify(t('Bibliothèque locale synchronisée'))
              } catch (e) {
                fail(e)
              }
            }}
          >
            {t('Remplacer par celle de cet appareil')}
          </button>
        </Dialog>
      )}
      {pluginCandidate && (
        <Dialog
          title={t('Installer ') + pluginCandidate.name}
          onClose={() => setPluginCandidate(null)}
        >
          <Description text={pluginCandidate.description ?? ''} />
          <p>{t('Ce plugin demande l’accès aux fonctions suivantes :')}</p>
          <ul>
            {pluginCandidate.permissions.map((p) => (
              <li key={p}>
                {
                  {
                    theme: t('Modifier les couleurs'),
                    pages: t('Ajouter des espaces et catalogues'),
                    addons: t('Proposer des addons à installer'),
                    sources: t('Filtrer et classer les sources'),
                  }[p]
                }
              </li>
            ))}
          </ul>
          <button
            className="primary"
            onClick={() => {
              const p = activatePlugin(pluginCandidate, pluginCandidate.permissions)
              setPlugins((list) => [...list.filter((x) => x.id !== p.id), p])
              setPluginCandidate(null)
              notify(t('Plugin installé'))
            }}
          >
            <Check /> {t('Autoriser et installer')}
          </button>
        </Dialog>
      )}
      {deleteOpen && (
        <Dialog title={t('Supprimer mon compte')} onClose={() => setDeleteOpen(false)}>
          <p>
            {t(
              'Votre compte et toutes ses données synchronisées seront supprimés. Cette action est définitive.',
            )}
          </p>
          <button
            className="primary danger"
            onClick={async () => {
              try {
                await api('/account', 'DELETE', undefined, token)
                setToken('')
                setEmail('')
                setSyncVersion(0)
                setDeleteOpen(false)
                setState(createState())
                notify(t('Compte supprimé'))
              } catch (e) {
                fail(e)
              }
            }}
          >
            {t('Supprimer définitivement')}
          </button>
        </Dialog>
      )}
      {playback && !isTauri() && (
        <Dialog
          title={playback.meta.name}
          onClose={() => {
            const v = videoRef.current
            if (v) saveProgress(playback, v.currentTime, v.duration || 0)
            setPlayback(null)
          }}
        >
          <video
            ref={videoRef}
            src={playback.url}
            controls
            autoPlay
            playsInline
            onLoadedMetadata={(e) => {
              e.currentTarget.currentTime = state.settings.rememberPosition
                ? resumePosition(state.progress, playback.meta.type, playback.videoId)
                : 0
            }}
            onTimeUpdate={(e) => {
              if (Math.floor(e.currentTarget.currentTime) % 10 === 0)
                saveProgress(playback, e.currentTarget.currentTime, e.currentTarget.duration)
            }}
            onError={() =>
              setError(t('Ce flux nécessite le lecteur libmpv de l’application Android.'))
            }
          />
          <p className="muted">{t('Aperçu navigateur · lecteur HTML5')}</p>
        </Dialog>
      )}
      {toast && (
        <div className="toast glass" role="status">
          <Check size={18} />
          <span>{toast}</span>
        </div>
      )}
    </div>
  )
}
function PluginCatalog(props: {
  block: { manifest: string; type: string; catalogId: string; title: string }
  onSelect: (m: Meta) => void
}) {
  return (
    <Deferred>
      <PluginCatalogContent {...props} />
    </Deferred>
  )
}
function PluginCatalogContent({
  block,
  onSelect,
}: {
  block: { manifest: string; type: string; catalogId: string; title: string }
  onSelect: (m: Meta) => void
}) {
  const [items, setItems] = useState<Meta[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    inspectAddon(block.manifest)
      .then((a) => catalog(a, block.type, block.catalogId))
      .then((v) => {
        if (active) setItems(v)
      })
      .catch(() => {
        if (active) setError(t('Ce catalogue est indisponible.'))
      })
    return () => {
      active = false
    }
  }, [block])
  return (
    <section>
      <h2>{block.title}</h2>
      {error ? (
        <p>{error}</p>
      ) : (
        <ProgressiveList
          items={items}
          className="poster-grid"
          renderItem={(m) => (
            <button className="poster" key={m.id} aria-label={m.name} onClick={() => onSelect(m)}>
              <MediaImage src={m.poster} />

              <strong>{m.name}</strong>
            </button>
          )}
        />
      )}
    </section>
  )
}
