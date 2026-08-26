/** Unit tests for Minecraft skin PNG normalization (no browser required). */
import {
  detectSkinFormat,
  normalizeSkinImageData,
  postProcessMinecraftSkin,
  scaleFactorForFormat,
} from './SkinPNGImporter';
import { SKIN_SIZE } from './SkinAtlas';

function rgba(
  w: number,
  h: number,
  fill: (x: number, y: number) => [number, number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * w + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
  return buf;
}

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) passed++;
  else {
    failed++;
    console.error('FAIL:', msg);
  }
}

assert(detectSkinFormat(64, 64) === '64x64', '64x64 format');
assert(detectSkinFormat(128, 128) === '128x128', '128x128 format');
assert(detectSkinFormat(64, 32) === '64x32', '64x32 legacy format');
assert(scaleFactorForFormat('128x128') === 2, '128 scale factor');

const hd = rgba(128, 128, (x, y) => (x < 64 && y < 64 ? [255, 0, 0, 255] : [0, 0, 0, 0]));
const down = normalizeSkinImageData(hd, 128, 128);
assert(down.scaleFactor === 2, 'downscale reports factor 2');
assert(down.pixels.length === SKIN_SIZE * SKIN_SIZE * 4, 'atlas byte length');
assert(down.pixels[0] === 255 && down.pixels[1] === 0, 'NN downsample keeps red corner');

const baseOpaque = postProcessMinecraftSkin(rgba(64, 64, () => [200, 100, 50, 128]));
const headFrontIdx = (8 * SKIN_SIZE + 8) * 4 + 3;
assert(baseOpaque[headFrontIdx] === 255, 'base head region forced opaque');

const overlayClear = postProcessMinecraftSkin(
  rgba(64, 64, (x, y) => (x === 40 && y === 8 ? [0, 0, 0, 0] : [0, 0, 0, 255])),
);
assert(overlayClear[(8 * SKIN_SIZE + 40) * 4 + 3] === 0, 'hat overlay alpha zero stays clear');

// Opaque black filler in unused 2nd-layer regions (common bad PNG) → cut out
const blackFiller = postProcessMinecraftSkin(rgba(64, 64, () => [0, 0, 0, 255]));
assert(blackFiller[(36 * SKIN_SIZE + 44) * 4 + 3] === 0, 'opaque black arm overlay scrubbed');
assert(blackFiller[(8 * SKIN_SIZE + 40) * 4 + 3] === 0, 'opaque black hat overlay scrubbed');

// Real overlay paint with no alpha channel must survive (non-black)
const paintedOL = postProcessMinecraftSkin(
  rgba(64, 64, (x, y) =>
    x >= 44 && x < 48 && y >= 36 && y < 48 ? [40, 120, 200, 255] : [0, 0, 0, 255],
  ),
);
assert(paintedOL[(36 * SKIN_SIZE + 44) * 4] === 40, 'painted overlay color kept');
assert(paintedOL[(36 * SKIN_SIZE + 44) * 4 + 3] === 255, 'painted overlay alpha kept');
assert(paintedOL[(8 * SKIN_SIZE + 40) * 4 + 3] === 0, 'unused black hat still scrubbed');

console.log(`SkinPNGImporter tests: ${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} test(s) failed`);
