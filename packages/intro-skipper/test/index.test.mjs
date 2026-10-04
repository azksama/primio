import assert from 'node:assert/strict'
import test from 'node:test'
import { createIntroSkipper, validSegments } from '../dist/index.js'

const media = { id: 'tt123', type: 'series', videos: [{ id: 'tt123:1:1', season: 1, episode: 1 }] }
const settings = { aniSkip: false, skipIntro: true }
const segment = (start = 0) => ({ start, end: start + 10, kind: 'intro', label: 'Intro', provider: 'test' })
const deferred = () => {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

test('malformed plugin results do not discard valid built-in segments', async () => {
  const skipper = createIntroSkipper(async () => ({ intro: { start_sec: 5, end_sec: 15 } }), [
    { id: 'throws', resolve() { throw Error('broken provider') } },
    { id: 'malformed', resolve: async () => [null, { ...segment(), kind: 'invalid' }] },
    { id: 'not-array', resolve: async () => ({ wrong: true }) },
  ])
  const result = await skipper.resolve(media, 'tt123:1:1', settings)
  assert.equal(result.length, 1)
  assert.equal(result[0].provider, 'IntroDB')
})

test('filters malformed timing and preserves input order', () => {
  const input = [segment(20), segment(0), null, { ...segment(), end: Infinity }, { ...segment(), start: -1 }]
  assert.deepEqual(validSegments(input).map((item) => item.start), [0, 20])
  assert.equal(input[0].start, 20)
})

test('coalesces concurrent lookups and caches successful segments', async () => {
  const response = deferred()
  let calls = 0
  const skipper = createIntroSkipper(() => { calls += 1; return response.promise })
  const first = skipper.resolve(media, 'tt123:1:1', settings)
  const second = skipper.resolve(media, 'tt123:1:1', settings)
  response.resolve({ intro: { start_sec: 5, end_sec: 15 } })
  assert.deepEqual(await first, await second)
  await skipper.resolve(media, 'tt123:1:1', settings)
  assert.equal(calls, 1)
})

test('cache reset detaches old requests without removing or overwriting the new lookup', async () => {
  const old = deferred(), fresh = deferred()
  let calls = 0
  const skipper = createIntroSkipper(() => (++calls === 1 ? old.promise : fresh.promise))
  const first = skipper.resolve(media, 'tt123:1:1', settings)
  skipper.clearCache()
  const second = skipper.resolve(media, 'tt123:1:1', settings)
  old.resolve({ intro: { start_sec: 1, end_sec: 11 } })
  await first
  const third = skipper.resolve(media, 'tt123:1:1', settings)
  assert.equal(calls, 2)
  fresh.resolve({ intro: { start_sec: 2, end_sec: 12 } })
  assert.deepEqual(await second, await third)
  assert.equal((await skipper.resolve(media, 'tt123:1:1', settings))[0].start, 2)
  assert.equal(calls, 2)
})

test('anime classification changes invalidate an earlier empty result', async () => {
  const urls = []
  const skipper = createIntroSkipper(async (url) => {
    urls.push(url)
    if (url.includes('filter[text]')) return { data: [{ id: '1', attributes: { canonicalTitle: 'Title', titles: {} } }] }
    if (url.includes('/mappings')) return { data: [{ attributes: { externalSite: 'myanimelist/anime', externalId: '2' } }] }
    return { found: true, results: [{ interval: { startTime: 0, endTime: 10 }, skipType: 'op', episodeLength: 1200 }] }
  })
  const title = { ...media, name: 'Title' }
  const preferences = { aniSkip: true, skipIntro: false }
  assert.deepEqual(await skipper.resolve(title, 'tt123:1:1', preferences), [])
  assert.equal((await skipper.resolve({ ...title, category: 'anime' }, 'tt123:1:1', preferences)).length, 1)
  assert.equal(urls.length, 3)
})

test('recap opt-out also applies to contributed segments', async () => {
  const skipper = createIntroSkipper(async () => ({}), [{
    id: 'plugin', resolve: async () => [segment(), { ...segment(20), kind: 'recap' }],
  }])
  assert.equal((await skipper.resolve(media, 'tt123:1:1', { ...settings, skipRecaps: false })).length, 1)
})

test('conflicting exact MAL mappings never select an arbitrary episode', async () => {
  let calls = 0
  const skipper = createIntroSkipper(async () => {
    calls += 1
    return { data: ['123', '456'].map(externalId => ({ attributes: { externalSite: 'myanimelist/anime', externalId } })) }
  })
  assert.deepEqual(await skipper.resolve({ id: 'kitsu:1', type: 'anime' }, 'kitsu:1:1', { aniSkip: true, skipIntro: false }), [])
  assert.equal(calls, 1)
})
