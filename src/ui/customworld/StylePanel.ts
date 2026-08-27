/**
 * Control panel for the Custom World editor.
 *
 * Every control is generated from PARAM_SPECS, so the panel, the clamping
 * applied to imported styles and the randomizer can never drift apart.
 */
import {
  CLOUD_STYLES,
  LANDSCAPE_STYLES,
  PARAM_SPECS,
  RESOLUTION_LABELS,
  SKY_STYLES,
  TERRAIN_RESOLUTIONS,
  readParam,
  type LandscapeStyle,
  type LockState,
  type ParamSpec,
  type StyleGroup,
  type TerrainResolution,
  type VytheraWorldStyle,
} from '../../world/style/WorldStyle';
import { VEGETATION_PRESETS } from '../../world/style/stylePresets';

export type EditorMode = 'basic' | 'advanced';
export type PreviewView = 'panorama' | 'hilltop' | 'ground' | 'map';

const GROUP_LABELS: Record<StyleGroup, string> = {
  terrain: 'Terrain',
  water: 'Water',
  biome: 'Biomes',
  vegetation: 'Vegetation',
  atmosphere: 'Atmosphere',
};

export interface StylePanelHandlers {
  onParam: (spec: ParamSpec, value: number) => void;
  onResolution: (r: TerrainResolution) => void;
  onLandscape: (id: LandscapeStyle) => void;
  onVegetationPreset: (id: string) => void;
  onSky: (id: string) => void;
  onCloud: (id: string) => void;
  onSeed: (seed: string) => void;
  onRandomSeed: () => void;
  onLockToggle: (group: StyleGroup, locked: boolean) => void;
  onMode: (mode: EditorMode) => void;
  onView: (view: PreviewView) => void;
}

export class StylePanel {
  readonly root = document.createElement('div');
  private body = document.createElement('div');
  private mode: EditorMode = 'basic';
  private style: VytheraWorldStyle;
  private locks: LockState;

  constructor(
    style: VytheraWorldStyle,
    locks: LockState,
    private handlers: StylePanelHandlers,
  ) {
    this.style = style;
    this.locks = locks;
    this.root.className = 'vy-cw__panel';
    this.body.className = 'vy-cw__body';
    this.root.append(this.header(), this.body);
    this.render();
  }

  update(style: VytheraWorldStyle, locks: LockState): void {
    this.style = style;
    this.locks = locks;
    this.render();
  }

  /**
   * Adopt a new style without rebuilding the DOM. Slider drags must not
   * re-render (that would drop the control being dragged), but the panel still
   * has to know the current values so a later re-render is not stale.
   */
  sync(style: VytheraWorldStyle): void {
    this.style = style;
  }

  private header(): HTMLElement {
    const head = document.createElement('div');
    head.className = 'vy-cw__head';

    const title = document.createElement('h2');
    title.textContent = 'Custom World';
    const sub = document.createElement('p');
    sub.className = 'vy-cw__note';
    sub.textContent = 'Design a world style, preview it, then create a world with it.';

    const modes = segmented(
      [
        { id: 'basic', label: 'Basic' },
        { id: 'advanced', label: 'Advanced' },
      ],
      this.mode,
      (id) => {
        this.mode = id as EditorMode;
        this.handlers.onMode(this.mode);
        this.render();
      },
    );

    const views = segmented(
      [
        { id: 'panorama', label: 'Panorama' },
        { id: 'hilltop', label: 'Hilltop' },
        { id: 'ground', label: 'Ground' },
        { id: 'map', label: 'Map' },
      ],
      'panorama',
      (id) => this.handlers.onView(id as PreviewView),
    );

    head.append(title, sub, label('Editor'), modes, label('Preview'), views);
    return head;
  }

  private render(): void {
    this.body.innerHTML = '';
    this.body.append(this.seedRow(), this.landscapeRow(), this.resolutionRow());

    const groups: StyleGroup[] = ['terrain', 'water', 'biome', 'vegetation', 'atmosphere'];
    for (const group of groups) {
      const specs = PARAM_SPECS.filter(
        (s) => s.group === group && (this.mode === 'advanced' || s.basic),
      );
      const extras = group === 'vegetation' || group === 'atmosphere';
      if (specs.length === 0 && !extras) continue;

      const section = document.createElement('section');
      section.className = 'vy-cw__section';
      section.append(this.sectionHead(group));

      if (group === 'vegetation') section.append(this.vegetationPresets());
      for (const spec of specs) section.append(this.slider(spec));
      if (group === 'atmosphere') section.append(this.atmosphereSelects());

      this.body.append(section);
    }
  }

