import { json } from './addons'
import { createIntroSkipper } from '@primio/intro-skipper'
export { validSegments } from '@primio/intro-skipper'
const skipper = createIntroSkipper(json)
export const skipSegments = skipper.resolve
