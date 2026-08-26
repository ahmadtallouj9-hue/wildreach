import type { ModAnimatePanel } from './ModAnimatePanel';
import type { ModLogicPanel } from './ModLogicPanel';
import type { TextureMakerPanel } from './TextureMakerPanel';
import { publicGameOrigin } from '../util/publicUrl';

type EditorMode = 'shape' | 'texture' | 'animate' | 'logic';

const MODE_LABELS: Record<EditorMode, string> = {
  shape: 'Modeling',
  texture: 'Texturing',
  animate: 'Animation',
  logic: 'Character',
};

function closeAllMenus(root: HTMLElement): void {
  root.querySelectorAll('.mod-studio-dropdown').forEach((el) => {
    (el as HTMLElement).hidden = true;
  });
}

/** Reparent panels into Blockbench-style layout regions. */
export function mountModelEditorLayout(
  root: HTMLElement,
  texMaker: TextureMakerPanel,
  animatePanel: ModAnimatePanel,
  logicPanel: ModLogicPanel,
): void {
  const hierarchySlot = root.querySelector('.mod-studio-hierarchy-slot')!;
  const materialsTexSlot = root.querySelector('.mod-studio-materials-tex-slot')!;
  const previewSlot = root.querySelector('.mod-studio-preview-slot')!;
  const inspectorSlot = root.querySelector('.mod-studio-inspector-slot')!;
  const timelineSlot = root.querySelector('.mod-studio-timeline-slot')!;

  const outliner = animatePanel.root.querySelector('.mod-anim-outliner');
  if (outliner) hierarchySlot.appendChild(outliner);

  const inspector = animatePanel.root.querySelector('.mod-anim-inspector');
  if (inspector) inspectorSlot.appendChild(inspector);

  const timeline = animatePanel.root.querySelector('.mod-anim-timeline');
  if (timeline) timelineSlot.appendChild(timeline);

  texMaker.root.hidden = false;
  texMaker.root.classList.add('mod-tex-embedded');
  const canvasSection = texMaker.root.querySelector('.mod-tex-canvas-section');
  const previewSection = texMaker.root.querySelector('.mod-tex-preview-section');
  if (canvasSection) materialsTexSlot.appendChild(canvasSection);
  if (previewSection) previewSlot.appendChild(previewSection);

  const logicSlot = root.querySelector('.mod-studio-logic-slot');
  logicPanel.root.classList.add('mod-studio-logic-docked');
  logicPanel.root.hidden = false;
  if (logicSlot) logicSlot.appendChild(logicPanel.root);
  else root.querySelector('.mod-studio-shell')?.appendChild(logicPanel.root);
  animatePanel.root.hidden = true;

  const shareUrl = root.querySelector('.mod-studio-share-url') as HTMLAnchorElement | null;
  if (shareUrl) {
    const href = publicGameOrigin();
    shareUrl.href = href;
    shareUrl.textContent = href.replace(/^https?:\/\//, '');
  }
}

/** Reparent inspector + adjust slots per editor mode. */
export function layoutStudioForMode(
  root: HTMLElement,
  mode: EditorMode,
  _animatePanel: ModAnimatePanel,
): void {
  const inspector = root.querySelector('.mod-anim-inspector');
  const inspectorSlot = root.querySelector('.mod-studio-inspector-slot');
  const paintPanel = root.querySelector('.mod-studio-panel--paint');
  const timelineSlot = root.querySelector('.mod-studio-timeline-slot') as HTMLElement | null;
  const scenePanel = root.querySelector('.mod-studio-panel--scene') as HTMLElement | null;
  const materialsPanel = root.querySelector('.mod-studio-panel--materials') as HTMLElement | null;

  if (timelineSlot) {
    timelineSlot.hidden = mode !== 'animate';
    timelineSlot.classList.toggle('is-open', mode === 'animate');
  }

  root.querySelectorAll('.mod-character-only').forEach((el) => {
    (el as HTMLElement).hidden = mode !== 'logic';
  });
  if (scenePanel) scenePanel.hidden = mode === 'logic';
  if (materialsPanel) materialsPanel.hidden = mode === 'logic';
  if (paintPanel) (paintPanel as HTMLElement).hidden = mode === 'logic';

  if (!inspector || !paintPanel || !inspectorSlot) return;

  // Inspector lives in the right rail (Blockbench-style side panel).
  inspectorSlot.appendChild(inspector);
  paintPanel.classList.toggle('mod-studio-panel--inspector-host', mode === 'animate');
}

export function bindModelEditorMenus(
  root: HTMLElement,
  onMode: (mode: EditorMode) => void,
): AbortController {
  const ac = new AbortController();
  const { signal } = ac;
  root.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      closeAllMenus(root);
      onMode((btn as HTMLElement).dataset.mode as EditorMode);
    }, { signal });
  });

  root.querySelectorAll('.mod-studio-menu-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const menu = btn.closest('.mod-studio-menu');
      const drop = menu?.querySelector('.mod-studio-dropdown') as HTMLElement | null;
      if (!drop) return;
      const opening = drop.hidden;
      closeAllMenus(root);
      drop.hidden = !opening;
    }, { signal });
  });

  root.querySelectorAll('.mod-studio-dropdown button').forEach((btn) => {
    btn.addEventListener('click', () => closeAllMenus(root), { signal });
  });

  root.querySelector('[data-action="copy-studio-link"]')?.addEventListener('click', async () => {
    const url = (root.querySelector('.mod-studio-share-url') as HTMLAnchorElement | null)?.href;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      const toast = root.querySelector('.mod-workshop-status');
      if (toast) toast.textContent = 'Link copied';
    } catch {
      /* ignore */
    }
  }, { signal });

  root.querySelector('.mod-studio-search')?.addEventListener('input', (e) => {
    const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
    root.querySelectorAll('.mod-anim-tree [role="treeitem"]').forEach((item) => {
      const el = item as HTMLElement;
      const name = el.textContent?.toLowerCase() ?? '';
      el.hidden = q.length > 0 && !name.includes(q);
    });
  }, { signal });

  document.addEventListener('pointerdown', (e) => {
    if ((e.target as HTMLElement).closest('.mod-studio-menu')) return;
    closeAllMenus(root);
  }, { signal });

  return ac;
}

