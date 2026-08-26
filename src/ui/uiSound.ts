/**
 * UI sound hooks — no placeholder assets.
 * Wire a real AudioContext / asset bank later via setUiSoundHandler.
 */

export type UiSoundEvent =
  | 'hover'
  | 'click'
  | 'open'
  | 'close'
  | 'confirm'
  | 'error'
  | 'item_select'
  | 'craft'
  | 'quest_complete'
  | 'menu_transition'
  | 'ai_response';

type UiSoundHandler = (event: UiSoundEvent) => void;

let handler: UiSoundHandler | null = null;
let reducedMotion = false;

if (typeof window !== 'undefined' && typeof matchMedia === 'function') {
  const mq = matchMedia('(prefers-reduced-motion: reduce)');
  reducedMotion = mq.matches;
  mq.addEventListener?.('change', (e) => {
    reducedMotion = e.matches;
  });
}

export function setUiSoundHandler(fn: UiSoundHandler | null): void {
  handler = fn;
}

export function uiSound(event: UiSoundEvent): void {
  if (reducedMotion && (event === 'hover' || event === 'menu_transition')) return;
  try {
    handler?.(event);
  } catch {
    /* never break UI for audio */
  }
}

/** Attach hover/click cues to interactive elements inside a root. */
export function bindUiSounds(root: ParentNode, opts?: { hover?: boolean }): void {
  const wantHover = opts?.hover !== false;
  const selector = 'button, [data-action], .menu-btn, .mc-btn, .menu-hero-btn, .seg-btn, .inv-tab, .slot';

  root.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    if (el.dataset.uiSoundBound === '1') return;
    el.dataset.uiSoundBound = '1';
    if (wantHover) {
      el.addEventListener('pointerenter', () => uiSound('hover'), { passive: true });
    }
    el.addEventListener(
      'click',
      () => {
        if (el.closest('[data-action="create-world"], [data-action="play-selected-world"], .pause-menu__btn--play, .menu-hero-btn--play')) {
          uiSound('confirm');
        } else {
          uiSound('click');
        }
      },
      { passive: true },
    );
  });
}
