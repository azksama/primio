import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const expectedVersion = process.argv[2]
assert.match(expectedVersion ?? '', /^\d+\.\d+\.\d+$/, 'Usage: node scripts/check-release.mjs 0.2.9')
const response = await fetch('https://primio-api.azks.fr/api/v1/app-release', {
  cache: 'no-store',
  signal: AbortSignal.timeout(30000),
})
assert.equal(response.status, 200)
const manifest = await response.json()
assert.equal(manifest.version, expectedVersion, 'Production must advertise the published version')
for (const [platform, extension] of [['android', 'apk'], ['windows', 'exe']]) {
  const artifact = manifest.platforms[platform]
  const url = new URL(artifact.url)
  assert.equal(url.origin, 'https://github.com')
  assert.ok(url.pathname.startsWith(`/azksama/primio/releases/download/v${expectedVersion}-`))
  assert.ok(url.pathname.endsWith(`.${extension}`))
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/)
  const download = await fetch(url, { signal: AbortSignal.timeout(180000) })
  assert.equal(download.status, 200, `${platform}: public download must work without authentication`)
  const hash = createHash('sha256')
  let size = 0
  for await (const chunk of download.body) {
    size += chunk.length
    assert.ok(size <= artifact.size, `${platform}: download exceeds announced size`)
    hash.update(chunk)
  }
  assert.equal(size, artifact.size)
  assert.equal(hash.digest('hex'), artifact.sha256)
  console.log(`${platform}: ${manifest.version}, ${size} bytes, SHA-256 verified`)
}
