import type { EditorTool, MirrorAxis } from '../modding/EditorTools';
import type { TexUvMode } from '../modding/LocalVoxelMesher';
import type { ShapeHistory } from '../modding/ShapeHistory';
import {
  centerGrid,
  clearLayerY,
  copySelection,
  duplicateInPlace,
  fillLayerY,
  flipGrid,
  floorGrid,
  hollowGrid,
  pasteClipboard,
  replaceColor,
  rotateGrid90,
  shellExpand,
  toggleGlowAll,
  translateGrid,
  type ShapeClipboard,
} from '../modding/ShapeOps';
import { applyShapeStarter, characterMatsFromSkin, type CharacterPartMats, type ShapeStarterId } from '../modding/ShapeStarters';
import { LOCAL_GRID_SIZE } from '../modding/constants';
import type { VoxelEditorViewport } from '../modding/VoxelEditorViewport';
import { Block } from '../world/blocks';
import { loadProfile } from './prefs';
import { decodeSkin } from '../player/SkinAtlas';

/** Wires Shape studio buttons (tools, mirror, ops) to the viewport. */
export function bindShapeStudio(
  host: HTMLElement,
  panel: HTMLElement,
  viewport: VoxelEditorViewport,
  history: ShapeHistory,
  opts: {
    onStatus: (msg: string) => void;
    onBrush: (id: number) => void;
    refreshStats: () => void;
    isShapeTab: () => boolean;
    refreshPalette?: () => void;
    onRefreshSkin?: () => void;
    onUvMode?: (mode: TexUvMode) => void;
    onStampTex?: (blockId: number) => void;
    onTexPaint?: (
      clientX: number,
      clientY: number,
      phase: 'down' | 'move' | 'up',
    ) => void;
  },
): void {
  const ix = viewport.interaction;
  let clipboard: ShapeClipboard | null = null;

  const commit = (changed: boolean, msg?: string) => {
    if (!changed) return;
    viewport.rebuildMesh();
    opts.refreshStats();
    if (msg) opts.onStatus(msg);
  };

  const withHistory = (fn: () => boolean | number, msg?: string) => {
    history.push(viewport.grid);
    const result = fn();
    const changed = typeof result === 'number' ? result > 0 : result;
    if (!changed) {
      history.undo(viewport.grid);
      return;
    }
    commit(true, msg);
  };

  ix.setBeforeEdit(() => history.push(viewport.grid));
  ix.setEyedropHandler((id) => {
    opts.onBrush(id);
    opts.onStatus('Picked color');
  });
  ix.setStampTexHandler((id) => {
    opts.onStampTex?.(id);
  });
  ix.setTexPaintHandler((clientX, clientY, phase) => {
    opts.onTexPaint?.(clientX, clientY, phase);
  });

  panel.querySelectorAll('[data-tool-row] [data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tool = (btn as HTMLElement).dataset.tool as EditorTool;
      ix.setTool(tool);
      panel.querySelectorAll('[data-tool-row] [data-tool]').forEach((b) => {
        b.classList.toggle('active', (b as HTMLElement).dataset.tool === tool);
      });
    });
  });

  panel.querySelectorAll('[data-sculpt-brush-row] [data-brush]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const size = Number((btn as HTMLElement).dataset.brush) || 1;
      ix.setBrushSize(size);
      panel.querySelectorAll('[data-sculpt-brush-row] [data-brush]').forEach((b) => {
        b.classList.toggle('active', Number((b as HTMLElement).dataset.brush) === size);
      });
    });
  });

  panel.querySelectorAll('[data-mirror-row] [data-mirror]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const axis = (btn as HTMLElement).dataset.mirror as MirrorAxis;
      viewport.setMirrorAxis(axis);
      panel.querySelectorAll('[data-mirror-row] [data-mirror]').forEach((b) => {
        b.classList.toggle('active', (b as HTMLElement).dataset.mirror === axis);
      });
    });
  });

  const syncUvBtns = () => {
    const mode = viewport.getTexUvMode();
    panel.querySelectorAll('[data-uv-row] [data-uv]').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.uv === mode);
    });
  };
  syncUvBtns();
  panel.querySelectorAll('[data-uv-row] [data-uv]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.uv as TexUvMode;
      viewport.setTexUvMode(mode);
      syncUvBtns();
      opts.onUvMode?.(mode);
      opts.onStatus(mode === 'projection' ? 'UV: project across shape' : 'UV: per voxel tile');
    });
  });

  const glowCheck = panel.querySelector('.mod-glow-check') as HTMLInputElement | null;
  glowCheck?.addEventListener('change', () => {
    ix.setPlaceEmissive(!!glowCheck.checked);
  });

  host.addEventListener('keydown', (e) => {
    if (!opts.isShapeTab()) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const key = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        if (history.redo(viewport.grid)) commit(true, 'Redo');
      } else if (history.undo(viewport.grid)) commit(true, 'Undo');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && key === 'y') {
      e.preventDefault();
      if (history.redo(viewport.grid)) commit(true, 'Redo');
      return;
    }
    const toolMap: Record<string, EditorTool> = {
      b: 'brush',
      e: 'erase',
      p: 'paint',
      i: 'eyedrop',
      g: 'flood',
      t: 'stamptex',
      x: 'extrude',
      l: 'line',
      f: 'flood',
      v: 'box',
    };
    if (!e.ctrlKey && !e.metaKey && toolMap[key]) {
      const tool = toolMap[key]!;
      ix.setTool(tool);
      panel.querySelectorAll('[data-tool-row] [data-tool]').forEach((b) => {
        b.classList.toggle('active', (b as HTMLElement).dataset.tool === tool);
      });
    }
  });

  const stampStarter = (id: ShapeStarterId) => {
    const brush = ix.getSelectedBlock() || viewport.materialsPalette.defaultBrush();
    if (!brush || brush === Block.Air) {
      opts.onStatus('Pick a material color first');
      return;
    }

    const run = (mats: number | CharacterPartMats, label: string) => {
      withHistory(() => applyShapeStarter(viewport.grid, id, mats, true), label);
      viewport.resetView();
    };

    if (id === 'character') {
      const profile = loadProfile();
      if (!profile.skinData) {
        run(brush, 'Starter: character');
        opts.onStatus('Character starter (set a skin in SKIN menu for colors)');
        return;
      }
      void decodeSkin(profile.skinData)
        .then((pixels) => {
          const mats = characterMatsFromSkin(viewport.materialsPalette, pixels, brush);
          opts.refreshPalette?.();
          opts.onBrush(mats.body);
          run(mats, 'Starter: character (your skin)');
          opts.onStatus('Character from your player skin — look in the viewport');
        })
        .catch(() => {
          run(brush, 'Starter: character');
          opts.onStatus('Character starter');
        });
      return;
    }

    run(brush, `Starter: ${id}`);
  };

  // Modeling rail + Character rail both expose starters.
  host.querySelectorAll('[data-starter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = (btn as HTMLElement).dataset.starter as ShapeStarterId;
      stampStarter(id);
    });
  });

  host.querySelectorAll('[data-char-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = (btn as HTMLElement).dataset.charAction;
      if (action === 'add-skin') {
        stampStarter('character');
        return;
      }
      if (action === 'refresh-skin') {
        opts.onRefreshSkin?.();
      }
    });
  });

  host.querySelectorAll('[data-model-gizmo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = (btn as HTMLElement).dataset.modelGizmo as
        | 'rotate'
        | 'translate'
        | 'scale'
        | 'off';
      viewport.setTransformGizmo(mode);
      host.querySelectorAll('[data-model-gizmo]').forEach((b) => {
        b.classList.toggle('active', (b as HTMLElement).dataset.modelGizmo === mode);
      });
      ix.setEnabled(opts.isShapeTab() && mode === 'off');
      opts.onStatus(
        mode === 'off' ? 'Gizmo off — place voxels' : `Gizmo ${mode} — drag handles, release to bake`,
      );
    });
  });

  viewport.setOnBeforeModelBake(() => history.push(viewport.grid));
  viewport.setOnModelBakeDone((msg) => {
    opts.refreshStats();
    opts.onStatus(msg);
  });

  panel.querySelectorAll('[data-op]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const op = (btn as HTMLElement).dataset.op!;
      const grid = viewport.grid;
      const brush = ix.getSelectedBlock();
      const glow = ix.getPlaceEmissive();

      if (op === 'undo') {
        if (history.undo(grid)) commit(true, 'Undo');
        return;
      }
      if (op === 'redo') {
        if (history.redo(grid)) commit(true, 'Redo');
        return;
      }
      if (op === 'copy') {
        clipboard = copySelection(grid);
        opts.onStatus(clipboard ? 'Copied model' : 'Nothing to copy');
        return;
      }
      if (op === 'paste') {
        if (!clipboard) {
          opts.onStatus('Clipboard empty');
          return;
        }
        const ox = Math.floor((LOCAL_GRID_SIZE - clipboard.sizeX) / 2);
        const oy = Math.floor((LOCAL_GRID_SIZE - clipboard.sizeY) / 2);
        const oz = Math.floor((LOCAL_GRID_SIZE - clipboard.sizeZ) / 2);
        withHistory(() => pasteClipboard(grid, clipboard!, ox, oy, oz), 'Pasted');
        return;
      }
      if (op === 'replace') {
        const hit = ix.getHoverHit();
        if (!hit) {
          opts.onStatus('Hover a voxel to replace its color');
          return;
        }
        const from = grid.get(hit.x, hit.y, hit.z);
        if (from === Block.Air) {
          opts.onStatus('Hover a solid voxel');
          return;
        }
        withHistory(() => replaceColor(grid, from, brush, glow), 'Replaced color');
        return;
      }

      const ops: Record<string, () => boolean | number> = {
        'flip-x': () => flipGrid(grid, 'x'),
        'flip-y': () => flipGrid(grid, 'y'),
        'flip-z': () => flipGrid(grid, 'z'),
        'rot-x': () => rotateGrid90(grid, 'x'),
        'rot-y': () => rotateGrid90(grid, 'y'),
        'rot-z': () => rotateGrid90(grid, 'z'),
        center: () => centerGrid(grid),
        floor: () => floorGrid(grid),
        dup: () => duplicateInPlace(grid),
        hollow: () => hollowGrid(grid),
        shell: () => shellExpand(grid, brush, glow),
        'glow-on': () => toggleGlowAll(grid, true),
        'glow-off': () => toggleGlowAll(grid, false),
        'fill-floor': () => fillLayerY(grid, 0, brush, glow),
        'clear-top': () => clearLayerY(grid, LOCAL_GRID_SIZE - 1),
        'nudge--x': () => translateGrid(grid, -1, 0, 0),
        'nudge-+x': () => translateGrid(grid, 1, 0, 0),
        'nudge--y': () => translateGrid(grid, 0, -1, 0),
        'nudge-+y': () => translateGrid(grid, 0, 1, 0),
        'nudge--z': () => translateGrid(grid, 0, 0, -1),
        'nudge-+z': () => translateGrid(grid, 0, 0, 1),
      };
      const fn = ops[op];
      if (fn) withHistory(fn);
    });
  });
}
