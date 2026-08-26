/**
 * Simple block-voxel skin presets.
 */

import { createDefaultSkin, encodeSkin } from '../player/SkinAtlas';
import { buildBlankBlockSkin, BLOCK_PALETTE } from '../player/BlockCharacterSkin';
import type { Profile } from './prefs';

export interface SkinPreset {
  id: string;
  name: string;
  tag: string;
  profile: Omit<Profile, 'name' | 'skinData'>;
  build: () => Uint8ClampedArray;
}

export const SKIN_PRESETS: SkinPreset[] = [
  {
    id: 'wanderer',
    name: 'Block Character',
    tag: 'Simple voxel blocks',
    profile: {
      skin: BLOCK_PALETTE.skin,
      outfit: BLOCK_PALETTE.outfit,
      pants: BLOCK_PALETTE.pants,
      accent: BLOCK_PALETTE.pink,
      hair: BLOCK_PALETTE.hair,
      eyes: BLOCK_PALETTE.eye,
      shoes: BLOCK_PALETTE.shoe,
      style: 'classic',
      hat: 'none',
      hairStyle: 'short',
      face: 'neutral',
      glasses: 'none',
      facial: 'none',
      sleeves: 'long',
      cape: 'none',
      backpack: 'none',
      belt: 'none',
      chestProp: 'none',
    },
    build: () =>
      createDefaultSkin(BLOCK_PALETTE.skin, BLOCK_PALETTE.outfit, BLOCK_PALETTE.pink, {
        hair: BLOCK_PALETTE.hair,
        eyes: BLOCK_PALETTE.eye,
        shoes: BLOCK_PALETTE.shoe,
        hairStyle: 'short',
        face: 'neutral',
        sleeves: 'long',
        pants: BLOCK_PALETTE.pants,
        renderMode: 'block',
      }),
  },
];

export const CUSTOM_PRESET_ID = 'custom';

export function buildCustomBlankPixels(): Uint8ClampedArray {
  return buildBlankBlockSkin();
}

export function customBlankProfile(name: string): Omit<Profile, 'skinData'> {
  return {
    name,
    skin: BLOCK_PALETTE.skin,
    outfit: BLOCK_PALETTE.outfit,
    pants: BLOCK_PALETTE.pants,
    accent: BLOCK_PALETTE.pink,
    hair: BLOCK_PALETTE.hair,
    eyes: BLOCK_PALETTE.eye,
    shoes: BLOCK_PALETTE.shoe,
    style: 'classic',
    hat: 'none',
    hairStyle: 'short',
    face: 'neutral',
    glasses: 'none',
    facial: 'none',
    sleeves: 'long',
    cape: 'none',
    backpack: 'none',
    belt: 'none',
    chestProp: 'none',
  };
}

export function getSkinPreset(id: string): SkinPreset | undefined {
  return SKIN_PRESETS.find((p) => p.id === id);
}

export function buildPresetPixels(id: string): Uint8ClampedArray | null {
  if (id === CUSTOM_PRESET_ID) return buildCustomBlankPixels();
  const preset = getSkinPreset(id);
  return preset ? preset.build() : null;
}

export function applyPresetToProfile(name: string, id: string): Profile | null {
  if (id === CUSTOM_PRESET_ID) {
    const profile = customBlankProfile(name);
    return { ...profile, skinData: encodeSkin(buildCustomBlankPixels()) };
  }
  const preset = getSkinPreset(id);
  if (!preset) return null;
  return { name, ...preset.profile, skinData: encodeSkin(preset.build()) };
}

export function presetMatchesProfile(profile: Profile, id: string): boolean {
  if (id === CUSTOM_PRESET_ID) return profile.chestProp === 'none' && !profile.skinData;
  const preset = getSkinPreset(id);
  if (!preset) return false;
  const p = preset.profile;
  return (
    profile.skin === p.skin &&
    profile.outfit === p.outfit &&
    profile.pants === p.pants &&
    profile.accent === p.accent &&
    profile.hair === p.hair &&
    profile.eyes === p.eyes &&
    profile.shoes === p.shoes &&
    profile.style === p.style &&
    profile.face === p.face
  );
}
