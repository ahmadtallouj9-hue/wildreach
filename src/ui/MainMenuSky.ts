/** Main-menu sky: looping pixel-art clouds drift using an MP4 plate. */
export type MainMenuSkySpeeds = readonly [number, number, number];

export interface MainMenuSkyOptions {
  /** Seconds to drift one art panel (higher = slower). */
  cloudSpeed?: MainMenuSkySpeeds;
}

const ASSET_V = '17';
const VIDEO_URL = `/menu-sky.mp4?v=${ASSET_V}`;
/** Encode length (seconds) used when generating `public/menu-sky.mp4`. */
const DEFAULT_VIDEO_SECONDS = 10;

/** Animated menu sky. */
export class MainMenuSky {
  readonly root: HTMLDivElement;
  readonly video: HTMLVideoElement;
  private running = false;
  private ready = false;
  private ro: ResizeObserver | null = null;
  private onResize = (): void => {
    // No-op: MP4 scales with CSS `object-fit: cover`.
  };

  // Optional playback rate adjustment (menu currently doesn't wire it up).
  private encodedSeconds = DEFAULT_VIDEO_SECONDS;
  private targetSeconds: number | null = null;

  constructor(opts: MainMenuSkyOptions = {}) {
    this.root = document.createElement('div');
    this.root.className = 'menu-sky-stack';
    this.root.setAttribute('aria-hidden', 'true');

    this.video = document.createElement('video');
    this.video.className = 'menu-sky-video';
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';
    this.video.setAttribute('aria-hidden', 'true');
    this.root.append(this.video);

    const s = opts.cloudSpeed?.[0];
    if (s && Number.isFinite(s) && s > 0) this.targetSeconds = s;
  }

  setCloudSpeed(seconds: MainMenuSkySpeeds): void {
    const s = seconds?.[0];
    if (!s || !Number.isFinite(s) || s <= 0) return;
    this.targetSeconds = s;
    this.applyPlaybackRate();
  }

  mount(host: HTMLElement): void {
    host.replaceChildren(this.root);
    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    window.addEventListener('resize', this.onResize);
    requestAnimationFrame(() => this.resize());
    void this.load();
  }

  start(): void {
    this.running = true;
    if (!this.ready) return;
    void this.video.play().catch(() => {
      // Autoplay can fail without user gesture in some environments.
    });
  }

  stop(): void {
    this.running = false;
    this.video.pause();
    // Reset so the motion starts consistently when returning to the menu.
    this.video.currentTime = 0;
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
      await new Promise<void>((resolve, reject) => {
        const onError = () => reject(new Error(`failed ${VIDEO_URL}`));
        const onCanPlay = () => resolve();
        this.video.addEventListener('error', onError, { once: true });
        this.video.addEventListener('canplay', onCanPlay, { once: true });
        this.video.src = VIDEO_URL;
        this.video.load();
      });
      this.ready = true;
      this.applyPlaybackRate();
      if (this.running) this.start();
    } catch (e) {
      console.warn('Menu sky video failed to load', e);
    }
  }

  private resize(): void {
    // No-op: object-fit handles cropping and scaling.
  }

  private applyPlaybackRate(): void {
    if (!this.ready || !this.targetSeconds) return;
    this.video.playbackRate = this.encodedSeconds / this.targetSeconds;
  }
}

export { MainMenuSky as TitleSky };
