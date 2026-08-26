/** Minecraft-classic 64×64 skin layout + pixel helpers. */

import { buildBlockCharacterSkin } from './BlockCharacterSkin';

export const SKIN_SIZE = 64;

export type SkinPart = 'head' | 'body' | 'armR' | 'armL' | 'legR' | 'legL' | 'hat';
export type SkinFace = 'right' | 'left' | 'top' | 'bottom' | 'front' | 'back';

/** UV rect in skin pixels (origin top-left, y down). */
export interface SkinRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** BoxGeometry material order: +X -X +Y -Y +Z -Z.
 * Avatar faces +Z (toward camera) → +X is character left, −X is character right. */
export const BOX_FACES: SkinFace[] = ['left', 'right', 'top', 'bottom', 'front', 'back'];

/** Flip options when copying atlas pixels onto a BoxGeometry face texture. */
export const BOX_FACE_SYNC: Partial<
  Record<SkinFace, { flipX?: boolean; flipY?: boolean }>
> = {
  top: { flipY: true },
  bottom: { flipY: true },
  back: { flipX: true },
  // −X face (character right) needs a horizontal flip to match the skin atlas.
  right: { flipX: true },
};

export const PART_UV: Record<SkinPart, Record<SkinFace, SkinRect>> = {
  head: {
    top: { x: 8, y: 0, w: 8, h: 8 },
    bottom: { x: 16, y: 0, w: 8, h: 8 },
    right: { x: 0, y: 8, w: 8, h: 8 },
    front: { x: 8, y: 8, w: 8, h: 8 },
    left: { x: 16, y: 8, w: 8, h: 8 },
    back: { x: 24, y: 8, w: 8, h: 8 },
  },
  hat: {
    top: { x: 40, y: 0, w: 8, h: 8 },
    bottom: { x: 48, y: 0, w: 8, h: 8 },
    right: { x: 32, y: 8, w: 8, h: 8 },
    front: { x: 40, y: 8, w: 8, h: 8 },
    left: { x: 48, y: 8, w: 8, h: 8 },
    back: { x: 56, y: 8, w: 8, h: 8 },
  },
  body: {
    top: { x: 20, y: 16, w: 8, h: 4 },
    bottom: { x: 28, y: 16, w: 8, h: 4 },
    right: { x: 16, y: 20, w: 4, h: 12 },
    front: { x: 20, y: 20, w: 8, h: 12 },
    left: { x: 28, y: 20, w: 4, h: 12 },
    back: { x: 32, y: 20, w: 8, h: 12 },
  },
  armR: {
    top: { x: 44, y: 16, w: 4, h: 4 },
    bottom: { x: 48, y: 16, w: 4, h: 4 },
    right: { x: 40, y: 20, w: 4, h: 12 },
    front: { x: 44, y: 20, w: 4, h: 12 },
    left: { x: 48, y: 20, w: 4, h: 12 },
    back: { x: 52, y: 20, w: 4, h: 12 },
  },
  armL: {
    top: { x: 36, y: 48, w: 4, h: 4 },
    bottom: { x: 40, y: 48, w: 4, h: 4 },
    right: { x: 32, y: 52, w: 4, h: 12 },
    front: { x: 36, y: 52, w: 4, h: 12 },
    left: { x: 40, y: 52, w: 4, h: 12 },
    back: { x: 44, y: 52, w: 4, h: 12 },
  },
  legR: {
    top: { x: 4, y: 16, w: 4, h: 4 },
    bottom: { x: 8, y: 16, w: 4, h: 4 },
    right: { x: 0, y: 20, w: 4, h: 12 },
    front: { x: 4, y: 20, w: 4, h: 12 },
    left: { x: 8, y: 20, w: 4, h: 12 },
    back: { x: 12, y: 20, w: 4, h: 12 },
  },
  legL: {
    top: { x: 20, y: 48, w: 4, h: 4 },
    bottom: { x: 24, y: 48, w: 4, h: 4 },
    right: { x: 16, y: 52, w: 4, h: 12 },
    front: { x: 20, y: 52, w: 4, h: 12 },
    left: { x: 24, y: 52, w: 4, h: 12 },
    back: { x: 28, y: 52, w: 4, h: 12 },
  },
};

export const PART_LABELS: Record<SkinPart, string> = {
  head: 'Head',
  body: 'Body',
  armR: 'Right arm',
  armL: 'Left arm',
  legR: 'Right leg',
  legL: 'Left leg',
  hat: 'Hat layer',
};

export const FACE_LABELS: Record<SkinFace, string> = {
  front: 'Front',
  back: 'Back',
  left: 'Left',
  right: 'Right',
  top: 'Top',
  bottom: 'Bottom',
};

