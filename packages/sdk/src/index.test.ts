import { describe, it, expect } from 'vitest'
import { activatePlugin, pluginSchema, rankSources } from './index'
const base = {
  schemaVersion: 1,
  id: 'community.test',
  name: 'Test',
  version: '1.0.0',
  description: '',
  author: 'Test',
  permissions: [],
}
describe('permissions', () => {
  it('returns validation errors instead of throwing for malformed URLs', () => {
    for (const url of ['', 'not a URL', 'https://[invalid', '/relative/path']) {
      expect(pluginSchema.safeParse({ ...base, icon: url }).success).toBe(false)
      expect(pluginSchema.safeParse({
        ...base,
        permissions: ['addons'],
        addons: [{ name: 'Broken', manifest: url }],
      }).success).toBe(false)
    }
  })
  it('accepts declarative HTTPS plugin icons and rejects unsafe image URLs', () => {
    expect(pluginSchema.parse({ ...base, icon: 'https://example.org/icon.png' }).icon).toBe('https://example.org/icon.png')
    for (const icon of ['http://example.org/icon.png', 'javascript:alert(1)', 'https://user:secret@example.org/icon.png']) {
      expect(pluginSchema.safeParse({ ...base, icon }).success).toBe(false)
    }
  })
  it('supports bounded material tokens while preserving existing theme manifests', () => {
    const theme = { ...base, permissions:['theme'], theme:{material:'neumorphic',colorScheme:'dark',shadowLight:'#383D45',shadowDark:'#191C20'} }
    expect(pluginSchema.safeParse(theme).success).toBe(true)
    expect(pluginSchema.safeParse({...theme,theme:{material:'url(https://example.org)'}}).success).toBe(false)
    expect(pluginSchema.safeParse({...theme,theme:{accent:'#DAD4C5'}}).success).toBe(true)
  })
  it('rejects undeclared or unapproved capabilities', () => {
    expect(pluginSchema.safeParse({ ...base, theme: { accent: '#ffffff' } }).success).toBe(false)
    expect(() =>
      activatePlugin({ ...base, permissions: ['theme'], theme: { accent: '#ffffff' } }, []),
    ).toThrow()
  })
  it('rejects scripts, unsafe links, CSS and unknown capabilities', () => {
    expect(pluginSchema.safeParse({ ...base, script: 'alert(1)' }).success).toBe(false)
    expect(
      pluginSchema.safeParse({
        ...base,
        permissions: ['pages'],
        pages: [
          {
            id: 'a',
            title: 'A',
            blocks: [{ kind: 'link', label: 'X', url: 'javascript:alert(1)' }],
          },
        ],
      }).success,
    ).toBe(false)
    expect(
      pluginSchema.safeParse({
        ...base,
        permissions: ['theme'],
        theme: { text: 'url(https://evil)' },
      }).success,
    ).toBe(false)
  })
  it('applies source ordering and exclusions without mutating input', () => {
    const p = activatePlugin(
      { ...base, permissions: ['sources'], sources: { prefer: ['French'], hide: ['CAM'] } },
      ['sources'],
    )
    const input = [{ title: 'English' }, { title: 'French HD' }, { title: 'French CAM' }]
    expect(rankSources(input, [p]).map((x) => x.title)).toEqual(['French HD', 'English'])
    expect(input.length).toBe(3)
  })
})

it('bounds schema v2 customization and requires every permission', () => {
  for (const [capability, value] of Object.entries({
    layout: { columns: 4 },
    spoilers: { hideUnwatched: true },
    accessibility: { fontScale: 1.2 },
    watchOrder: [
      {
        id: 'custom',
        title: 'Order',
        order: 'custom',
        entries: [{ id: 'tt1', type: 'movie', name: 'Movie' }],
      },
    ],
  })) {
    expect(pluginSchema.safeParse({ ...base, schemaVersion: 2, [capability]: value }).success).toBe(
      false,
    )
    expect(
      pluginSchema.safeParse({
        ...base,
        schemaVersion: 2,
        permissions: [capability],
        [capability]: value,
      }).success,
    ).toBe(true)
  }
  expect(
    pluginSchema.safeParse({
      ...base,
      schemaVersion: 2,
      permissions: ['layout'],
      layout: { columns: 20 },
    }).success,
  ).toBe(false)
  expect(
    pluginSchema.safeParse({
      ...base,
      schemaVersion: 2,
      permissions: ['theme'],
      theme: { glassOpacity: 0 },
    }).success,
  ).toBe(false)
})
