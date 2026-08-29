import fs from 'fs';
import sharp from 'sharp';

/**
 * Cover the baked-in title UI (center column + footer) by cloning scenery
 * from the left/right sides of the same image, with soft blend.
 */
const srcPath = 'public/menu-hero.png';
const outPath = 'public/menu-hero.png';
const backupPath = 'public/menu-hero.original.png';

const img = sharp(srcPath);
const { width, height } = await img.metadata();
if (!width || !height) throw new Error('no size');

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(srcPath, backupPath);
}

const raw = await sharp(srcPath).ensureAlpha().raw().toBuffer();
const out = Buffer.from(raw);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Center vertical UI band (logo + buttons) and bottom footer band.
const cx0 = Math.floor(width * 0.28);
const cx1 = Math.floor(width * 0.72);
const cy0 = Math.floor(height * 0.08);
const cy1 = Math.floor(height * 0.78);
const footerY0 = Math.floor(height * 0.82);

function sample(x, y) {
  const ix = clamp(Math.round(x), 0, width - 1);
  const iy = clamp(Math.round(y), 0, height - 1);
  const i = (iy * width + ix) * 4;
  return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]];
}

function setPx(x, y, rgba, a = 1) {
  const i = (y * width + x) * 4;
  out[i] = Math.round(out[i] * (1 - a) + rgba[0] * a);
  out[i + 1] = Math.round(out[i + 1] * (1 - a) + rgba[1] * a);
  out[i + 2] = Math.round(out[i + 2] * (1 - a) + rgba[2] * a);
  out[i + 3] = 255;
}

function fillBand(x0, x1, y0, y1) {
  const mid = (x0 + x1) / 2;
  const half = (x1 - x0) / 2;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      // Mirror sample from outside the band, left or right depending on side.
      const side = x < mid ? -1 : 1;
      const distIn = side < 0 ? mid - x : x - mid;
      const edge = side < 0 ? x0 : x1;
      const outside = edge + side * (8 + distIn * 0.85);
      // Soft edge falloff so the patch blends with surroundings.
      const edgeDist = Math.min(x - x0, x1 - x, y - y0, y1 - y);
      const edgeA = clamp(edgeDist / 18, 0, 1);
      const src = sample(outside, y + Math.sin(x * 0.05 + y * 0.03) * 2);
      // Slight vertical jitter sample for less streaking.
      const src2 = sample(outside + side * 12, y + 3);
      const mix = [
        (src[0] + src2[0]) * 0.5,
        (src[1] + src2[1]) * 0.5,
        (src[2] + src2[2]) * 0.5,
        255,
      ];
      setPx(x, y, mix, 0.55 + edgeA * 0.45);
    }
  }
}

fillBand(cx0, cx1, cy0, cy1);
fillBand(Math.floor(width * 0.18), Math.floor(width * 0.82), footerY0, height);

// Soft blur pass over patched regions only via slight neighbor average.
for (let pass = 0; pass < 2; pass++) {
  const snap = Buffer.from(out);
  const sampleOut = (x, y) => {
    const ix = clamp(x, 0, width - 1);
    const iy = clamp(y, 0, height - 1);
    const i = (iy * width + ix) * 4;
    return [snap[i], snap[i + 1], snap[i + 2]];
  };
  for (let y = cy0; y < height; y++) {
    for (let x = Math.floor(width * 0.18); x < Math.floor(width * 0.82); x++) {
      const inCenter = x >= cx0 && x < cx1 && y >= cy0 && y < cy1;
      const inFooter = y >= footerY0;
      if (!inCenter && !inFooter) continue;
      const a = sampleOut(x - 1, y);
      const b = sampleOut(x + 1, y);
      const c = sampleOut(x, y - 1);
      const d = sampleOut(x, y + 1);
      const e = sampleOut(x, y);
      setPx(
        x,
        y,
        [
          (a[0] + b[0] + c[0] + d[0] + e[0] * 2) / 6,
          (a[1] + b[1] + c[1] + d[1] + e[1] * 2) / 6,
          (a[2] + b[2] + c[2] + d[2] + e[2] * 2) / 6,
          255,
        ],
        0.85,
      );
    }
  }
}

await sharp(out, { raw: { width, height, channels: 4 } })
  .png()
  .toFile(outPath + '.tmp.png');
fs.renameSync(outPath + '.tmp.png', outPath);
console.log('cleaned', width, height, 'backup at', backupPath);
