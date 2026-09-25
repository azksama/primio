import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'

const output = path.resolve('tmp/validation-v0211')
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
      title: 'Primio preview test', previewExecutable: path.resolve('apps/client/src-tauri/resources/windows/mpv/primio-player.exe'), previewPath: path.join(output, 'preview.bgra'),
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
      '--osc=no', '--log-file='+path.join(output,'preview-mpv.log'),
      '--no-audio',
      '--keep-open=yes',
      path.resolve('tmp/player-tests/trailer.mp4'),
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
        pending.set(request_id, { resolve, reject: error => reject(Error(command[0] + ': ' + error.message)), timer })
        socket.write(JSON.stringify({ command, request_id }) + '\n')
      })
    const get = (name) => command('get_property', name)
    await until(
      () => get('user-data/primio/ui'),
      (ui) => ui && !ui.loading,
    )

    await command('set_property','pause',true)
    const before=await get('time-pos')
    await command('script-message-to','primio_preview','preview','5','20','20')
    await until(()=>fs.stat(path.join(output,'preview.bgra')),info=>info.size===129600,20000)
    await until(()=>get('user-data/primio/preview'),preview=>preview?.visible&&preview.seconds===5,20000)
    assert.ok(Math.abs((await get('time-pos'))-before)<0.1,'Preview must not seek the playing media')
    await command('screenshot-to-file',path.join(output,'windows-preview.png'),'window')
    await command('script-message-to','primio_preview','hide')
    await command('keypress','z')
    await until(()=>get('panscan'),value=>value===1)
    await command('keypress','z')
    await until(()=>get('panscan'),value=>value===0)
    console.log('PASS: Windows seek preview decoded a 240x135 frame without seeking playback; fit/fill shortcut works.')
  } finally {socket?.destroy();if(child.exitCode===null)child.kill()}
}
await run(false)
