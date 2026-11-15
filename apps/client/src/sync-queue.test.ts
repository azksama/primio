import { expect, it, vi } from 'vitest'
import { createSyncQueue } from './sync-queue'

it('sends the latest edit immediately after an in-flight upload, without overlapping writes', async () => {
  let release!: () => void
  let value = 1
  const sent: number[] = []
  const queue = createSyncQueue(async () => {
    sent.push(value)
    if (sent.length === 1)
      await new Promise<void>((resolve) => {
        release = resolve
      })
  })
  const first = queue.request()
  value = 2
  void queue.request()
  value = 3
  void queue.request()
  expect(sent).toEqual([1])
  release()
  await first
  expect(sent).toEqual([1, 3])
})

it('discards queued work on sign-out and does not repeat an uncertain mutation', async () => {
  let release!: () => void
  const task = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        release = resolve
      }),
  )
  const queue = createSyncQueue(task)
  const first = queue.request()
  void queue.request()
  queue.stop()
  release()
  await first
  await queue.request()
  expect(task).toHaveBeenCalledTimes(1)
  const failed = vi.fn().mockRejectedValue(Error('offline'))
  const offline = createSyncQueue(failed)
  await expect(offline.request()).rejects.toThrow('offline')
  expect(failed).toHaveBeenCalledTimes(1)
})
