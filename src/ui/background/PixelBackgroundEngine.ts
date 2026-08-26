import type { BgLayerFlags, BgMotionConfig, VytheraBgPrefs } from './backgroundPrefs.js';
import { resolveBgLayers, resolveBgMotion, isReducedMotionPreferred } from './backgroundPrefs.js';
import { AnimationClock, wrapOffset } from './AnimationClock.js';
import { PAL, phaseFromTime, skyColors, type TimePhase } from './pixelPalette.js';

export type BgPanelContext = 'home' | 'loading' | 'hub' | 'studio' | 'settings';

type CloudDef = { pixels: [number, number][]; w: number; h: number };

type TreeDef = { x: number; scale: number; phase: number };
type GrassBlade = { x: number; h: number; phase: number };
type Bird = { x: number; y: number; speed: number; wing: number };

const CLOUD_SHAPES: CloudDef[] = [
  {
    w: 28,
    h: 10,
    pixels: [
      [4, 6], [5, 5], [6, 5], [7, 4], [8, 4], [9, 4], [10, 3], [11, 3], [12, 3], [13, 3],
      [14, 3], [15, 3], [16, 4], [17, 4], [18, 4], [19, 5], [20, 5], [21, 6], [22, 6],
      [5, 6], [6, 6], [7, 5], [8, 5], [9, 5], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4],
      [15, 4], [16, 5], [17, 5], [18, 5], [19, 6], [20, 6], [21, 7],
      [8, 6], [9, 6], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5], [15, 5], [16, 6], [17, 6], [18, 6],
    ],
  },
  {
    w: 22,
    h: 8,
    pixels: [
      [3, 5], [4, 4], [5, 4], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 4],
      [13, 4], [14, 4], [15, 5], [16, 5], [17, 6], [4, 5], [5, 5], [6, 4], [7, 4], [8, 4],
      [9, 4], [10, 4], [11, 4], [12, 5], [13, 5], [14, 5], [15, 6], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5],
    ],
  },
  {
    w: 18,
    h: 7,
    pixels: [
      [2, 4], [3, 3], [4, 3], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 3], [11, 3], [12, 4], [13, 4], [14, 5],
      [3, 4], [4, 4], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 4], [11, 4], [12, 5], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4],
    ],
  },
];

function contextCalm(ctx: BgPanelContext): number {
  switch (ctx) {
    case 'loading':
      return 0.45;
    case 'hub':
    case 'studio':
    case 'settings':
      return 0.65;
    default:
      return 1;
  }
}

function seededTrees(w: number): TreeDef[] {
  const trees: TreeDef[] = [];
  const xs = [0.08, 0.18, 0.32, 0.52, 0.68, 0.82, 0.92];
  for (let i = 0; i < xs.length; i++) {
    trees.push({ x: xs[i]! * w, scale: 0.85 + (i % 3) * 0.12, phase: i * 1.7 });
  }
  return trees;
}

function seededGrass(w: number, count: number): GrassBlade[] {
  const blades: GrassBlade[] = [];
  for (let i = 0; i < count; i++) {
    blades.push({ x: (i / count) * w + ((i * 17) % 7), h: 4 + (i % 4), phase: i * 0.4 });
  }
  return blades;
}

export class PixelBackgroundEngine {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private clock = new AnimationClock();
  private raf = 0;
  private prefs: VytheraBgPrefs;
  private context: BgPanelContext = 'home';
  private layers: BgLayerFlags;
  private motion: BgMotionConfig;
  private reducedMotion = false;
  private staticFallback = false;
  private trees: TreeDef[] = [];
  private grass: GrassBlade[] = [];
  private birds: Bird[] = [];
  private birdTimer = 0;
  private iw = 384;
  private ih = 216;
  private visible = true;

  constructor(prefs: VytheraBgPrefs) {
    this.prefs = prefs;
    this.layers = resolveBgLayers(prefs, false);
    this.motion = resolveBgMotion(prefs, false);
    this.applyPrefs(prefs);
  }

  mount(container: HTMLElement): boolean {
    this.disposeCanvas();
    const canvas = document.createElement('canvas');
    canvas.className = 'vy-pixel-bg__canvas';
    canvas.setAttribute('aria-hidden', 'true');
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) {
      this.staticFallback = true;
      container.classList.add('vy-pixel-bg--static-fallback');
      return false;
    }

