import { useEffect, useState } from 'react'
import { catalog, inspectAddon } from './addons'
import { t } from './i18n'
import { MediaImage } from './media-image'
import { Deferred, ProgressiveList } from './progressive'
import type { Meta } from './types'

interface PluginCatalogProps {
  block: { manifest: string; type: string; catalogId: string; title: string }
  onSelect: (meta: Meta) => void
}

export function PluginCatalog(props: PluginCatalogProps) {
  return (
    <Deferred>
      <PluginCatalogContent {...props} />
    </Deferred>
  )
}

function PluginCatalogContent({ block, onSelect }: PluginCatalogProps) {
  const [items, setItems] = useState<Meta[]>([]),
    [error, setError] = useState('')
  useEffect(() => {
    let active = true
    inspectAddon(block.manifest)
      .then((addon) => catalog(addon, block.type, block.catalogId))
      .then((items) => {
        if (active) setItems(items)
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
          renderItem={(meta) => (
            <button className="poster" key={meta.id} aria-label={meta.name} onClick={() => onSelect(meta)}>
              <MediaImage src={meta.poster} />
              <strong>{meta.name}</strong>
            </button>
          )}
        />
      )}
    </section>
  )
}
