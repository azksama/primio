// Runs the production Lua controls in mpv against an owned synthetic video.
// It verifies the native controls; it does not simulate Android or the Rust IPC host.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
const root = path.resolve(import.meta.dirname, '..')
const output = path.join(root, '.impeccable/review/playback-feedback/windows')
const binary = process.env.PRIMIO_MPV ?? path.join(root, 'apps/client/src-tauri/resources/windows/mpv/primio-player.exe')
const video = process.env.PRIMIO_QA_VIDEO ?? path.join(output, 'fixture-4x3.mp4')
await access(binary)
await mkdir(output, { recursive: true })
try { await access(video) } catch (error) {
  if (process.env.PRIMIO_QA_VIDEO) throw error
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x480:rate=10',
    '-t', '120', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '36', '-pix_fmt', 'yuv420p', '-y', video], { windowsHide: true })
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(read, test, message = 'player state') {
  const end = Date.now() + 15000
  let latest
  while (Date.now() < end) {
    try { const value = await read(); latest = value; if (test(value)) return value } catch {}
    await delay(50)
  }
  throw Error('Timed out waiting for ' + message + ': ' + JSON.stringify(latest))
}
const episodes = [
  { id: 'special', season: 0, episode: 1, title: 'Special', watched: false },
  ...Array.from({ length: 45 }, (_, index) => ({ id: `s1e${index + 1}`, season: 1, episode: index + 1, watched: false,
    title: `Episode ${index + 1} with a deliberately long title that stays inside its image row`,
    description: 'A synthetic episode synopsis with enough text to exercise the two line limit and the fixed image height. '.repeat(3),
    thumbnail: 'https://qa.example/episode.jpg' })),
  { id: 's2e1', season: 2, episode: 1, title: 'Next season', watched: false },
]
const base = { locale: 'en', title: 'QA Show · Episode 20', currentVideoId: 's1e20', nextVideoId: 's1e21', episodes,
  autoSkipIntro: true, autoNextEpisode: true, reduceMotion: true,
  theme: { material: 'glass', accent: '#26CBA8', background: '#000000', surface: '#121212', text: '#FFFFFF', muted: '#C4C4C4' } }
