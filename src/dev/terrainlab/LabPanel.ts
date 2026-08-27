/**
 * Control panel for the terrain resolution lab. Developer tooling only.
 * Every displayed number comes from a real measurement taken by TerrainView.
 */
import { TERRAIN_RESOLUTIONS, type TerrainResolution } from '../../world/preview/TerrainField';
import type { ViewMetrics } from '../../world/preview/TerrainView';
import type { ViewName } from '../../world/preview/CameraRig';
import type { LabMode } from './TerrainLab';

const VIEWS: ViewName[] = ['panorama', 'hilltop', 'ground'];
const MODES: { id: LabMode; label: string }[] = [
  { id: 'single', label: 'Single' },
  { id: 'split', label: 'Side by side' },
  { id: 'overlay', label: 'Overlay' },
  { id: 'reference', label: 'Reference' },
];

const CHECKLIST = [
  'Small voxel appearance',
  'Natural hills',
  'Smooth stepped slopes',
  'Broad valleys',
  'Mountain silhouette',
  'Terrain depth',
  'Horizon quality',
  'River integration',
  'Forest placement',
  'Ground detail',
];

export interface LabPanelOptions {
  initialTarget: TerrainResolution | null;
  onResolution: (slot: 'a' | 'b', r: TerrainResolution) => void;
  onView: (v: ViewName) => void;
  onMode: (m: LabMode) => void;
  onLink: (on: boolean) => void;
  onOverlay: (v: number) => void;
  onReference: (i: number) => void;
  onSetTarget: (r: TerrainResolution) => void;
  onRecenter: () => void;
}

export class LabPanel {
  readonly root = document.createElement('div');
  private statusEl = document.createElement('div');
  private barEl = document.createElement('i');
  private metricsEl = document.createElement('div');
  private targetEl = document.createElement('div');
  private compareBlock = document.createElement('div');
  private referenceBlock = document.createElement('div');
  private resA: TerrainResolution = 1;
  private fps = 0;
  private lastA: ViewMetrics | null = null;
  private lastB: ViewMetrics | null = null;
  private target: TerrainResolution | null;

  constructor(private opts: LabPanelOptions) {
    this.target = opts.initialTarget;
    this.root.className = 'vy-lab__panel';

    const title = document.createElement('h2');
    title.textContent = 'Terrain Resolution Lab';
    const note = document.createElement('p');
    note.className = 'vy-lab__note';
    note.textContent = 'Developer evaluation prototype. Does not affect gameplay or saves.';

    this.statusEl.className = 'vy-lab__status';
    const bar = document.createElement('div');
    bar.className = 'vy-lab__bar';
    bar.appendChild(this.barEl);

    const resRow = this.resolutionRow('a');
    const viewRow = row(
      VIEWS.map((v) => ({ label: v, active: v === 'panorama', on: () => opts.onView(v) })),
    );
    const modeRow = row(
      MODES.map((m) => ({
        label: m.label,
        active: m.id === 'single',
        on: () => {
          this.compareBlock.hidden = m.id !== 'split' && m.id !== 'overlay';
          this.referenceBlock.hidden = m.id !== 'reference';
          opts.onMode(m.id);
        },
      })),
    );

    // --- Compare block (second resolution, link, overlay slider) ---
    this.compareBlock.hidden = true;
    const link = document.createElement('label');
    link.className = 'vy-lab__check';
    const linkBox = document.createElement('input');
    linkBox.type = 'checkbox';
    linkBox.checked = true;
    linkBox.onchange = () => opts.onLink(linkBox.checked);
    link.append(linkBox, document.createTextNode('Link cameras'));

    const overlay = document.createElement('input');
    overlay.type = 'range';
    overlay.min = '0';
    overlay.max = '1';
    overlay.step = '0.02';
    overlay.value = '0.5';
    overlay.oninput = () => opts.onOverlay(Number(overlay.value));

    this.compareBlock.append(
      label('Compare against'),
      this.resolutionRow('b'),
      link,
      label('Overlay blend'),
      overlay,
    );

    // --- Reference block ---
    this.referenceBlock.hidden = true;
    this.referenceBlock.append(
      label('Reference image'),
      row(
        Array.from({ length: 7 }, (_, i) => ({
          label: String(i + 1),
          active: i === 2,
          on: () => opts.onReference(i + 1),
        })),
      ),
    );

    const recenter = document.createElement('button');
    recenter.className = 'vy-lab__wide';
    recenter.textContent = 'Reset camera to preset';
    recenter.onclick = () => opts.onRecenter();

    const hint = document.createElement('p');
    hint.className = 'vy-lab__note';
    hint.textContent = 'Drag to look · scroll to dolly · WASD to move · Q/E for height.';

    this.root.append(
      title,
      note,
      label('Terrain resolution'),
      resRow,
      this.targetEl,
      this.statusEl,
      bar,
      label('Test view'),
      viewRow,
      label('Comparison mode'),
      modeRow,
      this.compareBlock,
      this.referenceBlock,
      recenter,
      hint,
      this.metricsEl,
      this.checklist(),
    );

    this.renderTarget();
  }

