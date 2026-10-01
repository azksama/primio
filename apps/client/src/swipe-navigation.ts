import { useEffect, useRef, type RefObject } from 'react'

export function swipeIntent(dx: number, dy: number) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return 'pending'
  if (Math.abs(dx) > Math.abs(dy) * 1.25) return 'horizontal'
  if (Math.abs(dy) > Math.abs(dx) * 1.25) return 'vertical'
  return 'pending'
}

function scrollConsumes(target: Element, root: HTMLElement, dx: number) {
  for (let node: Element | null = target; node && node !== root; node = node.parentElement) {
    if (!(node instanceof HTMLElement) || node.scrollWidth <= node.clientWidth + 2) continue
    if (!/auto|scroll/.test(getComputedStyle(node).overflowX)) continue
    if (dx < 0 && node.scrollLeft < node.scrollWidth - node.clientWidth - 2) return true
    if (dx > 0 && node.scrollLeft > 2) return true
  }
  return false
}

export function useSwipeNavigation(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  canNavigate: (direction: 'left' | 'right') => boolean,
  navigate: (direction: 'left' | 'right') => void,
) {
  const current = useRef({ canNavigate, navigate })
  current.current = { canNavigate, navigate }
  useEffect(() => {
    const root = ref.current
    if (!root || !enabled) return
    let gesture: { id: number; x: number; y: number; target: Element; intent: string } | null = null
    const reset = () => { gesture = null }
    const start = (event: TouchEvent) => {
      reset()
      const target = event.target
      if (event.touches.length !== 1 || !(target instanceof Element) ||
        target.closest('input,textarea,select,[contenteditable="true"],[role="slider"],.choice-options,dialog,.hero')) return
      const point = event.touches[0]
      gesture = { id: point.identifier, x: point.clientX, y: point.clientY, target, intent: 'pending' }
    }
    const move = (event: TouchEvent) => {
      if (!gesture || event.touches.length !== 1) { reset(); return }
      const point = event.touches[0]
      const dx = point.clientX - gesture.x, dy = point.clientY - gesture.y
      if (gesture.intent === 'pending') {
        gesture.intent = swipeIntent(dx, dy)
        if (gesture.intent === 'vertical' || (gesture.intent === 'horizontal' && scrollConsumes(gesture.target, root, dx))) {
          reset(); return
        }
      }
      if (gesture.intent === 'horizontal' && current.current.canNavigate(dx < 0 ? 'left' : 'right') && event.cancelable) event.preventDefault()
    }
    const end = (event: TouchEvent) => {
      const saved = gesture
      reset()
      const point = Array.from(event.changedTouches).find(p => p.identifier === saved?.id)
      if (!saved || !point || saved.intent === 'vertical') return
      const dx = point.clientX - saved.x, dy = point.clientY - saved.y
      const direction = dx < 0 ? 'left' : 'right'
      if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.25 ||
        scrollConsumes(saved.target, root, dx) || !current.current.canNavigate(direction)) return
      current.current.navigate(direction)
    }
    root.addEventListener('touchstart', start, { passive: true })
    root.addEventListener('touchmove', move, { passive: false })
    root.addEventListener('touchend', end)
    root.addEventListener('touchcancel', reset)
    window.addEventListener('blur', reset)
    return () => {
      root.removeEventListener('touchstart', start)
      root.removeEventListener('touchmove', move)
      root.removeEventListener('touchend', end)
      root.removeEventListener('touchcancel', reset)
      window.removeEventListener('blur', reset)
    }
  }, [ref, enabled])
}
