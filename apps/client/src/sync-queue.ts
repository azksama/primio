// Coalesce changes, but never lose a change made while a request is in flight.
// A rejected request is not replayed automatically: the next event reconciles it.
export function createSyncQueue(task: () => Promise<void>) {
  let pending = false
  let stopped = false
  let running: Promise<void> | null = null
  return {
    request() {
      if (stopped) return Promise.resolve()
      pending = true
      if (!running) {
        running = (async () => {
          while (pending && !stopped) {
            pending = false
            await task()
          }
        })().finally(() => {
          running = null
        })
      }
      return running
    },
    stop() {
      stopped = true
      pending = false
    },
  }
}
