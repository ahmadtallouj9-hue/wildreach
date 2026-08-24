/** Main-menu sky: full artwork + clipped ping-pong cloud drift (no tile seams). */
export type MainMenuSkySpeeds = readonly [number, number, number];

export interface MainMenuSkyOptions {
  /** Oscillation period in seconds per layer (high / mid / low). */
  cloudSpeed?: MainMenuSkySpeeds;
}

const ASSET_V = '10';
const BASE_URL = `/menu-sky-base.png?v=${ASSET_V}`;
const CLOUD_URLS = [
  `/menu-sky-clouds-0.png?v=${ASSET_V}`,
  `/menu-sky-clouds-1.png?v=${ASSET_V}`,
  `/menu-sky-clouds-2.png?v=${ASSET_V}`,
] as const;

/** Seconds per full drift cycle. */
const DEFAULT_SECONDS: MainMenuSkySpeeds = [90, 65, 45];

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
  private periods = DEFAULT_SECONDS;
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
    this.periods = opts.cloudSpeed ?? DEFAULT_SECONDS;
    this.root = document.createElement('div');
    this.root.className = 'menu-sky-stack';
    this.root.setAttribute('aria-hidden', 'true');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'menu-sky-canvas';
    this.root.append(this.canvas);
  }

  setCloudSpeed(seconds: MainMenuSkySpeeds): void {
    this.periods = seconds;
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
    if (this.ready) this.draw(0);
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

  /** Fit art to full screen height; letterbox sides. */
  private fit(imgW: number, imgH: number): { dx: number; dy: number; dw: number; dh: number } {
    const scale = this.h / imgH;
    const dw = imgW * scale;
    const dh = this.h;
    return { dx: (this.w - dw) / 2, dy: 0, dw, dh };
  }

  private drift(t: number, period: number, amount: number): number {
    const wave = Math.sin((t / period) * Math.PI * 2);
    return wave * amount;
  }

  private draw(t: number): void {
    const ctx = this.ctx;
    const base = this.base;
    if (!ctx || !base || !this.ready || this.clouds.length < 3) return;

    ctx.imageSmoothingEnabled = false;
    const { dx, dy, dw, dh } = this.fit(base.naturalWidth, base.naturalHeight);

    const edge = ctx.createLinearGradient(0, 0, 0, this.h);
    edge.addColorStop(0, '#1a5cb0');
    edge.addColorStop(0.55, '#7a88c0');
    edge.addColorStop(1, '#efb080');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, this.w, this.h);

    ctx.save();
    ctx.beginPath();
    ctx.rect(dx, dy, dw, dh);
    ctx.clip();

    ctx.drawImage(base, dx, dy, dw, dh);

    const driftPx = dw * 0.028;
    for (let i = 0; i < 3; i++) {
      const cloud = this.clouds[i];
      if (!cloud) continue;
      const shift = this.drift(t, this.periods[i]!, driftPx * (0.75 + i * 0.2));
      ctx.drawImage(cloud, dx + shift, dy, dw, dh);
    }

    ctx.restore();
  }
}

export { MainMenuSky as TitleSky };