  private resolutionRow(slot: 'a' | 'b'): HTMLDivElement {
    const active = slot === 'a' ? 1 : 0.25;
    return row(
      TERRAIN_RESOLUTIONS.map((r) => ({
        label: fmt(r),
        active: r === active,
        on: () => {
          if (slot === 'a') this.resA = r;
          this.renderTarget();
          this.opts.onResolution(slot, r);
        },
      })),
    );
  }

  private checklist(): HTMLDivElement {
    const wrap = document.createElement('div');
    wrap.className = 'vy-lab__checklist';
    wrap.appendChild(label('Lay-of-the-land check'));
    for (const item of CHECKLIST) {
      const l = document.createElement('label');
      l.className = 'vy-lab__check';
      const box = document.createElement('input');
      box.type = 'checkbox';
      l.append(box, document.createTextNode(item));
      wrap.appendChild(l);
    }
    const note = document.createElement('p');
    note.className = 'vy-lab__note';
    note.textContent = 'Manual developer assessment. Not an automated score.';
    wrap.appendChild(note);
    return wrap;
  }

  private renderTarget(): void {
    this.targetEl.className = 'vy-lab__target';
    this.targetEl.innerHTML = '';
    const current = document.createElement('span');
    current.innerHTML = `RESOLUTION: <b>${fmt(this.resA)}</b>`;
    const btn = document.createElement('button');
    btn.textContent = 'Set as target';
    btn.onclick = () => {
      this.target = this.resA;
      this.opts.onSetTarget(this.resA);
      this.renderTarget();
    };
    const saved = document.createElement('span');
    saved.className = 'vy-lab__saved';
    saved.textContent = this.target ? `target: ${fmt(this.target)}` : 'no target set';
    this.targetEl.append(current, btn, saved);
  }

  setStatus(text: string, progress: number): void {
    this.statusEl.textContent = text;
    this.barEl.style.width = `${Math.round(progress * 100)}%`;
  }

  setRuntime(fps: number): void {
    this.fps = fps;
    this.setMetrics(this.lastA, this.lastB);
  }

  setMetrics(a: ViewMetrics | null, b: ViewMetrics | null): void {
    this.lastA = a;
    this.lastB = b;
    if (!a) return;
    const heap = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;

    const rows: [string, (m: ViewMetrics) => string][] = [
      ['Voxel size', (m) => `${m.resolution}`],
      ['Cells / gameplay block', (m) => `${m.cellsPerBlockAxis} axis · ${m.cellsPerBlockVol} vol`],
      ['Terrain cells', (m) => m.terrainCells.toLocaleString()],
      ['Mesh triangles', (m) => m.triangles.toLocaleString()],
      ['Mesh memory (GPU buffers)', (m) => mb(m.geometryBytes)],
      ['Heightfield RAM', (m) => mb(m.heightfieldBytes)],
      ['Terrain generation', (m) => `${m.genMs.toFixed(1)} ms`],
      ['Meshing', (m) => `${m.meshMs.toFixed(1)} ms`],
      ['Collision (10k queries)', (m) => `${m.collisionMs.toFixed(1)} ms`],
      ['Greedy merge saving', (m) => `${(100 - (m.quadsAfter / Math.max(1, m.quadsBefore)) * 100).toFixed(1)}%`],
      ['Draw calls', (m) => `${m.drawCalls}`],
      ['Visible tiles', (m) => `${m.tiles}`],
    ];

    const head = b
      ? `<div class="vy-lab__m vy-lab__m--head"><span></span><b>${fmt(a.resolution)}</b><b>${fmt(b.resolution)}</b></div>`
      : '';

    const body = rows
      .map(([k, get]) => {
        const cells = b ? `<b>${get(a)}</b><b>${get(b)}</b>` : `<b>${get(a)}</b>`;
        return `<div class="vy-lab__m${b ? ' vy-lab__m--pair' : ''}"><span>${k}</span>${cells}</div>`;
      })
      .join('');

    const runtime = [
      ['FPS', this.fps ? this.fps.toFixed(0) : '—'],
      ['RAM (JS heap)', heap ? mb(heap.usedJSHeapSize) : 'unavailable in this browser'],
      ['VRAM', 'not exposed by WebGL — see mesh memory'],
    ]
      .map(([k, v]) => `<div class="vy-lab__m"><span>${k}</span><b>${v}</b></div>`)
      .join('');

    this.metricsEl.className = 'vy-lab__metrics';
    this.metricsEl.innerHTML = head + body + runtime;
  }
}

function fmt(r: number): string {
  return r === 1 ? '1.00' : r === 0.5 ? '0.50' : r === 0.25 ? '0.25' : '0.125';
}

function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function label(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'vy-lab__label';
  el.textContent = text;
  return el;
}

function row(items: { label: string; active?: boolean; on: () => void }[]): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'vy-lab__row';
  for (const item of items) {
    const b = document.createElement('button');
    b.textContent = item.label;
    if (item.active) b.classList.add('is-active');
    b.onclick = () => {
      for (const other of el.querySelectorAll('button')) other.classList.remove('is-active');
      b.classList.add('is-active');
      item.on();
    };
    el.appendChild(b);
  }
  return el;
}

