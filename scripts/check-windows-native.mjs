import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { chromium } from '../apps/client/node_modules/playwright/index.mjs'

// Run against an isolated Primio test profile with WebView2 debugging enabled.
const browser = await chromium.connectOverCDP(process.env.PRIMIO_CDP || 'http://127.0.0.1:9237')
const page = browser.contexts()[0].pages()[0]
const invoke = (command, args = {}) =>
  page.evaluate(({ command, args }) => window.__TAURI_INTERNALS__.invoke(command, args), {
    command,
    args,
  })
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const checks = []
async function until(read, predicate, timeout = 15000) {
  const deadline = Date.now() + timeout
  let value
  do {
    value = await read()
    if (predicate(value)) return value
    await delay(150)
  } while (Date.now() < deadline)
  throw new Error(`Timed out: ${JSON.stringify(value)}`)
}
function passed(name) {
  checks.push(name)
  console.log(`PASS ${name}`)
}
async function connectPlayer() {
  const name = await until(
    () =>
      fs
        .readdir('\\\\.\\pipe\\')
        .then((names) =>
          names.find((n) =>
            n.startsWith(
              process.env.PRIMIO_TEST_PID
                ? 'primio-' + process.env.PRIMIO_TEST_PID + '-'
                : 'primio-',
            ),
          ),
        ),
    Boolean,
  )
  const socket = net.connect('\\\\.\\pipe\\' + name)
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve)
    socket.once('error', reject)
  })
  let next = 0,
    buffer = ''
  const pending = new Map(),
    events = []
  socket.on('data', (bytes) => {
    buffer += bytes
    while (buffer.includes('\n')) {
      const end = buffer.indexOf('\n'),
        line = buffer.slice(0, end)
      buffer = buffer.slice(end + 1)
      const response = JSON.parse(line)
      if (response.event) events.push(response)
      const waiter = pending.get(response.request_id)
      if (waiter) {
        pending.delete(response.request_id)
        clearTimeout(waiter.timer)
        response.error === 'success'
          ? waiter.resolve(response.data)
          : waiter.reject(Error(response.error))
      }
    }
  })
  socket.on('error', () => {})
  const command = (...command) =>
    new Promise((resolve, reject) => {
      const request_id = ++next
      const timer = setTimeout(() => {
        pending.delete(request_id)
        reject(Error('IPC timeout'))
      }, 5000)
      pending.set(request_id, { resolve, reject, timer })
      socket.write(JSON.stringify({ command, request_id }) + '\n')
    })
  return { command, events, socket, get: (property) => command('get_property', property) }
}
const context = {
  accountId: 'windows-smoke',
  profileId: 'windows-smoke',
  meta: { id: 'smoke', type: 'series', name: 'Windows smoke' },
  videoId: 'smoke:1:1',
}
const extra = {
  currentVideoId: context.videoId,
  nextVideoId: 'smoke:1:2',
  locale: 'fr',
  episodes: [
    { id: context.videoId, title: 'Episode 1', season: 1, episode: 1 },
    { id: 'smoke:1:2', title: 'Episode 2', season: 1, episode: 2 },
  ],
  seekBackward: 15,
  seekForward: 30,
  subtitleSize: 40,
  forceSubtitleStyle: false,
}
const args = {
  url: 'http://127.0.0.1:9341/fixture.mkv',
  title: 'Primio · Windows playback test',
  external: false,
  position: 10,
  progressContext: JSON.stringify(context),
  playerExtra: JSON.stringify(extra),
  headers: {},
  subtitles: [{ id: 'smoke', url: 'http://127.0.0.1:9341/sub.srt', lang: 'eng' }],
  language: 'eng',
  subtitleLanguage: 'eng',
  seekBackward: 15,
  seekForward: 30,
  subtitleSize: 40,
  playbackSpeed: 1,
  hardwareDecoding: true,
  cacheSizeGb: 0,
  skipSegments: [],
  autoSkipIntro: false,
  showSubtitles: true,
}
const progressPath = path.join(
  process.env.APPDATA,
  process.env.PRIMIO_TEST_APP_ID || 'fr.azks.primio',
  'secure',
  'playerProgress.bin',
)
const oldProgress = await fs.readFile(progressPath).catch(() => null)
let player, downloadId
try {
  await invoke('play_media', args)
  player = await connectPlayer()
  await until(
    () => player.get('time-pos').catch(() => 0),
    (n) => n >= 10,
  )
  const tracks = await until(
    () => player.get('track-list'),
    (tracks) => tracks.some((t) => t.type === 'sub'),
  )
  assert.equal(tracks.filter((t) => t.type === 'audio').length, 2)
  passed('Native MKV playback, two audio tracks and external subtitles')
  await player.command('set_property', 'pause', true)
  const position = await player.get('time-pos')
  await delay(300)
  assert(Math.abs((await player.get('time-pos')) - position) < 0.15)
  passed('Pause preserves position')
  if (process.env.PRIMIO_INSPECT_PLAYER === '1') await delay(45000)
  const eventStart = player.events.length
  await player.command('set_property', 'aid', tracks.filter((t) => t.type === 'audio')[1].id)
  await player.command('set_property', 'sid', 'no')
  await player.command('set_property', 'sid', tracks.find((t) => t.type === 'sub').id)
  await delay(500)
  assert(
    !player.events.slice(eventStart).some((e) => ['start-file', 'file-loaded'].includes(e.event)),
  )
  assert(Math.abs((await player.get('time-pos')) - position) < 0.15)
  passed('Audio and subtitle switching without media reload or position loss')
  assert.equal(await player.get('sub-ass-override'), false)
  await player.command('script-binding', 'primio/style')
  await until(
    () => player.get('sub-ass-override'),
    (x) => x === 'force',
  )
  passed('Live subtitle style override')
  await player.command('script-binding', 'primio/episodes')
  await until(
    () => player.get('user-data/primio/ui').catch(() => ({})),
    (x) => x.panel === 'episodes',
  )
  passed('Episode menu opens in native player')
  await player.command('script-message-to', 'primio_ui', 'close')
  await player.command('seek', 92, 'absolute+exact')
  await until(
    () => player.get('user-data/primio/ui').catch(() => ({})),
    (x) => x.nextOffered === true,
  )
  passed('Next episode offered during last 30 seconds')
  await player.command('seek', 42, 'absolute+exact')
  await until(
    () => player.get('time-pos'),
    (x) => Math.abs(x - 42) < 0.2,
  )
  await player.command('quit').catch(() => {})
  player.socket.destroy()
  player = null
  const saved = await until(
    async () => JSON.parse(await invoke('secure_read', { key: 'playerProgress' })),
    (p) =>
      p?.closed && p.context.accountId === context.accountId && Math.abs(p.position - 42) < 0.5,
  )
  passed('Playback progress persists on close')
  await invoke('play_media', {
    ...args,
    url: args.url + '?alternative-source',
    position: saved.position,
  })
  player = await connectPlayer()
  await until(
    () => player.get('time-pos').catch(() => 0),
    (n) => n >= 41.5 && n < 47,
  )
  passed('Resume position with a different source URL')
  await player.command('quit').catch(() => {})
  player.socket.destroy()
  player = null
  const download = await invoke('download_start', {
    url: args.url,
    title: 'Windows smoke download',
    metadata: context,
    headers: {},
    wifiOnly: false,
  })
  downloadId = download.id
  const item = await until(
    async () => (await invoke('download_list')).items.find((item) => item.id === downloadId),
    (item) => item?.status === 'complete',
  )
  const fixture = await fs.readFile(path.resolve('tmp/windows-test/fixture.mkv'))
  const offlinePath = path.join(
    process.env.APPDATA,
    process.env.PRIMIO_TEST_APP_ID || 'fr.azks.primio',
    'downloads',
    downloadId + '.media',
  )
  const offline = await fs.readFile(offlinePath)
  assert.equal(
    createHash('sha256').update(offline).digest('hex'),
    createHash('sha256').update(fixture).digest('hex'),
  )
  assert.equal(item.bytes, fixture.length)
  passed('Offline download matches source SHA-256')
  await invoke('play_download', {
    id: downloadId,
    options: { ...extra, position: 30, context, cacheSizeGb: 0 },
  })
  player = await connectPlayer()
  await until(
    () => player.get('time-pos').catch(() => 0),
    (n) => n >= 29.5,
  )
  assert(!(await player.get('path')).startsWith('http'))
  passed('Offline playback resumes from local file')
  await player.command('quit').catch(() => {})
  player.socket.destroy()
  player = null
  await until(
    () => fs.readdir('\\\\.\\pipe\\'),
    (names) =>
      !names.some((n) =>
        n.startsWith(
          process.env.PRIMIO_TEST_PID ? 'primio-' + process.env.PRIMIO_TEST_PID + '-' : 'primio-',
        ),
      ),
  )
  await invoke('download_remove', { id: downloadId })
  assert(!(await invoke('download_list')).items.some((item) => item.id === downloadId))
  await assert.rejects(fs.access(offlinePath))
  downloadId = null
  passed('Download removal deletes record and file')
  await assert.rejects(invoke('download_remove', { id: '../secret' }))
  await assert.rejects(invoke('play_media', { ...args, url: 'file:///C:/Windows/win.ini' }))
  await assert.rejects(
    invoke('download_start', {
      url: 'http://127.0.0.1:9341/stream.m3u8',
      title: 'HLS',
      metadata: {},
      headers: {},
      wifiOnly: false,
    }),
  )
  passed('Reject local path injection and unsupported offline playlists')
  await fs.mkdir('tmp/windows-test', { recursive: true })
  await fs.writeFile(
    'tmp/windows-test/results.json',
    JSON.stringify({ at: new Date().toISOString(), checks }, null, 2),
  )
} finally {
  if (player) {
    await player.command('quit').catch(() => {})
    player.socket.destroy()
  }
  if (downloadId) await invoke('download_remove', { id: downloadId }).catch(() => {})
  await delay(300)
  if (oldProgress) await fs.writeFile(progressPath, oldProgress)
  await browser.close()
}