/** Full pixel-art palette: neutrals, skin tones, primaries, game + profile colors, transparent. */
export const SKIN_PALETTE = [
  '#000000',
  '#1a1a1a',
  '#2f3e46',
  '#4a4a4a',
  '#6b6b6b',
  '#9a9a9a',
  '#cccccc',
  '#ffffff',
  '#5c3a2e',
  '#4a3728',
  '#3d2817',
  '#5c4033',
  '#6b4423',
  '#8b6914',
  '#8d5524',
  '#a0643a',
  '#a0522d',
  '#c48a6a',
  '#e8c4a8',
  '#f0d5b8',
  '#f5e0d0',
  '#5c1a1a',
  '#8b0000',
  '#c0392b',
  '#e74c3c',
  '#e07a5f',
  '#ff6b6b',
  '#ffb4b4',
  '#b8860b',
  '#e8c56a',
  '#f1c40f',
  '#f39c12',
  '#ff9500',
  '#1a3d2e',
  '#2d5016',
  '#387a52',
  '#408059',
  '#478c61',
  '#4a7c6f',
  '#5ec4b0',
  '#27ae60',
  '#2ecc71',
  '#b8e0d2',
  '#1a2a4a',
  '#2c3e50',
  '#3d5a80',
  '#2980b9',
  '#3498db',
  '#2e6b9e',
  '#7aa2ff',
  '#73d9e6',
  '#4a235a',
  '#6c3483',
  '#7b6b8a',
  '#9b59b6',
  '#c9a0dc',
  '#6b4c33',
  '#737a85',
  '#d1bd85',
  '#614224',
  '#e6edf5',
  '#8c7a6b',
  '#8c857a',
  '#00000000',
];

function parseHex(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '').trim();
  if (h.length === 8) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      parseInt(h.slice(6, 8), 16),
    ];
  }
  if (h.length === 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      255,
    ];
  }
  return [232, 196, 168, 255];
}

function fillRect(
  data: Uint8ClampedArray,
  rect: SkinRect,
  r: number,
  g: number,
  b: number,
  a = 255,
): void {
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const i = ((rect.y + dy) * SKIN_SIZE + (rect.x + dx)) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
}

export function setPixel(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  if (x < 0 || y < 0 || x >= SKIN_SIZE || y >= SKIN_SIZE) return;
  const i = (y * SKIN_SIZE + x) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = a;
}

export function getPixel(
  data: Uint8ClampedArray,
  x: number,
  y: number,
): [number, number, number, number] {
  if (x < 0 || y < 0 || x >= SKIN_SIZE || y >= SKIN_SIZE) return [0, 0, 0, 0];
  const i = (y * SKIN_SIZE + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
}

export function atlasPixelFromFaceUv(
  part: SkinPart,
  face: SkinFace,
  u: number,
  v: number,
): { x: number; y: number } {
  const rect = PART_UV[part][face];
  const sync = BOX_FACE_SYNC[face] ?? {};
  const dx = Math.min(rect.w - 1, Math.max(0, Math.floor(u * rect.w)));
  const dy = Math.min(rect.h - 1, Math.max(0, Math.floor((1 - v) * rect.h)));
  const sx = sync.flipX ? rect.w - 1 - dx : dx;
  const sy = sync.flipY ? rect.h - 1 - dy : dy;
  return { x: rect.x + sx, y: rect.y + sy };
}

export function cloneSkin(data: Uint8ClampedArray): Uint8ClampedArray {
  return new Uint8ClampedArray(data);
}

export const SKIN_TONE_PARTS: SkinPart[] = ['head', 'armR', 'armL'];
export const OUTFIT_PARTS: SkinPart[] = ['body'];
export const PANTS_PARTS: SkinPart[] = ['legR', 'legL'];

const ALL_FACES: SkinFace[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

function colorNear(
  r: number,
  g: number,
  b: number,
  target: [number, number, number],
  tol: number,
): boolean {
  return (
    Math.abs(r - target[0]) <= tol &&
    Math.abs(g - target[1]) <= tol &&
    Math.abs(b - target[2]) <= tol
  );
}

export function fillPartSolid(
  data: Uint8ClampedArray,
  part: SkinPart,
  rgb: [number, number, number],
): void {
  for (const face of ALL_FACES) {
    fillRect(data, PART_UV[part][face], rgb[0], rgb[1], rgb[2], 255);
  }
}

export function replaceColorOnParts(
  data: Uint8ClampedArray,
  parts: SkinPart[],
  fromHex: string,
  toHex: string,
  tolerance = 18,
): number {
  const [fr, fg, fb] = parseHex(fromHex);
  const [tr, tg, tb] = parseHex(toHex);
  let count = 0;
  for (const part of parts) {
    for (const face of ALL_FACES) {
      const rect = PART_UV[part][face];
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          const [r, g, b, a] = getPixel(data, x, y);
          if (a < 8) continue;
          if (colorNear(r, g, b, [fr, fg, fb], tolerance)) {
            setPixel(data, x, y, tr, tg, tb, 255);
            count++;
          }
        }
      }
    }
  }
  return count;
}

function paintDefaultFaceFeatures(data: Uint8ClampedArray): void {
  applyFaceFeatures(data, '#2e6b9e');
}

