import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const directory = path.resolve('tmp/windows-test')
fs.mkdirSync(directory, { recursive: true })
const file = path.join(directory, 'fixture.mkv')
if (!fs.existsSync(file)) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc2=size=960x540:rate=24',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:sample_rate=48000',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=660:sample_rate=48000',
      '-t',
      '120',
      '-map',
      '0:v',
      '-map',
      '1:a',
      '-map',
      '2:a',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-crf',
      '32',
      '-c:a',
      'aac',
      '-metadata:s:a:0',
      'language=eng',
      '-metadata:s:a:1',
      'language=fra',
      file,
    ],
    { stdio: 'inherit' },
  )
  if (result.status !== 0) throw result.error || Error('FFmpeg fixture generation failed')
}
const delayed = new Set()
const size = fs.statSync(file).size
http
  .createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    if (url.pathname === '/sub.srt') {
      response.writeHead(200, { 'content-type': 'application/x-subrip' })
      response.end('1\n00:00:00,000 --> 00:02:00,000\nPrimio Windows subtitle test\n')
      return
    }
    if (url.pathname !== '/fixture.mkv') {
      response.writeHead(404)
      response.end()
      return
    }
    if(url.searchParams.has('delay') && !delayed.has(url.href)) { delayed.add(url.href); await new Promise(resolve=>setTimeout(resolve, Math.min(20000,Math.max(0,Number(url.searchParams.get('delay'))||0)))); }
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '')
    const start = range ? Number(range[1]) : 0
    const end = Math.min(range?.[2] ? Number(range[2]) : size - 1, size - 1)
    if (start > end) {
      response.writeHead(416)
      response.end()
      return
    }
    response.writeHead(range ? 206 : 200, {
      'content-type': 'video/x-matroska',
      'content-length': end - start + 1,
      'accept-ranges': 'bytes',
      ...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {}),
    })
    const stream = fs.createReadStream(file, { start, end })
    response.on('close', () => stream.destroy())
    stream.pipe(response)
  })
  .listen(9341, '127.0.0.1', () => console.log('Windows playback fixture ready on 127.0.0.1:9341'))
