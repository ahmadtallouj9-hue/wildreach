/**
 * Stable fingerprint of the parameters that actually affect generation.
 *
 * Cosmetic fields (name, description, author, timestamps) are excluded so that
 * renaming a style does not split multiplayer rooms, while any change that
 * would move a single block does.
 */
import { PARAM_SPECS, type VytheraWorldStyle } from './WorldStyle';
import { DEFAULT_WORLD_VOXEL_SIZE } from '../worldScale';

export const DEFAULT_STYLE_HASH = 'default';

export function styleFingerprint(style: VytheraWorldStyle | null | undefined): string {
  if (!style) return DEFAULT_STYLE_HASH;

  const parts: string[] = [
    style.landscape,
    String(style.terrainVoxelSize),
    String(style.generationVersion),
  ];

  // Block size changes the physical world, so it has to change identity: two
  // styles alike but for their scale are different worlds and must not share a
  // multiplayer room. It is appended only when it differs from stock, so every
  // style written before world scale existed keeps the fingerprint it already
  // had and existing rooms and caches are not invalidated.
  const worldVoxelSize = style.worldScale?.worldVoxelSize ?? DEFAULT_WORLD_VOXEL_SIZE;
  if (worldVoxelSize !== DEFAULT_WORLD_VOXEL_SIZE) {
    parts.push(`scale=${worldVoxelSize}`);
  }
  for (const spec of PARAM_SPECS) {
    const value = (style[spec.group] as unknown as Record<string, number>)[spec.key] ?? spec.default;
    parts.push(`${spec.group}.${spec.key}=${value.toFixed(4)}`);
  }

  let h = 0x811c9dc5;
  const text = parts.join('|');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}
