import { describe, it, expect } from 'vitest'
import { sourceInfo } from './sources'
describe('source information', () => {
  it('reads structured sizes before labels and normalizes release names', () => {
    expect(
      sourceInfo({ name: '4K WEB-DL', title: '2.3 GB', behaviorHints: { videoSize: 4e9 } }),
    ).toEqual({ quality: '2160p', format: 'WEB-DL', bytes: 4e9 })
    expect(sourceInfo({ title: '1080p BluRay · 1,5 GiB' })).toEqual({
      quality: '1080p',
      format: 'Blu-ray',
      bytes: 1.5 * 1024 ** 3,
    })
  })
  it('does not fabricate absent quality or size', () => {
    expect(sourceInfo({ title: 'Direct stream', behaviorHints: { videoSize: -10 } })).toEqual({
      quality: '',
      format: '',
      bytes: null,
    })
    expect(sourceInfo({ title: '720p WEBRip 850 Mo' }).bytes).toBe(850e6)
  })
})