export function syncModelEditorChrome(
  root: HTMLElement,
  mode: EditorMode,
  modelName: string,
  voxelCount: number,
  voxelLimit: number,
): void {
  const fileName = `${modelName || 'Character'}.vxl`;
  const pct = voxelLimit > 0 ? Math.min(100, (voxelCount / voxelLimit) * 100) : 0;

  root.classList.remove(
    'mod-studio-mode-shape',
    'mod-studio-mode-texture',
    'mod-studio-mode-animate',
    'mod-studio-mode-logic',
    'forge-mode-shape',
    'forge-mode-texture',
    'forge-mode-animate',
    'forge-mode-logic',
  );
  root.classList.add(`mod-studio-mode-${mode}`, `forge-mode-${mode}`);

  root.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.classList.toggle('active', (btn as HTMLElement).dataset.mode === mode);
  });

  const label = MODE_LABELS[mode];
  root.querySelectorAll('.forge-mode-label').forEach((el) => {
    el.textContent = label;
  });

  root.querySelectorAll('.forge-viewport-model, .forge-model-file').forEach((el) => {
    el.textContent = fileName;
  });

  root.querySelectorAll('.mod-studio-status-name').forEach((el) => {
    el.textContent = fileName;
  });

  root.querySelectorAll('[data-blocks]').forEach((el) => {
    el.textContent = String(voxelCount);
  });
  root.querySelectorAll('[data-limit]').forEach((el) => {
    el.textContent = String(voxelLimit);
  });

  const fill = root.querySelector('.mod-studio-progress-fill') as HTMLElement | null;
  if (fill) fill.style.width = `${pct}%`;
}

export function refreshMaterialsInUse(
  root: HTMLElement,
  usedIds: number[],
  nameFor: (id: number) => string,
  cssFor: (id: number) => string,
): void {
  const list = root.querySelector('.vxl-mats-in-use');
  if (!list) return;
  list.replaceChildren();
  if (!usedIds.length) {
    const li = document.createElement('li');
    li.className = 'mod-studio-used-empty';
    li.textContent = 'None yet';
    list.appendChild(li);
    return;
  }
  for (const id of usedIds) {
    const li = document.createElement('li');
    li.textContent = nameFor(id);
    li.style.setProperty('--mat-color', cssFor(id));
    li.className = 'mod-studio-used-item';
    list.appendChild(li);
  }
}

