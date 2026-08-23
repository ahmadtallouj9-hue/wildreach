import {
  createDefaultSkin,
  encodeSkin,
  setPixel,
} from '../player/SkinAtlas';
import type { Profile } from './prefs';

export interface SkinPreset {
  id: string;
  name: string;
  tag: string;
  profile: Omit<Profile, 'name' | 'skinData'>;
  build: () => Uint8ClampedArray;
}

type RGB = [number, number, number];

function parse(hex: string): RGB {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

function shade(hex: string, delta: number): RGB {
  const [r, g, b] = parse(hex);
  return [
    Math.max(0, Math.min(255, r + delta)),
    Math.max(0, Math.min(255, g + delta)),
    Math.max(0, Math.min(255, b + delta)),
  ];
}

function fillRect(data: Uint8ClampedArray, x: number, y: number, w: number, h: number, color: string): void {
  const [r, g, b] = parse(color);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(data, x + dx, y + dy, r, g, b, 255);
    }
  }
}

function paintPixels(data: Uint8ClampedArray, color: string, points: [number, number][]): void {
  const [r, g, b] = parse(color);
  for (const [x, y] of points) setPixel(data, x, y, r, g, b, 255);
}

function belt(data: Uint8ClampedArray, color: string, y = 28): void {
  fillRect(data, 20, y, 8, 1, color);
  const [br, bg, bb] = parse(color);
  setPixel(data, 23, y, br + 20, bg + 20, bb + 20, 255);
  setPixel(data, 24, y, br + 20, bg + 20, bb + 20, 255);
}

function chestStripe(data: Uint8ClampedArray, color: string, y = 22): void {
  fillRect(data, 21, y, 6, 2, color);
}

function chestDiamond(data: Uint8ClampedArray, color: string, cx = 23, cy = 23): void {
  paintPixels(data, color, [
    [cx, cy - 1],
    [cx - 1, cy],
    [cx, cy],
    [cx + 1, cy],
    [cx, cy + 1],
  ]);
}

function sideTrim(data: Uint8ClampedArray, color: string): void {
  fillRect(data, 20, 21, 1, 8, color);
  fillRect(data, 27, 21, 1, 8, color);
}

function vNeck(data: Uint8ClampedArray, skin: string): void {
  paintPixels(data, skin, [
    [23, 20],
    [24, 20],
    [23, 21],
    [24, 21],
    [24, 22],
  ]);
}

function pocket(data: Uint8ClampedArray, color: string, x: number, y: number): void {
  fillRect(data, x, y, 2, 2, color);
  const [dr, dg, db] = shade(color, -28);
  setPixel(data, x, y, dr, dg, db, 255);
  setPixel(data, x + 1, y, dr, dg, db, 255);
}

function kneePads(data: Uint8ClampedArray, color: string): void {
  fillRect(data, 4, 26, 4, 2, color);
  fillRect(data, 20, 58, 4, 2, color);
}

function bootCuffs(data: Uint8ClampedArray, color: string): void {
  fillRect(data, 4, 29, 4, 2, color);
  fillRect(data, 20, 61, 4, 2, color);
}

function armBands(data: Uint8ClampedArray, color: string): void {
  fillRect(data, 44, 24, 4, 1, color);
  fillRect(data, 36, 56, 4, 1, color);
}

function backPack(data: Uint8ClampedArray, main: string, trim: string): void {
  fillRect(data, 33, 22, 6, 7, main);
  fillRect(data, 33, 22, 6, 1, trim);
  fillRect(data, 33, 28, 6, 1, trim);
  fillRect(data, 35, 24, 2, 3, trim);
}

function leafBadge(data: Uint8ClampedArray, color: string): void {
  paintPixels(data, color, [
    [23, 22],
    [22, 23],
    [23, 23],
    [24, 23],
    [23, 24],
  ]);
  const [lr, lg, lb] = shade(color, 30);
  setPixel(data, 24, 22, lr, lg, lb, 255);
}

function crossBadge(data: Uint8ClampedArray, color: string): void {
  fillRect(data, 23, 22, 2, 4, color);
  fillRect(data, 22, 23, 4, 2, color);
}

