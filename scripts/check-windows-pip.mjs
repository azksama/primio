import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'

const output = path.resolve('tmp/validation-v029')
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
      title: 'Primio PiP test',
      locale: 'en',
      skipSegments: outro ? [{ kind: 'outro', start: 10, end: 120 }] : [],
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
      '--no-audio',
      '--keep-open=yes',
      'http://127.0.0.1:9341/fixture.mkv',
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
        pending.set(request_id, { resolve, reject, timer })
        socket.write(JSON.stringify({ command, request_id }) + '\n')
      })
    const get = (name) => command('get_property', name)
    await until(
      () => get('user-data/primio/ui'),
      (ui) => ui && !ui.loading,
    )
    if (outro) {
      await command('seek', 15, 'absolute+exact')
      await until(
        () => get('time-pos'),
        (p) => p >= 15,
      )
      await command('keypress', 'ESC').catch(() => {})
      await until(
        () => child.exitCode,
        (code) => code !== null,
      )
      console.log('PASS Windows closes after outro without PiP')
    } else {
      await command('keypress', 'ESC')
      await until(
        () => get('user-data/primio/ui'),
        (ui) => ui.pip,
      )
      assert.equal(await get('fullscreen'), false)
      assert.equal(await get('ontop'), true)
      const before = await get('time-pos')
      await until(
        () => get('time-pos'),
        (p) => p > before + 0.5,
      )
      await command('screenshot-to-file', path.join(output, 'windows-pip.png'), 'window')
      await command('keypress', 'MBTN_LEFT_DBL')
      await until(
        () => get('user-data/primio/ui'),
        (ui) => !ui.pip && ui.fullscreen,
      )
      await command('set_property', 'window-minimized', true)
      await until(
        () => get('user-data/primio/ui'),
        (ui) => ui.pip,
      )
      assert.equal(await get('window-minimized'), false)
      console.log('PASS Windows PiP on back/minimize, continuous playback, fullscreen restore')
    }
  } finally {
    socket?.destroy()
    if (child.exitCode === null) child.kill()
  }
}
await run(false)
await run(true)
