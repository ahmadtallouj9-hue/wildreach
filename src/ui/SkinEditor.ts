import {
  FACE_LABELS,
  OUTFIT_PARTS,
  PART_LABELS,
  PART_UV,
  SKIN_PALETTE,
  SKIN_SIZE,
  SKIN_TONE_PARTS,
  applyBaseColorToParts,
  applyProfileCosmetics,
  cloneSkin,
  createDefaultSkin,
  decodeSkin,
  encodeSkin,
  floodFill,
  getPixel,
  setPixel,
  type SkinFace,
  type SkinPart,
} from '../player/SkinAtlas';
import type { Profile } from './prefs';
import { SkinPaint3D } from './SkinPaint3D';

export type SkinTool = 'pen' | 'eraser' | 'fill' | 'eyedrop';
export type BaseColorField =
  | 'skin'
  | 'outfit'
  | 'accent'
  | 'hair'
  | 'eyes'
  | 'shoes'
  | 'hairStyle'
  | 'all';
export type SkinEditMode = '2d' | '3d';

const EDIT_MODE_KEY = 'wildreach.skinEditMode';

function loadEditMode(): SkinEditMode {
  try {
    return localStorage.getItem(EDIT_MODE_KEY) === '2d' ? '2d' : '3d';
  } catch {
    return '3d';
  }
}

