import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { DialogShell } from './dialog-shell'
import { trailerEmbedUrl } from './content'
import { t } from './i18n'

export function TrailerPlayer({
  url,
  name,
  onClose,
}: {
  url: string
  name: string
  onClose: () => void
}) {
  const embed = trailerEmbedUrl(url, window.location.origin)
  const [failed, setFailed] = useState(false)
  return (
    <DialogShell title={t('Bande-annonce')} className="trailer-dialog" onClose={onClose}>
      <header className="trailer-heading">
        <button className="icon glass" aria-label={t('Retour')} onClick={onClose}>
          <ArrowLeft />
        </button>
        <div>
          <small>{t('Bande-annonce')}</small>
          <h2>{name}</h2>
        </div>
      </header>
      {embed ? (
        <iframe
          title={`${t('Bande-annonce')} · ${name}`}
          src={embed}
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      ) : failed ? (
        <p role="alert" className="error">
          {t('Impossible de lire cette bande-annonce.')}
        </p>
      ) : (
        <video src={url} controls autoPlay playsInline onError={() => setFailed(true)} />
      )}
    </DialogShell>
  )
}
