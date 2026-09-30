import { describe, expect, it } from 'vitest'
import { pluginSchema } from '@primio/sdk'
import { resolveTheme, readableAccent } from './themes'
import { installPlugin, storePlugins } from './plugin-store'
import manifest from '../../../packages/sdk/examples/neo-graphite.primio.json'

const neo = storePlugins.find(p => p.id === 'primio.neo-graphite')!
const glass = storePlugins.find(p => p.id === 'primio.graphite')!
describe('theme material', () => {
  it('restores the complete original material when disabled or replaced', () => {
    const installed = installPlugin([glass], neo)
    expect(resolveTheme(installed)).toMatchObject({material:'neumorphic',background:'#282B30',glassOpacity:1})
    expect(resolveTheme(installPlugin(installed, glass))).toEqual(resolveTheme([glass]))
    expect(resolveTheme([{...neo, enabled:false}])).toEqual(resolveTheme([]))
  })
  it('does not grant theme access through undeclared permissions', () => {
    expect(resolveTheme([{...neo, permissions:[]}])).toEqual(resolveTheme([]))
    expect(pluginSchema.safeParse({...neo,theme:{...neo.theme,shadowLight:'url(https://example.org)'}}).success).toBe(false)
    expect(pluginSchema.safeParse({...neo,theme:{...neo.theme,material:'custom-css'}}).success).toBe(false)
  })
  it('ships an importable manifest matching the built-in theme', () => {
    expect(pluginSchema.parse(manifest)).toEqual(neo)
  })
  it('keeps text, secondary labels and accent controls readable on the sculpted surface', () => {
    const luminance = (hex:string) => {
      const rgb = hex.slice(1).match(/../g)!.map(h => parseInt(h,16)/255).map(v => v <= .04045 ? v/12.92 : ((v+.055)/1.055)**2.4)
      return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722
    }
    const theme=resolveTheme([neo]), base=luminance(theme.surface)
    for(const ink of [theme.text,theme.muted,theme.accent]) {
      const foreground=luminance(ink)
      expect((Math.max(base,foreground)+.05)/(Math.min(base,foreground)+.05)).toBeGreaterThanOrEqual(4.5)
    }
  })
  it('applies a saved OLED accent to native theme borders without leaking to other themes', () => {
    const oled = storePlugins.find(p => p.id === 'primio.oled')!
    expect(resolveTheme([oled], '#22CCAA')).toMatchObject({ accent:'#22CCAA', border:'#22CCAA', background:'#000000' })
    expect(resolveTheme([glass], '#22CCAA')).toEqual(resolveTheme([glass]))
    expect(resolveTheme([oled], 'invalid')).toEqual(resolveTheme([oled]))
    expect(readableAccent('#000000', '#121212')).not.toBe('#000000')
    expect(readableAccent('#FFFFFF', '#121212')).toBe('#FFFFFF')
  })
})
