/**
 * Local preview preferences.
 *
 * Deliberately separate from StyleStore: these describe how one machine draws
 * the preview, not what a world is, so they never travel with an exported
 * style and never affect a generated world.
 */
import {
  DEFAULT_QUALITY,
  PREVIEW_QUALITIES,
  type PreviewQuality,
} from '../../world/preview/previewQuality';

const KEY = 'vythera.previewQuality';

export function loadPreviewQuality(): PreviewQuality {
  try {
    const raw = localStorage.getItem(KEY);
    return (PREVIEW_QUALITIES as readonly string[]).includes(raw ?? '')
      ? (raw as PreviewQuality)
      : DEFAULT_QUALITY;
  } catch {
    // Private-mode browsers throw on storage access; the editor still works.
    return DEFAULT_QUALITY;
  }
}

export function savePreviewQuality(q: PreviewQuality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    // Preference is cosmetic; failing to persist it must not break the editor.
  }
}
