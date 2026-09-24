import { writeSecure } from '../src/platform'
import { createState } from '../src/preferences'

const base = 'https://primio-ui-test.invalid'
const meta = {
  id: 'review:film',
  type: 'movie',
  name: 'Big Buck Bunny',
  description: 'Un court-métrage de la Blender Foundation.',
  runtime: '10 min',
  poster: '/art/forest.png',
  background: '/art/panorama.png',
}
const manifest = {
  id: 'review',
  name: 'Primio Découverte',
  version: '1.0.0',
  types: ['movie'],
  resources: ['catalog', 'meta', 'stream'],
  catalogs: [{ type: 'movie', id: 'review', name: 'Découverte' }],
}
const streams = [
  { name: 'WEBRip · 1080p', title: '225 Mo' },
  { name: 'HDTV · 720p', title: '263 Mo' },
].map(stream => ({ ...stream, url: 'https://media.w3.org/2010/05/bunny/trailer.mp4' }))

const state = createState()
state.addons = [{ url: base + '/manifest.json', enabled: true }]
await writeSecure('state', JSON.stringify(state))

const originalFetch = window.fetch.bind(window)
window.fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.startsWith(base)) return originalFetch(input, init)
  if (url.includes('/catalog/')) await new Promise(resolve => setTimeout(resolve, 7000))
  const data = url.endsWith('/manifest.json')
    ? manifest
    : url.includes('/catalog/')
      ? { metas: [meta] }
      : url.includes('/meta/')
        ? { meta }
        : { streams }
  return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
}
await import('../src/main')