async function player(name, extra, inspect) {
  const directory = path.join(output, name)
  await mkdir(directory, { recursive: true })
  const images = path.join(directory, 'images')
  await mkdir(images, { recursive: true })
  // Raw thumbnail fixture has the same format as the Rust artwork downloader.
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', video, '-frames:v', '1', '-vf', 'scale=128:72', '-pix_fmt', 'bgra', '-f', 'rawvideo', '-y', path.join(images, 'episode-20-128-72.bgra')], { windowsHide: true })
  const config = path.join(directory, 'player.json'), log = path.join(directory, 'mpv.log')
  await writeFile(config, JSON.stringify({ ...base, episodeImagePath: images.replaceAll('\\', '/'), ...extra }))
  const pipe = `\\\\.\\pipe\\primio-playback-feedback-${process.pid}-${name}`
  const child = spawn(binary, [`--config-dir=${path.join(root, 'apps/client/src-tauri/resources/windows/player')}`,
    '--load-scripts=no', `--script=${path.join(root, 'apps/client/src-tauri/resources/windows/player/scripts/primio.lua')}`,
    `--script=${path.join(root, 'apps/client/src-tauri/resources/windows/player/scripts/primio-ui.lua')}`,
    `--input-ipc-server=${pipe}`, '--fullscreen=no', '--geometry=1280x720', '--keepaspect-window=no', '--border=no',
    '--osc=no', '--osd-level=0', '--pause=yes', '--volume=0', '--keep-open=yes', `--log-file=${log}`, video],
    { windowsHide: true, env: { ...process.env, PRIMIO_PLAYER_CONFIG: config }, stdio: 'ignore' })
  let socket
  try {
    socket = await until(() => new Promise((resolve, reject) => {
      const candidate = net.connect(pipe)
      candidate.once('connect', () => resolve(candidate))
      candidate.once('error', () => { candidate.destroy(); reject(Error('Starting')) })
    }), Boolean, 'IPC connection')
    let buffer = '', sequence = 0
    const pending = new Map()
    socket.on('error', () => {})
    socket.on('data', bytes => {
      buffer += bytes
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'), message = JSON.parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        const waiter = pending.get(message.request_id)
        if (waiter) {
          pending.delete(message.request_id); clearTimeout(waiter.timer)
          message.error === 'success' ? waiter.resolve(message.data) : waiter.reject(Error(message.error))
        }
      }
    })
    const command = (...command) => new Promise((resolve, reject) => {
      const request_id = ++sequence, timer = setTimeout(() => { pending.delete(request_id); reject(Error('IPC timeout')) }, 3000)
      pending.set(request_id, { resolve, reject, timer }); socket.write(JSON.stringify({ command, request_id }) + '\n')
    })
    const get = name => command('get_property', name)
    const seek = async position => {
      await command('seek', position, 'absolute+exact')
      await until(() => get('time-pos'), p => Math.abs(p - position) < .15, 'seek ' + position)
      await delay(100)
    }
    const click = async (x, y) => {
      const dimensions = await get('osd-dimensions'), scale = dimensions.h / 720
      await command('mouse', Math.round(x * scale), Math.round(y * scale)); await command('keypress', 'MBTN_LEFT')
      await delay(100) // Cross-script messages finish before a subsequent seek.
    }
    const capture = async name => command('screenshot-to-file', path.join(directory, name + '.png'), 'window')
    await until(() => get('user-data/primio/ui'), ui => ui && !ui.loading, 'Lua UI loading')
    await inspect({ command, get, seek, click, capture })
    const text = await readFile(log, 'utf8')
    assert(!/Lua error|stack traceback|\[e\]\[primio(?:_ui)?\]/.test(text), 'No Lua errors')
  } finally { socket?.destroy(); if (child.exitCode === null) child.kill() }
}
await player('segments', { skipSegments: [{ start: 12, end: 20, kind: 'intro' }, { start: 105, end: 120, kind: 'outro' }] }, async ({ command, get, seek, click, capture }) => {
  await seek(9.5)
  await until(() => get('user-data/primio/countdown'), c => c.visible && c.key === 'intro:12', '3 second opening countdown')
  await capture('countdown')
  await click(1228, 564)
  await until(() => get('user-data/primio/countdown'), c => !c.visible && c.key === '', 'cancelled countdown')
  await seek(13)
  assert(Math.abs(await get('time-pos') - 13) < .15, 'Cancelled opening remains watchable')
  await click(1100, 564)
  await until(() => get('time-pos'), p => Math.abs(p - 20) < .15, 'manual skip after cancellation')
  await command('script-message-to', 'primio_ui', 'open', 'episodes')
  const artwork = await until(() => get('user-data/primio/episode-images'), r => r?.indices?.length > 0, 'current episode scrolling')
  assert.deepEqual(artwork.indices, [18, 19, 21, 22], 'Episode 20 is centered with its thumbnail fixture present')
  await capture('episodes-current')
  await click(1194, 314)
  await until(() => get('user-data/primio/watched'), w => w?.videoId === 's1e19' && w.watched === true)
  assert.equal((await get('user-data/primio/ui')).panel, 'episodes', 'Marking watched keeps the list open')
  await click(1194, 314)
  await until(() => get('user-data/primio/watched'), w => w?.videoId === 's1e19' && w.watched === false)
  assert.equal((await get('user-data/primio/ui')).panel, 'episodes', 'Marking unwatched keeps the list open')
  await command('script-message-to', 'primio_ui', 'close')
  await seek(60)
  assert.equal(await get('user-data/primio/inferred-watched').catch(() => undefined), undefined, 'Exactly 50% does not infer watched')
  await seek(60.2)
  const changes = await until(() => get('user-data/primio/inferred-watched'), c => Array.isArray(c), 'inferred watched batch')
  assert.deepEqual(changes.map(c => c.videoId), Array.from({ length: 18 }, (_, i) => 's1e' + (i + 1)), 'Earlier regular episodes, preserving manual edit')
  await seek(102.5)
  await until(() => get('user-data/primio/countdown'), c => c.visible && c.key === 'outro:105', 'ending countdown')
  await click(1228, 564)
  await seek(106)
  assert.equal(await get('user-data/primio/request').catch(() => undefined), undefined, 'Cancelled ending does not launch next')
  // Force a window focus event without touching another application.
  await command('set_property', 'panscan', 1)
  await command('set_property', 'window-minimized', true)
  await until(() => get('user-data/primio/ui'), ui => ui.pip === true, 'PiP after cancelled ending')
  assert.equal(await get('panscan'), 0, 'PiP fits the real video')
  await until(() => get('osd-dimensions'), d => Math.abs(d.w / d.h - 4 / 3) < .025, 'PiP 4:3 window resize')
  await capture('pip-4x3')
  await command('keypress', 'MBTN_LEFT_DBL')
  await until(() => get('user-data/primio/ui'), ui => ui.pip === false, 'PiP restored')
  assert.equal(await get('panscan'), 1, 'Previous fit preference is restored')
  await seek(119.6)
  await until(() => get('user-data/primio/request'), r => r?.id === 's1e21' && r.auto && r.completed, 'next episode after complete ending')
})
await player('repeated-seeks', { skipSegments: [], autoNextEpisode: false, reduceMotion: false, seekForward: 20, seekBackward: 5 }, async ({ command, get, seek, capture }) => {
  await seek(30)
  await command('mouse', 1000, 460)
  await command('keypress', 'MBTN_LEFT_DBL')
  await until(() => get('time-pos'), p => Math.abs(p - 50) < .15, 'first configured double click')
  await command('keypress', 'MBTN_LEFT_DBL')
  await until(() => get('time-pos'), p => Math.abs(p - 70) < .15, 'second configured double click')
  await command('keypress', 'MBTN_LEFT')
  await until(() => get('time-pos'), p => Math.abs(p - 90) < .15, 'additional tap in seek burst')
  await capture('forward-60')
  await command('mouse', 180, 460)
  await command('keypress', 'MBTN_LEFT_DBL')
  await until(() => get('time-pos'), p => Math.abs(p - 85) < .15, 'configured backwards double click')
  await command('keypress', 'MBTN_LEFT_DBL')
  await until(() => get('time-pos'), p => Math.abs(p - 80) < .15, 'cumulative backwards seek')
  await capture('backward-10')
})
await player('fallback', { skipSegments: [] }, async ({ command, get, seek, click }) => {
  await seek(87.5)
  await until(() => get('user-data/primio/countdown'), c => c.visible && c.key === 'next', 'fallback countdown')
  await click(1228, 564)
  await seek(119.6)
  assert.equal(await get('user-data/primio/request').catch(() => undefined), undefined, 'Fallback cancellation also blocks EOF auto next')
  await command('script-message-to', 'primio', 'next')
  await until(() => get('user-data/primio/request'), r => r?.id === 's1e21' && r.auto && !r.completed, 'manual next remains available')
})
await writeFile(path.join(output, 'results.json'), JSON.stringify({ countdownSeconds: 3, clickCancelsOpeningAndEnding: true,
  manualSkipStillWorks: true, fixedEpisodeRowsAndCurrentScroll: true, priorEpisodesAfter50Percent: true,
  manualWatchedChoicePreserved: true, pipAspect4x3: true, cancelledFallbackPreventsAutoNext: true, luaErrors: false }, null, 2) + '\n')
console.log('PASS: native Windows countdown cancellation, episode rows and scroll, watched inference, manual overrides, and 4:3 PiP.')
