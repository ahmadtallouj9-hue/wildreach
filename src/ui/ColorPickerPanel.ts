import { hexToRgb01, rgb01ToHex } from '../modding/editorPalette';

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max < 1e-6 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}

const QUICK_SWATCHES = [
  '#ffffff', '#f5f0e0', '#e07a5f', '#f0a05a', '#e8c56a', '#f2e26a',
  '#9ee05a', '#27ae60', '#2d6a45', '#5ec4b0', '#4ecdc4', '#7aa2ff',
  '#3d5a9e', '#7b68c9', '#c9a0dc', '#e05aaa', '#f080a0', '#8b5a3c',
  '#888c92', '#3a3d42', '#1a1a1a',
];

/** Studio color picker — SV pad, hue bar, RGB + hex. */
export class ColorPickerPanel {
  readonly root: HTMLElement;
  private readonly svCanvas: HTMLCanvasElement;
  private readonly hueEl: HTMLInputElement;
  private readonly previewEl: HTMLElement;
  private readonly rInput: HTMLInputElement;
  private readonly gInput: HTMLInputElement;
  private readonly bInput: HTMLInputElement;
  private readonly hexInput: HTMLInputElement;
  private h = 28;
  private s = 0.76;
  private v = 0.92;
  private dragging = false;
  private onChange: (rgb: [number, number, number]) => void;

