import type { TerrainMaterials } from '../render/TerrainMaterials';
import {
  defaultEditorBrush,
  isEditorPaletteBlock,
  materialCssColor,
  paletteEntryFor,
} from '../modding/editorPalette';
import {
  bundleModLogic,
  createModAssetFromGrid,
  defaultRootPart,
  downloadModFile,
  modAssetFromJson,
  type ModAsset,
  type ModKeyframe,
  type ModMotionPreset,
  type ModPart,
} from '../modding/ModAsset';
import type { ModAnimationClip } from '../modding/ModClip';
import { interpretModScripts } from '../modding/ModAiInterpreter';
import {
  listSavedMods,
  loadModAsset,
  saveModAsset,
} from '../modding/ModStorage';
import { LocalVoxelGrid } from '../modding/LocalVoxelGrid';
import { exportModShape } from '../modding/ModShapeExport';
import { partMaskFromArray, partMaskToArray } from '../modding/PartAssignment';
import { VoxelEditorViewport } from '../modding/VoxelEditorViewport';
import { applyShapeStarter } from '../modding/ShapeStarters';
import type { StudioAiAction } from '../modding/ModStudioAi';
import type { ProjectAction } from '../modding/ModProjectPlanner';
import { ensureCityMaterials, stampCity } from '../modding/CityGenerator';
import { ShapeHistory } from '../modding/ShapeHistory';
import { ColorPickerPanel } from './ColorPickerPanel';
import { ModAnimatePanel } from './ModAnimatePanel';
import { ModLoadPicker } from './ModLoadPicker';
import { ModLogicPanel } from './ModLogicPanel';
import { TextureMakerPanel } from './TextureMakerPanel';
import { LEFT_RAIL_HTML, PAINT_PANEL_HTML } from './leftRailHtml';
import { MID_RAIL_MATERIAL_HTML } from './midRailHtml';
import { bindShapeStudio } from './ShapeStudioBinder';
import { MODEL_EDITOR_SHELL_HTML } from './modelEditorShellHtml';
import { MOD_STUDIO_GUIDE_HTML } from './modStudioGuideHtml';
import {
  bindModelEditorMenus,
  bindPaintPanelActions,
  bindTextureLeftRail,
  layoutStudioForMode,
  mountModelEditorLayout,
  populateMatSelects,
  refreshMaterialsInUse,
  syncModelEditorChrome,
  syncViewToggles,
} from './ModelEditorLayout';
import { rgb01ToHex } from '../modding/CustomMaterials';

type WorkshopTab = 'shape' | 'texture' | 'animate' | 'logic';

/** Embedded shape editor for the main-menu Mod panel. */
export class VoxelEditorUi {
  readonly root: HTMLElement;
  private readonly viewport: VoxelEditorViewport;
  private readonly animatePanel: ModAnimatePanel;
  private readonly logicPanel: ModLogicPanel;
  private readonly texMaker: TextureMakerPanel;
  private readonly colorPicker: ColorPickerPanel;
  private readonly loadPicker: ModLoadPicker;
  private readonly blockCountEl: HTMLElement;
  private readonly blockLimitEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly brushNameEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly shapePalette: HTMLElement;
  private guideEl: HTMLElement | null = null;
  private mounted = false;
  private active = false;
  private brush = 1;
  private mode: WorkshopTab = 'texture';
  private modId: string | null = null;
  private modName = 'Untitled';
  private parts: ModPart[] = [defaultRootPart()];
  private keyframes: ModKeyframe[] = [];
  private clips: ModAnimationClip[] = [];
  private scripts: string[] = [];
  private statusEl: HTMLElement;
  private importInput: HTMLInputElement;
  private readonly history = new ShapeHistory();
  private lastTexPixelKey = '';
  private lastUsedMatKey = '';
  private menuAbort: AbortController | null = null;

