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
