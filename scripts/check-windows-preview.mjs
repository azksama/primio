import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'

const theme = process.env.PRIMIO_PLAYER_THEME ? JSON.parse(await fs.readFile(process.env.PRIMIO_PLAYER_THEME,'utf8')).theme : undefined
const resources = path.resolve(process.env.PRIMIO_PLAYER_RESOURCES ?? 'apps/client/src-tauri/resources/windows')
const executable = path.join(resources, 'mpv/primio-player.exe')
const output = path.resolve(process.env.PRIMIO_PREVIEW_OUTPUT ?? (theme ? 'tmp/validation-neo-graphite/native' : 'tmp/audit-2026-10-04/windows-preview'))
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
      title: 'Primio preview test', previewExecutable: executable, previewPath: path.join(output, 'preview.bgra'),
      locale: 'en', theme,
      skipSegments: outro ? [{ kind: 'outro', start: 10, end: 120 }] : [{kind:'intro',start:10,end:20}],
      autoSkipIntro:false, autoNextEpisode:false,
    }),
  )
  const pipe = `\\\\.\\pipe\\primio-pip-qa-${process.pid}-${outro}`
  const child = spawn(
    executable,
    [
      `--config-dir=${path.join(resources, 'player')}`,
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
    if(theme) assert.equal((await get('user-data/primio/ui')).material, theme.material)

    await command('set_property','pause',true)
    await command('seek',8,'absolute+exact')
    await until(()=>get('user-data/primio/countdown'),v=>v?.visible&&v.key==='intro:10'&&v.position>=8)
    const warning=await get('user-data/primio/countdown')
    assert.ok(warning.position<10,'Warn before the segment starts')
    await delay(400)
    assert.equal((await get('user-data/primio/countdown')).elapsed,warning.elapsed,'Paused video must pause the countdown')
    const preloadStart=performance.now()
    const cached=await until(()=>get('user-data/primio/preview-cache'),v=>v?.total>0&&v.frames>=v.total,60000)
    assert.equal(cached.interval,1)
    const preloadMs=performance.now()-preloadStart
    const before=await get('time-pos')
    const size=await get('osd-dimensions')
    const scale=size.h/720
    const mx=Math.round(size.w*.6), my=Math.round((720-100)*scale)
    await command('mouse',mx,my)
    await command('keypress','mouse_move')
    const target=(mx/scale-28)/(size.w/scale-56)*(await get('duration'))
    const seconds=Math.floor(target)
    const previewStart=performance.now()
    await until(()=>fs.stat(path.join(output,'preview.bgra.'+seconds+'.bgra')),info=>info.size===129600,20000)
    await until(async()=>{await command('mouse',mx,my);await command('keypress','mouse_move');return get('user-data/primio/preview')},preview=>preview?.visible&&preview.seconds===seconds&&Math.abs(preview.x-(mx-120))<2,20000)
    const preview=await get('user-data/primio/preview')
    const previewMs=performance.now()-previewStart
    assert.ok(Math.abs(preview.x-(mx-120))<2,'Thumbnail follows the seek cursor horizontally')
    assert.ok(preview.y+135<(720-130)*scale,'Thumbnail sits above the timestamp and cursor')
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

    // Dragging the timeline previews the target and commits exactly once on release.
    await command('mouse',Math.round(size.w*.25),my);await command('keypress','mouse_move')
    await command('keydown','MBTN_LEFT')
    const dragX=Math.round(size.w*.72)
    await command('mouse',dragX,my);await command('keypress','mouse_move')
    const dragTarget=(dragX/scale-28)/(size.w/scale-56)*((await get('duration'))-.001)
    const drag=await until(()=>get('user-data/primio/ui'),ui=>ui?.scrubbing&&Math.abs(ui.seekTarget-dragTarget)<.05)
    await until(()=>get('user-data/primio/preview'),p=>p?.visible&&p.seconds===Math.floor(drag.seekTarget),15000)
    assert.ok(Math.abs((await get('time-pos'))-before)<.1,'Dragging must not repeatedly seek the playback decoder')
    await command('screenshot-to-file',path.join(output,'windows-timeline-drag.png'),'window')
    await command('keyup','MBTN_LEFT')
    await until(()=>get('time-pos'),v=>Math.abs(v-drag.seekTarget)<.2)
    assert.equal(await get('pause'),true)

    await command('script-message-to','primio_ui','open','subtitle-delay')
    await until(()=>get('user-data/primio/ui'),ui=>ui?.panel==='subtitle-delay')
    const click=async(x,y)=>{await command('mouse',Math.round(x*scale),Math.round(y*scale));await command('keypress','MBTN_LEFT')}
    const virtualWidth=size.w/scale,panelX=(virtualWidth-Math.min(860,virtualWidth-48))/2
    await click(virtualWidth*.65,371)
    await until(()=>get('sub-delay'),v=>Math.abs(v-.5)<.001)
    await click(panelX+90,371)
    await until(()=>get('sub-delay'),v=>Math.abs(v)<.001)
    await click(panelX+90,371)
    await until(()=>get('sub-delay'),v=>Math.abs(v+.5)<.001)
    await command('screenshot-to-file',path.join(output,'windows-subtitle-delay.png'),'window')
    await click(virtualWidth/2,431)
    await until(()=>get('sub-delay'),v=>v===0)
    await command('script-message-to','primio_ui','close')
    const subtitles=path.join(output,'timing.srt')
    await fs.writeFile(subtitles,'1\n00:00:01,000 --> 00:00:02,000\nSubtitle timing proof\n')
    await command('sub-add',subtitles,'select')
    await command('seek',1.2,'absolute+exact')
    await until(()=>get('sub-text'),text=>text?.includes('Subtitle timing proof'))
    await command('set_property','sub-delay',.5)
    await command('seek',1.2,'absolute+exact')
    await until(()=>get('sub-text'),text=>text==='')
    await command('seek',1.8,'absolute+exact')
    await until(()=>get('sub-text'),text=>text?.includes('Subtitle timing proof'))
    await command('set_property','sub-delay',0)
    await command('set_property','sid','no')
    await fs.writeFile(path.join(output,'results.json'),JSON.stringify({cached,preloadMs,previewMs,timelineDrag:true,subtitleDelay:true},null,2))

    await command('keypress','z')
    await until(()=>get('panscan'),value=>value===1)
    await command('keypress','z')
    await until(()=>get('panscan'),value=>value===0)
    await command('seek',10,'absolute+exact')
    await until(()=>get('user-data/primio/countdown'),v=>v?.segment==='intro'&&!v.visible)
    // Seeking into the middle of an intro exposes Skip immediately, without a new timer.
    await command('mouse',Math.round(size.w-138*scale),Math.round((720-156)*scale));await delay(100)
    await command('keypress','MBTN_LEFT')
    await until(()=>get('time-pos'),v=>v>=19.9)
    console.log('PASS: Segment warning precedes the intro, follows the media clock, and the skip button appears at its start.')
    await command('seek',8,'absolute+exact')
    await until(()=>get('time-pos'),v=>Math.abs(v-8)<.15)
    const gx=Math.round(size.w*.4),gy=Math.round(size.h*.32)
    await command('mouse',gx,gy);await command('keypress','mouse_move');await command('keydown','MBTN_LEFT')
    await delay(400)
    await command('mouse',gx+Math.round(24*scale),gy);await command('keypress','mouse_move')
    await until(()=>get('user-data/primio/ui'),v=>v?.scrubbing&&Math.abs(v.seekTarget-11)<.2)
    await command('screenshot-to-file',path.join(output,'windows-gesture.png'),'window')
    await command('keyup','MBTN_LEFT')
    await until(()=>get('time-pos'),v=>Math.abs(v-11)<.15)
    assert.equal(await get('pause'),true,'Seeking retains the original pause state')
    console.log('PASS: Hold and horizontal drag seeks second by second and keeps pause state.')
    console.log(`PASS: ${cached.frames} frames preloaded at 1/s, ${cached.bytes} bytes; cached preview ${Math.round(previewMs)} ms; timeline drag, subtitle delay +/-/reset and fit/fill verified.`)
  } finally {
    if(socket&&!socket.destroyed)socket.write(JSON.stringify({command:['quit']})+'\n')
    await until(async()=>child.exitCode,value=>value!==null,3000).catch(()=>child.kill())
    socket?.destroy()
  }
}
await run(false)