export interface SkinCosmetics {
  hair: string;
  eyes: string;
  shoes: string;
  hairStyle: 'none' | 'short' | 'long' | 'spiky' | 'curly' | 'mohawk' | 'bun' | 'afro' | 'bangs';
  face?: 'neutral' | 'smile' | 'frown' | 'scar' | 'wink' | 'cool' | 'blush' | 'freckles' | 'kawaii';
  facial?: 'none' | 'stubble' | 'beard' | 'mustache';
  sleeves?: 'bare' | 'short' | 'long';
  pants?: string;
  outfit?: string;
  skin?: string;
  accent?: string;
  /** Classic scout vs simple block voxel (default block). */
  renderMode?: 'block' | 'classic';
}

function clearHatLayer(data: Uint8ClampedArray): void {
  for (const face of ALL_FACES) {
    const rect = PART_UV.hat[face];
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        setPixel(data, x, y, 0, 0, 0, 0);
      }
    }
  }
}

export function applyFaceFeatures(
  data: Uint8ClampedArray,
  eyeHex: string,
  faceStyle: NonNullable<SkinCosmetics['face']> = 'neutral',
): void {
  const [er, eg, eb] = parseHex(eyeHex);
  const face = PART_UV.head.front;
  // Eyes
  setPixel(data, face.x + 2, face.y + 3, er, eg, eb, 255);
  setPixel(data, face.x + 5, face.y + 3, er, eg, eb, 255);
  // Mouth / marks
  if (faceStyle === 'smile') {
    setPixel(data, face.x + 2, face.y + 5, 120, 70, 60, 255);
    setPixel(data, face.x + 3, face.y + 6, 120, 70, 60, 255);
    setPixel(data, face.x + 4, face.y + 6, 120, 70, 60, 255);
    setPixel(data, face.x + 5, face.y + 5, 120, 70, 60, 255);
  } else if (faceStyle === 'frown') {
    setPixel(data, face.x + 2, face.y + 6, 120, 70, 60, 255);
    setPixel(data, face.x + 3, face.y + 5, 120, 70, 60, 255);
    setPixel(data, face.x + 4, face.y + 5, 120, 70, 60, 255);
    setPixel(data, face.x + 5, face.y + 6, 120, 70, 60, 255);
  } else if (faceStyle === 'scar') {
    setPixel(data, face.x + 3, face.y + 5, 120, 70, 60, 255);
    setPixel(data, face.x + 4, face.y + 5, 120, 70, 60, 255);
    setPixel(data, face.x + 6, face.y + 2, 160, 80, 70, 255);
    setPixel(data, face.x + 6, face.y + 3, 160, 80, 70, 255);
    setPixel(data, face.x + 6, face.y + 4, 160, 80, 70, 255);
  } else if (faceStyle === 'wink') {
    setPixel(data, face.x + 2, face.y + 3, er, eg, eb, 255);
    setPixel(data, face.x + 4, face.y + 3, 90, 55, 50, 255);
    setPixel(data, face.x + 5, face.y + 3, 90, 55, 50, 255);
    setPixel(data, face.x + 3, face.y + 5, 120, 70, 60, 255);
    setPixel(data, face.x + 4, face.y + 5, 120, 70, 60, 255);
  } else if (faceStyle === 'cool') {
    setPixel(data, face.x + 1, face.y + 3, 20, 20, 20, 255);
    setPixel(data, face.x + 2, face.y + 3, 20, 20, 20, 255);
    setPixel(data, face.x + 5, face.y + 3, 20, 20, 20, 255);
    setPixel(data, face.x + 6, face.y + 3, 20, 20, 20, 255);
    setPixel(data, face.x + 3, face.y + 3, 40, 40, 40, 255);
    setPixel(data, face.x + 4, face.y + 3, 40, 40, 40, 255);
    setPixel(data, face.x + 3, face.y + 6, 120, 70, 60, 255);
    setPixel(data, face.x + 4, face.y + 6, 120, 70, 60, 255);
  } else if (faceStyle === 'blush') {
    setPixel(data, face.x + 1, face.y + 4, 220, 130, 140, 255);
    setPixel(data, face.x + 6, face.y + 4, 220, 130, 140, 255);
    setPixel(data, face.x + 2, face.y + 5, 120, 70, 60, 255);
    setPixel(data, face.x + 3, face.y + 6, 120, 70, 60, 255);
    setPixel(data, face.x + 4, face.y + 6, 120, 70, 60, 255);
    setPixel(data, face.x + 5, face.y + 5, 120, 70, 60, 255);
  } else if (faceStyle === 'freckles') {
    setPixel(data, face.x + 3, face.y + 5, 120, 70, 60, 255);
    setPixel(data, face.x + 4, face.y + 5, 120, 70, 60, 255);
    setPixel(data, face.x + 1, face.y + 4, 160, 100, 80, 255);
    setPixel(data, face.x + 2, face.y + 5, 160, 100, 80, 255);
    setPixel(data, face.x + 5, face.y + 4, 160, 100, 80, 255);
    setPixel(data, face.x + 6, face.y + 5, 160, 100, 80, 255);
  } else if (faceStyle === 'kawaii') {
    setPixel(data, face.x + 2, face.y + 4, er, eg, eb, 255);
    setPixel(data, face.x + 5, face.y + 4, er, eg, eb, 255);
    setPixel(data, face.x + 1, face.y + 5, 240, 170, 180, 255);
    setPixel(data, face.x + 2, face.y + 5, 240, 170, 180, 255);
    setPixel(data, face.x + 5, face.y + 5, 240, 170, 180, 255);
    setPixel(data, face.x + 6, face.y + 5, 240, 170, 180, 255);
  } else {
    setPixel(data, face.x + 3, face.y + 5, 120, 70, 60, 255);
    setPixel(data, face.x + 4, face.y + 5, 120, 70, 60, 255);
  }
}

