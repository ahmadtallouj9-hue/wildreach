/**
 * Upscale menu sky art and extract 3 cloud layers.
 * Run: node scripts/prepare-menu-sky.mjs
 */
import sharp from 'sharp';

const srcPath = 'public/menu-sky-source.png';
const SCALE = 4;

const img = sharp(srcPath);
const { width, height } = await img.metadata();
if (!width || !height) throw new Error('missing image size');

const raw = await img.ensureAlpha().raw().toBuffer();

function px(x, y) {
  const i = (y * width + x) * 4;
  return [raw[i], raw[i + 1], raw[i + 2]];
}

function gradAt(y) {
  const t = y / (height - 1);
  const top = px((width / 2) | 0, 2);
  const bot = px((width / 2) | 0, height - 3);
  return [
    top[0] * (1 - t) + bot[0] * t,
    top[1] * (1 - t) + bot[1] * t,
    top[2] * (1 - t) + bot[2] * t,
  ];
}

function cloudness(r, g, b, y) {
  const gcol = gradAt(y);
  const dist = Math.hypot(r - gcol[0], g - gcol[1], b - gcol[2]) / 255;
  const lum = (r + g + b) / (3 * 255);
  const glum = (gcol[0] + gcol[1] + gcol[2]) / (3 * 255);
  return Math.min(1, dist * 2.7 + Math.max(0, lum - glum - 0.02) * 1.6);
}

function layerWeight(y, layer) {
  const t = y / height;
  if (layer === 0) return t < 0.42 ? 1 - t / 0.42 : 0;
  if (layer === 1) {
    if (t < 0.18 || t > 0.78) return 0;
    if (t < 0.34) return (t - 0.18) / 0.16;
    if (t > 0.62) return (0.78 - t) / 0.16;
    return 1;
  }
  return t < 0.48 ? 0 : (t - 0.48) / 0.52;
}

const base = Buffer.alloc(width * height * 4);
const clouds = [Buffer.alloc(width * height * 4), Buffer.alloc(width * height * 4), Buffer.alloc(width * height * 4)];

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const [r, g, b] = px(x, y);
    const c = cloudness(r, g, b, y);
    const i = (y * width + x) * 4;
    const sky = gradAt(y);
    if (c > 0.1) {
      base[i] = Math.round(sky[0]);
      base[i + 1] = Math.round(sky[1]);
      base[i + 2] = Math.round(sky[2]);
    } else {
      base[i] = r;
      base[i + 1] = g;
      base[i + 2] = b;
    }
    base[i + 3] = 255;
    for (let L = 0; L < 3; L++) {
      const w = layerWeight(y, L);
      if (w > 0.04 && c > 0.08) {
        clouds[L][i] = r;
        clouds[L][i + 1] = g;
        clouds[L][i + 2] = b;
        clouds[L][i + 3] = Math.min(255, Math.round((c - 0.08) * 310 * w));
      }
    }
  }
}

await sharp(srcPath)
  .resize(width * SCALE, height * SCALE, { kernel: 'nearest' })
  .png()
  .toFile('public/menu-sky-source-hd.png');

await sharp(base, { raw: { width, height, channels: 4 } })
  .resize(width * SCALE, height * SCALE, { kernel: 'nearest' })
  .png()
  .toFile('public/menu-sky-base.png');

for (let i = 0; i < 3; i++) {
  await sharp(clouds[i], { raw: { width, height, channels: 4 } })
    .resize(width * SCALE, height * SCALE, { kernel: 'nearest' })
    .png()
    .toFile(`public/menu-sky-clouds-${i}.png`);
}

console.log('Prepared menu sky', { width, height, SCALE });
