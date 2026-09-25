import { useEffect, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Cast, Pause, Play, Square } from 'lucide-react'
import { DialogShell } from './dialog-shell'
import { isAndroid } from './platform'
import { t } from './i18n'
import type { Meta, Stream } from './types'

export type CastTarget = {
  meta: Meta
  videoId: string
  stream: Stream
  position: number
  profileId: string
}
type Status = { position: number; duration: number; connected?: boolean }
export function CastPanel({
  target,
  onClose,
  onProgress,
}: {
  target: CastTarget
  onClose: () => void
  onProgress: (position: number, duration: number) => void
}) {
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([])
  const [connection, setConnection] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [status, setStatus] = useState<Status>({ position: target.position, duration: 0 })
  const progress = useRef(onProgress)
  progress.current = onProgress
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const command = (id: string, action: string, position?: number) =>
    id === 'google'
      ? invoke<Status>('google_cast', {
          action,
          data: {
            url: target.stream.url,
            title: target.meta.name,
            position: position ?? target.position,
          },
        })
      : invoke<Status>('cast_control', {
          id,
          action,
          url: target.stream.url,
          position: position ?? null,
        })
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch {
      if (alive.current)
        setError(
          t(
            'Diffusion impossible. Vérifiez le réseau et la compatibilité de la source avec le téléviseur.',
          ),
        )
    } finally {
      if (alive.current) setBusy(false)
    }
  }
  const discover = () =>
    run(async () => {
      const found = await invoke<{ id: string; name: string }[]>('cast_discover')
      if (alive.current) setDevices(found)
    })
  useEffect(() => {
    void discover()
  }, [])
  useEffect(() => {
    if (!connection) return
    let stopped = false,
      polling = false
    const poll = async () => {
      if (polling) return
      polling = true
      try {
        const next = await command(connection, 'status')
        if (!stopped) {
          if (next.connected === false) {
            setConnection('')
            return
          }
          setStatus(next)
          if (next.duration > 0 && Number.isFinite(next.position))
            progress.current(next.position, next.duration)
        }
      } catch {
        if (!stopped) setError(t('Le téléviseur ne répond pas.'))
      } finally {
        polling = false
      }
    }
    void poll()
    const timer = setInterval(poll, 5000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [connection])
  const connect = (id: string) =>
    run(async () => {
      await command(id, 'load')
      if (!alive.current) return
      setConnection(id)
      if (id !== 'google' && target.position > 0) await command(id, 'seek', target.position)
    })
  const protectedSource =
    Object.keys(target.stream.behaviorHints?.proxyHeaders?.request ?? {}).length > 0
  return (
    <DialogShell title={t('Diffuser sur un téléviseur')} onClose={onClose}>
      <p>{target.meta.name}</p>
      {protectedSource ? (
        <p role="status">
          {t(
            'Cette source exige des en-têtes privés. Choisissez une source directe pour la diffusion.',
          )}
        </p>
      ) : connection ? (
        <>
          <p role="status">
            {connection === 'google'
              ? 'Google Cast'
              : devices.find((d) => d.id === connection)?.name}
          </p>
          <input
            aria-label={t('Position de lecture')}
            type="range"
            min="0"
            max={Math.max(status.duration, 1)}
            value={status.position}
            disabled={busy || !status.duration}
            onChange={(e) => {
              const position = +e.target.value
              setStatus((s) => ({ ...s, position }))
              void run(() => command(connection, 'seek', position))
            }}
          />
          <div className="collection-actions">
            <button
              disabled={busy}
              aria-label={t('Lecture')}
              onClick={() => void run(() => command(connection, 'play'))}
            >
              <Play />
            </button>
            <button
              disabled={busy}
              aria-label={t('Pause')}
              onClick={() => void run(() => command(connection, 'pause'))}
            >
              <Pause />
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await command(connection, 'stop')
                  setConnection('')
                })
              }
            >
              <Square />
              {t('Arrêter')}
            </button>
          </div>
          <p className="muted">
            {t(
              'Gardez cette télécommande ouverte pour enregistrer la progression de la diffusion.',
            )}
          </p>
        </>
      ) : (
        <div className="cast-devices">
          {isAndroid() && (
            <button disabled={busy} onClick={() => void connect('google')}>
              <Cast />
              Google Cast / Android TV
            </button>
          )}
          <p className="muted">DLNA · {t('Même réseau Wi-Fi')}</p>
          {devices.map((d) => (
            <button disabled={busy} key={d.id} onClick={() => void connect(d.id)}>
              <Cast />
              {d.name}
            </button>
          ))}
          {!devices.length && (
            <p role="status">
              {t(busy ? 'Recherche de téléviseurs…' : 'Aucun téléviseur DLNA détecté.')}
            </p>
          )}
          <button disabled={busy} onClick={() => void discover()}>
            {t('Actualiser')}
          </button>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </DialogShell>
  )
}
