import { useEffect, type Dispatch, type SetStateAction } from 'react'
import { metadata } from './addons'
import { isAnime } from './preferences'
import type { Addon, UserState } from './types'
export function useAnimeClassification(
  state: UserState,
  setState: Dispatch<SetStateAction<UserState>>,
  addons: Addon[],
  ready: boolean,
) {
  const ids = state.library
    .filter((m) => m.type === 'series' && !isAnime(m))
    .map((m) => m.id)
    .join('|')
  useEffect(() => {
    if (!ready || !addons.length || !ids) return
    let cancelled = false
    const profileId = state.activeProfileId
    void (async () => {
      for (const item of state.library.filter((m) => m.type === 'series' && !isAnime(m))) {
        if (cancelled) break
        try {
          const meta = await metadata(addons, item)
          if (cancelled) break
          if (isAnime(meta))
            setState((s) =>
              s.activeProfileId !== profileId
                ? s
                : {
                    ...s,
                    library: s.library.map((m) =>
                      m.id === item.id && m.type === item.type ? { ...m, category: 'anime' } : m,
                    ),
                    progress: s.progress.map((p) =>
                      p.id === item.id && p.type === item.type ? { ...p, category: 'anime' } : p,
                    ),
                  },
            )
        } catch {
          /* Incomplete metadata keeps the existing category. */
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [ids, state.activeProfileId, addons, ready])
}
