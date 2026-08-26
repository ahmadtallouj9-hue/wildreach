/**
 * Simple block voxel character skin — flat regions, no overlays, no props.
 * Matches the low-detail rectangular Minecraft-style reference.
 */

import {
  BOX_FACES,
  PART_UV,
  SKIN_SIZE,
  applyShoeColor,
  setPixel,
  type SkinPart,
} from './SkinAtlas';

/** Muted block palette from the new reference. */
export const BLOCK_PALETTE = {
  hair: '#8B8178',
  hairDark: '#6E665E',
  skin: '#C4B4A8',
  skinShadow: '#A89888',
  outfit: '#3A383C',
  outfitDark: '#2A282C',
  sleeve: '#D8D4CE',
  sleeveShadow: '#B8B4AE',
  pants: '#E8E4DE',
  pink: '#C9A8A8',
  pinkDark: '#A88888',
  eye: '#252528',
  mouth: '#4A4038',
  shoe: '#3D3835',
} as const;

function parse(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function fill(data: Uint8ClampedArray, x: number, y: number, w: number, h: number, hex: string): void {
  const [r, g, b] = parse(hex);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) setPixel(data, x + dx, y + dy, r, g, b, 255);
  }
}

function paintPart(data: Uint8ClampedArray, part: SkinPart, hex: string): void {
  for (const face of BOX_FACES) {
    const r = PART_UV[part][face];
    fill(data, r.x, r.y, r.w, r.h, hex);
  }
}

function paintBlockFace(data: Uint8ClampedArray): void {
  const f = PART_UV.head.front;
  fill(data, f.x, f.y, f.w, f.h, BLOCK_PALETTE.skin);
  fill(data, f.x + 2, f.y + 4, 1, 2, BLOCK_PALETTE.eye);
  fill(data, f.x + 5, f.y + 4, 1, 2, BLOCK_PALETTE.eye);
  const [mr, mg, mb] = parse(BLOCK_PALETTE.mouth);
  setPixel(data, f.x + 3, f.y + 6, mr, mg, mb, 255);
  setPixel(data, f.x + 4, f.y + 6, mr, mg, mb, 255);
}

function paintHairCap(data: Uint8ClampedArray): void {
  for (const face of BOX_FACES) {
    const r = PART_UV.hat[face];
    fill(data, r.x, r.y, r.w, r.h, BLOCK_PALETTE.hair);
  }
  fill(data, 40, 8, 8, 4, BLOCK_PALETTE.hairDark);
  fill(data, 8, 8, 8, 2, BLOCK_PALETTE.hairDark);
}

function paintTorso(data: Uint8ClampedArray): void {
  for (const face of ['front', 'back', 'left', 'right'] as const) {
    const r = PART_UV.body[face];
    fill(data, r.x, r.y, r.w, r.h, BLOCK_PALETTE.outfit);
  }
  fill(data, 20, 16, 8, 4, BLOCK_PALETTE.outfitDark);
  fill(data, 28, 16, 8, 4, BLOCK_PALETTE.outfitDark);
  fill(data, 20, 20, 8, 3, BLOCK_PALETTE.sleeve);
  fill(data, 32, 20, 8, 3, BLOCK_PALETTE.sleeve);
}

function paintArms(data: Uint8ClampedArray): void {
  for (const part of ['armR', 'armL'] as SkinPart[]) {
    for (const face of BOX_FACES) {
      const r = PART_UV[part][face];
      fill(data, r.x, r.y, r.w, r.h, BLOCK_PALETTE.sleeve);
    }
  }
  fill(data, 44, 24, 4, 4, BLOCK_PALETTE.sleeveShadow);
  fill(data, 36, 56, 4, 4, BLOCK_PALETTE.sleeveShadow);
}

function paintLegs(data: Uint8ClampedArray): void {
  for (const part of ['legR', 'legL'] as SkinPart[]) {
    const front = PART_UV[part].front;
    fill(data, front.x, front.y, front.w, 4, BLOCK_PALETTE.pink);
    fill(data, front.x, front.y + 4, front.w, front.h - 6, BLOCK_PALETTE.pants);
    for (const face of ['back', 'left', 'right'] as const) {
      const r = PART_UV[part][face];
      fill(data, r.x, r.y, r.w, r.h - 2, BLOCK_PALETTE.pants);
      fill(data, r.x, r.y, r.w, 3, BLOCK_PALETTE.pink);
    }
    fill(data, PART_UV[part].top.x, PART_UV[part].top.y, 4, 4, BLOCK_PALETTE.pinkDark);
  }
  applyShoeColor(data, BLOCK_PALETTE.shoe);
}

export interface BlockSkinOpts {
  skin?: string;
  outfit?: string;
  accent?: string;
  pants?: string;
  hair?: string;
  shoes?: string;
}

/** Flat block-character skin — base layer only, no overlay texels. */
export function buildBlockCharacterSkin(opts: BlockSkinOpts = {}): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 0;

  const skin = opts.skin ?? BLOCK_PALETTE.skin;
  const hair = opts.hair ?? BLOCK_PALETTE.hair;
  const outfit = opts.outfit ?? BLOCK_PALETTE.outfit;
  const pants = opts.pants ?? BLOCK_PALETTE.pants;
  const pink = opts.accent ?? BLOCK_PALETTE.pink;
  const shoes = opts.shoes ?? BLOCK_PALETTE.shoe;

  paintPart(data, 'head', skin);
  paintBlockFace(data);
  paintPart(data, 'body', outfit);
  paintTorso(data);
  paintArms(data);
  paintPart(data, 'legR', pants);
  paintPart(data, 'legL', pants);
  paintLegs(data);
  paintHairCap(data);

  if (hair !== BLOCK_PALETTE.hair) {
    for (const face of BOX_FACES) {
      const r = PART_UV.hat[face];
      fill(data, r.x, r.y, r.w, r.h, hair);
    }
  }
  if (pink !== BLOCK_PALETTE.pink) {
    for (const x of [4, 20]) {
      fill(data, x, 20, 4, 3, pink);
    }
  }
  if (shoes !== BLOCK_PALETTE.shoe) applyShoeColor(data, shoes);

  return data;
}

/** Empty block canvas — flat gray regions, no overlay. */
export function buildBlankBlockSkin(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(SKIN_SIZE * SKIN_SIZE * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 0;
  for (const part of ['head', 'body', 'armR', 'armL', 'legR', 'legL'] as SkinPart[]) {
    paintPart(data, part, BLOCK_PALETTE.sleeve);
  }
  paintPart(data, 'head', BLOCK_PALETTE.skin);
  applyShoeColor(data, BLOCK_PALETTE.shoe);
  return data;
}
