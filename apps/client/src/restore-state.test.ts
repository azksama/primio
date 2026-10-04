import { expect, it } from 'vitest'
import { restoreLocalState } from './restore-state'
import { createState } from './preferences'

it('restores a valid snapshot only after every section is readable and parseable', async () => {
  const state = createState()
  state.library = [{ id: 'saved', type: 'movie', name: 'Saved' }]
  const store: Record<string, string> = { state: JSON.stringify(state), plugins: '[]', onboarding: 'done' }
  const read = async (key: string) => store[key] ?? null
  expect(await restoreLocalState(read)).toMatchObject({ state: { library: state.library }, onboarding: false })
  store.plugins = '{broken'
  await expect(restoreLocalState(read)).rejects.toThrow()
  expect(JSON.parse(store.state).library).toEqual(state.library)
  store.plugins = '[]'
  expect((await restoreLocalState(read)).state?.library).toEqual(state.library)
})

it('does not treat a failed read as a fresh installation', async () => {
  await expect(restoreLocalState(async key => {
    if (key === 'state') throw Error('storage unavailable')
    return null
  })).rejects.toThrow('storage unavailable')
})

it('rejects malformed session identities before using them in account requests', async () => {
  for (const session of ['null', '[]', '{"token":4}', '{"email":{}}'])
    await expect(restoreLocalState(async key => key === 'session' ? session : null)).rejects.toThrow('Invalid local session')
})
