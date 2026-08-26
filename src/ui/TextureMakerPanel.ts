import {
  CUSTOM_TEX_SIZE,
  solidPixels,
  type CustomMaterialPalette,
} from '../modding/CustomMaterials';
import type { VoxelFacePaintHit } from '../modding/RaycastToUV';
import type { TextureAtlasManager } from '../modding/TextureAtlasManager';
import {
  strokeVoxelTexture,
  type VoxelTexPaintResult,
  type VoxelTexTool,
} from '../modding/VoxelTexturePainter';
import {
  TEX_N,
  addTexNoise,
  averageTexColor,
  drawTexLine,
  flipTex,
  floodFillTex,
  mapTexRgb,
  pixelsToDataUrl,
  rotateTex90,
  setTexPx,
  texIdx,
} from './textureOps';
import {
  drawTexGrid,
  drawTexHover,
  drawTexPreview,
  type TexPreviewMode,
  sizeTexCanvases,
} from './textureCanvasView';
import { TEXTURE_STUDIO_HTML } from './textureStudioHtml';

type TexTool = 'paint' | 'erase' | 'eyedrop' | 'bucket' | 'line';
const CELL_MIN = 10;

/** Dedicated texture studio panel (separate from Shape tools). */
export class TextureMakerPanel {
  readonly root: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLCanvasElement;
  private readonly preview: HTMLCanvasElement;
  private readonly nameInput: HTMLInputElement;
  private readonly matSelect: HTMLSelectElement;
  private readonly chipsEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private pixels: number[];
  private paintColor: [number, number, number] = [1, 1, 1];
  private drawing = false;
  private tool: TexTool = 'paint';
  private brush = 1;
  private cell = 14;
  private showGrid = true;
  private showCheck = true;
  private mirrorX = false;
  private mirrorY = false;
  private hover: { x: number; y: number } | null = null;
  private lineStart: { x: number; y: number } | null = null;
  private clipboard: number[] | null = null;
  private readonly undoStack: number[][] = [];
  private readonly redoStack: number[][] = [];
  private tex3DStrokeMat: number | null = null;
  private previewMode: TexPreviewMode = 'cube';
  private palette: CustomMaterialPalette;
  editingId: number | null = null;
  private onApplied: (id: number, applyToShape: boolean) => void;
  private onUvMode: ((mode: 'projection' | 'per_voxel') => void) | null = null;
  private onColorPicked: ((rgb: [number, number, number]) => void) | null = null;
  private workshopRoot: HTMLElement | null = null;

