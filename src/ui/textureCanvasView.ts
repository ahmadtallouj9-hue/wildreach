import { TEX_N, texIdx } from './textureOps';

function blitPixels(
  ctx: CanvasRenderingContext2D,
  pixels: number[],
  cell: number,
  showCheck: boolean,
): void {
  const px = cell * TEX_N;
  if (showCheck) {
    for (let y = 0; y < TEX_N; y++) {
      for (let x = 0; x < TEX_N; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#2a3038' : '#1e232a';
        ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }
  } else {
    ctx.fillStyle = '#1a1e24';
    ctx.fillRect(0, 0, px, px);
  }

  for (let y = 0; y < TEX_N; y++) {
    for (let x = 0; x < TEX_N; x++) {
      const i = texIdx(x, y);
      // Skip fully black-transparent-looking unused? No — textures are opaque RGB.
      ctx.fillStyle = `rgb(${pixels[i]},${pixels[i + 1]},${pixels[i + 2]})`;
      ctx.fillRect(x * cell, y * cell, cell, cell);
    }
  }
}

function blitGrid(ctx: CanvasRenderingContext2D, cell: number): void {
  const px = cell * TEX_N;
  // Minor cell lines
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 1; i < TEX_N; i++) {
    if (i % 4 === 0) continue;
    const p = i * cell;
    ctx.fillRect(p, 0, 1, px);
    ctx.fillRect(0, p, px, 1);
  }
  // Major every 4 (Blockbench-style UV guides)
  ctx.fillStyle = 'rgba(62,187,165,0.45)';
  for (let i = 4; i < TEX_N; i += 4) {
    const p = i * cell;
    ctx.fillRect(p, 0, 1, px);
    ctx.fillRect(0, p, px, 1);
  }
  // Outer frame
  ctx.fillStyle = 'rgba(62,187,165,0.85)';
  ctx.fillRect(0, 0, px, 1);
  ctx.fillRect(0, px - 1, px, 1);
  ctx.fillRect(0, 0, 1, px);
  ctx.fillRect(px - 1, 0, 1, px);
}

/** Draw locked even-cell texture grid + optional overlay hover. */
export function drawTexGrid(
  canvas: HTMLCanvasElement,
  pixels: number[],
  cell: number,
  opts: { showCheck: boolean; showGrid: boolean },
): void {
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  blitPixels(ctx, pixels, cell, opts.showCheck);
  if (opts.showGrid) blitGrid(ctx, cell);
}

export function drawTexHover(
  overlay: HTMLCanvasElement,
  cell: number,
  hover: { x: number; y: number } | null,
  brush = 1,
): void {
  const ctx = overlay.getContext('2d')!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!hover) return;

  const half = Math.floor((brush - 1) / 2);
  const x0 = Math.max(0, hover.x - half);
  const y0 = Math.max(0, hover.y - half);
  const x1 = Math.min(TEX_N, hover.x - half + brush);
  const y1 = Math.min(TEX_N, hover.y - half + brush);

  ctx.fillStyle = 'rgba(62,187,165,0.22)';
  ctx.fillRect(x0 * cell, y0 * cell, (x1 - x0) * cell, (y1 - y0) * cell);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  // 1px crisp border around brush footprint
  const bx = x0 * cell;
  const by = y0 * cell;
  const bw = (x1 - x0) * cell;
  const bh = (y1 - y0) * cell;
  ctx.fillRect(bx, by, bw, 1);
  ctx.fillRect(bx, by + bh - 1, bw, 1);
  ctx.fillRect(bx, by, 1, bh);
  ctx.fillRect(bx + bw - 1, by, 1, bh);
}

export type TexPreviewMode = 'cube' | 'flat' | 'top' | 'side' | 'item' | 'slab' | 'pillar' | 'stairs';

function pixelsToCanvas(pixels: number[]): HTMLCanvasElement {
  const tex = document.createElement('canvas');
  tex.width = TEX_N;
  tex.height = TEX_N;
  const tctx = tex.getContext('2d')!;
  const img = tctx.createImageData(TEX_N, TEX_N);
  for (let i = 0; i < pixels.length; i++) img.data[i] = pixels[i]!;
  tctx.putImageData(img, 0, 0);
  return tex;
}

function drawIsoFace(
  ctx: CanvasRenderingContext2D,
  tex: HTMLCanvasElement,
  pts: number[][],
  shade: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0]![0]!, pts[0]![1]!);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0]!, pts[i]![1]!);
  ctx.closePath();
  ctx.clip();
  ctx.globalAlpha = shade;
  ctx.imageSmoothingEnabled = false;
  const xs = pts.map((p) => p[0]!);
  const ys = pts.map((p) => p[1]!);
  ctx.drawImage(
    tex,
    Math.min(...xs),
    Math.min(...ys),
    Math.max(...xs) - Math.min(...xs),
    Math.max(...ys) - Math.min(...ys),
  );
  ctx.restore();
}