export function applyFacialHair(
  data: Uint8ClampedArray,
  style: NonNullable<SkinCosmetics['facial']>,
  hairHex: string,
): void {
  if (style === 'none') return;
  const [r, g, b] = parseHex(hairHex);
  const face = PART_UV.head.front;
  if (style === 'mustache') {
    setPixel(data, face.x + 2, face.y + 5, r, g, b, 255);
    setPixel(data, face.x + 3, face.y + 5, r, g, b, 255);
    setPixel(data, face.x + 4, face.y + 5, r, g, b, 255);
    setPixel(data, face.x + 5, face.y + 5, r, g, b, 255);
  } else if (style === 'stubble') {
    for (const [ox, oy] of [
      [2, 5],
      [3, 5],
      [4, 5],
      [5, 5],
      [2, 6],
      [5, 6],
      [3, 6],
      [4, 6],
    ] as const) {
      if ((ox + oy) % 2 === 0) setPixel(data, face.x + ox, face.y + oy, r, g, b, 255);
    }
  } else if (style === 'beard') {
    for (let y = 5; y <= 7; y++) {
      for (let x = 2; x <= 5; x++) {
        setPixel(data, face.x + x, face.y + y, r, g, b, 255);
      }
    }
    // Chin wrap on sides
    const left = PART_UV.head.left;
    const right = PART_UV.head.right;
    for (let y = 5; y <= 7; y++) {
      setPixel(data, left.x + 3, left.y + y, r, g, b, 255);
      setPixel(data, right.x + 4, right.y + y, r, g, b, 255);
    }
  }
}

export function applyShoeColor(data: Uint8ClampedArray, shoeHex: string): void {
  const [r, g, b] = parseHex(shoeHex);
  for (const part of ['legR', 'legL'] as SkinPart[]) {
    fillRect(data, PART_UV[part].bottom, r, g, b, 255);
    const front = PART_UV[part].front;
    for (let x = front.x; x < front.x + front.w; x++) {
      setPixel(data, x, front.y + front.h - 1, r, g, b, 255);
      setPixel(data, x, front.y + front.h - 2, r, g, b, 255);
    }
  }
}

export function applyPantsColor(data: Uint8ClampedArray, pantsHex: string): void {
  const [r, g, b] = parseHex(pantsHex);
  for (const part of ['legR', 'legL'] as SkinPart[]) {
    for (const face of BOX_FACES) {
      if (face === 'bottom') continue;
      const rect = PART_UV[part][face];
      const shoeRows = face === 'front' || face === 'back' || face === 'left' || face === 'right' ? 2 : 0;
      for (let y = rect.y; y < rect.y + rect.h - shoeRows; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          setPixel(data, x, y, r, g, b, 255);
        }
      }
    }
  }
}

export function applySleeves(
  data: Uint8ClampedArray,
  style: NonNullable<SkinCosmetics['sleeves']>,
  skinHex: string,
  outfitHex: string,
): void {
  const [sr, sg, sb] = parseHex(skinHex);
  const [or, og, ob] = parseHex(outfitHex);
  for (const part of ['armR', 'armL'] as SkinPart[]) {
    for (const face of BOX_FACES) {
      const rect = PART_UV[part][face];
      for (let y = 0; y < rect.h; y++) {
        const useOutfit =
          style === 'long' || (style === 'short' && y < Math.ceil(rect.h * 0.4));
        const [r, g, b] = useOutfit ? [or, og, ob] : [sr, sg, sb];
        for (let x = 0; x < rect.w; x++) {
          setPixel(data, rect.x + x, rect.y + y, r, g, b, 255);
        }
      }
    }
  }
}

