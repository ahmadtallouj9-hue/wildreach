/**
 * Split menu sky artwork into a static gradient base + 3 tileable cloud layers.
 * Run: node scripts/prepare-menu-sky.mjs
 */
import fs from 'fs';
import sharp from 'sharp';

const src = 'public/menu-sky-source.png';
const outBase = 'public/menu-sky-base.png';
const outClouds = [
  'public/menu-sky-clouds-0.png',
  'public/menu-sky-clouds-1.png',
  'public/menu-sky-clouds-2.png',
];

const img = sharp(src);
const { width, height } = await img.metadata();
if (!width || !height) throw new Error('missing image size');

const raw = await img.ensureAlpha().raw().toBuffer();

function px(x, y) {
  const i = (y * width + x) * 4;
  return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]];
}

const sampleTop = [];
for (let x = Math.floor(width * 0.35); x < Math.floor(width * 0.65); x++) {
  for (let y = 0; y < 4; y++) sampleTop.push(px(x, y));
}
const sampleBot = [];
for (let x = Math.floor(width * 0.35); x < Math.floor(width * 0.65); x++) {
  for (let y = height - 4; y < height; y++) sampleBot.push(px(x, y));
}

const avg = (rows) => {
  const s = [0, 0, 0];
  for (const c of rows) {
    s[0] += c[0];
    s[1] += c[1];
    s[2] += c[2];
  }
  const n = rows.length || 1;
  return [s[0] / n, s[1] / n, s[2] / n];
};

const topColor = avg(sampleTop);
const botColor = avg(sampleBot);

function gradAt(y) {
  const t = y / (height - 1);
  return [
    topColor[0] * (1 - t) + botColor[0] * t,
    topColor[1] * (1 - t) + botColor[1] * t,
    topColor[2] * (1 - t) + botColor[2] * t,
  ];
}

function cloudness(r, g, b, y) {
  const gcol = gradAt(y);
  const dr = r - gcol[0];
  const dg = g - gcol[1];
  const db = b - gcol[2];
  const dist = Math.sqrt(dr * dr + dg * dg + db * db) / 255;
  // Clouds are lighter or more saturated than the smooth gradient.
  const lum = (r + g + b) / (3 * 255);
  const glum = (gcol[0] + gcol[1] + gcol[2]) / (3 * 255);
  const lift = Math.max(0, lum - glum - 0.02);
  return Math.min(1, dist * 2.8 + lift * 1.6);
}

function layerForY(y) {
  const t = y / height;
  if (t < 0.36) return 0;
  if (t < 0.66) return 1;
  return 2;
}

const base = Buffer.alloc(width * height * 4);
const clouds = [Buffer.alloc(width * height * 4), Buffer.alloc(width * height * 4), Buffer.alloc(width * height * 4)];

for (let y = 0; y < height; y++) {
  const gcol = gradAt(y);
  for (let x = 0; x < width; x++) {
    const [r, g, b] = px(x, y);
    const c = cloudness(r, g, b, y);
    const li = layerForY(y);
    const i = (y * width + x) * 4;

    if (c <= 0.06) {
      base[i] = r;
      base[i + 1] = g;
      base[i + 2] = b;
    } else {
      base[i] = Math.round(gcol[0]);
      base[i + 1] = Math.round(gcol[1]);
      base[i + 2] = Math.round(gcol[2]);
    }
    base[i + 3] = 255;

    for (let L = 0; L < 3; L++) {
      const ci = (y * width + x) * 4;
      if (L === li && c > 0.06) {
        const a = Math.min(255, Math.round((c - 0.06) * 320));
        clouds[L][ci] = r;
        clouds[L][ci + 1] = g;
        clouds[L][ci + 2] = b;
        clouds[L][ci + 3] = a;
      } else {
        clouds[L][ci + 3] = 0;
      }
    }
  }
}

async function writeTileable(buf, path) {
  const wide = Buffer.alloc(width * 2 * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width * 2; x++) {
      const sx = x % width;
      const di = (y * width * 2 + x) * 4;
      const si = (y * width + sx) * 4;
      wide[di] = buf[si];
      wide[di + 1] = buf[si + 1];
      wide[di + 2] = buf[si + 2];
      wide[di + 3] = buf[si + 3];
    }
  }
  await sharp(wide, { raw: { width: width * 2, height, channels: 4 } }).png().toFile(path);
}

await sharp(base, { raw: { width, height, channels: 4 } }).png().toFile(outBase);
for (let i = 0; i < 3; i++) await writeTileable(clouds[i], outClouds[i]);

console.log('Prepared menu sky assets:', width, height);
console.log('  base:', outBase);
for (const p of outClouds) console.log('  cloud:', p);
