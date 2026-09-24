import { useState } from 'react'
import { ImageOff } from 'lucide-react'

export function MediaImage({
  src,
  className = '',
  eager = false,
}: {
  src?: string
  className?: string
  eager?: boolean
}) {
  const [ready, setReady] = useState('')
  const [failed, setFailed] = useState('')
  const unavailable = !src || failed === src
  const loading = !unavailable && ready !== src
  return (
    <span className={`media-image ${className} ${loading ? 'skeleton' : ''}`} aria-hidden="true">
      {unavailable ? (
        <ImageOff className="image-placeholder" />
      ) : (
        <img
          key={src}
          src={src}
          alt=""
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          referrerPolicy="no-referrer"
          className={loading ? 'image-pending' : 'image-ready'}
          onLoad={() => setReady(src)}
          onError={() => setFailed(src)}
        />
      )}
    </span>
  )
}

export function CardSkeleton({ episode = false }: { episode?: boolean }) {
  return (
    <div className={episode ? 'episode-skeleton' : 'poster-skeleton'} aria-hidden="true">
      <span className="skeleton skeleton-art" />
      <span className="skeleton-copy">
        <span className="skeleton skeleton-title" />
        <span className="skeleton skeleton-caption" />
      </span>
    </div>
  )
}