export function drawTexPreview(
  preview: HTMLCanvasElement,
  pixels: number[],
  mode: TexPreviewMode = 'cube',
): void {
  const tex = pixelsToCanvas(pixels);
  const ctx = preview.getContext('2d')!;
  const w = preview.width;
  const h = preview.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#0d1418';
  ctx.fillRect(0, 0, w, h);

  if (mode === 'flat' || mode === 'top' || mode === 'side' || mode === 'item') {
    const pad = mode === 'item' ? w * 0.22 : w * 0.12;
    const size = w - pad * 2;
    const x = pad;
    const y = mode === 'item' ? pad * 1.2 : pad;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tex, x, y, size, size);
    if (mode === 'item') {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.88, size * 0.35, size * 0.1, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    return;
  }

  const cx = w * 0.5;
  const cy = h * 0.52;
  const s = w * 0.26;

  if (mode === 'slab') {
    const top = [
      [cx, cy - s * 0.35],
      [cx + s, cy - s * 0.05],
      [cx, cy + s * 0.25],
      [cx - s, cy - s * 0.05],
    ];
    const left = [
      [cx - s, cy - s * 0.05],
      [cx, cy + s * 0.25],
      [cx, cy + s * 0.55],
      [cx - s, cy + s * 0.25],
    ];
    const right = [
      [cx, cy + s * 0.25],
      [cx + s, cy - s * 0.05],
      [cx + s, cy + s * 0.25],
      [cx, cy + s * 0.55],
    ];
    drawIsoFace(ctx, tex, top, 1);
    drawIsoFace(ctx, tex, left, 0.72);
    drawIsoFace(ctx, tex, right, 0.88);
    return;
  }

  if (mode === 'pillar') {
    const top = [
      [cx, cy - s * 1.15],
      [cx + s * 0.55, cy - s * 0.85],
      [cx, cy - s * 0.55],
      [cx - s * 0.55, cy - s * 0.85],
    ];
    const left = [
      [cx - s * 0.55, cy - s * 0.85],
      [cx, cy - s * 0.55],
      [cx, cy + s * 0.95],
      [cx - s * 0.55, cy + s * 0.65],
    ];
    const right = [
      [cx, cy - s * 0.55],
      [cx + s * 0.55, cy - s * 0.85],
      [cx + s * 0.55, cy + s * 0.65],
      [cx, cy + s * 0.95],
    ];
    drawIsoFace(ctx, tex, top, 1);
    drawIsoFace(ctx, tex, left, 0.7);
    drawIsoFace(ctx, tex, right, 0.86);
    return;
  }

  if (mode === 'stairs') {
    const step = (ox: number, oy: number, sc: number) => {
      const top = [
        [ox, oy - sc * 0.5],
        [ox + sc, oy - sc * 0.2],
        [ox, oy + sc * 0.1],
        [ox - sc, oy - sc * 0.2],
      ];
      const left = [
        [ox - sc, oy - sc * 0.2],
        [ox, oy + sc * 0.1],
        [ox, oy + sc * 0.55],
        [ox - sc, oy + sc * 0.25],
      ];
      const right = [
        [ox, oy + sc * 0.1],
        [ox + sc, oy - sc * 0.2],
        [ox + sc, oy + sc * 0.25],
        [ox, oy + sc * 0.55],
      ];
      drawIsoFace(ctx, tex, top, 1);
      drawIsoFace(ctx, tex, left, 0.72);
      drawIsoFace(ctx, tex, right, 0.88);
    };
    step(cx - s * 0.35, cy + s * 0.35, s * 0.7);
    step(cx + s * 0.15, cy - s * 0.15, s * 0.7);
    return;
  }

  // cube (default)
  const faces = [
    [
      [cx, cy - s * 0.95],
      [cx + s, cy - s * 0.45],
      [cx, cy + 0.05],
      [cx - s, cy - s * 0.45],
    ],
    [
      [cx - s, cy - s * 0.45],
      [cx, cy + 0.05],
      [cx, cy + s * 1.05],
      [cx - s, cy + s * 0.55],
    ],
    [
      [cx, cy + 0.05],
      [cx + s, cy - s * 0.45],
      [cx + s, cy + s * 0.55],
      [cx, cy + s * 1.05],
    ],
  ];
  const shades = [1, 0.72, 0.88];
  faces.forEach((pts, fi) => drawIsoFace(ctx, tex, pts, shades[fi]!));
}

/** @deprecated use drawTexPreview */
export function drawTexPreviewCube(preview: HTMLCanvasElement, pixels: number[]): void {
  drawTexPreview(preview, pixels, 'cube');
}

export function sizeTexCanvases(
  canvas: HTMLCanvasElement,
  overlay: HTMLCanvasElement,
  wrapWidth: number,
  cellMin: number,
  wrapHeight?: number,
): number {
  const pad = 8;
  const side = Math.max(
    TEX_N * cellMin,
    Math.floor(Math.min(wrapWidth || 224, wrapHeight || wrapWidth || 224) - pad),
  );
  // Prefer even cell sizes so major (÷4) guides land on whole pixels.
  let cell = Math.max(cellMin, Math.floor(side / TEX_N));
  if (cell > cellMin && cell % 2 === 1) cell -= 1;
  const px = cell * TEX_N;
  for (const c of [canvas, overlay]) {
    c.width = px;
    c.height = px;
    c.style.width = `${px}px`;
    c.style.height = `${px}px`;
  }
  return cell;
}
