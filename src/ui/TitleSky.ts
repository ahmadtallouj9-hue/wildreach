/** Crisp canvas title-sky with drifting bubble clouds (no CSS blur). */
export class TitleSky {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private running = false;
  private t0 = 0;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private clouds: Array<{
    x: number;
    y: number;
    s: number;
    speed: number;
    tone: 0 | 1 | 2;
    seed: number;
  }> = [];
  private onResize = (): void => this.resize();
  private ro: ResizeObserver | null = null;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'title-sky';
    this.canvas.setAttribute('aria-hidden', 'true');
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2d canvas unavailable');
    this.ctx = ctx;
  }

  mount(host: HTMLElement): void {
    host.replaceChildren(this.canvas);
    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    window.addEventListener('resize', this.onResize);
    requestAnimationFrame(() => this.resize());
  }

  start(): void {
    this.resize();
    if (this.running) return;
    this.running = true;
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
    this.canvas.remove();
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    let w = parent?.clientWidth ?? 0;
    let h = parent?.clientHeight ?? 0;
    if (w < 2 || h < 2) {
      w = window.innerWidth;
      h = window.innerHeight;
    }
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    if (w === this.w && h === this.h && this.canvas.width > 1) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.seedClouds();
  }

  private seedClouds(): void {
    const list: TitleSky['clouds'] = [];
    const rows = [
      { count: 6, y0: 0.08, y1: 0.32, s0: 0.55, s1: 0.9, speed: 18, tone: 0 as const },
      { count: 7, y0: 0.28, y1: 0.55, s0: 0.7, s1: 1.15, speed: 28, tone: 1 as const },
      { count: 5, y0: 0.48, y1: 0.72, s0: 0.85, s1: 1.35, speed: 40, tone: 2 as const },
    ];
    let n = 0;
    for (const row of rows) {
      for (let i = 0; i < row.count; i++) {
        const u = (i + 0.35) / row.count;
        list.push({
          x: u * this.w * 1.35 - this.w * 0.15,
          y: (row.y0 + (row.y1 - row.y0) * ((n * 37) % 100) / 100) * this.h,
          s: row.s0 + ((n * 19) % 100) / 100 * (row.s1 - row.s0),
          speed: row.speed * (0.85 + ((n * 13) % 30) / 100),
          tone: row.tone,
          seed: n * 97 + 11,
        });
        n++;
      }
    }
    this.clouds = list;
  }

  private draw(t: number): void {
    const { ctx, w, h } = this;
    // Sky
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#3a74cc');
    g.addColorStop(0.35, '#5e92df');
    g.addColorStop(0.58, '#a8a9c8');
    g.addColorStop(0.78, '#e2a890');
    g.addColorStop(1, '#f0b890');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Sun (hard disk + soft rim via solid rings, no blur filter)
    const sx = w * 0.5;
    const sy = h * 0.92;
    const r = Math.min(w, h) * 0.22;
    const rings: Array<[number, string]> = [
      [1.55, 'rgba(255,150,100,0.18)'],
      [1.28, 'rgba(255,180,120,0.28)'],
      [1.08, 'rgba(255,210,150,0.45)'],
      [1.0, '#ffe8b8'],
      [0.72, '#fff6e4'],
      [0.42, '#ffffff'],
    ];
    for (const [k, color] of rings) {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(sx, sy, r * k, 0, Math.PI * 2);
      ctx.fill();
    }

    // Clouds
    for (const c of this.clouds) {
      const x = ((c.x + t * c.speed) % (w + 280)) - 140;
      this.paintCloud(x, c.y, c.s, c.tone, c.seed);
    }
  }

  private paintCloud(x: number, y: number, scale: number, tone: 0 | 1 | 2, seed: number): void {
    const { ctx } = this;
    const palette = [
      ['#9db6d4', '#c8d7e8', '#eaf1f8'],
      ['#b0acc5', '#d2cde0', '#f0ebf5'],
      ['#c9ae9f', '#e3c9bb', '#f6e8df'],
    ][tone];
    const bumps = [
      [0.0, 0.12, 0.38],
      [0.28, -0.08, 0.46],
      [0.58, 0.02, 0.4],
      [0.86, 0.14, 0.3],
      [0.18, 0.22, 0.28],
      [0.48, 0.24, 0.32],
      [0.72, 0.2, 0.26],
    ];
    const base = 92 * scale;
    ctx.save();
    ctx.translate(x, y);
    // underside
    ctx.fillStyle = palette[0];
    for (const [bx, by, br] of bumps) {
      ctx.beginPath();
      ctx.arc(bx * base * 2.1, by * base + 6 * scale, br * base, 0, Math.PI * 2);
      ctx.fill();
    }
    // mid
    ctx.fillStyle = palette[1];
    for (let i = 0; i < bumps.length; i++) {
      const [bx, by, br] = bumps[i];
      const j = (seed + i * 3) % 5;
      ctx.beginPath();
      ctx.arc(bx * base * 2.1, by * base - j, br * base * 0.92, 0, Math.PI * 2);
      ctx.fill();
    }
    // highlight
    ctx.fillStyle = palette[2];
    for (let i = 0; i < 4; i++) {
      const [bx, by, br] = bumps[i];
      ctx.beginPath();
      ctx.arc(bx * base * 2.1 - 4, by * base - 8 * scale, br * base * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
