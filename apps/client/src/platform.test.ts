import { afterEach, expect, it, vi } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { readSecure, writeSecure } from './platform'

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn() }))
afterEach(() => vi.clearAllMocks())

it('serializes native writes and makes reads wait for the latest queued value', async () => {
  let complete!: () => void
  const values = new Map<string, string>()
  vi.mocked(invoke).mockImplementation(async (command, args: any) => {
    if (command === 'secure_read') return values.get(args.key) as any
    if (args.value === 'before') await new Promise<void>(resolve => { complete = resolve })
    values.set(args.key, args.value)
  })
  const first = writeSecure('state-test', 'before')
  const second = writeSecure('state-test', 'after')
  const read = readSecure('state-test')
  await vi.waitFor(() => expect(complete).toBeTypeOf('function'))
  await writeSecure('other-test', 'independent')
  expect(values.get('other-test')).toBe('independent')
  expect(values.has('state-test')).toBe(false)
  complete()
  await Promise.all([first, second])
  expect(await read).toBe('after')
})

it('reports a failed write without preventing subsequent writes', async () => {
  vi.mocked(invoke).mockRejectedValueOnce(Error('storage unavailable')).mockResolvedValue(undefined)
  const failed = writeSecure('retry-test', 'first')
  const saved = writeSecure('retry-test', 'second')
  await expect(failed).rejects.toThrow('storage unavailable')
  await expect(saved).resolves.toBeUndefined()
  expect(invoke).toHaveBeenLastCalledWith('secure_write', { key: 'retry-test', value: 'second' })
})
