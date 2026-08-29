/**
 * True for phones/tablets that need on-screen controls.
 * Touch laptops with a fine pointer keep keyboard/mouse + pointer-lock.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(pointer: coarse)').matches) return true;
  if (window.matchMedia('(hover: none)').matches && navigator.maxTouchPoints > 0) return true;
  return false;
}
