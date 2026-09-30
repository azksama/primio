import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'

const output = path.resolve('tmp/validation-player-preferences')
await fs.mkdir(output, { recursive: true })
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
async function until(read, test, timeout = 15000) {
  const deadline = Date.now() + timeout
  let value
  do {
    try {
      value = await read()
      if (test(value)) return value
    } catch {}
    await delay(100)
  } while (Date.now() < deadline)
  throw Error(`Timed out: ${JSON.stringify(value)}`)
}
async function run(outro) {
  const config = path.join(output, `pip-${outro}.json`)
  await fs.writeFile(
    config,
    JSON.stringify({
      title: 'Primio preview test',
      previewExecutable: path.resolve(
        'apps/client/src-tauri/resources/windows/mpv/primio-player.exe',
      ),
      previewPath: path.join(output, 'preview.bgra'),
      locale: 'en',
      currentVideoId: 'qa:1',
      trackPreferences: {
        audio: { language: 'fr', forced: false },
        subtitle: { language: 'fr', forced: false },
      },
      skipSegments: [{ kind: 'recap', start: 0, end: 10 }],
      autoSkipRecap: true,
      autoSkipIntro: false,
      autoNextEpisode: false,
    }),
  )
  const pipe = `\\\\.\\pipe\\primio-pip-qa-${process.pid}-${outro}`
  const child = spawn(
    path.resolve('apps/client/src-tauri/resources/windows/mpv/primio-player.exe'),
    [
      `--config-dir=${path.resolve('apps/client/src-tauri/resources/windows/player')}`,
      `--input-ipc-server=${pipe}`,
      '--fullscreen=yes',
      '--border=no',
      '--osc=no',
      '--log-file=' + path.join(output, 'preview-mpv.log'),
      '--volume=0',
      '--input-cursor=no',
      '--keep-open=yes',
      path.resolve('tmp/player-tests/tracks.mkv'),
    ],
    { windowsHide: true, env: { ...process.env, PRIMIO_PLAYER_CONFIG: config }, stdio: 'ignore' },
  )
  let socket
  try {
    socket = await until(
      () =>
        new Promise((resolve, reject) => {
          const s = net.connect(pipe)
          s.once('connect', () => resolve(s))
          s.once('error', () => {
            s.destroy()
            reject(Error('Starting'))
          })
        }),
      Boolean,
    )
    let buffer = '',
      sequence = 0
    const pending = new Map()
    socket.on('error', () => {})
    socket.on('data', (bytes) => {
      buffer += bytes
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n'),
          line = JSON.parse(buffer.slice(0, end))
        buffer = buffer.slice(end + 1)
        const waiter = pending.get(line.request_id)
        if (waiter) {
          pending.delete(line.request_id)
          clearTimeout(waiter.timer)
          line.error === 'success' ? waiter.resolve(line.data) : waiter.reject(Error(line.error))
        }
      }
    })
    const command = (...command) =>
      new Promise((resolve, reject) => {
        const request_id = ++sequence,
          timer = setTimeout(() => {
            pending.delete(request_id)
            reject(Error('IPC timeout'))
          }, 3000)
        pending.set(request_id, {
          resolve,
          reject: (error) => reject(Error(command[0] + ': ' + error.message)),
          timer,
        })
        socket.write(JSON.stringify({ command, request_id }) + '\n')
      })
    const get = (name) => command('get_property', name)
    await until(
      () => get('user-data/primio/ui'),
      (ui) => ui && !ui.loading,
    )

    await command('set_property', 'pause', true)
    await until(
      () => get('time-pos'),
      (p) => p >= 9.9,
    )
    const selected = (tracks, type) => tracks.find((t) => t.type === type && t.selected)
    const tracks = await until(
      () => get('track-list'),
      (tracks) =>
        selected(tracks, 'audio')?.lang === 'fra' && selected(tracks, 'sub')?.lang === 'fra',
    )
    const english = tracks.find((t) => t.type === 'audio' && t.lang === 'eng')
    await command('set_property', 'aid', english.id)
    await command('script-message-to', 'primio', 'remember-track', 'audio', String(english.id))
    await until(
      () => get('user-data/primio/track-preferences'),
      (p) => p?.audio?.language === 'en' && p?.subtitle?.language === 'fr',
    )
    const size = await get('osd-dimensions'),
      scale = size.h / 720,
      width = size.w / scale
    await command('script-message-to', 'primio_ui', 'open', 'speed')
    await delay(250)
    const w = Math.min(860, width - 48),
      x = (width - w) / 2
    // 1.5x is the third row of the first column in the speed panel.
    await command('mouse', Math.round((x + 75) * scale), Math.round((24 + 84 + 104 + 22) * scale))
    await command('keypress', 'MBTN_LEFT')
    await until(
      () => get('speed'),
      (v) => v === 1.5,
    )
    // Current source icon bounds: x=28..76, y=height-64..height-16.
    await command('mouse', Math.round(52 * scale), Math.round((720 - 40) * scale))
    await command('keypress', 'mouse_move')
    await delay(150)
    await command('keypress', 'MBTN_LEFT')
    await until(
      () => get('user-data/primio/request'),
      (v) => v?.id === 'qa:1' && v.auto === false,
    )
    console.log(
      'PASS: Windows restores semantic audio/subtitle preferences, remembers manual audio, skips recaps, changes speed and requests a new source for the current episode.',
    )
  } finally {
    socket?.destroy()
    if (child.exitCode === null) child.kill()
  }
}
await run(false)