function skullBadge(data: Uint8ClampedArray): void {
  fillRect(data, 22, 22, 4, 3, '#e8e8e8');
  setPixel(data, 22, 22, 0, 0, 0, 255);
  setPixel(data, 25, 22, 0, 0, 0, 255);
  fillRect(data, 23, 24, 2, 1, '#1a1a1a');
}

function snowflake(data: Uint8ClampedArray, color: string): void {
  paintPixels(data, color, [
    [23, 21],
    [23, 22],
    [23, 23],
    [23, 24],
    [22, 22],
    [24, 22],
    [22, 23],
    [24, 23],
  ]);
}

function flameBadge(data: Uint8ClampedArray): void {
  paintPixels(data, '#ff9500', [
    [23, 24],
    [22, 23],
    [23, 23],
    [24, 23],
    [23, 22],
    [23, 21],
  ]);
  setPixel(data, 23, 20, 255, 241, 168, 255);
}

function anchorBadge(data: Uint8ClampedArray, color: string): void {
  paintPixels(data, color, [
    [23, 21],
    [23, 22],
    [23, 23],
    [22, 23],
    [24, 23],
    [23, 24],
    [22, 24],
    [24, 24],
  ]);
}

function mysticRunes(data: Uint8ClampedArray, color: string): void {
  fillRect(data, 22, 22, 4, 1, color);
  fillRect(data, 23, 21, 2, 4, color);
  setPixel(data, 22, 23, ...shade(color, 40), 255);
  setPixel(data, 25, 23, ...shade(color, 40), 255);
}

function monkSash(data: Uint8ClampedArray, color: string): void {
  belt(data, color, 27);
  fillRect(data, 22, 24, 4, 1, color);
}

function diverStripe(data: Uint8ClampedArray, color: string): void {
  chestStripe(data, color, 21);
  fillRect(data, 21, 23, 6, 1, color);
  armBands(data, color);
}

function makePreset(
  id: string,
  name: string,
  tag: string,
  profile: Omit<Profile, 'name' | 'skinData'>,
  tweak?: (data: Uint8ClampedArray) => void,
): SkinPreset {
  return {
    id,
    name,
    tag,
    profile,
    build: () => {
      const data = createDefaultSkin(profile.skin, profile.outfit, profile.accent, {
        hair: profile.hair,
        eyes: profile.eyes,
        shoes: profile.shoes,
        hairStyle: profile.hairStyle,
        face: profile.face,
        facial: profile.facial,
        sleeves: profile.sleeves,
        pants: profile.pants,
        outfit: profile.outfit,
        skin: profile.skin,
      });
      tweak?.(data);
      return data;
    },
  };
}

