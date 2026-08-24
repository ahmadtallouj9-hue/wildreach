/** Main-menu sky: HD artwork via CSS background (sharp, correct orientation). */
export type MainMenuSkySpeeds = readonly [number, number, number];

export interface MainMenuSkyOptions {
  cloudSpeed?: MainMenuSkySpeeds;
}

const ASSET_V = '5';
const ART_URL = `/menu-sky-source-hd.png?v=${ASSET_V}`;

/** Menu sky background. */
export class MainMenuSky {
  readonly root: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;

  constructor(_opts: MainMenuSkyOptions = {}) {
    this.root = document.createElement('div');
    this.root.className = 'menu-sky-stack';
    this.root.setAttribute('aria-hidden', 'true');
    this.root.style.backgroundImage = `url("${ART_URL}")`;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'menu-sky-canvas menu-sky-canvas--unused';
    this.canvas.hidden = true;
    this.root.append(this.canvas);
  }

  setCloudSpeed(_speed: MainMenuSkySpeeds): void {}

  setCloudDrift(_drift: MainMenuSkySpeeds): void {}

  mount(host: HTMLElement): void {
    host.replaceChildren(this.root);
  }

  start(): void {}

  stop(): void {}

  dispose(): void {
    this.root.remove();
  }
}

export { MainMenuSky as TitleSky };