export function applyHairStyle(
  data: Uint8ClampedArray,
  style: SkinCosmetics['hairStyle'],
  hairHex: string,
): void {
  clearHatLayer(data);
  if (style === 'none') return;
  const [r, g, b] = parseHex(hairHex);
  fillRect(data, PART_UV.hat.top, r, g, b, 255);
  if (style === 'short') {
    fillRect(data, { ...PART_UV.hat.front, h: 3 }, r, g, b, 255);
  } else if (style === 'long') {
    for (const f of ['front', 'back', 'left', 'right'] as SkinFace[]) {
      fillRect(data, PART_UV.hat[f], r, g, b, 255);
    }
  } else if (style === 'spiky') {
    const top = PART_UV.hat.top;
    for (let y = 0; y < top.h; y++) {
      for (let x = 0; x < top.w; x++) {
        const shade = (x + y) % 2 === 0 ? 0 : 28;
        setPixel(
          data,
          top.x + x,
          top.y + y,
          Math.max(0, r - shade),
          Math.max(0, g - shade),
          Math.max(0, b - shade),
          255,
        );
      }
    }
    fillRect(data, { x: PART_UV.hat.front.x, y: PART_UV.hat.front.y, w: 8, h: 2 }, r, g, b, 255);
  } else if (style === 'curly') {
    fillRect(data, PART_UV.hat.top, r, g, b, 255);
    fillRect(data, { ...PART_UV.hat.front, h: 4 }, r, g, b, 255);
    fillRect(data, { ...PART_UV.hat.back, h: 5 }, r, g, b, 255);
    fillRect(data, { ...PART_UV.hat.left, h: 4 }, r, g, b, 255);
    fillRect(data, { ...PART_UV.hat.right, h: 4 }, r, g, b, 255);
  } else if (style === 'mohawk') {
    const top = PART_UV.hat.top;
    for (let y = 0; y < top.h; y++) {
      for (let x = 3; x <= 4; x++) {
        setPixel(data, top.x + x, top.y + y, r, g, b, 255);
      }
    }
    fillRect(data, { x: PART_UV.hat.front.x + 3, y: PART_UV.hat.front.y, w: 2, h: 5 }, r, g, b, 255);
    fillRect(data, { x: PART_UV.hat.back.x + 3, y: PART_UV.hat.back.y, w: 2, h: 5 }, r, g, b, 255);
  } else if (style === 'bun') {
    fillRect(data, { x: PART_UV.hat.top.x + 2, y: PART_UV.hat.top.y + 1, w: 4, h: 4 }, r, g, b, 255);
    fillRect(data, { x: PART_UV.hat.back.x + 2, y: PART_UV.hat.back.y, w: 4, h: 3 }, r, g, b, 255);
    fillRect(data, { ...PART_UV.hat.front, h: 2 }, r, g, b, 255);
  } else if (style === 'afro') {
    for (const f of ['top', 'front', 'back', 'left', 'right'] as SkinFace[]) {
      fillRect(data, PART_UV.hat[f], r, g, b, 255);
    }
    const top = PART_UV.hat.top;
    for (let y = 0; y < top.h; y++) {
      for (let x = 0; x < top.w; x++) {
        if ((x + y) % 3 === 0) {
          setPixel(
            data,
            top.x + x,
            top.y + y,
            Math.min(255, r + 18),
            Math.min(255, g + 12),
            Math.min(255, b + 8),
            255,
          );
        }
      }
    }
  } else if (style === 'bangs') {
    for (const f of ['top', 'front', 'back', 'left', 'right'] as SkinFace[]) {
      fillRect(data, PART_UV.hat[f], r, g, b, 255);
    }
    const headFront = PART_UV.head.front;
    fillRect(data, { x: headFront.x + 1, y: headFront.y + 1, w: 6, h: 2 }, r, g, b, 255);
    const [lr, lg, lb] = [Math.min(255, r + 14), Math.min(255, g + 10), Math.min(255, b + 12)];
    setPixel(data, headFront.x + 2, headFront.y + 1, lr, lg, lb, 255);
    setPixel(data, headFront.x + 5, headFront.y + 1, lr, lg, lb, 255);
  }
}

/** Accent collar, cuff tips, and hem stripe on body/arms. */
export function applyAccentTrim(data: Uint8ClampedArray, accentHex: string): void {
  const [r, g, b] = parseHex(accentHex);
  const body = PART_UV.body.front;
  fillRect(data, { x: body.x, y: body.y, w: body.w, h: 1 }, r, g, b, 255);
  fillRect(data, { x: body.x, y: body.y + body.h - 1, w: body.w, h: 1 }, r, g, b, 255);
  const back = PART_UV.body.back;
  fillRect(data, { x: back.x, y: back.y, w: back.w, h: 1 }, r, g, b, 255);
  for (const arm of ['armR', 'armL'] as SkinPart[]) {
    const front = PART_UV[arm].front;
    fillRect(data, { x: front.x, y: front.y + front.h - 1, w: front.w, h: 1 }, r, g, b, 255);
  }
}

export function applyProfileCosmetics(data: Uint8ClampedArray, c: SkinCosmetics): void {
  if (c.pants) applyPantsColor(data, c.pants);
  if (c.sleeves && c.skin && c.outfit) applySleeves(data, c.sleeves, c.skin, c.outfit);
  if (c.accent && c.renderMode !== 'block') applyAccentTrim(data, c.accent);
  applyFaceFeatures(data, c.eyes, c.face ?? 'neutral');
  applyFacialHair(data, c.facial ?? 'none', c.hair);
  applyShoeColor(data, c.shoes);
  applyHairStyle(data, c.hairStyle, c.hair);
}

function fillRectAt(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  w: number,
  h: number,
  hex: string,
): void {
  const [r, g, b] = parseHex(hex);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      setPixel(data, x + dx, y + dy, r, g, b, 255);
    }
  }
}