function saveEditMode(mode: SkinEditMode): void {
  try {
    localStorage.setItem(EDIT_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export interface SkinEditorOpts {
  skin: string;
  outfit: string;
  accent: string;
  pants: string;
  hair: string;
  eyes: string;
  shoes: string;
  hairStyle: Profile['hairStyle'];
  face: Profile['face'];
  facial: Profile['facial'];
  sleeves: Profile['sleeves'];
  cape: Profile['cape'];
  glasses: Profile['glasses'];
  style: Profile['style'];
  hat: Profile['hat'];
  skinData?: string;
  onChange: (pixels: Uint8ClampedArray, dataUrl: string) => void;
}

const PARTS: SkinPart[] = ['head', 'body', 'armR', 'armL', 'legR', 'legL', 'hat'];
const FACES: SkinFace[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

export class SkinEditor {
  readonly root: HTMLElement;
  private pixels: Uint8ClampedArray;
  private part: SkinPart = 'head';
  private face: SkinFace = 'front';
  private tool: SkinTool = 'pen';
  private brushSize = 1;
  private color = '#1a1a1a';
  private painting = false;
  private scale = 18;
  private readonly paint: HTMLCanvasElement;
  private readonly atlas: HTMLCanvasElement;
  private readonly onChange: SkinEditorOpts['onChange'];
  private base: {
    skin: string;
    outfit: string;
    accent: string;
    pants: string;
    hair: string;
    eyes: string;
    shoes: string;
    hairStyle: Profile['hairStyle'];
    face: Profile['face'];
    facial: Profile['facial'];
    sleeves: Profile['sleeves'];
  };
  private avatarProfile: Profile;
  private editMode: SkinEditMode = loadEditMode();
  private paint3d: SkinPaint3D | null = null;
  private readonly paint2dWrap: HTMLElement;
  private readonly paint3dMount: HTMLElement;

  constructor(opts: SkinEditorOpts) {
    this.onChange = opts.onChange;
    this.base = {
      skin: opts.skin,
      outfit: opts.outfit,
      accent: opts.accent,
      pants: opts.pants,
      hair: opts.hair,
      eyes: opts.eyes,
      shoes: opts.shoes,
      hairStyle: opts.hairStyle,
      face: opts.face,
      facial: opts.facial,
      sleeves: opts.sleeves,
    };
    this.avatarProfile = {
      name: 'Wanderer',
      skin: opts.skin,
      outfit: opts.outfit,
      pants: opts.pants,
      accent: opts.accent,
      hair: opts.hair,
      eyes: opts.eyes,
      shoes: opts.shoes,
      hairStyle: opts.hairStyle,
      face: opts.face,
      facial: opts.facial,
      sleeves: opts.sleeves,
      cape: opts.cape,
      glasses: opts.glasses,
      style: opts.style,
      hat: opts.hat,
    };
    this.pixels = createDefaultSkin(opts.skin, opts.outfit, opts.accent, this.base);

    this.root = document.createElement('div');
    this.root.className = 'skin-editor';
    this.root.innerHTML = `
      <div class="skin-editor-head">
        <div class="seg skin-edit-mode" role="group" aria-label="Editor mode">
          <button type="button" class="seg-btn" data-edit-mode="2d">2D grid</button>
          <button type="button" class="seg-btn" data-edit-mode="3d">3D model</button>
        </div>
      </div>
      <p class="skin-editor-hint">64×64 · paint on the grid or directly on the 3D player</p>
      <div class="skin-toolbar">
        <div class="seg skin-parts" role="group" aria-label="Body part"></div>
        <div class="seg skin-faces" role="group" aria-label="Face"></div>
      </div>
      <div class="skin-tools-row">
        <div class="skin-tools seg" role="group" aria-label="Tool">
          <button type="button" class="seg-btn" data-tool="pen">Pen</button>
          <button type="button" class="seg-btn" data-tool="eraser">Erase</button>
          <button type="button" class="seg-btn" data-tool="fill">Fill</button>
          <button type="button" class="seg-btn" data-tool="eyedrop">Pick</button>
        </div>
        <input type="color" class="skin-color" value="#1a1a1a" aria-label="Paint color" />
        <div class="seg skin-brush" role="group" aria-label="Brush size">
          <button type="button" class="seg-btn" data-brush="1">1×</button>
          <button type="button" class="seg-btn" data-brush="2">2×</button>
          <button type="button" class="seg-btn" data-brush="3">3×</button>
        </div>
      </div>
      <div class="skin-palette" role="group" aria-label="Colors"></div>
      <div class="skin-paint-3d-mount" hidden></div>
      <div class="skin-workspace">
        <div class="skin-paint-wrap skin-paint-2d">
          <div class="skin-paint-label">Head · Front</div>
          <canvas class="skin-paint" width="8" height="8"></canvas>
        </div>
        <div class="skin-side">
          <canvas class="skin-atlas" width="64" height="64" title="Full skin"></canvas>
          <div class="skin-actions">
            <button type="button" class="menu-btn quiet" data-act="reset">Reset</button>
            <button type="button" class="menu-btn quiet" data-act="clear">Clear face</button>
            <label class="menu-btn quiet skin-import">Import<input type="file" accept="image/png,image/*" hidden /></label>
            <button type="button" class="menu-btn quiet" data-act="export">Export</button>
          </div>
        </div>
      </div>
    `;

    this.paint = this.root.querySelector('.skin-paint')!;
    this.atlas = this.root.querySelector('.skin-atlas')!;
    this.paint2dWrap = this.root.querySelector('.skin-paint-2d')!;
    this.paint3dMount = this.root.querySelector('.skin-paint-3d-mount')!;

    this.fillParts();
    this.fillFaces();
    this.fillPalette();
    this.bindTools();
    this.bindEditMode();
    this.bindPaint();
    this.bindActions();
    this.syncSeg();
    this.setEditMode(this.editMode, false);

    if (opts.skinData) {
      void decodeSkin(opts.skinData)
        .then((p) => {
          this.pixels = p;
          this.redraw();
          this.emit();
        })
        .catch(() => this.redraw());
    } else {
      this.redraw();
    }
  }

  setBaseColors(
    skin: string,
    outfit: string,
    accent: string,
    field: BaseColorField = 'all',
    extras?: Partial<
      Pick<Profile, 'hair' | 'eyes' | 'shoes' | 'hairStyle' | 'pants' | 'face' | 'facial' | 'sleeves'>
    >,
  ): void {
    const prev = { ...this.base };
    if (extras) Object.assign(this.base, extras);

    if (field === 'all') {
      this.base = {
        skin,
        outfit,
        accent,
        pants: extras?.pants ?? this.base.pants,
        hair: extras?.hair ?? this.base.hair,
        eyes: extras?.eyes ?? this.base.eyes,
        shoes: extras?.shoes ?? this.base.shoes,
        hairStyle: extras?.hairStyle ?? this.base.hairStyle,
        face: extras?.face ?? this.base.face,
        facial: extras?.facial ?? this.base.facial,
        sleeves: extras?.sleeves ?? this.base.sleeves,
      };
      this.pixels = createDefaultSkin(skin, outfit, accent, this.base);
    } else {
      if (field === 'skin') {
        applyBaseColorToParts(this.pixels, SKIN_TONE_PARTS, prev.skin, skin);
        this.base.skin = skin;
      }
      if (field === 'outfit') {
        applyBaseColorToParts(this.pixels, OUTFIT_PARTS, prev.outfit, outfit);
        this.base.outfit = outfit;
      }
      if (field === 'accent') this.base.accent = accent;
      if (field === 'hair') this.base.hair = extras?.hair ?? skin;
      if (field === 'eyes') this.base.eyes = extras?.eyes ?? skin;
      if (field === 'shoes') this.base.shoes = extras?.shoes ?? skin;
      if (field === 'hairStyle') this.base.hairStyle = extras?.hairStyle ?? 'short';
      if (
        field === 'hair' ||
        field === 'eyes' ||
        field === 'shoes' ||
        field === 'hairStyle' ||
        field === 'outfit' ||
        field === 'skin'
      ) {
        applyProfileCosmetics(this.pixels, this.base);
      }
    }

    this.redraw();
    this.emit();
  }

  applyCosmetics(
    profile: Pick<
      Profile,
      'hair' | 'eyes' | 'shoes' | 'hairStyle' | 'pants' | 'face' | 'facial' | 'sleeves' | 'skin' | 'outfit'
    >,
  ): void {
    this.base.hair = profile.hair;
    this.base.eyes = profile.eyes;
    this.base.shoes = profile.shoes;
    this.base.hairStyle = profile.hairStyle;
    this.base.pants = profile.pants;
    this.base.face = profile.face;
    this.base.facial = profile.facial;
    this.base.sleeves = profile.sleeves;
    this.base.skin = profile.skin;
    this.base.outfit = profile.outfit;
    applyProfileCosmetics(this.pixels, this.base);
    this.redraw();
    this.emit();
  }

  getDataUrl(): string {
    return encodeSkin(this.pixels);
  }

  getPixels(): Uint8ClampedArray {
    return cloneSkin(this.pixels);
  }

  syncAvatarProfile(profile: Profile): void {
    this.avatarProfile = { ...profile };
    this.paint3d?.applyProfile(profile);
  }

  randomize(profile: Profile): void {
    this.base = {
      skin: profile.skin,
      outfit: profile.outfit,
      accent: profile.accent,
      pants: profile.pants,
      hair: profile.hair,
      eyes: profile.eyes,
      shoes: profile.shoes,
      hairStyle: profile.hairStyle,
      face: profile.face,
      facial: profile.facial,
      sleeves: profile.sleeves,
    };
    this.avatarProfile = { ...profile };
    this.pixels = createDefaultSkin(profile.skin, profile.outfit, profile.accent, this.base);
    this.redraw();
    this.paint3d?.applyProfile(profile);
    this.emit();
  }

  applyPreset(profile: Profile, pixels: Uint8ClampedArray): void {
    this.base = {
      skin: profile.skin,
      outfit: profile.outfit,
      accent: profile.accent,
      pants: profile.pants,
      hair: profile.hair,
      eyes: profile.eyes,
      shoes: profile.shoes,
      hairStyle: profile.hairStyle,
      face: profile.face,
      facial: profile.facial,
      sleeves: profile.sleeves,
    };
    this.avatarProfile = { ...profile };
    this.pixels = cloneSkin(pixels);
    this.redraw();
    this.paint3d?.applyProfile(profile);
    this.emit();
  }

  setActive(active: boolean): void {
    if (this.editMode !== '3d') return;
    if (active) {
      requestAnimationFrame(() => {
        this.paint3d?.layout();
        this.paint3d?.start();
      });
    } else {
      this.paint3d?.stop();
    }
  }

  private ensurePaint3d(): SkinPaint3D | null {
    if (this.paint3d) return this.paint3d;
    this.paint3d = new SkinPaint3D({
      onSelect: (part, face) => {
        this.part = part;
        this.face = face;
        this.syncSeg();
        this.redrawAtlas();
        const label = this.root.querySelector('.skin-paint-label');
        if (label) label.textContent = `${PART_LABELS[part]} · ${FACE_LABELS[face]}`;
      },
      onStroke: (part, face, ax, ay) => {
        this.part = part;
        this.face = face;
        this.applyStrokeAt(ax, ay);
      },
    });
    this.paint3d.mount(this.paint3dMount);
    this.paint3d.applyProfile({ ...this.avatarProfile, skinData: this.getDataUrl() });
    this.paint3d.syncPixels(this.pixels);
    return this.paint3d;
  }

  private bindEditMode(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-edit-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.setEditMode(btn.dataset.editMode as SkinEditMode);
      });
    });
  }

  private setEditMode(mode: SkinEditMode, save = true): void {
    this.editMode = mode;
    if (save) saveEditMode(mode);
    const is3d = mode === '3d';
    this.root.classList.toggle('mode-3d', is3d);
    this.paint2dWrap.hidden = is3d;
    this.paint3dMount.hidden = !is3d;
    this.root.querySelectorAll<HTMLButtonElement>('[data-edit-mode]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.editMode === mode);
    });
    if (is3d) {
      const p3 = this.ensurePaint3d();
      requestAnimationFrame(() => {
        p3?.layout();
        p3?.start();
      });
    } else {
      this.paint3d?.stop();
      this.redrawPaint();
    }
  }

  private applyStrokeAt(ax: number, ay: number): void {
    if (this.tool === 'fill' || this.tool === 'eyedrop') {
      this.paintPixel(ax, ay);
      return;
    }
    for (let dy = 0; dy < this.brushSize; dy++) {
      for (let dx = 0; dx < this.brushSize; dx++) {
        this.paintPixel(ax + dx, ay + dy, false);
      }
    }
    this.redraw();
    this.emit();
  }

  private paintPixel(ax: number, ay: number, finish = true): void {
    const rect = PART_UV[this.part][this.face];
    if (ax < rect.x || ay < rect.y || ax >= rect.x + rect.w || ay >= rect.y + rect.h) return;

    if (this.tool === 'eyedrop') {
      const [r, g, b, a] = getPixel(this.pixels, ax, ay);
      if (a < 8) this.tool = 'eraser';
      else {
        this.color = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
        this.root.querySelector<HTMLInputElement>('.skin-color')!.value = this.color;
        this.tool = 'pen';
      }
      this.syncSeg();
      return;
    }
    if (this.tool === 'fill') {
      floodFill(this.pixels, rect, ax, ay, ...this.rgba());
    } else if (this.tool === 'eraser') {
      if (this.part === 'hat') setPixel(this.pixels, ax, ay, 0, 0, 0, 0);
      else setPixel(this.pixels, ax, ay, ...this.baseRgb(this.part));
    } else {
      setPixel(this.pixels, ax, ay, ...this.rgba());
    }
    if (finish) {
      this.redraw();
      this.emit();
    }
  }

  private fillParts(): void {
    const row = this.root.querySelector('.skin-parts')!;
    row.innerHTML = PARTS.map(
      (p) => `<button type="button" class="seg-btn" data-part="${p}">${PART_LABELS[p]}</button>`,
    ).join('');
    row.querySelectorAll<HTMLButtonElement>('[data-part]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.part = btn.dataset.part as SkinPart;
        this.syncSeg();
        this.redrawPaint();
        this.redrawAtlas();
      });
    });
  }

  private fillFaces(): void {
    const row = this.root.querySelector('.skin-faces')!;
    row.innerHTML = FACES.map(
      (f) => `<button type="button" class="seg-btn" data-face="${f}">${FACE_LABELS[f]}</button>`,
    ).join('');
    row.querySelectorAll<HTMLButtonElement>('[data-face]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.face = btn.dataset.face as SkinFace;
        this.syncSeg();
        this.redrawPaint();
        this.redrawAtlas();
      });
    });
  }

  private fillPalette(): void {
    const pal = this.root.querySelector('.skin-palette')!;
    pal.innerHTML = SKIN_PALETTE.map((c) => {
      const clear = c === '#00000000';
      return `<button type="button" class="skin-swatch${clear ? ' erase' : ''}" data-c="${c}" style="background-color:${clear ? 'transparent' : c}" title="${clear ? 'Transparent' : c}"></button>`;
    }).join('');
    pal.querySelectorAll<HTMLButtonElement>('.skin-swatch').forEach((btn) => {
      btn.addEventListener('click', () => {
        const c = btn.dataset.c!;
        if (c === '#00000000') {
          this.tool = 'eraser';
        } else {
          this.color = c.slice(0, 7);
          this.root.querySelector<HTMLInputElement>('.skin-color')!.value = this.color;
          if (this.tool === 'eraser' || this.tool === 'eyedrop') this.tool = 'pen';
        }
        this.syncSeg();
      });
    });
  }

  private bindTools(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.tool = btn.dataset.tool as SkinTool;
        this.syncSeg();
      });
    });
    this.root.querySelector<HTMLInputElement>('.skin-color')!.addEventListener('input', (e) => {
      this.color = (e.target as HTMLInputElement).value;
      if (this.tool === 'eraser') this.tool = 'pen';
      this.syncSeg();
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-brush]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.brushSize = Number(btn.dataset.brush) || 1;
        this.syncSeg();
      });
    });
  }

  private bindPaint(): void {
    const cellAt = (e: PointerEvent) => {
      const box = this.paint.getBoundingClientRect();
      const uv = PART_UV[this.part][this.face];
      const lx = Math.floor(((e.clientX - box.left) / Math.max(1, box.width)) * uv.w);
      const ly = Math.floor(((e.clientY - box.top) / Math.max(1, box.height)) * uv.h);
      return {
        x: uv.x + Math.max(0, Math.min(uv.w - 1, lx)),
        y: uv.y + Math.max(0, Math.min(uv.h - 1, ly)),
      };
    };

    const stroke = (e: PointerEvent) => {
      const { x, y } = cellAt(e);
      this.applyStrokeAt(x, y);
    };

    this.paint.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.painting = true;
      this.paint.setPointerCapture(e.pointerId);
      stroke(e);
    });
    this.paint.addEventListener('pointermove', (e) => {
      if (!this.painting) return;
      if (this.tool === 'fill' || this.tool === 'eyedrop') return;
      stroke(e);
    });
    const stop = () => {
      this.painting = false;
    };
    this.paint.addEventListener('pointerup', stop);
    this.paint.addEventListener('pointercancel', stop);
  }

  private bindActions(): void {
    this.root.querySelector('[data-act="reset"]')!.addEventListener('click', () => {
      this.setBaseColors(this.base.skin, this.base.outfit, this.base.accent, 'all', this.base);
    });
    this.root.querySelector('[data-act="clear"]')!.addEventListener('click', () => {
      const rect = PART_UV[this.part][this.face];
      const clearHat = this.part === 'hat';
      for (let y = rect.y; y < rect.y + rect.h; y++) {
        for (let x = rect.x; x < rect.x + rect.w; x++) {
          if (clearHat) setPixel(this.pixels, x, y, 0, 0, 0, 0);
          else setPixel(this.pixels, x, y, ...this.baseRgb(this.part));
        }
      }
      this.redraw();
      this.emit();
    });
    this.root.querySelector('[data-act="export"]')!.addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = encodeSkin(this.pixels);
      a.download = 'wildreach-skin.png';
      a.click();
    });
    const input = this.root.querySelector<HTMLInputElement>('.skin-import input')!;
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        void decodeSkin(String(reader.result))
          .then((p) => {
            this.pixels = p;
            this.redraw();
            this.emit();
          })
          .catch(() => undefined);
      };
      reader.readAsDataURL(file);
      input.value = '';
    });
  }

  private rgba(): [number, number, number, number] {
    const h = this.color.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16) || 0,
      parseInt(h.slice(2, 4), 16) || 0,
      parseInt(h.slice(4, 6), 16) || 0,
      255,
    ];
  }

  private baseRgb(part: SkinPart): [number, number, number, number] {
    const hex =
      part === 'body' || part === 'legR' || part === 'legL' ? this.base.outfit : this.base.skin;
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16) || 232,
      parseInt(h.slice(2, 4), 16) || 196,
      parseInt(h.slice(4, 6), 16) || 168,
      255,
    ];
  }

  private syncSeg(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-part]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.part === this.part);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-face]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.face === this.face);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tool === this.tool);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-brush]').forEach((btn) => {
      btn.classList.toggle('active', Number(btn.dataset.brush) === this.brushSize);
    });
    const pick = this.color.toLowerCase();
    this.root.querySelectorAll<HTMLButtonElement>('.skin-swatch').forEach((btn) => {
      const c = btn.dataset.c!;
      btn.classList.toggle('active', !c.endsWith('00') && c.slice(0, 7).toLowerCase() === pick);
    });
  }

  private redraw(): void {
    this.redrawPaint();
    this.redrawAtlas();
    this.syncSeg();
  }

  private redrawPaint(): void {
    const rect = PART_UV[this.part][this.face];
    this.scale = rect.w <= 4 ? 32 : 24;
    const px = this.scale;
    this.paint.width = rect.w * px;
    this.paint.height = rect.h * px;
    this.paint.style.width = `${this.paint.width}px`;
    this.paint.style.height = `${this.paint.height}px`;

    const label = this.root.querySelector('.skin-paint-label');
    if (label) label.textContent = `${PART_LABELS[this.part]} · ${FACE_LABELS[this.face]}`;

    const ctx = this.paint.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;

    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#5a6e6a' : '#3e4f4b';
        ctx.fillRect(x * px, y * px, px, px);
      }
    }

    let painted = 0;
    for (let y = 0; y < rect.h; y++) {
      for (let x = 0; x < rect.w; x++) {
        const [r, g, b, a] = getPixel(this.pixels, rect.x + x, rect.y + y);
        if (a > 0) {
          painted++;
          ctx.fillStyle = `rgba(${r},${g},${b},${a / 255})`;
          ctx.fillRect(x * px, y * px, px, px);
        }
      }
    }

    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= rect.w; x++) {
      ctx.beginPath();
      ctx.moveTo(x * px + 0.5, 0);
      ctx.lineTo(x * px + 0.5, rect.h * px);
      ctx.stroke();
    }
    for (let y = 0; y <= rect.h; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * px + 0.5);
      ctx.lineTo(rect.w * px, y * px + 0.5);
      ctx.stroke();
    }

    if (painted === 0) {
      ctx.fillStyle = 'rgba(10, 18, 16, 0.55)';
      ctx.fillRect(0, 0, this.paint.width, this.paint.height);
      ctx.fillStyle = '#d7efe6';
      ctx.font = '600 12px IBM Plex Sans, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Empty — paint here', this.paint.width / 2, this.paint.height / 2);
    }
  }

  private redrawAtlas(): void {
    const ctx = this.atlas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SKIN_SIZE, SKIN_SIZE);
    const img = ctx.createImageData(SKIN_SIZE, SKIN_SIZE);
    img.data.set(this.pixels);
    ctx.putImageData(img, 0, 0);
    const rect = PART_UV[this.part][this.face];
    ctx.strokeStyle = '#5ec4b0';
    ctx.lineWidth = 1;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
  }

  private emit(): void {
    this.paint3d?.syncPixels(this.pixels);
    this.onChange(cloneSkin(this.pixels), encodeSkin(this.pixels));
  }
}
