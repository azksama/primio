import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createReadStream } from 'node:fs'
import fs from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import path from 'node:path'

// Local synthetic/trailer fixture only. No account, addon, provider or production mutation.
const root = path.resolve('tmp/audit-2026-10-04/windows-preview-performance')
const media = path.resolve(process.env.PRIMIO_PERF_MEDIA ?? 'tmp/player-tests/trailer.mp4')
const executable = path.resolve('apps/client/src-tauri/resources/windows/mpv/primio-player.exe')
const seconds = Number(process.env.PRIMIO_PERF_SECONDS ?? 24)
assert.ok(seconds >= 10 && seconds <= 30)
const mediaSize = (await fs.stat(media)).size
await fs.mkdir(root, { recursive: true })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(read, accepts, milliseconds = 10000) {
  const deadline = performance.now() + milliseconds
  while (performance.now() < deadline) {
    try { const value = await read(); if (accepts(value)) return value } catch {}
    await sleep(50)
  }
  throw new Error('Timed out')
}
let transferred = 0, requests = 0
const server = http.createServer((request, response) => {
  if (request.url !== '/fixture.mp4') { response.writeHead(404).end(); return }
  requests++
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '')
  const first = range ? Number(range[1]) : 0
  const last = range?.[2] ? Math.min(Number(range[2]), mediaSize - 1) : mediaSize - 1
  if (first > last || first >= mediaSize) { response.writeHead(416).end(); return }
  response.writeHead(range ? 206 : 200, {
    'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'content-length': last - first + 1,
    ...(range ? { 'content-range': `bytes ${first}-${last}/${mediaSize}` } : {}),
  })
  const stream = createReadStream(media, { start: first, end: last })
  stream.on('data', chunk => { transferred += chunk.length })
  response.on('close', () => stream.destroy())
  stream.on('error', () => response.destroy())
  stream.pipe(response)
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}/fixture.mp4`

const samplerPath = path.join(root, 'sample-owned-processes.ps1')
await fs.writeFile(samplerPath, `param([int]$PrimioPid,[string]$SamplePath,[string]$StopPath)
$started = [DateTime]::UtcNow
$tracked = @{}
$tracked[$PrimioPid] = $true
$writer = [System.IO.StreamWriter]::new($SamplePath, $false)
$writer.WriteLine('milliseconds,pid,cpuSeconds,workingSet,privateBytes')
try {
 while (!(Test-Path -LiteralPath $StopPath)) {
  foreach ($primioProcess in @(Get-Process -Name primio-player -ErrorAction SilentlyContinue)) {
   if (!$tracked.ContainsKey($primioProcess.Id)) {
    $information = Get-CimInstance Win32_Process -Filter "ProcessId = $($primioProcess.Id)" -ErrorAction SilentlyContinue
    if ($information -and $tracked.ContainsKey([int]$information.ParentProcessId)) { $tracked[$primioProcess.Id] = $true }
   }
   if ($tracked.ContainsKey($primioProcess.Id)) {
    try { $writer.WriteLine(('{0},{1},{2},{3},{4}' -f [int]([DateTime]::UtcNow-$started).TotalMilliseconds,$primioProcess.Id,$primioProcess.TotalProcessorTime.TotalSeconds.ToString([Globalization.CultureInfo]::InvariantCulture),$primioProcess.WorkingSet64,$primioProcess.PrivateMemorySize64)) } catch {}
   }
  }
  $writer.Flush()
  Start-Sleep -Milliseconds 100
 }
} finally { $writer.Dispose() }
`)

async function run(transport, preload, closeDuringWarmup = false) {
  const label = `${transport}-${preload ? 'on' : 'off'}${closeDuringWarmup ? '-close' : ''}`
  const folder = path.join(root, label)
  await fs.mkdir(folder, { recursive: true })
  const config = path.join(folder, 'config.json'), previewPath = path.join(folder, 'preview')
  await fs.writeFile(config, JSON.stringify({ title: 'Primio performance fixture', locale: 'en',
    previewPath, ...(preload ? { previewExecutable: executable } : {}), skipSegments: [] }))
  const pipe = `\\\\.\\pipe\\primio-perf-${process.pid}-${label}`
  transferred = 0; requests = 0
  const started = performance.now()
  const child = spawn(executable, [
    `--config-dir=${path.resolve('apps/client/src-tauri/resources/windows/player')}`,
    `--input-ipc-server=${pipe}`, '--fullscreen=yes', '--border=no', '--osc=no',
    '--no-audio', '--keep-open=yes', '--hwdec=auto-safe', '--pause=no',
    transport === 'http' ? url : media,
  ], { env: { ...process.env, PRIMIO_PLAYER_CONFIG: config }, windowsHide: true, stdio: 'ignore' })
  const stop = path.join(folder, `stop-${process.pid}`)
  const samplesPath = path.join(folder, 'processes.csv')
  const sampler = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', samplerPath, '-PrimioPid', String(child.pid), '-SamplePath', samplesPath, '-StopPath', stop],
  { windowsHide: true, stdio: 'ignore' })
  let socket, sequence = 0, buffer = '', samples = [], initial, final, measuredMs = 0, partialFramesOnClose = 0
  const pending = new Map()
  try {
    socket = await until(() => new Promise((resolve, reject) => {
      const socket = net.connect(pipe)
      socket.once('connect', () => resolve(socket))
      socket.once('error', error => { socket.destroy(); reject(error) })
    }), Boolean)
    socket.on('error', () => {})
    socket.on('data', chunk => {
      buffer += chunk
      while (buffer.includes('\n')) {
        const split = buffer.indexOf('\n'), line = JSON.parse(buffer.slice(0, split))
        buffer = buffer.slice(split + 1)
        const waiter = pending.get(line.request_id)
        if (waiter) {
          pending.delete(line.request_id); clearTimeout(waiter.timer)
          line.error === 'success' ? waiter.resolve(line.data) : waiter.resolve(null)
        }
      }
    })
    const command = (...command) => new Promise((resolve, reject) => {
      const request_id = ++sequence
      const timer = setTimeout(() => { pending.delete(request_id); reject(Error('IPC timeout')) }, 3000)
      pending.set(request_id, { resolve, timer })
      socket.write(JSON.stringify({ command, request_id }) + '\n')
    })
    const get = property => command('get_property', property)
    await until(() => get('time-pos'), position => typeof position === 'number' && position > 0)
    const properties = ['time-pos', 'frame-drop-count', 'decoder-frame-drop-count',
      'mistimed-frame-count', 'vo-delayed-frame-count', 'paused-for-cache', 'demuxer-cache-duration',
      'user-data/primio/preview-cache']
    const snapshot = async () => Object.fromEntries(await Promise.all(properties.map(async key => [key, await get(key)])))
    initial = await snapshot()
    const observationStarted = performance.now()
    if (closeDuringWarmup) {
      const warming = await until(async () => ({
        cache: await get('user-data/primio/preview-cache'),
        files: (await fs.readdir(folder)).filter(name => name.startsWith('preview') && name.endsWith('.jpg')),
      }), state => state.cache?.running && state.files.length > 0, 12000)
      partialFramesOnClose = warming.files.length
      final = await snapshot()
    } else {
      const deadline = performance.now() + seconds * 1000
      while (performance.now() < deadline) { samples.push(await snapshot()); await sleep(200) }
      final = await snapshot()
      assert.ok(final['time-pos'] - initial['time-pos'] >= seconds - 2, `${label} playback advances`)
      if (preload) {
        const cache = final['user-data/primio/preview-cache']
        assert.ok(cache?.total > 0, `${label} preload started`)
        assert.equal(cache.frames, cache.total, `${label} full one-second cache populated`)
      }
    }
    measuredMs = performance.now() - observationStarted
    socket.write(JSON.stringify({ command: ['quit'] }) + '\n')
  } finally {
    if (socket && !socket.destroyed && child.exitCode === null) socket.write(JSON.stringify({ command: ['quit'] }) + '\n')
    await until(() => child.exitCode, code => code !== null, 4000).catch(() => child.kill())
    socket?.destroy()
    for (const waiter of pending.values()) clearTimeout(waiter.timer)
    await fs.writeFile(stop, '')
    await until(() => sampler.exitCode, code => code !== null, 4000).catch(() => sampler.kill())
  }
  await sleep(400)
  const owned = new Map(), memory = new Map()
  for (const line of (await fs.readFile(samplesPath, 'utf8')).trim().split(/\r?\n/).slice(1)) {
    const [time, pid, cpu, workingSet, privateBytes] = line.split(',').map(Number)
    const previous = owned.get(pid)
    owned.set(pid, { pid, cpuSeconds: Math.max(previous?.cpuSeconds ?? 0, cpu) })
    const bucket = Math.floor(time / 100)
    const current = memory.get(bucket) ?? { workingSet: 0, privateBytes: 0 }
    current.workingSet += workingSet; current.privateBytes += privateBytes; memory.set(bucket, current)
  }
  const leftovers = (await fs.readdir(folder)).filter(name => name.startsWith('preview'))
  const survivingPids = [...owned.keys()].filter(pid => {
    try { process.kill(pid, 0); return true } catch { return false }
  })
  const cacheDurations = samples.map(s => s['demuxer-cache-duration']).filter(Number.isFinite)
  const result = { label, observationSeconds: measuredMs / 1000, wallMs: performance.now() - started,
    ...(closeDuringWarmup ? { partialFramesOnClose } : {}),
    playingSeconds: final['time-pos'] - initial['time-pos'],
    drops: Object.fromEntries(['frame-drop-count','decoder-frame-drop-count','mistimed-frame-count','vo-delayed-frame-count'].map(key => [key, initial[key] === null || final[key] === null ? null : final[key] - initial[key]])),
    bufferingSamples: samples.filter(s => s['paused-for-cache']).length,
    sampleCount: samples.length,
    minCacheDuration: cacheDurations.length ? Math.min(...cacheDurations) : null,
    cache: final['user-data/primio/preview-cache'],
    sampledCpuSeconds: [...owned.values()].reduce((sum, process) => sum + process.cpuSeconds, 0),
    peakAggregateWorkingSet: Math.max(0, ...[...memory.values()].map(sample => sample.workingSet)),
    peakAggregatePrivateBytes: Math.max(0, ...[...memory.values()].map(sample => sample.privateBytes)),
    ownedProcesses: [...owned.values()], servedBytes: transferred, requests, leftovers, survivingPids }
  await fs.writeFile(path.join(folder, 'result.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
  assert.deepEqual(leftovers, [], `${label} preview files cleaned on shutdown`)
  assert.deepEqual(survivingPids, [], `${label} sampled player processes stopped on shutdown`)
  return result
}

try {
  const results = []
  // Recheck cancellation without repeating the four measured playback runs.
  for (const transport of ['local', 'http']) for (const preload of [false, true]) {
    results.push(process.argv.includes('--close-only')
      ? JSON.parse(await fs.readFile(path.join(root, `${transport}-${preload ? 'on' : 'off'}`, 'result.json'), 'utf8'))
      : await run(transport, preload))
  }
  results.push(await run('local', true, true))
  await fs.writeFile(path.join(root, 'results.json'), JSON.stringify({ mediaSize, method: `${seconds}-second active video-only playback; identical mpv UI. Owned process CPU/RAM sampled every ~100 ms; CPU can undercount processes exiting between samples. HTTP byte count includes bytes queued by the local range server. No phone or external network measured.`, results }, null, 2))
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