export const SKIN_PRESETS: SkinPreset[] = [
  makePreset('wanderer', 'Wanderer', 'Default reach scout', {
    skin: '#e8c4a8',
    outfit: '#4a7c6f',
    pants: '#3d5a80',
    accent: '#e8c56a',
    hair: '#4a3728',
    eyes: '#2e6b9e',
    shoes: '#2f3e46',
    style: 'classic',
    hat: 'cap',
    hairStyle: 'short',
    face: 'smile',
    glasses: 'none',
    facial: 'none',
    sleeves: 'short',
    cape: 'none',
  }, (d) => {
    vNeck(d, '#e8c4a8');
    belt(d, '#e8c56a');
    pocket(d, '#3d5a80', 21, 25);
    backPack(d, '#3d5a80', '#e8c56a');
  }),

  makePreset('ranger', 'Ranger', 'Greenwood tracker', {
    skin: '#c48a6a',
    outfit: '#2d5a3d',
    pants: '#1f3e2a',
    accent: '#7cb342',
    hair: '#3e2723',
    eyes: '#558b2f',
    shoes: '#1a1a1a',
    style: 'slim',
    hat: 'hood',
    hairStyle: 'long',
    face: 'neutral',
    glasses: 'none',
    facial: 'stubble',
    sleeves: 'long',
    cape: 'short',
  }, (d) => {
    sideTrim(d, '#1b3d24');
    leafBadge(d, '#7cb342');
    armBands(d, '#7cb342');
    fillRect(d, 33, 23, 6, 5, '#1f3e2a');
    paintPixels(d, '#7cb342', [
      [35, 24],
      [36, 25],
      [35, 25],
      [34, 25],
      [35, 26],
    ]);
  }),

  makePreset('miner', 'Miner', 'Lantern delver', {
    skin: '#d1bd85',
    outfit: '#5c4a32',
    pants: '#3d3428',
    accent: '#ffd54f',
    hair: '#1a1a1a',
    eyes: '#8d6e63',
    shoes: '#2f3e46',
    style: 'stocky',
    hat: 'helm',
    hairStyle: 'none',
    face: 'neutral',
    glasses: 'none',
    facial: 'stubble',
    sleeves: 'long',
    cape: 'none',
  }, (d) => {
    belt(d, '#ffd54f');
    chestDiamond(d, '#ffd54f');
    fillRect(d, 21, 24, 6, 1, '#ffd54f');
    kneePads(d, '#3d3428');
    bootCuffs(d, '#1a1a1a');
  }),

  makePreset('scholar', 'Scholar', 'Archive wanderer', {
    skin: '#f5e0d0',
    outfit: '#5d4e75',
    pants: '#2c3e6b',
    accent: '#b39ddb',
    hair: '#212121',
    eyes: '#5c6bc0',
    shoes: '#1a1a1a',
    style: 'tall',
    hat: 'none',
    hairStyle: 'long',
    face: 'neutral',
    glasses: 'round',
    facial: 'none',
    sleeves: 'long',
    cape: 'long',
  }, (d) => {
    vNeck(d, '#f5e0d0');
    fillRect(d, 22, 22, 4, 5, '#b39ddb');
    fillRect(d, 21, 22, 1, 5, '#4527a0');
    fillRect(d, 26, 22, 1, 5, '#4527a0');
    backPack(d, '#4527a0', '#b39ddb');
  }),

  makePreset('knight', 'Knight', 'Reach warden', {
    skin: '#e8c4a8',
    outfit: '#616161',
    pants: '#37474f',
    accent: '#ffd700',
    hair: '#4a3728',
    eyes: '#1565c0',
    shoes: '#1a1a1a',
    style: 'stocky',
    hat: 'helm',
    hairStyle: 'short',
    face: 'scar',
    glasses: 'none',
    facial: 'none',
    sleeves: 'long',
    cape: 'long',
  }, (d) => {
    crossBadge(d, '#ffd700');
    belt(d, '#ffd700');
    sideTrim(d, '#424242');
    fillRect(d, 20, 20, 8, 1, '#ffd700');
    fillRect(d, 20, 31, 8, 1, '#424242');
    kneePads(d, '#616161');
  }),

  makePreset('pirate', 'Pirate', 'Tide corsair', {
    skin: '#c48a6a',
    outfit: '#8b1e1e',
    pants: '#1a1a1a',
    accent: '#ffd700',
    hair: '#1a1a1a',
    eyes: '#1a1a1a',
    shoes: '#4e342e',
    style: 'classic',
    hat: 'band',
    hairStyle: 'long',
    face: 'smile',
    glasses: 'none',
    facial: 'beard',
    sleeves: 'short',
    cape: 'none',
  }, (d) => {
    belt(d, '#ffd700');
    skullBadge(d);
    fillRect(d, 44, 22, 4, 2, '#ffd700');
    fillRect(d, 36, 54, 4, 2, '#ffd700');
    bootCuffs(d, '#4e342e');
  }),

  makePreset('frost', 'Frost', 'Glacier nomad', {
    skin: '#f5e0d0',
    outfit: '#4fc3f7',
    pants: '#1565c0',
    accent: '#ffffff',
    hair: '#ffe082',
    eyes: '#0288d1',
    shoes: '#263238',
    style: 'tall',
    hat: 'beanie',
    hairStyle: 'short',
    face: 'neutral',
    glasses: 'none',
    facial: 'none',
    sleeves: 'long',
    cape: 'short',
  }, (d) => {
    snowflake(d, '#ffffff');
    chestStripe(d, '#ffffff', 21);
    fillRect(d, 20, 20, 8, 1, '#ffffff');
    sideTrim(d, '#0288d1');
    bootCuffs(d, '#ffffff');
  }),

  makePreset('ember', 'Ember', 'Cinder path runner', {
    skin: '#8d5524',
    outfit: '#bf360c',
    pants: '#3e2723',
    accent: '#ff6d00',
    hair: '#1a1a1a',
    eyes: '#ff3d00',
    shoes: '#1a1a1a',
    style: 'slim',
    hat: 'none',
    hairStyle: 'spiky',
    face: 'frown',
    glasses: 'none',
    facial: 'none',
    sleeves: 'bare',
    cape: 'none',
  }, (d) => {
    flameBadge(d);
    fillRect(d, 21, 25, 6, 1, '#ff6d00');
    armBands(d, '#ff6d00');
    fillRect(d, 4, 24, 4, 1, '#ff6d00');
    fillRect(d, 20, 56, 4, 1, '#ff6d00');
  }),

  makePreset('shadow', 'Shadow', 'Night stalker', {
    skin: '#5c3a2e',
    outfit: '#121212',
    pants: '#0d0d0d',
    accent: '#00e676',
    hair: '#0d0d0d',
    eyes: '#00e676',
    shoes: '#0d0d0d',
    style: 'slim',
    hat: 'hood',
    hairStyle: 'none',
    face: 'neutral',
    glasses: 'shades',
    facial: 'none',
    sleeves: 'long',
    cape: 'short',
  }, (d) => {
    chestDiamond(d, '#00e676');
    belt(d, '#1b1b1b');
    fillRect(d, 20, 21, 1, 9, '#00e676');
    fillRect(d, 27, 21, 1, 9, '#00e676');
    fillRect(d, 33, 22, 6, 6, '#0d0d0d');
    setPixel(d, 35, 24, 0, 230, 118, 255);
  }),

  makePreset('meadow', 'Meadow', 'Sunfield drifter', {
    skin: '#f0d5b8',
    outfit: '#689f38',
    pants: '#827717',
    accent: '#fdd835',
    hair: '#5d4037',
    eyes: '#33691e',
    shoes: '#5d4037',
    style: 'classic',
    hat: 'cap',
    hairStyle: 'curly',
    face: 'smile',
    glasses: 'none',
    facial: 'none',
    sleeves: 'short',
    cape: 'none',
  }, (d) => {
    leafBadge(d, '#fdd835');
    pocket(d, '#558b2f', 25, 25);
    belt(d, '#fdd835');
    fillRect(d, 21, 23, 6, 1, '#c0ca33');
  }),

  makePreset('captain', 'Captain', 'Chart master', {
    skin: '#e8c4a8',
    outfit: '#1a237e',
    pants: '#0d1b4c',
    accent: '#ffd700',
    hair: '#3e2723',
    eyes: '#1565c0',
    shoes: '#1a1a1a',
    style: 'classic',
    hat: 'crown',
    hairStyle: 'short',
    face: 'smile',
    glasses: 'none',
    facial: 'mustache',
    sleeves: 'long',
    cape: 'long',
  }, (d) => {
    anchorBadge(d, '#ffd700');
    belt(d, '#ffd700');
    chestStripe(d, '#ffd700', 23);
    fillRect(d, 20, 20, 8, 1, '#ffd700');
    sideTrim(d, '#0d1b4c');
  }),

  makePreset('botanist', 'Botanist', 'Seed keeper', {
    skin: '#f5e0d0',
    outfit: '#a5d6a7',
    pants: '#33691e',
    accent: '#66bb6a',
    hair: '#6d4c41',
    eyes: '#2e7d32',
    shoes: '#4e342e',
    style: 'classic',
    hat: 'visor',
    hairStyle: 'curly',
    face: 'smile',
    glasses: 'square',
    facial: 'none',
    sleeves: 'short',
    cape: 'none',
  }, (d) => {
    leafBadge(d, '#2e7d32');
    pocket(d, '#33691e', 21, 24);
    pocket(d, '#33691e', 25, 26);
    fillRect(d, 22, 22, 4, 1, '#ffffff');
  }),

  makePreset('violet', 'Violet', 'Twilight seer', {
    skin: '#ffccbc',
    outfit: '#7b1fa2',
    pants: '#4a148c',
    accent: '#ea80fc',
    hair: '#ce93d8',
    eyes: '#ab47bc',
    shoes: '#311b92',
    style: 'tall',
    hat: 'beanie',
    hairStyle: 'long',
    face: 'neutral',
    glasses: 'round',
    facial: 'none',
    sleeves: 'long',
    cape: 'long',
  }, (d) => {
    mysticRunes(d, '#ea80fc');
    belt(d, '#4a148c');
    fillRect(d, 21, 21, 6, 1, '#ea80fc');
    sideTrim(d, '#4a148c');
  }),

  makePreset('prospector', 'Prospector', 'Gold rusher', {
    skin: '#d1bd85',
    outfit: '#795548',
    pants: '#4e342e',
    accent: '#ffca28',
    hair: '#5d4037',
    eyes: '#6d4c41',
    shoes: '#3e2723',
    style: 'stocky',
    hat: 'cap',
    hairStyle: 'short',
    face: 'smile',
    glasses: 'none',
    facial: 'stubble',
    sleeves: 'short',
    cape: 'none',
  }, (d) => {
    belt(d, '#ffca28');
    chestDiamond(d, '#ffca28');
    pocket(d, '#4e342e', 22, 25);
    kneePads(d, '#795548');
    bootCuffs(d, '#3e2723');
  }),

  makePreset('reef', 'Reef', 'Tide diver', {
    skin: '#ffab91',
    outfit: '#00838f',
    pants: '#006064',
    accent: '#80deea',
    hair: '#4a3728',
    eyes: '#00acc1',
    shoes: '#eceff1',
    style: 'slim',
    hat: 'visor',
    hairStyle: 'short',
    face: 'smile',
    glasses: 'shades',
    facial: 'none',
    sleeves: 'bare',
    cape: 'none',
  }, (d) => {
    diverStripe(d, '#80deea');
    fillRect(d, 21, 24, 6, 2, '#006064');
    bootCuffs(d, '#80deea');
  }),

  makePreset('monk', 'Monk', 'Quiet walker', {
    skin: '#f0d5b8',
    outfit: '#78909c',
    pants: '#546e7a',
    accent: '#eceff1',
    hair: '#1a1a1a',
    eyes: '#37474f',
    shoes: '#37474f',
    style: 'classic',
    hat: 'none',
    hairStyle: 'none',
    face: 'neutral',
    glasses: 'none',
    facial: 'none',
    sleeves: 'long',
    cape: 'short',
  }, (d) => {
    monkSash(d, '#eceff1');
    fillRect(d, 22, 23, 4, 3, '#cfd8dc');
    fillRect(d, 33, 23, 6, 4, '#546e7a');
  }),
];

export function getSkinPreset(id: string): SkinPreset | undefined {
  return SKIN_PRESETS.find((p) => p.id === id);
}

export function buildPresetPixels(id: string): Uint8ClampedArray | null {
  const preset = getSkinPreset(id);
  return preset ? preset.build() : null;
}

export function applyPresetToProfile(name: string, id: string): Profile | null {
  const preset = getSkinPreset(id);
  if (!preset) return null;
  const pixels = preset.build();
  return {
    name,
    ...preset.profile,
    skinData: encodeSkin(pixels),
  };
}

export function presetMatchesProfile(profile: Profile, id: string): boolean {
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
    profile.hat === p.hat &&
    profile.hairStyle === p.hairStyle &&
    profile.face === p.face &&
    profile.glasses === p.glasses &&
    profile.facial === p.facial &&
    profile.sleeves === p.sleeves &&
    profile.cape === p.cape
  );
}