  constructor(
    palette: CustomMaterialPalette,
    onApplied: (id: number, applyToShape: boolean) => void,
    onUvMode?: (mode: 'projection' | 'per_voxel') => void,
    onColorPicked?: (rgb: [number, number, number]) => void,
  ) {
    this.palette = palette;
    this.onApplied = onApplied;
    this.onUvMode = onUvMode ?? null;
    this.onColorPicked = onColorPicked ?? null;
    this.pixels = solidPixels([0.85, 0.85, 0.88]);

    this.root = document.createElement('aside');
    this.root.className = 'mod-tex-panel';
    this.root.hidden = true;
    this.root.tabIndex = 0;
    this.root.innerHTML = TEXTURE_STUDIO_HTML;

    this.canvas = this.root.querySelector('.mod-tex-canvas')!;
    this.overlay = this.root.querySelector('.mod-tex-overlay')!;
    this.preview = this.root.querySelector('.mod-tex-preview')!;
    this.nameInput = this.root.querySelector('.mod-tex-name')!;
    this.matSelect = this.root.querySelector('.mod-tex-mat-select')!;
    this.chipsEl = this.root.querySelector('.mod-tex-chips')!;
    this.statusEl = this.root.querySelector('.mod-tex-status')!;

    this.matSelect.addEventListener('change', () => {
      const id = Number(this.matSelect.value);
      if (id) this.loadMaterial(id);
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-tex]').forEach((btn) => {
      btn.addEventListener('click', () => this.onToolClick(btn.dataset.tex!));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-brush]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.brush = Number(btn.dataset.brush) || 1;
        this.root.querySelectorAll('.mod-tex-brush-btn').forEach((b) => {
          b.classList.toggle('active', Number((b as HTMLElement).dataset.brush) === this.brush);
        });
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-tog]').forEach((btn) => {
      btn.addEventListener('click', () => this.onToggle(btn.dataset.tog!));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-fx]').forEach((btn) => {
      btn.addEventListener('click', () => this.onFx(btn.dataset.fx!));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-preview]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.previewMode = (btn.dataset.preview || 'cube') as TexPreviewMode;
        this.root.querySelectorAll('[data-preview]').forEach((b) => {
          b.classList.toggle('active', (b as HTMLElement).dataset.preview === this.previewMode);
        });
        const tag = this.root.querySelector('.mod-tex-preview-tag');
        if (tag) tag.textContent = this.previewMode.toUpperCase();
        this.redraw();
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-uv]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = (btn.dataset.uv || 'projection') as 'projection' | 'per_voxel';
        this.onUvMode?.(mode);
        this.syncUvBtns(mode);
      });
    });
    const file = this.root.querySelector<HTMLInputElement>('.mod-tex-import input');
    file?.addEventListener('change', () => {
      const f = file.files?.[0];
      if (f) this.importImage(f);
      file.value = '';
    });
    this.root.addEventListener('keydown', (e) => this.onKey(e));
    new ResizeObserver(() => this.layoutCanvas()).observe(
      this.root.querySelector('.mod-tex-canvas-wrap')!,
    );

    this.refreshMaterialSelect();
    this.bindPaint();
    this.syncToolBtns();
    this.syncToggles();
    this.layoutCanvas();
  }

  /** Current canvas RGBA pixels (16×16×4). */
  getPixels(): number[] {
    return this.pixels.slice();
  }

  /** Average paint color from the canvas. */
  getAverageColor(): [number, number, number] {
    return averageTexColor(this.pixels, this.paintColor);
  }

  /** Active 2D texture tool — shared with 3D viewport paint mode. */
  getPaintTool(): VoxelTexTool {
    if (this.tool === 'line') return 'paint';
    return this.tool;
  }

  setPaintTool(tool: TexTool): void {
    this.onToolClick(tool);
    this.root.dispatchEvent(new CustomEvent('vxl-tex-tool', { detail: tool }));
  }

  setBrushSizeExternal(n: number): void {
    this.brush = Math.max(1, Math.min(4, n | 0));
    this.root.querySelectorAll('.mod-tex-brush-btn').forEach((b) => {
      b.classList.toggle('active', Number((b as HTMLElement).dataset.brush) === this.brush);
    });
  }

  externalToggle(tog: string): void {
    this.onToggle(tog);
    this.root.dispatchEvent(new CustomEvent('vxl-tex-tog', { detail: { tog, on: this.toggleState(tog) } }));
  }

  private toggleState(tog: string): boolean {
    if (tog === 'grid') return this.showGrid;
    if (tog === 'check') return this.showCheck;
    if (tog === 'mx') return this.mirrorX;
    if (tog === 'my') return this.mirrorY;
    return false;
  }

  setPaintColor(rgb: [number, number, number]): void {
    this.paintColor = rgb;
  }

  openImportDialog(): void {
    this.root.querySelector<HTMLInputElement>('.mod-tex-import input')?.click();
  }

  exportTexturePng(): void {
    const a = document.createElement('a');
    a.href = pixelsToDataUrl(this.pixels);
    a.download = `${this.nameInput.value.trim() || 'texture'}-16.png`;
    a.click();
    this.setStatus('Exported PNG');
  }

  copyTexture(): void {
    this.clipboard = this.pixels.slice();
    this.setStatus('Copied texture');
  }

  pasteTexture(): void {
    if (!this.clipboard) {
      this.setStatus('Nothing copied');
      return;
    }
    this.pushUndo();
    this.pixels = this.clipboard.slice();
    this.redraw();
    this.setStatus('Pasted texture');
  }

  getToggleState(tog: string): boolean {
    return this.toggleState(tog);
  }

  applyNow(): void {
    this.apply();
  }

  createBlockNow(): void {
    this.createNew();
  }

  getPaintColor(): [number, number, number] {
    return [...this.paintColor] as [number, number, number];
  }

  getBrushSize(): number {
    return this.brush;
  }

  /** Begin undo snapshot for a 3D viewport texture stroke. */
  begin3DStroke(matId: number, atlas: TextureAtlasManager): void {
    if (this.tex3DStrokeMat === matId) return;
    this.tex3DStrokeMat = matId;
    const pixels = atlas.getOrCreateTilePixels(matId);
    if (pixels) {
      this.undoStack.push(pixels.slice());
      if (this.undoStack.length > 40) this.undoStack.shift();
      this.redoStack.length = 0;
    }
  }

  end3DStroke(): void {
    this.tex3DStrokeMat = null;
  }

  /** Paint / erase / pick / bucket on the hit voxel face tile from the 3D viewport. */
  apply3DHit(atlas: TextureAtlasManager, hit: VoxelFacePaintHit): VoxelTexPaintResult {
    const tool = this.getPaintTool();
    const result = strokeVoxelTexture(atlas, hit.matId, hit.tx, hit.ty, {
      tool,
      color: this.paintColor,
      brush: this.brush,
      mirrorX: this.mirrorX,
      mirrorY: this.mirrorY,
    });

    if (result.kind === 'picked' && result.pickedColor) {
      this.paintColor = result.pickedColor;
      this.onColorPicked?.(result.pickedColor);
      this.tool = 'paint';
      this.syncToolBtns();
    }

    if (this.editingId === hit.matId) {
      const live = atlas.getOrCreateTilePixels(hit.matId);
      if (live) {
        this.pixels = live.slice();
        this.redraw();
      }
    }

    return result;
  }

  /** Keep Texture tab UV buttons in sync with Shape / viewport. */
  syncUvBtns(mode: 'projection' | 'per_voxel'): void {
    this.root.querySelectorAll('[data-uv]').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.uv === mode);
    });
  }

  refreshMaterialSelect(): void {
    const cur = this.editingId;
    this.matSelect.replaceChildren();
    this.chipsEl.replaceChildren();
    const mats = this.palette.list();
    const order = ['Warm', 'Green', 'Cool', 'Violet', 'Neutral', 'Custom'];
    const byGroup = new Map<string, typeof mats>();
    for (const mat of mats) {
      const g = mat.group || 'Custom';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(mat);
    }
    const seen = new Set<string>();
    const appendGroup = (label: string) => {
      const list = byGroup.get(label);
      if (!list?.length) return;
      seen.add(label);
      const og = document.createElement('optgroup');
      og.label = label;
      for (const mat of list) {
        const opt = document.createElement('option');
        opt.value = String(mat.id);
        opt.textContent = mat.pixels?.length ? `${mat.name} ✦` : mat.name;
        og.appendChild(opt);
      }
      this.matSelect.appendChild(og);
    };
    for (const label of order) appendGroup(label);
    for (const label of byGroup.keys()) {
      if (!seen.has(label)) appendGroup(label);
    }
    for (const mat of mats) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'mod-tex-chip';
      chip.dataset.id = String(mat.id);
      chip.title = mat.group ? `${mat.name} · ${mat.group}` : mat.name;
      const [r, g, b] = mat.color;
      chip.style.setProperty('--c', `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`);
      if (mat.pixels?.length) chip.classList.add('textured');
      chip.addEventListener('click', () => this.loadMaterial(mat.id));
      this.chipsEl.appendChild(chip);
    }
    if (cur && this.palette.has(cur)) {
      this.matSelect.value = String(cur);
      this.markActiveChip(cur);
    }
  }

  loadMaterial(id: number): void {
    const mat = this.palette.get(id);
    if (!mat) return;
    this.editingId = id;
    this.nameInput.value = mat.name;
    this.paintColor = [...mat.color] as [number, number, number];
    this.onColorPicked?.(this.paintColor);
    this.pixels = mat.pixels?.length ? mat.pixels.slice() : solidPixels(mat.color);
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.refreshMaterialSelect();
    this.matSelect.value = String(id);
    this.markActiveChip(id);
    this.redraw();
  }

  private markActiveChip(id: number): void {
    this.chipsEl.querySelectorAll('.mod-tex-chip').forEach((el) => {
      el.classList.toggle('active', Number((el as HTMLElement).dataset.id) === id);
    });
  }

  private layoutCanvas(): void {
    const wrap = this.root.querySelector('.mod-tex-canvas-wrap') as HTMLElement;
    this.cell = sizeTexCanvases(
      this.canvas,
      this.overlay,
      wrap.clientWidth,
      CELL_MIN,
      wrap.clientHeight,
    );
    this.redraw();
  }

  private onToolClick(act: string): void {
    if (act === 'paint' || act === 'erase' || act === 'eyedrop' || act === 'bucket' || act === 'line') {
      this.tool = act;
      this.lineStart = null;
      this.syncToolBtns();
      this.setStatus();
      return;
    }
    if (act === 'undo') return this.undo();
    if (act === 'redo') return this.redo();
    if (act === 'clear') {
      this.pushUndo();
      this.pixels = solidPixels([0.85, 0.85, 0.88]);
      this.redraw();
      return;
    }
    if (act === 'apply') this.apply();
    if (act === 'new') this.createNew();
  }

  private onToggle(tog: string): void {
    if (tog === 'grid') this.showGrid = !this.showGrid;
    if (tog === 'check') this.showCheck = !this.showCheck;
    if (tog === 'mx') this.mirrorX = !this.mirrorX;
    if (tog === 'my') this.mirrorY = !this.mirrorY;
    this.syncToggles();
    this.redraw();
  }

  private onFx(fx: string): void {
    if (fx === 'copy') {
      this.clipboard = this.pixels.slice();
      this.setStatus('Copied texture');
      return;
    }
    if (fx === 'paste') {
      if (!this.clipboard) return;
      this.pushUndo();
      this.pixels = this.clipboard.slice();
      this.redraw();
      return;
    }
    if (fx === 'export') {
      const a = document.createElement('a');
      a.href = pixelsToDataUrl(this.pixels);
      a.download = `${this.nameInput.value.trim() || 'texture'}-16.png`;
      a.click();
      return;
    }
    this.pushUndo();
    if (fx === 'flip-h') this.pixels = flipTex(this.pixels, true);
    else if (fx === 'flip-v') this.pixels = flipTex(this.pixels, false);
    else if (fx === 'rot') this.pixels = rotateTex90(this.pixels);
    else if (fx === 'invert') mapTexRgb(this.pixels, (r, g, b) => [255 - r, 255 - g, 255 - b]);
    else if (fx === 'light')
      mapTexRgb(this.pixels, (r, g, b) => [Math.min(255, r + 18), Math.min(255, g + 18), Math.min(255, b + 18)]);
    else if (fx === 'dark')
      mapTexRgb(this.pixels, (r, g, b) => [Math.max(0, r - 18), Math.max(0, g - 18), Math.max(0, b - 18)]);
    else if (fx === 'noise') addTexNoise(this.pixels);
    else if (fx === 'border') {
      const r = Math.round(this.paintColor[0] * 255);
      const g = Math.round(this.paintColor[1] * 255);
      const b = Math.round(this.paintColor[2] * 255);
      for (let i = 0; i < TEX_N; i++) {
        setTexPx(this.pixels, i, 0, r, g, b);
        setTexPx(this.pixels, i, TEX_N - 1, r, g, b);
        setTexPx(this.pixels, 0, i, r, g, b);
        setTexPx(this.pixels, TEX_N - 1, i, r, g, b);
      }
    } else if (fx === 'solid') this.pixels = solidPixels(this.paintColor);
    this.redraw();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') {
      e.preventDefault();
      if (e.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k === 'y') {
      e.preventDefault();
      this.redo();
      return;
    }
    if (k === 'b') this.onToolClick('paint');
    else if (k === 'e') this.onToolClick('erase');
    else if (k === 'i') this.onToolClick('eyedrop');
    else if (k === 'f') this.onToolClick('bucket');
    else if (k === 'l') this.onToolClick('line');
    else if (k === 'g') this.onToggle('grid');
    else if (k === 'z') this.undo();
    else if (k === 'y') this.redo();
  }

  private syncToolBtns(): void {
    this.root.querySelectorAll('.mod-tex-tool').forEach((el) => {
      const btn = el as HTMLElement;
      btn.classList.toggle('active', btn.dataset.tex === this.tool);
    });
  }

  private syncToggles(): void {
    this.root.querySelectorAll('.mod-tex-tog').forEach((el) => {
      const btn = el as HTMLElement;
      const on =
        (btn.dataset.tog === 'grid' && this.showGrid) ||
        (btn.dataset.tog === 'check' && this.showCheck) ||
        (btn.dataset.tog === 'mx' && this.mirrorX) ||
        (btn.dataset.tog === 'my' && this.mirrorY);
      btn.classList.toggle('active', !!on);
    });
  }

  private pushUndo(): void {
    this.undoStack.push(this.pixels.slice());
    if (this.undoStack.length > 40) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  private undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.pixels.slice());
    this.pixels = prev;
    this.redraw();
  }

  private redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.pixels.slice());
    this.pixels = next;
    this.redraw();
  }

  private cellAt(e: PointerEvent): { x: number; y: number } | null {
    const rect = this.overlay.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / Math.max(1, rect.width)) * TEX_N);
    const y = Math.floor(((e.clientY - rect.top) / Math.max(1, rect.height)) * TEX_N);
    if (x < 0 || y < 0 || x >= TEX_N || y >= TEX_N) return null;
    return { x, y };
  }

  private paintDot(x: number, y: number): void {
    const erase = this.tool === 'erase';
    const r = erase ? 220 : Math.round(this.paintColor[0] * 255);
    const g = erase ? 220 : Math.round(this.paintColor[1] * 255);
    const b = erase ? 225 : Math.round(this.paintColor[2] * 255);
    const half = Math.floor((this.brush - 1) / 2);
    const stamp = (sx: number, sy: number) => {
      for (let dy = -half; dy < this.brush - half; dy++) {
        for (let dx = -half; dx < this.brush - half; dx++) {
          setTexPx(this.pixels, sx + dx, sy + dy, r, g, b);
        }
      }
    };
    stamp(x, y);
    if (this.mirrorX) stamp(TEX_N - 1 - x, y);
    if (this.mirrorY) stamp(x, TEX_N - 1 - y);
    if (this.mirrorX && this.mirrorY) stamp(TEX_N - 1 - x, TEX_N - 1 - y);
  }

  private bindPaint(): void {
    const applyAt = (e: PointerEvent) => {
      const c = this.cellAt(e);
      if (!c) return;
      this.hover = c;
      if (this.tool === 'eyedrop') {
        const i = texIdx(c.x, c.y);
        const rgb: [number, number, number] = [
          this.pixels[i]! / 255,
          this.pixels[i + 1]! / 255,
          this.pixels[i + 2]! / 255,
        ];
        this.paintColor = rgb;
        this.onColorPicked?.(rgb);
        this.tool = 'paint';
        this.syncToolBtns();
        this.setStatus();
        return;
      }
      if (this.tool === 'bucket') {
        floodFillTex(
          this.pixels,
          c.x,
          c.y,
          Math.round(this.paintColor[0] * 255),
          Math.round(this.paintColor[1] * 255),
          Math.round(this.paintColor[2] * 255),
        );
        this.redraw();
        return;
      }
      if (this.tool === 'line') {
        if (!this.lineStart) {
          this.lineStart = c;
          this.paintDot(c.x, c.y);
          this.redraw();
          return;
        }
        drawTexLine((x, y) => this.paintDot(x, y), this.lineStart.x, this.lineStart.y, c.x, c.y);
        this.lineStart = null;
        this.redraw();
        return;
      }
      this.paintDot(c.x, c.y);
      this.redraw();
    };

    this.overlay.style.pointerEvents = 'auto';
    this.overlay.addEventListener('pointerdown', (e) => {
      this.drawing = true;
      this.overlay.setPointerCapture(e.pointerId);
      if (this.tool !== 'eyedrop') this.pushUndo();
      applyAt(e);
    });
    this.overlay.addEventListener('pointermove', (e) => {
      this.hover = this.cellAt(e);
      this.drawOverlay();
      this.setStatus();
      if (!this.drawing) return;
      if (this.tool === 'bucket' || this.tool === 'eyedrop' || this.tool === 'line') return;
      applyAt(e);
    });
    this.overlay.addEventListener('pointerup', () => {
      this.drawing = false;
    });
    this.overlay.addEventListener('pointerleave', () => {
      this.hover = null;
      this.drawOverlay();
      this.setStatus();
    });
  }

  private redraw(): void {
    drawTexGrid(this.canvas, this.pixels, this.cell, {
      showCheck: this.showCheck,
      showGrid: this.showGrid,
    });
    this.drawOverlay();
    drawTexPreview(this.preview, this.pixels, this.previewMode);
    this.setStatus();
  }

  private drawOverlay(): void {
    drawTexHover(this.overlay, this.cell, this.hover, this.brush);
  }

  private setStatus(extra?: string): void {
    const coords = this.root.querySelector('.mod-tex-coords');
    if (coords) {
      coords.textContent = this.hover
        ? `${this.hover.x}, ${this.hover.y}`
        : `${TEX_N}×${TEX_N}`;
    }
    this.statusEl.textContent =
      extra ||
      `${this.tool} · brush ${this.brush}× · ${this.cell}px/cell${this.showGrid ? ' · grid' : ''}${this.mirrorX || this.mirrorY ? ' · mirror' : ''}`;
  }

  private importImage(file: File): void {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = CUSTOM_TEX_SIZE;
      c.height = CUSTOM_TEX_SIZE;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, CUSTOM_TEX_SIZE, CUSTOM_TEX_SIZE);
      this.pushUndo();
      this.pixels = Array.from(ctx.getImageData(0, 0, CUSTOM_TEX_SIZE, CUSTOM_TEX_SIZE).data);
      this.redraw();
      URL.revokeObjectURL(url);
      this.setStatus('Imported image');
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  setWorkshopRoot(root: HTMLElement): void {
    this.workshopRoot = root;
  }

  private wantsApplyToShape(): boolean {
    const el =
      this.workshopRoot?.querySelector<HTMLInputElement>('.mod-studio-scene-tools .mod-tex-apply-shape') ??
      this.root.closest('.mod-workshop')?.querySelector<HTMLInputElement>('.mod-tex-apply-shape') ??
      this.root.querySelector<HTMLInputElement>('.mod-tex-apply-shape');
    return el?.checked === true;
  }

  private apply(): void {
    if (this.editingId == null) {
      this.createNew();
      return;
    }
    const name = this.nameInput.value.trim() || this.palette.get(this.editingId)?.name || 'Custom';
    this.palette.updateMaterial(this.editingId, {
      name,
      color: averageTexColor(this.pixels, this.paintColor),
      pixels: this.pixels.slice(),
    });
    this.refreshMaterialSelect();
    this.onApplied(this.editingId, this.wantsApplyToShape());
    this.setStatus(this.wantsApplyToShape() ? 'Saved · selected color only' : 'Saved on this color');
  }

  private createNew(): void {
    const name = this.nameInput.value.trim() || 'Textured';
    const mat = this.palette.addMaterial(name, averageTexColor(this.pixels, this.paintColor), this.pixels.slice());
    if (!mat) return;
    this.editingId = mat.id;
    this.refreshMaterialSelect();
    this.onApplied(mat.id, this.wantsApplyToShape());
  }
}
