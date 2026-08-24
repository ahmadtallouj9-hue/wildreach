/** Main-menu sky: 2D canvas cover blit + wrapping cloud layers. */
export type MainMenuSkySpeeds = readonly [number, number, number];

export interface MainMenuSkyOptions {
  cloudSpeed?: MainMenuSkySpeeds;
}

const ASSET_V = '9';
const BASE_URL = `/menu-sky-base.png?v=${ASSET_V}`;
const CLOUD_URLS = [
  `/menu-sky-clouds-0.png?v=${ASSET_V}`,
  `/menu-sky-clouds-1.png?v=${ASSET_V}`,
  `/menu-sky-clouds-2.png?v=${ASSET_V}`,
] as const;

/** Pixels per second at 1080p-height, high/mid/low clouds. */
const DEFAULT_SPEED: MainMenuSkySpeeds = [18, 32, 48];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed ${url}`));
    img.src = url;
  });
}

/** Animated menu sky. */
export class MainMenuSky {
  readonly root: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null = null;
  private base: HTMLImageElement | null = null;
  private clouds: HTMLImageElement[] = [];
  private speeds: MainMenuSkySpeeds;
  private running = false;
  private raf = 0;
  private t0 = 0;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private ready = false;
  private onResize = (): void => this.resize();
  private ro: ResizeObserver | null = null;

  constructor(opts: MainMenuSkyOptions = {}) {
    this.speeds = opts.cloudSpeed ?? DEFAULT_SPEED;
    this.root = document.createElement('div');
    this.root.className = 'menu-sky-stack';
    this.root.setAttribute('aria-hidden', 'true');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'menu-sky-canvas';
    this.root.append(this.canvas);
  }

  setCloudSpeed(speed: MainMenuSkySpeeds): void {
    this.speeds = speed;
  }

  mount(host: HTMLElement): void {
    host.replaceChildren(this.root);
    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    window.addEventListener('resize', this.onResize);
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    requestAnimationFrame(() => this.resize());
    void this.load();
  }

  start(): void {
    this.resize();
    this.running = true;
    if (this.raf) return;
    this.t0 = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      this.draw((now - this.t0) / 1000);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose(): void {
    this.stop();
    this.ro?.disconnect();
    this.ro = null;
    window.removeEventListener('resize', this.onResize);
    this.root.remove();
  }

  private async load(): Promise<void> {
    try {
      this.base = await loadImage(BASE_URL);
      this.clouds = [];
      for (const url of CLOUD_URLS) this.clouds.push(await loadImage(url));
      this.ready = true;
      this.draw(0);
      if (this.running && !this.raf) this.start();
    } catch (e) {
      console.warn('Menu sky failed to load', e);
    }
  }

  private resize(): void {
    const parent = this.root.parentElement ?? this.root;
    let w = parent.clientWidth;
    let h = parent.clientHeight;
    if (w < 2 || h < 2) {
      w = window.innerWidth;
      h = window.innerHeight;
    }
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const bw = Math.floor(w * this.dpr);
    const bh = Math.floor(h * this.dpr);
    if (w === this.w && h === this.h && this.canvas.width === bw) return;
    this.w = w;
    this.h = h;
    this.canvas.width = bw;
    this.canvas.height = bh;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx?.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  private cover(imgW: number, imgH: number): { dx: number; dy: number; dw: number; dh: number } {
    const scale = Math.max(this.w / imgW, this.h / imgH);
    const dw = imgW * scale;
    const dh = imgH * scale;
    return { dx: (this.w - dw) / 2, dy: (this.h - dh) / 2, dw, dh };
  }

  private draw(t: number): void {
    const ctx = this.ctx;
    const base = this.base;
    if (!ctx || !base || !this.ready || this.clouds.length < 3) return;

    ctx.imageSmoothingEnabled = false;

    const { dx, dy, dw, dh } = this.cover(base.naturalWidth, base.naturalHeight);
    ctx.fillStyle = '#1470c3';
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.drawImage(base, dx, dy, dw, dh);

    for (let i = 0; i < 3; i++) {
      const cloud = this.clouds[i];
      if (!cloud) continue;
      const shift = -((t * this.speeds[i]) % dw);
      ctx.drawImage(cloud, dx + shift, dy, dw, dh);
      ctx.drawImage(cloud, dx + shift + dw, dy, dw, dh);
    }
  }
}

export { MainMenuSky as TitleSky };