  private sectionHead(group: StyleGroup): HTMLElement {
    const row = document.createElement('div');
    row.className = 'vy-cw__sectionhead';

    const title = document.createElement('h3');
    title.textContent = GROUP_LABELS[group];

    const lock = document.createElement('label');
    lock.className = 'vy-cw__lock';
    lock.title = 'Locked groups are left alone by Randomize and landscape presets';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = this.locks[group];
    box.onchange = () => this.handlers.onLockToggle(group, box.checked);
    lock.append(box, document.createTextNode('Lock'));

    row.append(title, lock);
    return row;
  }

  private seedRow(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'vy-cw__section';
    wrap.append(label('World seed'));

    const row = document.createElement('div');
    row.className = 'vy-cw__seed';
    const input = document.createElement('input');
    input.type = 'text';
    input.value = this.style.seed;
    input.maxLength = 64;
    input.onchange = () => this.handlers.onSeed(input.value);

    const dice = document.createElement('button');
    dice.textContent = 'Randomize';
    dice.onclick = () => this.handlers.onRandomSeed();

    row.append(input, dice);
    wrap.append(row);

    const hint = document.createElement('p');
    hint.className = 'vy-cw__note';
    hint.textContent = 'Same seed and same settings always produce the same world.';
    wrap.append(hint);
    return wrap;
  }

  private landscapeRow(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'vy-cw__section';
    wrap.append(label('Landscape style'));
    wrap.append(
      segmented(
        LANDSCAPE_STYLES.map((s) => ({ id: s.id, label: s.label })),
        this.style.landscape,
        (id) => this.handlers.onLandscape(id as LandscapeStyle),
      ),
    );
    return wrap;
  }

  private resolutionRow(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'vy-cw__section';
    wrap.append(label('Terrain detail'));

    const row = document.createElement('div');
    row.className = 'vy-cw__row';
    for (const r of TERRAIN_RESOLUTIONS) {
      const meta = RESOLUTION_LABELS[String(r)]!;
      const btn = document.createElement('button');
      btn.className = 'vy-cw__res';
      btn.innerHTML = `<b>${meta.name}</b><span>${r}</span>`;
      btn.title = meta.note;
      if (this.style.terrainVoxelSize === r) btn.classList.add('is-active');
      btn.onclick = () => this.handlers.onResolution(r);
      row.append(btn);
    }
    wrap.append(row);

    const meta = RESOLUTION_LABELS[String(this.style.terrainVoxelSize)]!;
    const note = document.createElement('p');
    note.className = meta.costly ? 'vy-cw__note vy-cw__note--warn' : 'vy-cw__note';
    note.textContent = meta.costly ? `Heavier setting. ${meta.note}` : meta.note;
    wrap.append(note);
    return wrap;
  }

  private vegetationPresets(): HTMLElement {
    return segmented(
      Object.keys(VEGETATION_PRESETS).map((id) => ({ id, label: capitalize(id) })),
      '',
      (id) => this.handlers.onVegetationPreset(id),
    );
  }

  private atmosphereSelects(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.append(label('Sky'));
    wrap.append(
      segmented(
        SKY_STYLES.map((id) => ({ id, label: capitalize(id) })),
        this.style.atmosphere.skyStyle,
        (id) => this.handlers.onSky(id),
      ),
    );
    wrap.append(label('Clouds'));
    wrap.append(
      segmented(
        CLOUD_STYLES.map((id) => ({ id, label: capitalize(id) })),
        this.style.atmosphere.cloudStyle,
        (id) => this.handlers.onCloud(id),
      ),
    );
    return wrap;
  }

  private slider(spec: ParamSpec): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'vy-cw__control';

    const head = document.createElement('div');
    head.className = 'vy-cw__controlhead';
    const name = document.createElement('span');
    name.textContent = spec.label;
    const value = document.createElement('b');
    const current = readParam(this.style, spec);
    value.textContent = formatValue(current, spec);

    head.append(name, value);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(current);
    input.disabled = this.locks[spec.group];
    input.oninput = () => {
      const v = Number(input.value);
      value.textContent = formatValue(v, spec);
      this.handlers.onParam(spec, v);
    };

    wrap.append(head, input);
    if (spec.hint) {
      const hint = document.createElement('p');
      hint.className = 'vy-cw__hint';
      hint.textContent = spec.hint;
      wrap.append(hint);
    }
    return wrap;
  }
}

function formatValue(v: number, spec: ParamSpec): string {
  if (spec.unit) return `${Math.round(v)} ${spec.unit}`;
  return v.toFixed(2);
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function label(text: string): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'vy-cw__label';
  el.textContent = text;
  return el;
}

function segmented(
  items: { id: string; label: string }[],
  active: string,
  onPick: (id: string) => void,
): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'vy-cw__row';
  for (const item of items) {
    const btn = document.createElement('button');
    btn.textContent = item.label;
    if (item.id === active) btn.classList.add('is-active');
    btn.onclick = () => {
      for (const other of row.querySelectorAll('button')) other.classList.remove('is-active');
      btn.classList.add('is-active');
      onPick(item.id);
    };
    row.append(btn);
  }
  return row;
}