function paintPixelsAt(
  data: Uint8ClampedArray,
  hex: string,
  points: [number, number][],
): void {
  const [r, g, b] = parseHex(hex);
  for (const [x, y] of points) setPixel(data, x, y, r, g, b, 255);
}

function heartTiny(data: Uint8ClampedArray, color: string, cx: number, cy: number): void {
  paintPixelsAt(data, color, [
    [cx - 1, cy],
    [cx + 1, cy],
    [cx - 1, cy + 1],
    [cx, cy + 1],
    [cx + 1, cy + 1],
    [cx, cy + 2],
  ]);
}

function paintArmRects(data: Uint8ClampedArray, color: string): void {
  const rects: [number, number, number, number][] = [
    [44, 16, 4, 4],
    [48, 16, 4, 4],
    [40, 20, 4, 12],
    [44, 20, 4, 12],
    [48, 20, 4, 12],
    [52, 20, 4, 12],
    [36, 48, 4, 4],
    [40, 48, 4, 4],
    [32, 52, 4, 12],
    [36, 52, 4, 12],
    [40, 52, 4, 12],
    [44, 52, 4, 12],
  ];
  for (const [x, y, w, h] of rects) fillRectAt(data, x, y, w, h, color);
}

function paintLegRects(data: Uint8ClampedArray, color: string, keepShoeRows = 2): void {
  const rects: [number, number, number, number][] = [
    [0, 20, 4, 12],
    [4, 20, 4, 12],
    [8, 20, 4, 12],
    [12, 20, 4, 12],
    [16, 52, 4, 12],
    [20, 52, 4, 12],
    [24, 52, 4, 12],
    [28, 52, 4, 12],
  ];
  for (const [x, y, w, h] of rects) fillRectAt(data, x, y, w, h - keepShoeRows, color);
}

function hoodieOutfit(data: Uint8ClampedArray, hoodie: string, shirt: string): void {
  fillRectAt(data, 20, 20, 8, 12, hoodie);
  fillRectAt(data, 32, 20, 8, 12, hoodie);
  fillRectAt(data, 22, 22, 4, 2, shirt);
  paintArmRects(data, hoodie);
  fillRectAt(data, 40, 8, 8, 3, hoodie);
  fillRectAt(data, 41, 7, 6, 1, hoodie);
}

function overallsOutfit(data: Uint8ClampedArray, shirt: string, overalls: string): void {
  fillRectAt(data, 20, 20, 8, 12, shirt);
  fillRectAt(data, 32, 20, 8, 12, shirt);
  fillRectAt(data, 20, 24, 8, 8, overalls);
  fillRectAt(data, 32, 24, 8, 8, overalls);
  fillRectAt(data, 16, 20, 4, 8, overalls);
  fillRectAt(data, 28, 20, 4, 8, overalls);
  fillRectAt(data, 36, 52, 4, 8, overalls);
  fillRectAt(data, 48, 52, 4, 8, overalls);
  paintArmRects(data, shirt);
  paintLegRects(data, overalls, 2);
}

function shadeHex(hex: string, delta: number): string {
  const [r, g, b] = parseHex(hex);
  return `#${[
    Math.max(0, Math.min(255, r + delta)),
    Math.max(0, Math.min(255, g + delta)),
    Math.max(0, Math.min(255, b + delta)),
  ]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('')}`;
}

function softNoiseRect(
  data: Uint8ClampedArray,
  x: number,
  y: number,
  w: number,
  h: number,
  base: string,
  spread = 10,
): void {
  const [br, bg, bb] = parseHex(base);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const n = ((dx * 5 + dy * 7) % 3) - 1;
      setPixel(data, x + dx, y + dy, br + n * spread, bg + n * spread, bb + n * spread, 255);
    }
  }
}

function collarBow(data: Uint8ClampedArray, accent: string): void {
  fillRectAt(data, 22, 20, 4, 2, accent);
  fillRectAt(data, 21, 21, 2, 2, accent);
  fillRectAt(data, 25, 21, 2, 2, accent);
  fillRectAt(data, 23, 22, 2, 1, accent);
}

function sideHairBows(data: Uint8ClampedArray, bow: string): void {
  fillRectAt(data, 16, 9, 2, 2, bow);
  fillRectAt(data, 15, 10, 1, 1, bow);
  fillRectAt(data, 23, 9, 2, 2, bow);
  fillRectAt(data, 25, 10, 1, 1, bow);
}

function puffyWhiteSleeves(data: Uint8ClampedArray, shirt: string, accent: string): void {
  const shadow = shadeHex(shirt, -12);
  paintArmRects(data, shirt);
  const armFronts: [number, number][] = [
    [44, 20],
    [36, 52],
  ];
  for (const [x, y] of armFronts) {
    softNoiseRect(data, x, y, 4, 12, shirt, 6);
    fillRectAt(data, x, y + 8, 4, 2, shadow);
    heartTiny(data, accent, x + 2, y + 9);
  }
}