    this.canvas = canvas;
    this.ctx = ctx;
    ctx.imageSmoothingEnabled = false;
    this.resize();
    this.trees = seededTrees(this.iw);
    this.grass = seededGrass(this.iw, this.prefs.quality === 'low' ? 48 : 96);
    this.drawFrame(0);
    return true;
  }

  setContext(ctx: BgPanelContext): void {
    this.context = ctx;
  }

  setPrefs(prefs: VytheraBgPrefs): void {
    this.applyPrefs(prefs);
    if (this.canvas) {
      this.grass = seededGrass(this.iw, this.prefs.quality === 'low' ? 48 : 96);
      this.resize();
      this.drawFrame(this.clock.time.value);
      if (this.layers.animate && this.visible) this.schedule();
    }
  }

  start(): void {
    this.clock.start();
    this.schedule();
  }

  stop(): void {
    this.clock.stop();
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (v) {
      this.clock.start();
      this.schedule();
    } else {
      this.stop();
    }
  }

  dispose(): void {
    this.stop();
    this.disposeCanvas();
  }

  getState(): {
    staticFallback: boolean;
    layers: BgLayerFlags;
    motion: BgMotionConfig;
    reducedMotion: boolean;
  } {
    return {
      staticFallback: this.staticFallback,
      layers: this.layers,
      motion: this.motion,
      reducedMotion: this.reducedMotion,
    };
  }

  /** Exposed for tests — one render step. */
  renderStep(t: number): void {
    this.drawFrame(t);
  }

  private applyPrefs(prefs: VytheraBgPrefs): void {
    this.prefs = prefs;
    this.reducedMotion = isReducedMotionPreferred();
    this.layers = resolveBgLayers(prefs, this.reducedMotion);
    this.motion = resolveBgMotion(prefs, this.reducedMotion);
    this.iw = this.motion.internalWidth;
    this.ih = this.motion.internalHeight;

    const running = this.layers.animate && !this.staticFallback;
    this.clock.setProfile({
      motion: running ? 1 : 0,
      running,
    });
  }

  private disposeCanvas(): void {
    this.canvas?.remove();
    this.canvas = null;
    this.ctx = null;
  }

  private resize(): void {
    if (!this.canvas || !this.ctx) return;
    this.canvas.width = this.iw;
    this.canvas.height = this.ih;
    this.ctx.imageSmoothingEnabled = false;
  }

  private schedule(): void {
    if (this.raf) return;
    const loop = (now: number) => {
      this.raf = 0;
      if (!this.visible) return;
      const dt = this.clock.tick(now);
      if (this.layers.animate) {
        this.updateAmbient(dt);
        this.drawFrame(this.clock.time.value);
        this.schedule();
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  private updateAmbient(dt: number): void {
    const calm = contextCalm(this.context);
    const rate = this.motion.birdRate * calm;
    if (rate <= 0 || !this.layers.ambientLife) return;
    this.birdTimer += dt;
    if (this.birdTimer > 4 / Math.max(0.15, rate)) {
      this.birdTimer = 0;
      if (this.birds.length < 3) {
        this.birds.push({
          x: -8,
          y: 28 + Math.random() * 40,
          speed: 18 + Math.random() * 14,
          wing: Math.random() * Math.PI * 2,
        });
      }
    }
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const b = this.birds[i]!;
      b.x += b.speed * dt * calm;
      b.wing += dt * 8;
      if (b.x > this.iw + 12) this.birds.splice(i, 1);
    }
  }

  private drawFrame(t: number): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const calm = contextCalm(this.context);
    const phase = phaseFromTime(t * calm);
    const colors = skyColors(phase);

    this.drawSky(ctx, colors);
    if (this.layers.sun) this.drawSun(ctx, t, phase, calm);
    if (this.layers.clouds) {
      this.drawCloudLayer(ctx, t, 0.22 * calm, 0.35, CLOUD_SHAPES[0]!, colors);
      if (this.prefs.quality !== 'low') {
        this.drawCloudLayer(ctx, t, 0.45 * calm, 0.55, CLOUD_SHAPES[1]!, colors);
      }
      if (this.prefs.quality === 'high' || this.prefs.quality === 'ultra') {
        this.drawCloudLayer(ctx, t, 0.75 * calm, 0.85, CLOUD_SHAPES[2]!, colors);
      }
    }
    this.drawMountains(ctx, t, calm);
    if (this.layers.water) this.drawWater(ctx, t, calm);
    this.drawTrees(ctx, t, calm);
    if (this.layers.vegetation) this.drawGrass(ctx, t, calm);
    if (this.layers.ambientLife) this.drawBirds(ctx);
    if (this.layers.atmosphere) this.drawAtmosphere(ctx, phase);
  }

  private drawSky(
    ctx: CanvasRenderingContext2D,
    colors: ReturnType<typeof skyColors>,
  ): void {
    const bands = 12;
    for (let i = 0; i < bands; i++) {
      const f = i / (bands - 1);
      const y0 = Math.floor((f * this.ih) / bands) * (this.ih / bands);
      const y1 = Math.floor(((i + 1) / bands) * this.ih);
      let c: string;
      if (f < 0.45) c = colors.top;
      else if (f < 0.78) c = colors.mid;
      else c = colors.horizon;
      ctx.fillStyle = c;
      ctx.fillRect(0, y0, this.iw, y1 - y0 + 1);
    }
    if (colors.warm > 0) {
      ctx.fillStyle = `rgba(240, 180, 100, ${colors.warm * 0.12})`;
      ctx.fillRect(0, 0, this.iw, Math.floor(this.ih * 0.55));
    }
  }

  private drawSun(ctx: CanvasRenderingContext2D, t: number, phase: TimePhase, calm: number): void {
    if (phase === 'night') return;
    const baseX = this.iw * 0.78;
    const baseY = this.ih * (phase === 'sunset' ? 0.38 : 0.22);
    const shift = Math.sin(t * this.motion.sunShift * calm) * 3;
    const sx = Math.floor(baseX + shift);
    const sy = Math.floor(baseY + shift * 0.4);
    const r = phase === 'sunset' ? 9 : 7;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= r * r) {
          ctx.fillStyle = d2 < (r - 2) * (r - 2) ? PAL.sunCore : PAL.sunGlow;
          ctx.fillRect(sx + dx, sy + dy, 1, 1);
        }
      }
    }
    ctx.fillStyle = `rgba(255, 220, 120, ${0.08 + Math.sin(t * 0.15) * 0.02})`;
    ctx.fillRect(0, 0, this.iw, Math.floor(this.ih * 0.5));
  }

  private drawCloudLayer(
    ctx: CanvasRenderingContext2D,
    t: number,
    speedMul: number,
    yFrac: number,
    shape: CloudDef,
    colors: ReturnType<typeof skyColors>,
  ): void {
    const span = this.iw + shape.w * 3;
    const scroll = wrapOffset(t * this.motion.cloudSpeed * speedMul * 12, span);
    const y = Math.floor(this.ih * yFrac);
    const slots = Math.ceil(this.iw / (shape.w + 40)) + 2;
    for (let i = -1; i < slots; i++) {
      const cx = Math.floor(i * (shape.w + 48) - scroll);
      this.blitCloud(ctx, cx, y, shape, colors);
    }
  }

  private blitCloud(
    ctx: CanvasRenderingContext2D,
    ox: number,
    oy: number,
    shape: CloudDef,
    colors: ReturnType<typeof skyColors>,
  ): void {
    for (const [px, py] of shape.pixels) {
      const shade = py >= shape.h - 3 ? PAL.cloudShadow : py <= 2 ? PAL.cloudLight : PAL.cloudMid;
      ctx.fillStyle = colors.warm > 0.5 && py <= 2 ? PAL.skyWarm : shade;
      ctx.fillRect(ox + px, oy + py, 1, 1);
    }
  }

  private drawMountains(ctx: CanvasRenderingContext2D, t: number, calm: number): void {
    const baseY = Math.floor(this.ih * 0.58);
    const parallax = Math.sin(t * 0.04 * calm) * 0.5;
    ctx.fillStyle = PAL.mountainFar;
    for (let x = 0; x < this.iw; x++) {
      const h =
        18 +
        Math.sin((x + parallax) * 0.04) * 8 +
        Math.sin((x + parallax) * 0.015) * 14 +
        Math.sin((x + parallax) * 0.08) * 4;
      ctx.fillRect(x, baseY - Math.floor(h), 1, Math.floor(h) + this.ih);
    }
    ctx.fillStyle = PAL.hill;
    const hillY = Math.floor(this.ih * 0.68);
    for (let x = 0; x < this.iw; x++) {
      const h = 10 + Math.sin((x + parallax * 2) * 0.06) * 6 + Math.sin(x * 0.02) * 8;
      ctx.fillRect(x, hillY - Math.floor(h), 1, Math.floor(h) + this.ih);
    }
    ctx.fillStyle = PAL.hillDark;
    ctx.fillRect(0, hillY + 8, this.iw, this.ih - hillY);
  }

  private drawWater(ctx: CanvasRenderingContext2D, t: number, calm: number): void {
    const waterTop = Math.floor(this.ih * 0.82);
    const ripple = Math.floor(t * this.motion.waterRipple * 18 * calm) % 4;
    for (let y = waterTop; y < this.ih; y++) {
      for (let x = 0; x < this.iw; x++) {
        const wave = ((x + ripple + y) & 3) === 0;
        ctx.fillStyle = wave ? PAL.waterLight : y % 2 === 0 ? PAL.water : PAL.waterDark;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  private drawTrees(ctx: CanvasRenderingContext2D, t: number, calm: number): void {
    const ground = Math.floor(this.ih * 0.78);
    for (const tree of this.trees) {
      const sway = this.layers.vegetation
        ? Math.sin(t * 1.2 * this.motion.vegSway * calm + tree.phase) * 1.5
        : 0;
      const x = Math.floor(tree.x);
      const s = tree.scale;
      const trunkH = Math.floor(14 * s);
      const trunkW = Math.max(2, Math.floor(3 * s));
      ctx.fillStyle = PAL.trunkDark;
      ctx.fillRect(x - Math.floor(trunkW / 2), ground - trunkH, trunkW, trunkH);
      ctx.fillStyle = PAL.trunk;
      ctx.fillRect(x - Math.floor(trunkW / 2) + 1, ground - trunkH, trunkW - 1, trunkH - 1);
      const canopyY = ground - trunkH - Math.floor(8 * s);
      const cw = Math.floor(16 * s);
      const ch = Math.floor(12 * s);
      const offX = Math.floor(sway);
      for (let dy = 0; dy < ch; dy++) {
        const rowW = Math.floor(cw * (1 - Math.abs(dy - ch / 2) / (ch / 2 + 1)));
        for (let dx = -rowW; dx <= rowW; dx++) {
          const shade = dy < ch * 0.35 ? PAL.leafLight : dy > ch * 0.65 ? PAL.leafDark : PAL.leaf;
          ctx.fillStyle = shade;
          ctx.fillRect(x + offX + dx, canopyY + dy, 1, 1);
        }
      }
    }
  }

  private drawGrass(ctx: CanvasRenderingContext2D, t: number, calm: number): void {
    const ground = Math.floor(this.ih * 0.88);
    for (const blade of this.grass) {
      const sway = Math.sin(t * 2.4 * this.motion.vegSway * calm + blade.phase) * 1.2;
      const x = Math.floor(blade.x);
      ctx.fillStyle = blade.h % 2 === 0 ? PAL.grass : PAL.grassDark;
      ctx.fillRect(x, ground - blade.h, 1, blade.h);
      ctx.fillRect(x + Math.floor(sway), ground - blade.h - 1, 1, 1);
      if (blade.h > 5 && blade.x % 19 < 2) {
        ctx.fillStyle = PAL.flower;
        ctx.fillRect(x + Math.floor(sway), ground - blade.h - 2, 1, 1);
      }
    }
  }

  private drawBirds(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = PAL.bird;
    for (const b of this.birds) {
      const flap = Math.sin(b.wing) > 0 ? -1 : 1;
      const x = Math.floor(b.x);
      const y = Math.floor(b.y);
      ctx.fillRect(x, y, 2, 1);
      ctx.fillRect(x - 1, y + flap, 1, 1);
      ctx.fillRect(x + 2, y + flap, 1, 1);
    }
  }

  private drawAtmosphere(ctx: CanvasRenderingContext2D, phase: TimePhase): void {
    const strength = this.prefs.atmosphere * (phase === 'night' ? 0.5 : 1);
    ctx.fillStyle = `rgba(200, 220, 240, ${0.06 * strength})`;
    ctx.fillRect(0, 0, this.iw, this.ih);
    const g = ctx.createLinearGradient(0, 0, 0, this.ih);
    g.addColorStop(0, `rgba(0,0,0,${0.08 * strength})`);
    g.addColorStop(0.45, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${0.18 * strength})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.iw, this.ih);
  }
}
