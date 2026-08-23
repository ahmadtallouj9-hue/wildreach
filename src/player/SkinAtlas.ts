/** Minecraft-classic 64×64 skin layout + pixel helpers. */

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

/** BoxGeometry material order: +X -X +Y -Y +Z -Z (avatar faces -Z). */
export const BOX_FACES: SkinFace[] = ['right', 'left', 'top', 'bottom', 'back', 'front'];

/** Flip options when copying atlas pixels onto a BoxGeometry face texture. */
export const BOX_FACE_SYNC: Partial<
  Record<SkinFace, { flipX?: boolean; flipY?: boolean }>
> = {
  top: { flipY: true },
  bottom: { flipY: true },
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
  hairStyle: 'none' | 'short' | 'long' | 'spiky' | 'curly' | 'mohawk';
  face?: 'neutral' | 'smile' | 'frown' | 'scar';
  facial?: 'none' | 'stubble' | 'beard' | 'mustache';
  sleeves?: 'bare' | 'short' | 'long';
  pants?: string;
  outfit?: string;
  skin?: string;
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
  }
}

export function applyProfileCosmetics(data: Uint8ClampedArray, c: SkinCosmetics): void {
  if (c.pants) applyPantsColor(data, c.pants);
  if (c.sleeves && c.skin && c.outfit) applySleeves(data, c.sleeves, c.skin, c.outfit);
  applyFaceFeatures(data, c.eyes, c.face ?? 'neutral');
  applyFacialHair(data, c.facial ?? 'none', c.hair);
  applyShoeColor(data, c.shoes);
  applyHairStyle(data, c.hairStyle, c.hair);
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

/** Steve-like default from base colors + optional cosmetics. */
export function createDefaultSkin(
  skin: string,
  outfit: string,
  accent: string,
  cosmetics?: SkinCosmetics,
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4);
  const [sr, sg, sb] = parseHex(skin);
  const [or, og, ob] = parseHex(outfit);
  void accent;

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
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = SKIN_SIZE;
      canvas.height = SKIN_SIZE;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, SKIN_SIZE, SKIN_SIZE);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, SKIN_SIZE, SKIN_SIZE);
      resolve(new Uint8ClampedArray(ctx.getImageData(0, 0, SKIN_SIZE, SKIN_SIZE).data));
    };
    img.onerror = () => reject(new Error('Failed to decode skin'));
    img.src = dataUrl;
  });
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