function teddyCrossbody(data: Uint8ClampedArray, bear: string, strap: string, accent: string): void {
  fillRectAt(data, 22, 27, 4, 3, bear);
  paintPixelsAt(data, shadeHex(bear, 20), [
    [22, 27],
    [25, 27],
  ]);
  setPixel(data, 23, 28, 70, 48, 34, 255);
  setPixel(data, 24, 28, 70, 48, 34, 255);
  fillRectAt(data, 21, 23, 1, 6, strap);
  fillRectAt(data, 26, 25, 1, 3, strap);
  heartTiny(data, accent, 24, 24);
}

function cozyPinafore(
  data: Uint8ClampedArray,
  shirt: string,
  dress: string,
  accent: string,
): void {
  const dressShadow = shadeHex(dress, -16);
  fillRectAt(data, 20, 20, 8, 3, shirt);
  fillRectAt(data, 32, 20, 8, 3, shirt);
  collarBow(data, accent);
  softNoiseRect(data, 20, 23, 8, 9, dress, 8);
  softNoiseRect(data, 32, 23, 8, 9, dress, 8);
  fillRectAt(data, 16, 20, 4, 8, dress);
  fillRectAt(data, 28, 20, 4, 8, dress);
  fillRectAt(data, 36, 52, 4, 8, dress);
  fillRectAt(data, 48, 52, 4, 8, dress);
  fillRectAt(data, 20, 30, 8, 1, dressShadow);
  fillRectAt(data, 32, 30, 8, 1, dressShadow);
}

function cozyStockings(data: Uint8ClampedArray, sock: string, accent: string): void {
  paintLegRects(data, sock);
  const sockFronts: [number, number][] = [
    [4, 20],
    [20, 52],
  ];
  for (const [x, y] of sockFronts) {
    softNoiseRect(data, x, y, 4, 10, sock, 4);
    fillRectAt(data, x, y, 4, 2, accent);
    heartTiny(data, accent, x + 2, y + 4);
    heartTiny(data, accent, x + 1, y + 7);
    paintPixelsAt(data, accent, [
      [x + 1, y + 1],
      [x + 2, y + 1],
    ]);
  }
}

function cozyHair(data: Uint8ClampedArray, hair: string, bow: string): void {
  const highlight = shadeHex(hair, 18);
  const shadow = shadeHex(hair, -14);
  for (const rect of [
    [40, 0, 8, 8],
    [32, 8, 8, 8],
    [40, 8, 8, 8],
    [48, 8, 8, 8],
    [56, 8, 8, 8],
  ] as const) {
    softNoiseRect(data, rect[0], rect[1], rect[2], rect[3], hair, 7);
  }
  fillRectAt(data, 9, 9, 6, 2, hair);
  paintPixelsAt(data, highlight, [
    [10, 9],
    [13, 9],
    [40, 1],
    [45, 2],
  ]);
  paintPixelsAt(data, shadow, [
    [12, 10],
    [34, 12],
    [54, 12],
  ]);
  sideHairBows(data, bow);
}

/** Reference cozy-girl skin — charcoal pinafore, puffy sleeves, teddy bag. */
export function applyCozyReferenceStyle(
  data: Uint8ClampedArray,
  opts: {
    skin: string;
    outfit: string;
    accent: string;
    pants: string;
    hair: string;
    shoes: string;
    variant?: 'girl' | 'boy';
    boyStyle?: 'hoodie' | 'overalls';
    legColor?: string;
  },
): void {
  const shirt = opts.skin;
  const dress = opts.outfit;
  const accent = opts.accent;
  const socks = opts.pants;
  const variant = opts.variant ?? 'girl';

  if (variant === 'boy') {
    if (opts.boyStyle === 'overalls') {
      overallsOutfit(data, shirt, dress);
      paintLegRects(data, opts.legColor ?? socks);
    } else {
      hoodieOutfit(data, dress, shirt);
      paintLegRects(data, socks);
    }
    puffyWhiteSleeves(data, shirt, accent);
    cozyStockings(data, socks, accent);
    teddyCrossbody(data, shadeHex(opts.hair, 30), shirt, accent);
    return;
  }

  cozyHair(data, opts.hair, shirt);
  cozyPinafore(data, shirt, dress, accent);
  puffyWhiteSleeves(data, shirt, accent);
  cozyStockings(data, socks, accent);
  teddyCrossbody(data, shadeHex(opts.hair, 28), shirt, accent);
  applyShoeColor(data, opts.shoes);
}

/** Recolor skin/outfit parts when profile swatches change (keeps custom pixels elsewhere). */
export function applyBaseColorToParts(
  data: Uint8ClampedArray,
  parts: SkinPart[],
  fromHex: string,
  toHex: string,
): void {
  const [tr, tg, tb] = parseHex(toHex);
  const replaced = replaceColorOnParts(data, parts, fromHex, toHex);
  if (replaced > 0) return;
  for (const part of parts) {
    fillPartSolid(data, part, [tr, tg, tb]);
  }
  if (parts.includes('head')) paintDefaultFaceFeatures(data);
}

