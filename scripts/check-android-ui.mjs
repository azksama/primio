// Run against the debug APK on the explicitly selected AVD after ARTEMIS exploration.
// Requires an English UI with onboarding completed; does not alter account or catalog data.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
const serial = process.argv[2]
assert(serial, 'Pass the chosen device serial, e.g. emulator-5554')
const adb = resolve(process.env.ANDROID_HOME || `${process.env.LOCALAPPDATA}/Android/Sdk`, 'platform-tools/adb.exe')
const run = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8' })
const avd = run('emu', 'avd', 'name').trim()
assert(avd.startsWith('Primio_Medium_API_36_1'), `Unexpected AVD: ${avd}`)
run('shell', 'am', 'start', '-n', 'fr.azks.primio/.MainActivity')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let socketName
for (let n = 0; n < 50 && !socketName; n++) {
  let pid = ''
  try { pid = run('shell', 'pidof', 'fr.azks.primio').trim() } catch { await sleep(100); continue }
  socketName = run('shell', 'cat', '/proc/net/unix').match(new RegExp(`@webview_devtools_remote_${pid}\\b`))?.[0].slice(1)
  if (!socketName) await sleep(100)
}
assert(socketName, 'No debuggable Primio WebView; install the debug APK first')
run('forward', 'tcp:9224', `localabstract:${socketName}`)
let target
for (let n = 0; n < 50 && !target; n++) {
  const targets = await (await fetch('http://127.0.0.1:9224/json')).json()
  target = targets.find((p) => p.url.includes('tauri.localhost'))
  if (!target) await sleep(100)
}
assert(target, 'Primio page not found')
const socket = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject })
let id = 0; const pending = new Map()
socket.onmessage = ({ data }) => {
  const msg = JSON.parse(data), call = pending.get(msg.id)
  if (call) { pending.delete(msg.id); clearTimeout(call.timer); msg.error ? call.reject(msg.error) : call.resolve(msg.result) }
}
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const key = ++id, timer = setTimeout(() => { pending.delete(key); reject(Error(`Timeout: ${method}`)) }, 10000)
  pending.set(key, { resolve, reject, timer }); socket.send(JSON.stringify({ id: key, method, params }))
})
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails))
  return result.result.value
}
const click = async (text, prefix = false) => {
  const exists = `Boolean([...document.querySelectorAll('button')].find(b => b.textContent${prefix ? '.startsWith(' + JSON.stringify(text) + ')' : '===' + JSON.stringify(text)}))`
  let found = false
  for (let n = 0; n < 100 && !found; n++) { found = await evaluate(exists); if (!found) await sleep(100) }
  assert(found, `Missing button: ${text}`)
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent${prefix ? '.startsWith(' + JSON.stringify(text) + ')' : '===' + JSON.stringify(text)}).click()`)
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
}
const output = resolve('tmp/validation-v0212')
await mkdir(output, { recursive: true })
const capture = async (name) => {
  await sleep(300) // Page transition is 240 ms.
  assert(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), `${name}: horizontal overflow`)
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(resolve(output, `android-${name}.png`), Buffer.from(data, 'base64'))
}
try {
  await click('Home'); await capture('home')
  assert(await evaluate("document.documentElement.classList.contains('native-android')"), 'Native zoom policy missing')
  // Touch dispatch observes the page's actual gesture policy, unlike CDP's forced pinch command.
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 170, y: 350, id: 0 }, { x: 230, y: 350, id: 1 }] })
  for (let i = 1; i <= 10; i++) {
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 170-i*12, y: 350, id: 0 }, { x: 230+i*12, y: 350, id: 1 }] })
    await sleep(30)
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  assert.equal(await evaluate('visualViewport.scale'), 1, 'App chrome zoomed after pinch')
  for (const [button, name] of [['Addons', 'addons'], ['Plugins', 'plugins'], ['Player', 'player-settings']]) {
    await click('Settings'); await click(button, true); await capture(name)
    assert(await evaluate('Math.abs(document.querySelector(".bottom-nav").getBoundingClientRect().bottom-innerHeight)<40'), 'Navigation escaped the viewport')
  }
  await evaluate("document.querySelector('.font-import').scrollIntoView({block:'center'})")
  await capture('font-import')
  const font = await readFile('apps/client/src-tauri/resources/windows/player/fonts/inter.ttf')
  const fontId = createHash('sha256').update(font).digest('hex')
  const previousFont = await evaluate("localStorage.getItem('primio.subtitle-font')")
  const alreadyImported = await evaluate(`new Promise((resolve,reject)=>{const r=indexedDB.open('primio-fonts',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('fonts').objectStore('fonts').get(${JSON.stringify(fontId)});q.onsuccess=()=>{resolve(!!q.result);db.close()};q.onerror=reject};r.onerror=reject})`)
  try {
    await evaluate(`(()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(font.toString('base64'))}),c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([bytes],'Inter.ttf',{type:'font/ttf'}));const input=document.querySelector('.font-import input');input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    let imported = false
    for(let n=0;n<100&&!imported;n++){imported=await evaluate(`localStorage.getItem('primio.subtitle-font')===${JSON.stringify(fontId)}`);if(!imported)await sleep(100)}
    assert(imported, 'Font import failed in the real Android WebView')
    assert(await evaluate("getComputedStyle(document.querySelector('.subtitle-preview > span')).fontFamily.includes('primio-')"), 'Custom font missing from preview')
    const native = await evaluate(`window.__TAURI_INTERNALS__.invoke('prepare_subtitle_font',{id:${JSON.stringify(fontId)},data:${JSON.stringify([...font])}})`)
    assert(native.path.includes(fontId), 'Native font bridge did not prepare the font')
    console.log('PASS: Android font import, real CSP/IndexedDB preview and native font preparation bridge.')
  } finally {
    if(!alreadyImported) {
      await evaluate("document.querySelector('.font-import button')?.click()")
      for(let n=0;n<100;n++){if(await evaluate(`localStorage.getItem('primio.subtitle-font')!==${JSON.stringify(fontId)}`))break;await sleep(100)}
    }
    await evaluate(`${previousFont ? "localStorage.setItem('primio.subtitle-font',"+JSON.stringify(previousFont)+')' : "localStorage.removeItem('primio.subtitle-font')"};window.dispatchEvent(new Event('primio-fonts-changed'))`)
  }
  await click('Explore'); await capture('explore')
  await click('My list'); await capture('library')
  await click('Home')
  console.log('PASS: Medium Primio real WebView: navigation, Addons/Plugins actions, subtitle settings, font import control, Explore, library, horizontal bounds, pinch zoom blocked.')
} finally { socket.close(); run('forward', '--remove', 'tcp:9224') }