  constructor(materials: TerrainMaterials) {
    this.viewport = new VoxelEditorViewport(materials, () => this.refreshStats());
    this.brush = defaultEditorBrush();
    this.loadPicker = new ModLoadPicker();
    this.animatePanel = new ModAnimatePanel(this.viewport, (state) => {
      this.parts = state.parts;
      this.keyframes = state.keyframes;
      if (state.clips) this.clips = state.clips;
    });
    this.logicPanel = new ModLogicPanel(
      (scripts) => {
        this.scripts = scripts;
      },
      (msg) => this.setStatus(msg),
      (actions) => this.applyProjectActions(actions),
    );
    this.logicPanel.setInferenceHost(() => ({
      grid: this.viewport.grid,
      palette: this.viewport.materialsPalette,
      parts: this.parts,
      scripts: this.scripts,
      projectName: this.modName || 'Untitled',
      historyPush: () => this.history.push(this.viewport.grid),
      rebuildMesh: () => this.viewport.rebuildMesh(),
      refreshPalette: () => this.refreshSwatches(),
      applyKeyframes: (keys, clipName) => {
        this.keyframes = keys;
        this.animatePanel.setState(this.parts, keys);
        this.setMode('animate');
        this.setStatus(`VYTHERA AI animation: ${clipName}`);
      },
      applyTexturePixels: (name, pixels, rgb) => {
        const mat =
          this.viewport.materialsPalette.list().find((m) => m.name === name) ??
          this.viewport.materialsPalette.addMaterial(name, rgb, pixels, true, 'AI');
        if (mat) {
          this.viewport.materialsPalette.updateMaterial(mat.id, { pixels, color: rgb });
          this.refreshSwatches();
          this.selectBrush(mat.id);
          this.texMaker.loadMaterial(mat.id);
          this.viewport.rebuildMesh();
          this.setMode('texture');
          this.setStatus(`VYTHERA AI texture on “${name}”`);
        }
      },
      appendBehaviors: (lines) => this.logicPanel.appendScripts(lines),
      setScripts: (lines) => this.logicPanel.setScripts(lines),
      notify: (msg) => this.setStatus(msg),
      undo: () => {
        const ok = this.history.undo(this.viewport.grid);
        if (ok) this.viewport.rebuildMesh();
        return ok;
      },
      redo: () => {
        const ok = this.history.redo(this.viewport.grid);
        if (ok) this.viewport.rebuildMesh();
        return ok;
      },
    }));
    this.texMaker = new TextureMakerPanel(
      this.viewport.materialsPalette,
      (id, applyToShape) => {
        this.refreshSwatches();
        this.selectBrush(id);
        if (applyToShape) this.stampTextureOntoShape(id);
        else this.viewport.rebuildMesh();
        this.setStatus(
          applyToShape
            ? `Texture saved on “${paletteEntryFor(id)?.name ?? 'block'}” (only that color’s blocks)`
            : `Texture saved on “${paletteEntryFor(id)?.name ?? 'block'}”`,
        );
      },
      (mode) => {
        this.viewport.setTexUvMode(mode);
        this.syncUvUi(mode);
        this.setStatus(mode === 'projection' ? 'UV: project across shape' : 'UV: per voxel tile');
      },
      (rgb) => {
        this.colorPicker.setRgb(rgb);
        this.updateHexReadout(rgb);
      },
    );
    this.colorPicker = new ColorPickerPanel((rgb) => {
      this.texMaker.setPaintColor(rgb);
      this.updateHexReadout(rgb);
    });

    this.root = document.createElement('div');
    this.root.className = 'mod-workshop mod-workshop--studio mod-workshop--forge mod-studio-mode-texture forge-mode-texture';
    this.root.tabIndex = 0;
    this.root.innerHTML = MODEL_EDITOR_SHELL_HTML + MOD_STUDIO_GUIDE_HTML;
    this.guideEl = this.root.querySelector('.mod-studio-guide');

    const sceneTools = this.root.querySelector('.mod-studio-scene-tools') as HTMLElement;
    sceneTools.innerHTML = LEFT_RAIL_HTML;

    const materialsSlot = this.root.querySelector('.mod-studio-materials-slot') as HTMLElement;
    materialsSlot.innerHTML = MID_RAIL_MATERIAL_HTML;

    const paintSlot = this.root.querySelector('.mod-studio-paint-slot') as HTMLElement;
    paintSlot.innerHTML = PAINT_PANEL_HTML;

    this.blockCountEl = this.root.querySelector('[data-blocks]')!;
    this.blockLimitEl = this.root.querySelector('[data-limit]') as HTMLElement;
    this.statsEl = this.root.querySelector('.voxel-editor-stats') as HTMLElement;
    this.brushNameEl = this.root.querySelector('.mod-brush-name') as HTMLElement;
    this.hintEl = this.root.querySelector('.voxel-editor-hint')!;
    this.statusEl = this.root.querySelector('.mod-workshop-status')!;
    this.importInput = this.root.querySelector('.mod-import-input') as HTMLInputElement;
    this.shapePalette = sceneTools;

    this.root.querySelector('.mod-color-host')!.appendChild(this.colorPicker.root);

    mountModelEditorLayout(this.root, this.texMaker, this.animatePanel, this.logicPanel);
    this.texMaker.setWorkshopRoot(this.root);
    this.loadPicker.mount(this.root);

    const canvasHost = this.root.querySelector('.mod-workshop-viewport') as HTMLElement;
    this.viewport.mount(canvasHost);
    this.refreshSwatches();
    this.selectBrush(this.brush);
    this.texMaker.loadMaterial(this.brush);
    this.bindModTools();
    this.bindShapeTools();
    this.menuAbort = bindModelEditorMenus(this.root, (mode) => this.setMode(mode));
    bindTextureLeftRail(this.shapePalette, this.texMaker);
    bindPaintPanelActions(paintSlot, this.texMaker, this.colorPicker.root);
    layoutStudioForMode(this.root, this.mode, this.animatePanel);
    this.setMode('texture');
  }

