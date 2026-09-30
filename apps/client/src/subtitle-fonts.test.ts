import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fontFamily } from './subtitle-fonts'

const source = readFileSync('src-tauri/resources/windows/player/fonts/inter.ttf')
const data = source.buffer.slice(
  source.byteOffset,
  source.byteOffset + source.byteLength,
) as ArrayBuffer
describe('Imported subtitle fonts', () => {
  it('uses the internal family name required by libass', () => {
    expect(fontFamily(data)).toBe('Inter')
  })
  it('includes five valid fonts usable by the native subtitle renderer', () => {
    const families = ['inter', 'manrope', 'nunito', 'lora', 'jetbrains'].map((id) => {
      const font = readFileSync(`src/assets/fonts/${id}.ttf`)
      return fontFamily(
        font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer,
      )
    })
    expect(new Set(families).size).toBe(5)
    expect(families).toEqual(['Inter', 'Manrope', 'Nunito Sans', 'Lora', 'JetBrains Mono'])
  })
  it('rejects non-fonts, truncated tables and oversized files', () => {
    for (const invalid of [
      new ArrayBuffer(4),
      new ArrayBuffer(100),
      data.slice(0, 40),
      new ArrayBuffer(5_000_001),
    ]) {
      expect(() => fontFamily(invalid)).toThrow()
    }
  })
  it('rejects a name table that points outside the file', () => {
    const corrupt = data.slice(0),
      view = new DataView(corrupt)
    for (let i = 0; i < view.getUint16(4); i++) {
      const entry = 12 + i * 16
      if (view.getUint32(entry) === 0x6e616d65) view.setUint32(entry + 8, 0xfffffff0)
    }
    expect(() => fontFamily(corrupt)).toThrow()
  })
})
