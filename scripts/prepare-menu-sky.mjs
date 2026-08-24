/**
 * Split menu sky artwork into sky base + 3 cloud layers (same size as source).
 * Run: node scripts/prepare-menu-sky.mjs
 */
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
  const lum = (r + g + b) / (3 * 255);
  const glum = (gcol[0] + gcol[1] + gcol[2]) / (3 * 255);
  const lift = Math.max(0, lum - glum - 0.025);
  return Math.min(1, dist * 2.4 + lift * 1.4);
}

function layerWeight(y, layer) {
  const t = y / height;
  if (layer === 0) {
    if (t >= 0.4) return 0;
    return 1 - t / 0.4;
  }
  if (layer === 1) {
    if (t < 0.2 || t > 0.75) return 0;
    if (t < 0.35) return (t - 0.2) / 0.15;
    if (t > 0.6) return (0.75 - t) / 0.15;
    return 1;
  }
  if (t < 0.5) return 0;
  return (t - 0.5) / 0.5;
}

const rowSky = Array.from({ length: height }, () => []);

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const [r, g, b] = px(x, y);
    if (cloudness(r, g, b, y) <= 0.07) rowSky[y].push([r, g, b]);
  }
}

function skyAt(x, y) {
  const row = rowSky[y];
  if (row.length) {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (const c of row) {
      sx += c[0];
      sy += c[1];
      sz += c[2];
    }
    return [sx / row.length, sy / row.length, sz / row.length];
  }
  return gradAt(y);
}

const base = Buffer.alloc(width * height * 4);
const clouds = [Buffer.alloc(width * height * 4), Buffer.alloc(width * height * 4), Buffer.alloc(width * height * 4)];

for (let y = 0; y < height; y++) {
  for (let x = 0; x < width; x++) {
    const [r, g, b] = px(x, y);
    const c = cloudness(r, g, b, y);
    const i = (y * width + x) * 4;
    const sky = skyAt(x, y);

    if (c <= 0.07) {
      base[i] = r;
      base[i + 1] = g;
      base[i + 2] = b;
    } else {
      base[i] = Math.round(sky[0]);
      base[i + 1] = Math.round(sky[1]);
      base[i + 2] = Math.round(sky[2]);
    }
    base[i + 3] = 255;

    for (let L = 0; L < 3; L++) {
      const w = layerWeight(y, L);
      const ci = (y * width + x) * 4;
      if (w > 0.05 && c > 0.07) {
        const a = Math.min(255, Math.round((c - 0.07) * 280 * w));
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

async function writePng(buf, width, height, path, scale = 3) {
  let pipe = sharp(buf, { raw: { width, height, channels: 4 } });
  if (scale > 1) {
    pipe = pipe.resize(width * scale, height * scale, { kernel: 'nearest' });
  }
  await pipe.png().toFile(path);
}

await writePng(base, width, height, outBase);
for (let i = 0; i < 3; i++) {
  await writePng(clouds[i], width, height, outClouds[i]);
}

// Upscaled source for sharper full-res sampling
await sharp(src).resize(width * 3, height * 3, { kernel: 'nearest' }).png().toFile('public/menu-sky-source-hd.png');

console.log('Prepared menu sky assets:', width, height);
console.log('  base:', outBase);
for (const p of outClouds) console.log('  cloud:', p);