  private updateHexReadout(rgb?: [number, number, number]): void {
    const c = rgb ?? this.colorPicker.getRgb();
    const hex = rgb01ToHex(c).toUpperCase();
    this.root.querySelectorAll('.vxl-hex-readout').forEach((el) => {
      el.textContent = hex;
    });
  }

  bindHeaderActions(header: HTMLElement): void {
    header.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
      this.history.push(this.viewport.grid);
      this.viewport.clearGrid();
      this.refreshStats();
      this.setStatus('Cleared');
    });
    header.querySelector('[data-action="reset-view"]')?.addEventListener('click', () => this.viewport.resetView());
  }

  mount(parent: HTMLElement): void {
    if (this.mounted) return;
    this.mounted = true;
    parent.appendChild(this.root);
  }

  start(): void {
    if (this.active) {
      this.layout();
      return;
    }
    this.active = true;
    this.viewport.start();
    this.animatePanel.setActive(this.mode === 'animate');
    this.refreshStats();
    this.root.focus({ preventScroll: true });
    requestAnimationFrame(() => this.layout());
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.viewport.stop();
  }

  layout(): void {
    this.viewport.layout();
  }

  dispose(): void {
    this.menuAbort?.abort();
    this.menuAbort = null;
    this.stop();
    this.viewport.dispose();
    this.root.remove();
    this.mounted = false;
  }

  private refreshSwatches(): void {
    const host = this.root.querySelector('.voxel-editor-swatches') as HTMLElement;
    host.replaceChildren();
    for (const mat of this.viewport.materialsPalette.list()) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'voxel-editor-swatch';
      btn.dataset.block = String(mat.id);
      btn.title = mat.name;
      btn.style.background = materialCssColor(mat.id);
      if (mat.pixels?.length) {
        btn.classList.add('has-texture');
        btn.title = `${mat.name} (textured)`;
      }
      if (mat.id === this.brush) btn.classList.add('active');
      btn.addEventListener('click', () => {
        this.selectBrush(mat.id);
        this.texMaker.loadMaterial(mat.id);
        const entry = paletteEntryFor(mat.id);
        if (entry) this.colorPicker.setRgb(entry.color);
      });
      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this.viewport.materialsPalette.list().length <= 1) return;
        this.viewport.materialsPalette.removeMaterial(mat.id);
        this.refreshSwatches();
        this.texMaker.refreshMaterialSelect();
        this.selectBrush(defaultEditorBrush());
        this.texMaker.loadMaterial(this.brush);
      });
      host.appendChild(btn);
    }
    this.texMaker.refreshMaterialSelect();
  }

  private applyCanvasTexToBlock(blockId: number): void {
    if (!isEditorPaletteBlock(blockId)) {
      this.setStatus('Click a solid voxel');
      return;
    }
    const pixels = this.texMaker.getPixels();
    const color = this.texMaker.getAverageColor();
    const entry = this.viewport.materialsPalette.get(blockId);
    if (!entry) {
      this.setStatus('Unknown material');
      return;
    }
    this.viewport.materialsPalette.updateMaterial(blockId, {
      pixels: pixels.slice(),
      color,
    });
    this.texMaker.loadMaterial(blockId);
    this.texMaker.refreshMaterialSelect();
    this.refreshSwatches();
    this.selectBrush(blockId);
    // Atlas onChange rebuilds mesh; surfaces of this material all show the canvas.
    this.setStatus(`Texture stamped on “${entry.name}” (all faces)`);
  }

  /** 3D viewport UV paint — uses Texture tab brush, eraser, eyedrop, bucket. */
  private handle3DTexPaint(
    clientX: number,
    clientY: number,
    phase: 'down' | 'move' | 'up',
  ): void {
    if (phase === 'up') {
      this.texMaker.end3DStroke();
      this.lastTexPixelKey = '';
      return;
    }

    const hit = this.viewport.pickTextureHit(clientX, clientY);
    if (!hit) return;

    const key = `${hit.matId}:${hit.tx}:${hit.ty}`;
    if (phase === 'down') {
      this.lastTexPixelKey = '';
      this.texMaker.begin3DStroke(hit.matId, this.viewport.textureAtlas);
    }
    if (phase === 'move' && key === this.lastTexPixelKey) return;
    this.lastTexPixelKey = key;

    const tool = this.texMaker.getPaintTool();
    if (tool === 'bucket' && phase === 'move') return;

    const result = this.texMaker.apply3DHit(this.viewport.textureAtlas, hit);
    if (result.kind === 'picked') {
      this.setStatus(`Picked pixel from “${paletteEntryFor(hit.matId)?.name ?? 'block'}”`);
      return;
    }
    if (result.kind === 'painted') {
      this.refreshSwatches();
      const name = paletteEntryFor(hit.matId)?.name ?? 'block';
      this.setStatus(`${tool} · ${name} @ ${hit.tx},${hit.ty}`);
    }
  }

  private syncUvUi(mode: 'projection' | 'per_voxel'): void {
    this.texMaker.syncUvBtns(mode);
    this.shapePalette.querySelectorAll('[data-uv]').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.uv === mode);
    });
  }

  private applyProjectActions(actions: ProjectAction[]): void {
    const palette = this.viewport.materialsPalette;

    for (const action of actions) {
      if (action.kind === 'city') {
        this.history.push(this.viewport.grid);
        const mats = ensureCityMaterials(palette, action.theme);
        const n = stampCity(this.viewport.grid, mats, action.theme, true);
        this.viewport.rebuildMesh();
        this.refreshSwatches();
        this.refreshStats();
        this.setStatus(`${action.summary} (${n} voxels)`);
        this.setMode('shape');
      } else if (action.kind === 'story') {
        const scripts: string[] = [];
        if (action.beats[0]) scripts.push(`Say "${action.beats[0]}" when spawned`);
        if (action.beats[1]) scripts.push(`Say "${action.beats[1]}" when used`);
        if (action.beats[2]) scripts.push(`Say "${action.beats[2]}" when clicked`);
        for (let i = 3; i < action.beats.length; i++) {
          scripts.push(`Say "${action.beats[i]}" when clicked`);
        }
        this.logicPanel.appendScripts(scripts);
        this.modName = action.title.slice(0, 32) || this.modName;
        const nameInput = this.root.querySelector('.mod-name-input') as HTMLInputElement | null;
        if (nameInput) nameInput.value = this.modName;
        this.logicPanel.setModName(this.modName);
        this.setStatus(action.summary);
      } else if (action.kind === 'rename') {
        this.modName = action.name.slice(0, 32);
        const nameInput = this.root.querySelector('.mod-name-input') as HTMLInputElement | null;
        if (nameInput) nameInput.value = this.modName;
        this.logicPanel.setModName(this.modName);
        this.syncChrome();
        this.setStatus(action.summary);
      } else if (action.kind === 'note') {
        this.setStatus(action.text || action.summary);
      } else {
        this.applyStudioAiActions([action]);
      }
    }
  }

  private applyStudioAiActions(actions: StudioAiAction[]): void {
    const brush = this.brush || this.viewport.materialsPalette.defaultBrush();
    for (const action of actions) {
      if (action.kind === 'starter') {
        this.history.push(this.viewport.grid);
        applyShapeStarter(this.viewport.grid, action.id, brush, true);
        this.viewport.rebuildMesh();
        this.refreshStats();
        this.setStatus(action.summary);
        this.setMode('shape');
      } else if (action.kind === 'texture_color') {
        const mat =
          this.viewport.materialsPalette.list().find((m) => m.name.toLowerCase() === action.name) ??
          this.viewport.materialsPalette.addMaterial(action.name, action.rgb);
        if (mat) {
          this.viewport.materialsPalette.updateMaterial(mat.id, { color: action.rgb });
          this.refreshSwatches();
          this.selectBrush(mat.id);
          this.texMaker.loadMaterial(mat.id);
          this.setStatus(action.summary);
          this.setMode('texture');
        }
      } else if (action.kind === 'anim_preset') {
        const map: Record<string, ModMotionPreset> = {
          spin: 'spin',
          bounce: 'heartbeat',
          wave: 'wobble',
          idle: 'float',
        };
        const preset = map[action.preset] ?? 'spin';
        for (const p of this.parts) {
          p.motionPreset = preset;
        }
        this.animatePanel.setState(this.parts, this.keyframes, this.clips);
        this.setStatus(action.summary);
        this.setMode('animate');
      } else if (action.kind === 'particles') {
        this.viewport.spawnParticles(action.style, action.color);
        this.setStatus(action.summary);
      } else if (action.kind === 'behavior') {
        this.logicPanel.appendScripts([action.rule.source]);
        this.setStatus(action.summary);
      }
    }
  }

  private stampTextureOntoShape(id: number): void {
    // Textures bind to one material tile only — never copy onto other colors in the model.
    void id;
    this.viewport.rebuildMesh();
  }

  private selectBrush(id: number): void {
    if (!isEditorPaletteBlock(id)) return;
    this.brush = id;
    this.viewport.setBrush(id);
    this.root.querySelectorAll('.voxel-editor-swatch').forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset.block === String(id));
    });
    const entry = paletteEntryFor(id);
    if (entry) {
      this.brushNameEl.textContent = entry.name + (entry.pixels?.length ? ' ✦' : '');
      this.brushNameEl.style.setProperty('--brush-color', materialCssColor(id));
    }
    this.hintEl.textContent = `${entry?.name ?? 'Color'} — left place · right erase · Texture tab to paint`;
  }

  private refreshStats(): void {
    const grid = this.viewport.grid;
    const count = grid.filledCount();
    this.blockCountEl.textContent = String(count);
    this.blockLimitEl.textContent = String(grid.capacity);
    this.statsEl.classList.toggle('at-limit', grid.isFull());
    this.syncChrome();
  }

  private syncChrome(): void {
    syncModelEditorChrome(
      this.root,
      this.mode,
      this.modName,
      this.viewport.grid.filledCount(),
      this.viewport.grid.capacity,
    );
    const used = new Set<number>();
    for (const b of this.viewport.grid.voxels) {
      if (b) used.add(b);
    }
    const ids = [...used].sort((a, b) => a - b);
    const matKey = ids.join(',');
    if (matKey !== this.lastUsedMatKey) {
      this.lastUsedMatKey = matKey;
      refreshMaterialsInUse(this.root, ids, (id) => paletteEntryFor(id)?.name ?? `Block ${id}`, materialCssColor);
      populateMatSelects(
        this.root,
        this.viewport.materialsPalette.list().map((m) => m.id),
        (id) => paletteEntryFor(id)?.name ?? `Block ${id}`,
        this.brush,
      );
    }
  }

  private setMode(tab: WorkshopTab): void {
    this.mode = tab;

    this.animatePanel.setActive(this.mode === 'animate');
    this.logicPanel.setActive(this.mode === 'logic');
    // Character mode still needs orbit; place via “Add my skin character” / starters.
    this.viewport.interaction.setEnabled(this.mode === 'shape' || this.mode === 'texture');

    if (this.mode === 'texture') {
      this.texMaker.loadMaterial(this.brush);
      this.texMaker.refreshMaterialSelect();
      this.viewport.interaction.setTool('texpaint');
    } else if (this.mode === 'shape') {
      this.viewport.interaction.setTool('brush');
      this.viewport.interaction.setSelectedBlock(this.brush);
      this.shapePalette.querySelectorAll('[data-tool-row] [data-tool]').forEach((b) => {
        b.classList.toggle('active', (b as HTMLElement).dataset.tool === 'brush');
      });
      requestAnimationFrame(() => this.viewport.layout());
    } else if (this.mode === 'logic') {
      requestAnimationFrame(() => {
        this.viewport.layout();
        this.logicPanel.refreshPlayerSkin();
      });
    }

    layoutStudioForMode(this.root, this.mode, this.animatePanel);
    this.viewport.layout();
    this.syncChrome();

    if (this.mode === 'shape') {
      this.hintEl.textContent =
        '32³ workspace · Starters: Sword / Dragon / Animal / Character · LMB place · RMB erase';
    } else if (this.mode === 'texture') {
      this.hintEl.textContent = 'Paint 16×16 · Apply texture · UV paint on 3D faces';
    } else if (this.mode === 'animate') {
      this.hintEl.textContent = 'Hierarchy · gizmo pose · timeline keyframes · FPS selector';
      this.root.querySelector('.mod-studio-timeline-slot')?.scrollIntoView({ block: 'nearest' });
    } else {
      this.hintEl.textContent =
        'Add my skin character · or Sword / Dragon / Animal · skin preview on the right';
    }
  }

  private bindShapeTools(): void {
    bindShapeStudio(this.root, this.shapePalette, this.viewport, this.history, {
      onStatus: (msg) => this.setStatus(msg),
      onBrush: (id) => {
        this.selectBrush(id);
        this.texMaker.loadMaterial(id);
        const entry = paletteEntryFor(id);
        if (entry) {
          this.colorPicker.setRgb(entry.color);
          this.updateHexReadout(entry.color);
        }
      },
      refreshStats: () => this.refreshStats(),
      refreshPalette: () => this.refreshSwatches(),
      onRefreshSkin: () => {
        this.logicPanel.refreshPlayerSkin();
        this.setStatus('Skin refreshed from profile');
      },
      isShapeTab: () => this.mode === 'shape' || this.mode === 'texture',
      onUvMode: (mode) => this.syncUvUi(mode),
      onStampTex: (blockId) => this.applyCanvasTexToBlock(blockId),
      onTexPaint: (clientX, clientY, phase) => this.handle3DTexPaint(clientX, clientY, phase),
    });

    this.colorPicker.root.querySelector('[data-action="add-color"]')?.addEventListener('click', () => {
      const color = this.colorPicker.getRgb();
      const mat = this.viewport.materialsPalette.addMaterial('Color', color);
      if (!mat) {
        this.setStatus('Color limit reached');
        return;
      }
      this.refreshSwatches();
      this.selectBrush(mat.id);
      this.texMaker.loadMaterial(mat.id);
      this.setStatus(`Added color “${mat.name}”`);
    });
  }

  private bindModTools(): void {
    const nameInput = this.root.querySelector('.mod-name-input') as HTMLInputElement;
    nameInput.addEventListener('change', () => {
      this.modName = nameInput.value.trim() || 'Character';
      nameInput.value = this.modName;
      this.logicPanel.setModName(this.modName);
      this.syncChrome();
    });

    this.root.querySelector('[data-op="undo"]')?.addEventListener('click', () => {
      this.shapePalette.querySelector('[data-op="undo"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    this.root.querySelector('[data-op="redo"]')?.addEventListener('click', () => {
      this.shapePalette.querySelector('[data-op="redo"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    this.root.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
      this.history.push(this.viewport.grid);
      this.viewport.clearGrid();
      this.refreshStats();
      this.setStatus('Cleared');
    });
    this.root.querySelectorAll('[data-action="reset-view"]').forEach((btn) => {
      btn.addEventListener('click', () => this.viewport.resetView());
    });

    this.root.querySelector('[data-action="save-mod"]')!.addEventListener('click', () => this.saveMod());
    this.root.querySelector('[data-action="load-mod"]')!.addEventListener('click', () => void this.loadMod());
    this.root.querySelector('[data-action="export-mod"]')!.addEventListener('click', () => this.exportMod());
    this.root.querySelector('[data-action="import-mod"]')!.addEventListener('click', () => this.importInput.click());
    this.root.querySelector('[data-action="tex-copy"]')?.addEventListener('click', () => {
      this.texMaker.copyTexture();
    });
    this.root.querySelector('[data-action="tex-paste"]')?.addEventListener('click', () => {
      this.texMaker.pasteTexture();
    });
    this.root.querySelector('[data-action="toggle-grid"]')?.addEventListener('click', () => {
      this.texMaker.externalToggle('grid');
      syncViewToggles(this.root, this.texMaker);
    });
    this.root.querySelector('[data-action="toggle-check"]')?.addEventListener('click', () => {
      this.texMaker.externalToggle('check');
      syncViewToggles(this.root, this.texMaker);
    });
    this.root.querySelector('[data-action="open-guide"]')?.addEventListener('click', () => this.setGuideOpen(true));
    this.root.querySelectorAll('[data-guide-close]').forEach((el) => {
      el.addEventListener('click', () => this.setGuideOpen(false));
    });
    this.root.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.guideEl && !this.guideEl.hidden) {
        e.preventDefault();
        this.setGuideOpen(false);
      }
    });
    this.importInput.addEventListener('change', () => {
      const file = this.importInput.files?.[0];
      this.importInput.value = '';
      if (!file) return;
      void this.importModFile(file);
    });
  }

  private setGuideOpen(open: boolean): void {
    if (!this.guideEl) return;
    this.guideEl.hidden = !open;
    this.guideEl.classList.toggle('is-open', open);
    if (open) {
      (this.guideEl.querySelector('.mod-studio-guide-close') as HTMLElement | null)?.focus();
    }
  }

  private currentAsset(): ModAsset {
    this.modName = (this.root.querySelector('.mod-name-input') as HTMLInputElement).value.trim() || 'Untitled';
    const asset = createModAssetFromGrid(
      this.modName,
      this.viewport.grid,
      partMaskToArray(this.viewport.getPartMask()),
    );
    asset.shape.palette = this.viewport.materialsPalette.toJson();
    asset.parts = this.parts.map((p) => ({ ...p, pivot: { ...p.pivot } }));
    asset.keyframes = this.keyframes.map((k) => ({
      ...k,
      position: { ...k.position },
      rotation: { ...k.rotation },
      scale: k.scale ? { ...k.scale } : undefined,
      ease: k.ease ? { ...k.ease } : undefined,
      easeType: k.easeType,
    }));
    const anim = this.animatePanel.getState();
    if (anim.clips?.length) {
      asset.clips = anim.clips.map((c) => ({
        ...c,
        keyframes: c.keyframes.map((k) => ({
          ...k,
          position: { ...k.position },
          rotation: { ...k.rotation },
          scale: k.scale ? { ...k.scale } : undefined,
          ease: k.ease ? { ...k.ease } : undefined,
        })),
      }));
    } else if (this.clips.length) {
      asset.clips = this.clips;
    }
    asset.scripts = this.logicPanel.getScripts();
    const { rules } = interpretModScripts(asset.scripts);
    return bundleModLogic(asset, rules);
  }

  private applyAsset(asset: ModAsset, id: string | null = null): void {
    this.modId = id;
    this.modName = asset.name;
    this.parts = asset.parts.length ? asset.parts : [defaultRootPart()];
    this.keyframes = asset.keyframes ?? [];
    this.clips = asset.clips ?? [];
    this.scripts = asset.scripts ?? [];
    this.animatePanel.setState(this.parts, this.keyframes, this.clips);
    this.logicPanel.setScripts(this.scripts);
    this.logicPanel.setModName(asset.name);

    if (asset.shape.palette?.length) {
      this.viewport.materialsPalette.loadFromJson(asset.shape.palette);
    }

    const nameInput = this.root.querySelector('.mod-name-input') as HTMLInputElement;
    nameInput.value = asset.name;
    const loaded = LocalVoxelGrid.fromData(asset.shape);
    for (let i = 0; i < loaded.voxels.length; i++) {
      this.viewport.grid.voxels[i] = loaded.voxels[i]!;
      this.viewport.grid.emissive[i] = loaded.emissive[i]!;
    }
    this.viewport.grid.recount();
    this.history.clear();
    this.viewport.setPartMask(partMaskFromArray(asset.shape.partMask, this.parts.length));
    this.refreshSwatches();
    this.selectBrush(defaultEditorBrush());
    this.texMaker.loadMaterial(this.brush);
    this.viewport.rebuildMesh();
    this.refreshStats();
  }

  private setStatus(msg: string): void {
    this.statusEl.textContent = msg;
  }

  private saveMod(): void {
    try {
      const asset = this.currentAsset();
      this.modId = saveModAsset(asset, this.modId ?? undefined);
      this.setStatus(`Saved “${asset.name}”`);
    } catch {
      this.setStatus('Save failed');
    }
  }

  private async loadMod(): Promise<void> {
    const mods = listSavedMods();
    if (!mods.length) {
      this.setStatus('No saved mods yet');
      return;
    }
    const id = await this.loadPicker.open(mods);
    if (!id) return;
    const asset = loadModAsset(id);
    if (!asset) {
      this.setStatus('Could not load mod');
      return;
    }
    this.applyAsset(asset, id);
    this.setStatus(`Loaded “${asset.name}”`);
  }

  private exportMod(): void {
    const asset = this.currentAsset();
    downloadModFile(asset);
    const ruleCount = asset.logic?.rules.length ?? 0;
    const shape = exportModShape(this.viewport.grid);
    this.setStatus(
      `Exported “${asset.name}” — ${shape.filledCount} voxels, ${this.parts.length} parts, ${this.keyframes.length} keys, ${ruleCount} rules`,
    );
  }

  private async importModFile(file: File): Promise<void> {
    try {
      const asset = modAssetFromJson(await file.text());
      this.applyAsset(asset, null);
      this.setStatus(`Imported “${asset.name}”`);
    } catch {
      this.setStatus('Invalid mod file');
    }
  }
}