export function populateMatSelects(
  root: HTMLElement,
  ids: number[],
  nameFor: (id: number) => string,
  selected: number,
): void {
  for (const sel of root.querySelectorAll<HTMLSelectElement>('.vxl-mat-face, .vxl-mat-torso')) {
    const cur = sel.value;
    sel.replaceChildren();
    for (const id of ids) {
      const opt = document.createElement('option');
      opt.value = String(id);
      const label = nameFor(id);
      opt.textContent = sel.classList.contains('vxl-mat-face')
        ? `Face (${label})`
        : `Torso (${label})`;
      sel.appendChild(opt);
    }
    sel.value = cur && ids.includes(Number(cur)) ? cur : String(selected);
  }
}

export function bindTextureLeftRail(toolsRoot: HTMLElement, texMaker: TextureMakerPanel): void {
  const syncToolIcons = (tool: string) => {
    toolsRoot.querySelectorAll('[data-tex-tool]').forEach((btn) => {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.texTool === tool);
    });
  };

  toolsRoot.querySelectorAll('[data-tex-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tool = (btn as HTMLElement).dataset.texTool!;
      texMaker.setPaintTool(tool as 'paint' | 'erase' | 'eyedrop' | 'bucket' | 'line');
      syncToolIcons(tool);
    });
  });

  toolsRoot.querySelectorAll('[data-brush-row] [data-brush]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const n = Number((btn as HTMLElement).dataset.brush) || 1;
      texMaker.setBrushSizeExternal(n);
      toolsRoot.querySelectorAll('[data-brush-row] [data-brush]').forEach((b) => {
        b.classList.toggle('active', Number((b as HTMLElement).dataset.brush) === n);
      });
    });
  });

  toolsRoot.querySelectorAll('[data-tog]').forEach((btn) => {
    btn.addEventListener('click', () => texMaker.externalToggle((btn as HTMLElement).dataset.tog!));
  });

  texMaker.root.addEventListener('vxl-tex-tog', ((e: CustomEvent<{ tog: string; on: boolean }>) => {
    const { tog, on } = e.detail;
    toolsRoot.querySelectorAll(`[data-tog="${tog}"]`).forEach((el) => {
      el.classList.toggle('active', on);
    });
  }) as EventListener);

  toolsRoot.querySelector('[data-action="apply-texture"]')?.addEventListener('click', () => {
    texMaker.applyNow();
  });
  toolsRoot.querySelector('[data-action="new-block"]')?.addEventListener('click', () => {
    texMaker.createBlockNow();
  });
  toolsRoot.querySelector('[data-action="import-texture"]')?.addEventListener('click', () => {
    texMaker.openImportDialog();
  });
  toolsRoot.querySelector('[data-action="export-texture"]')?.addEventListener('click', () => {
    texMaker.exportTexturePng();
  });

  syncToolIcons('paint');
}

export function bindPaintPanelActions(
  paintRoot: HTMLElement,
  texMaker: TextureMakerPanel,
  colorRoot: HTMLElement,
): void {
  paintRoot.querySelector('[data-action="apply-texture"]')?.addEventListener('click', () => {
    texMaker.applyNow();
  });
  paintRoot.querySelector('[data-action="new-block"]')?.addEventListener('click', () => {
    texMaker.createBlockNow();
  });
  paintRoot.querySelector('[data-action="add-color"]')?.addEventListener('click', () => {
    colorRoot.querySelector('[data-action="add-color"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  paintRoot.querySelector('[data-action="save-color"]')?.addEventListener('click', () => {
    colorRoot.querySelector('[data-action="add-color"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

export function syncViewToggles(root: HTMLElement, texMaker: TextureMakerPanel): void {
  for (const tog of ['grid', 'check'] as const) {
    const on = texMaker.getToggleState(tog);
    root.querySelectorAll(`[data-tog="${tog}"]`).forEach((el) => {
      el.classList.toggle('active', on);
    });
  }
}

export function syncTimelineStatus(root: HTMLElement, frame: number, speed: number, fps: number): void {
  const frameEl = root.querySelector('[data-frame]');
  if (frameEl) frameEl.textContent = String(frame);
  const speedEl = root.querySelector('[data-speed]');
  if (speedEl) speedEl.textContent = `${speed}×`;
  const fpsEl = root.querySelector('[data-fps]');
  if (fpsEl) fpsEl.textContent = String(fps);
}
