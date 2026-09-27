import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'

const output = path.resolve('tmp/validation-v0212')
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
      skipSegments: outro ? [{ kind: 'outro', start: 10, end: 120 }] : [{kind:'intro',start:0,end:20}],
      autoSkipIntro:false, autoNextEpisode:false,
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
      '--no-audio', '--input-cursor=no',
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
    await until(()=>get('user-data/primio/countdown'),v=>v?.visible&&v.key==='intro:0')
    const countdownStarted=Date.now()
    const before=await get('time-pos')
    const size=await get('osd-dimensions')
    const scale=size.h/720
    const mx=Math.round(size.w*.6), my=Math.round((720-80)*scale)
    await command('mouse',mx,my)
    await command('keypress','mouse_move')
    const target=(mx/scale-28)/(size.w/scale-56)*(await get('duration'))
    const seconds=Math.floor(target/5)*5
    await until(()=>fs.stat(path.join(output,'preview.bgra.'+seconds+'.bgra')),info=>info.size===129600,20000)
    await until(async()=>{await command('mouse',mx,my);await command('keypress','mouse_move');return get('user-data/primio/preview')},preview=>preview?.visible&&preview.seconds===seconds&&Math.abs(preview.x-(mx-120))<2,20000)
    const preview=await get('user-data/primio/preview')
    assert.ok(Math.abs(preview.x-(mx-120))<2,'Thumbnail follows the seek cursor horizontally')
    assert.ok(preview.y+135<(720-110)*scale,'Thumbnail sits above the timestamp and cursor')
    assert.ok(Math.abs((await get('time-pos'))-before)<0.1,'Preview must not seek the playing media')
    await command('screenshot-to-file',path.join(output,'windows-preview.png'),'window')
    // The preview remains inside the video at either end and hiding cancels pending display.
    for (const ratio of [0,1]) {
      const edgeX=Math.round(ratio===0?28*scale:(size.w-28*scale))
      await command('mouse',edgeX,my);await command('keypress','mouse_move')
      const edge=await until(()=>get('user-data/primio/preview'),p=>p?.visible&&p.x>=0&&p.x+240<=size.w&&Math.abs(p.x-(ratio===0?0:size.w-240))<2,20000)
      assert.ok(edge.y>=0)
    }
    await command('script-message-to','primio_preview','hide')
    await until(()=>get('user-data/primio/preview'),p=>p&&!p.visible)

    await command('keypress','z')
    await until(()=>get('panscan'),value=>value===1)
    await command('keypress','z')
    await until(()=>get('panscan'),value=>value===0)
    await until(()=>get('user-data/primio/countdown'),v=>v?.key==='intro:0'&&v.elapsed>=5&&!v.visible)
    assert.ok(Date.now()-countdownStarted>=4400,'Manual skip is delayed by the five-second countdown')
    await command('mouse',Math.round(size.w-138*scale),Math.round((720-156)*scale));await delay(100)
    await command('keypress','MBTN_LEFT')
    await until(()=>get('time-pos'),v=>v>=19.9)
    console.log('PASS: Five-second intro countdown and manual skip.')
    console.log('PASS: Windows seek preview decoded a 240x135 frame without seeking playback; fit/fill shortcut works.')
  } finally {socket?.destroy();if(child.exitCode===null)child.kill()}
}
await run(false)
