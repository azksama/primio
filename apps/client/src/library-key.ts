import type { Meta } from './types'

export const collectionKey = (item: Pick<Meta, 'type' | 'id'>) =>
  JSON.stringify([item.type, item.id])
