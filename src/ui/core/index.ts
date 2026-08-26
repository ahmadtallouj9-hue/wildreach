/**
 * VYTHERA UI core — screen routing + focus navigation helpers.
 * Presentation screens live under src/ui/*.ts and src/ui/theme/.
 */

export type UiScreenId =
  | 'home'
  | 'world'
  | 'settings'
  | 'character'
  | 'multiplayer'
  | 'ai'
  | 'hud'
  | 'inventory'
  | 'pause'
  | 'loading';

export type UiNavDirection = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'back';

/** Lightweight focus ring helper for keyboard / gamepad lists. */
export function moveFocus(container: HTMLElement, dir: 'next' | 'prev'): void {
  const items = [...container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )].filter((el) => !el.hidden && el.offsetParent !== null);
  if (!items.length) return;
  const i = items.indexOf(document.activeElement as HTMLElement);
  const next =
    dir === 'next'
      ? items[(i + 1 + items.length) % items.length]!
      : items[(i - 1 + items.length) % items.length]!;
  next.focus();
}

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