  constructor(onChange: (rgb: [number, number, number]) => void) {
    this.onChange = onChange;
    this.root = document.createElement('div');
    this.root.className = 'mod-color-panel';
    this.root.innerHTML = `
      <div class="mod-color-head">
        <p class="voxel-editor-label">Paint color</p>
        <span class="mod-color-hex-chip" aria-hidden="true">#EB8C38</span>
      </div>
      <canvas class="mod-sv-canvas" width="220" height="132" aria-label="Saturation and brightness"></canvas>
      <div class="mod-color-tools">
        <span class="mod-color-preview" aria-hidden="true"></span>
        <input type="range" class="mod-hue-slider" min="0" max="360" value="28" aria-label="Hue" />
      </div>
      <div class="mod-color-quick" role="group" aria-label="Quick colors"></div>
      <div class="mod-rgb-row">
        <label><span>R</span><input type="number" class="mod-rgb-r" min="0" max="255" value="235" /></label>
        <label><span>G</span><input type="number" class="mod-rgb-g" min="0" max="255" value="140" /></label>
        <label><span>B</span><input type="number" class="mod-rgb-b" min="0" max="255" value="56" /></label>
        <label class="mod-hex-label"><span>HEX</span><input type="text" class="mod-hex-input" maxlength="7" value="#EB8C38" spellcheck="false" /></label>
      </div>
      <button type="button" class="voxel-editor-btn mod-add-color-btn" data-action="add-color">+ Add color</button>`;

    this.svCanvas = this.root.querySelector('.mod-sv-canvas')!;
    this.hueEl = this.root.querySelector('.mod-hue-slider')!;
    this.previewEl = this.root.querySelector('.mod-color-preview')!;
    this.rInput = this.root.querySelector('.mod-rgb-r')!;
    this.gInput = this.root.querySelector('.mod-rgb-g')!;
    this.bInput = this.root.querySelector('.mod-rgb-b')!;
    this.hexInput = this.root.querySelector('.mod-hex-input')!;

    const quick = this.root.querySelector('.mod-color-quick')!;
    quick.innerHTML = QUICK_SWATCHES.map(
      (c) =>
        `<button type="button" class="mod-color-chip" data-hex="${c}" style="--c:${c}" title="${c}" aria-label="${c}"></button>`,
    ).join('');
    quick.querySelectorAll<HTMLButtonElement>('.mod-color-chip').forEach((btn) => {
      btn.addEventListener('click', () => this.setHex(btn.dataset.hex!));
    });

    this.hueEl.addEventListener('input', () => {
      this.h = Number(this.hueEl.value);
      this.paintSv();
      this.syncFromHsv(true);
    });

    const onRgb = () => {
      const r = clamp01(Number(this.rInput.value) / 255);
      const g = clamp01(Number(this.gInput.value) / 255);
      const b = clamp01(Number(this.bInput.value) / 255);
      const hsv = rgbToHsv(r, g, b);
      this.h = hsv.h;
      this.s = hsv.s;
      this.v = hsv.v;
      this.hueEl.value = String(Math.round(this.h));
      this.paintSv();
      this.updatePreview();
      this.onChange([r, g, b]);
    };
    this.rInput.addEventListener('change', onRgb);
    this.gInput.addEventListener('change', onRgb);
    this.bInput.addEventListener('change', onRgb);

    this.hexInput.addEventListener('change', () => {
      let raw = this.hexInput.value.trim();
      if (!raw.startsWith('#')) raw = `#${raw}`;
      if (/^#[0-9a-fA-F]{6}$/.test(raw)) this.setHex(raw);
      else this.syncFromHsv(false);
    });

    this.bindSv();
    this.paintSv();
    this.syncFromHsv(false);
  }

  getRgb(): [number, number, number] {
    return hsvToRgb(this.h, this.s, this.v);
  }

  getHex(): string {
    return rgb01ToHex(this.getRgb());
  }

  setRgb(rgb: [number, number, number]): void {
    const hsv = rgbToHsv(rgb[0], rgb[1], rgb[2]);
    this.h = hsv.h;
    this.s = hsv.s;
    this.v = hsv.v;
    this.hueEl.value = String(Math.round(this.h));
    this.paintSv();
    this.syncFromHsv(false);
  }

  setHex(hex: string): void {
    this.setRgb(hexToRgb01(hex));
    this.onChange(this.getRgb());
  }

  private bindSv(): void {
    const pick = (e: PointerEvent) => {
      const rect = this.svCanvas.getBoundingClientRect();
      this.s = clamp01((e.clientX - rect.left) / rect.width);
      this.v = clamp01(1 - (e.clientY - rect.top) / rect.height);
      this.paintSv();
      this.syncFromHsv(true);
    };
    this.svCanvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.svCanvas.setPointerCapture(e.pointerId);
      pick(e);
    });
    this.svCanvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      pick(e);
    });
    this.svCanvas.addEventListener('pointerup', () => {
      this.dragging = false;
    });
  }

  private paintSv(): void {
    const ctx = this.svCanvas.getContext('2d')!;
    const w = this.svCanvas.width;
    const h = this.svCanvas.height;
    const [hr, hg, hb] = hsvToRgb(this.h, 1, 1);
    const hue = `rgb(${Math.round(hr * 255)},${Math.round(hg * 255)},${Math.round(hb * 255)})`;

    const white = ctx.createLinearGradient(0, 0, w, 0);
    white.addColorStop(0, '#fff');
    white.addColorStop(1, hue);
    ctx.fillStyle = white;
    ctx.fillRect(0, 0, w, h);

    const black = ctx.createLinearGradient(0, 0, 0, h);
    black.addColorStop(0, 'rgba(0,0,0,0)');
    black.addColorStop(1, '#000');
    ctx.fillStyle = black;
    ctx.fillRect(0, 0, w, h);

    const x = this.s * w;
    const y = (1 - this.v) * h;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = this.getHex();
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private syncFromHsv(emit: boolean): void {
    const rgb = this.getRgb();
    this.rInput.value = String(Math.round(rgb[0] * 255));
    this.gInput.value = String(Math.round(rgb[1] * 255));
    this.bInput.value = String(Math.round(rgb[2] * 255));
    this.updatePreview();
    if (emit) this.onChange(rgb);
  }

  private updatePreview(): void {
    const hex = this.getHex();
    this.previewEl.style.background = hex;
    this.hexInput.value = hex.toUpperCase();
    const chip = this.root.querySelector('.mod-color-hex-chip');
    if (chip) chip.textContent = hex.toUpperCase();
  }
}