/** Default block-voxel skin. */
export function createDefaultSkin(
  skin: string,
  outfit: string,
  accent: string,
  cosmetics?: SkinCosmetics,
): Uint8ClampedArray {
  const renderMode = cosmetics?.renderMode ?? 'block';
  if (renderMode === 'block') {
    return buildBlockCharacterSkin({
      skin: cosmetics?.skin ?? skin,
      outfit: cosmetics?.outfit ?? outfit,
      accent: cosmetics?.accent ?? accent,
      pants: cosmetics?.pants,
      hair: cosmetics?.hair,
      shoes: cosmetics?.shoes,
    });
  }

  const data = new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4);
  const [sr, sg, sb] = parseHex(skin);
  const [or, og, ob] = parseHex(outfit);

  for (let i = 3; i < data.length; i += 4) data[i] = 0;

  const paint = (part: SkinPart, rgb: [number, number, number]) => {
    for (const face of BOX_FACES) {
      fillRect(data, PART_UV[part][face], rgb[0], rgb[1], rgb[2], 255);
    }
  };

  paint('head', [sr, sg, sb]);
  paint('body', [or, og, ob]);
  paint('armR', [sr, sg, sb]);
  paint('armL', [sr, sg, sb]);
  paint('legR', [or, og, ob]);
  paint('legL', [or, og, ob]);

  applyProfileCosmetics(data, {
    hair: cosmetics?.hair ?? '#4a3728',
    eyes: cosmetics?.eyes ?? '#2e6b9e',
    shoes: cosmetics?.shoes ?? '#2f3e46',
    hairStyle: cosmetics?.hairStyle ?? 'short',
    face: cosmetics?.face ?? 'neutral',
    facial: cosmetics?.facial ?? 'none',
    sleeves: cosmetics?.sleeves ?? 'bare',
    pants: cosmetics?.pants ?? outfit,
    outfit,
    skin,
    accent,
    renderMode: 'classic',
  });

  return data;
}

export function encodeSkin(data: Uint8ClampedArray): string {
  const canvas = document.createElement('canvas');
  canvas.width = SKIN_SIZE;
  canvas.height = SKIN_SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SKIN_SIZE, SKIN_SIZE);
  img.data.set(data);
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export function decodeSkin(dataUrl: string): Promise<Uint8ClampedArray> {
  return import('./SkinPNGImporter').then(({ importSkinFromDataUrl }) =>
    importSkinFromDataUrl(dataUrl).then((r) => r.pixels),
  );
}

export function copyRectToCanvas(
  data: Uint8ClampedArray,
  rect: SkinRect,
  canvas: HTMLCanvasElement,
  opts?: { flipX?: boolean; flipY?: boolean },
): void {
  if (canvas.width !== rect.w || canvas.height !== rect.h) {
    canvas.width = rect.w;
    canvas.height = rect.h;
  }
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(rect.w, rect.h);
  for (let dy = 0; dy < rect.h; dy++) {
    for (let dx = 0; dx < rect.w; dx++) {
      const sy = opts?.flipY ? rect.h - 1 - dy : dy;
      const sx = opts?.flipX ? rect.w - 1 - dx : dx;
      const si = ((rect.y + sy) * SKIN_SIZE + (rect.x + sx)) * 4;
      const di = (dy * rect.w + dx) * 4;
      img.data[di] = data[si]!;
      img.data[di + 1] = data[si + 1]!;
      img.data[di + 2] = data[si + 2]!;
      img.data[di + 3] = data[si + 3]!;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Draw a Minecraft-style front preview of the skin onto a canvas. */
export function drawSkinFrontPreview(
  data: Uint8ClampedArray,
  canvas: HTMLCanvasElement,
  scale = 4,
): void {
  const W = 16;
  const H = 32;
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const blit = (rect: SkinRect, dx: number, dy: number) => {
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const [r, g, b, a] = getPixel(data, rect.x + x, rect.y + y);
        if (a < 8) continue;
        ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
        ctx.fillRect((dx + x) * scale, (dy + y) * scale, scale, scale);
      }
    }
  };

  // Layout in 16×32 skin units (classic MC inventory preview).
  blit(PART_UV.head.front, 4, 0);
  blit(PART_UV.hat.front, 4, 0);
  blit(PART_UV.body.front, 4, 8);
  blit(PART_UV.armR.front, 0, 8);
  blit(PART_UV.armL.front, 12, 8);
  blit(PART_UV.legR.front, 4, 20);
  blit(PART_UV.legL.front, 8, 20);
}

export function floodFill(
  data: Uint8ClampedArray,
  rect: SkinRect,
  sx: number,
  sy: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  const [tr, tg, tb, ta] = getPixel(data, sx, sy);
  if (tr === r && tg === g && tb === b && ta === a) return;
  const stack: [number, number][] = [[sx, sy]];
  const seen = new Set<number>();
  while (stack.length) {
    const [x, y] = stack.pop()!;
    if (x < rect.x || y < rect.y || x >= rect.x + rect.w || y >= rect.y + rect.h) continue;
    const key = y * SKIN_SIZE + x;
    if (seen.has(key)) continue;
    seen.add(key);
    const [cr, cg, cb, ca] = getPixel(data, x, y);
    if (cr !== tr || cg !== tg || cb !== tb || ca !== ta) continue;
    setPixel(data, x, y, r, g, b, a);
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
}
