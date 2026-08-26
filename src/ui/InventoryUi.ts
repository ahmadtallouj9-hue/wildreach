import { Block, BLOCK_COLORS } from '../world/blocks';
import { CraftingGrid, RECIPES } from '../player/Crafting';
import {
  HOTBAR_SIZE,
  INV_SIZE,
  STACK_MAX,
  type Inventory,
  type ItemStack,
} from '../player/Inventory';

export const BLOCK_NAMES: Record<number, string> = {
  [Block.Grass]: 'Grass',
  [Block.Dirt]: 'Dirt',
  [Block.Stone]: 'Stone',
  [Block.Sand]: 'Sand',
  [Block.Water]: 'Water',
  [Block.Wood]: 'Wood',
  [Block.Leaves]: 'Leaves',
  [Block.Snow]: 'Snow',
  [Block.Clay]: 'Clay',
  [Block.Crystal]: 'Crystal',
  [Block.Ruin]: 'Ruin',
  [Block.Moss]: 'Moss',
  [Block.Gravel]: 'Gravel',
  [Block.Ice]: 'Ice',
  [Block.DarkStone]: 'Dark stone',
  [Block.Torch]: 'Torch',
  [Block.Lava]: 'Lava',
};

/** Short type label shown in the look-at viewer. */
export const BLOCK_KINDS: Record<number, string> = {
  [Block.Grass]: 'Surface block',
  [Block.Dirt]: 'Soil',
  [Block.Stone]: 'Building block',
  [Block.Sand]: 'Loose sediment',
  [Block.Water]: 'Fluid',
  [Block.Wood]: 'Natural material',
  [Block.Leaves]: 'Foliage',
  [Block.Snow]: 'Surface cover',
  [Block.Clay]: 'Sediment',
  [Block.Crystal]: 'Rare mineral',
  [Block.Ruin]: 'Structure block',
  [Block.Moss]: 'Growth',
  [Block.Gravel]: 'Loose rock',
  [Block.Ice]: 'Frozen water',
  [Block.DarkStone]: 'Deep rock',
  [Block.Torch]: 'Light source',
  [Block.Lava]: 'Molten fluid',
};

export function blockCssColor(id: number): string {
  const c = BLOCK_COLORS[id] ?? [1, 0, 1];
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

type PanelTab = 'pack' | 'guide';
type SlotKind = 'inv' | 'craft' | 'result';

export class InventoryUi {
  readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly hotbarEl: HTMLElement;
  private readonly hotbarNameEl: HTMLElement;
  private readonly invGrid: HTMLElement;
  private readonly craftGridEl: HTMLElement;
  private readonly resultSlot: HTMLElement;
  private readonly cursorEl: HTMLElement;
  private tab: PanelTab = 'pack';
  private open = false;
  private cursor: ItemStack | null = null;
  private readonly craft = new CraftingGrid();
  private onChange: (() => void) | null = null;
  private onOpenChange: ((open: boolean) => void) | null = null;

  constructor(private readonly inventory: Inventory) {
    this.root = document.createElement('div');
    this.root.className = 'inv-root vy-inv';
    this.root.innerHTML = `
      <div class="vy-hotbar">
        <div class="vy-hotbar__name" aria-live="polite"></div>
        <div class="vy-hotbar__row" role="listbox" aria-label="Hotbar"></div>
      </div>
      <div class="vy-inv-panel" hidden>
        <header class="vy-inv-head">
          <div class="vy-inv-tabs">
            <button type="button" class="vy-inv-tab is-active" data-tab="pack">Pack</button>
            <button type="button" class="vy-inv-tab" data-tab="guide">Guide</button>
          </div>
          <button type="button" class="vy-btn vy-btn--ghost" data-close aria-label="Close">✕</button>
        </header>
        <div class="vy-inv-body" data-view="pack">
          <section class="vy-craft">
            <h3>Crafting</h3>
            <div class="vy-craft__row">
              <div class="vy-craft__grid"></div>
              <span class="vy-craft__arrow" aria-hidden="true">→</span>
              <div class="vy-slot" data-kind="result" data-index="0"></div>
            </div>
            <p class="vy-craft__hint">Arrange materials, then take the result.</p>
          </section>
          <section class="vy-pack">
            <h3>Satchel</h3>
            <div class="vy-pack__grid"></div>
          </section>
        </div>
        <div class="vy-inv-body" data-view="guide" hidden>
          <section class="vy-pack">
            <h3>Controls</h3>
            <ul class="vy-guide__list">
              <li><kbd>E</kbd> Pack &amp; craft</li>
              <li><kbd>T</kbd> / <kbd>Enter</kbd> Chat (AR / EN)</li>
              <li><kbd>G</kbd> Field guide</li>
              <li><kbd>Ctrl</kbd> Sneak</li>
              <li><kbd>C</kbd> Sit / stand</li>
              <li><kbd>Space</kbd> Jump</li>
              <li><kbd>Shift</kbd> Sprint</li>
              <li><kbd>V</kbd> First / third / front view</li>
              <li><kbd>1–9</kbd> Hotbar · <kbd>F</kbd> / RMB place · LMB break</li>
              <li><kbd>J</kbd> Journal · <kbd>M</kbd> Map</li>
            </ul>
          </section>
          <section class="vy-pack">
            <h3>Recipes</h3>
            <ul class="vy-guide__recipes"></ul>
          </section>
        </div>
      </div>
      <div class="vy-inv-cursor" hidden></div>
    `;

    this.panel = this.root.querySelector('.vy-inv-panel')!;
    this.hotbarEl = this.root.querySelector('.vy-hotbar__row')!;
    this.hotbarNameEl = this.root.querySelector('.vy-hotbar__name')!;
    this.invGrid = this.root.querySelector('.vy-pack__grid')!;
    this.craftGridEl = this.root.querySelector('.vy-craft__grid')!;
    this.resultSlot = this.root.querySelector('[data-kind="result"]')!;
    this.cursorEl = this.root.querySelector('.vy-inv-cursor')!;

    this.buildStaticGrids();
    this.buildGuide();
    this.bind();
    this.refresh();
  }

  onInventoryChange(fn: () => void): void {
    this.onChange = fn;
  }

  onToggle(fn: (open: boolean) => void): void {
    this.onOpenChange = fn;
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    if (this.open === open) return;
    this.open = open;
    this.panel.hidden = !open;
    if (!open) this.returnCursor();
    this.onOpenChange?.(open);
    this.refresh();
  }

  toggle(tab?: PanelTab): void {
    if (tab) {
      this.setTab(tab);
      this.setOpen(true);
      return;
    }
    this.setOpen(!this.open);
  }

  refresh(): void {
    this.paintRow(this.hotbarEl, true);
    this.paintRow(this.invGrid, false);
    this.paintCraft();
    this.paintCursor();
    this.paintHotbarName();
  }

  private setTab(tab: PanelTab): void {
    this.tab = tab;
    this.root.querySelectorAll('.vy-inv-tab').forEach((el) => {
      el.classList.toggle('is-active', (el as HTMLElement).dataset.tab === tab);
    });
    this.root.querySelectorAll('.vy-inv-body').forEach((el) => {
      (el as HTMLElement).hidden = (el as HTMLElement).dataset.view !== tab;
    });
  }

  private buildStaticGrids(): void {
    this.hotbarEl.innerHTML = Array.from({ length: HOTBAR_SIZE }, (_, i) =>
      slotHtml('inv', i, String(i + 1)),
    ).join('');
    this.invGrid.innerHTML = Array.from({ length: INV_SIZE }, (_, i) =>
      slotHtml('inv', i, i < HOTBAR_SIZE ? String(i + 1) : ''),
    ).join('');
    this.craftGridEl.innerHTML = Array.from({ length: 9 }, (_, i) =>
      slotHtml('craft', i, ''),
    ).join('');
  }

  private buildGuide(): void {
    const list = this.root.querySelector('.vy-guide__recipes')!;
    list.innerHTML = RECIPES.map(
      (r) => `<li class="vy-guide__recipe">
        <span class="vy-slot__swatch vy-guide__swatch" style="background:${blockCssColor(r.result.id)}"></span>
        <div>
          <strong>${r.name}</strong>
          <span>${r.hint}</span>
        </div>
      </li>`,
    ).join('');
  }

  private bind(): void {
    this.root.querySelector('[data-close]')!.addEventListener('click', () => this.setOpen(false));
    this.root.querySelectorAll('.vy-inv-tab').forEach((btn) => {
      btn.addEventListener('click', () =>
        this.setTab((btn as HTMLElement).dataset.tab as PanelTab),
      );
    });

    this.hotbarEl.addEventListener('click', (e) => {
      const slot = (e.target as HTMLElement).closest('.vy-slot') as HTMLElement | null;
      if (!slot || slot.closest('.vy-inv-panel')) return;
      const idx = Number(slot.dataset.index);
      if (!Number.isFinite(idx)) return;
      this.inventory.setHotbar(idx);
      this.refresh();
      this.onChange?.();
    });

    this.root.addEventListener('click', (e) => {
      const slot = (e.target as HTMLElement).closest('.vy-slot') as HTMLElement | null;
      if (!slot || !this.open) return;
      this.clickSlot(
        slot.dataset.kind as SlotKind,
        Number(slot.dataset.index),
        (e as MouseEvent).shiftKey,
      );
    });

    this.root.addEventListener('contextmenu', (e) => {
      const slot = (e.target as HTMLElement).closest('.vy-slot') as HTMLElement | null;
      if (!slot || !this.open) return;
      e.preventDefault();
      this.clickSlot(slot.dataset.kind as SlotKind, Number(slot.dataset.index), true);
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.cursor) return;
      this.cursorEl.style.left = `${e.clientX + 12}px`;
      this.cursorEl.style.top = `${e.clientY + 12}px`;
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.cursor) return;
      this.cursorEl.style.left = `${e.clientX + 12}px`;
      this.cursorEl.style.top = `${e.clientY + 12}px`;
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE') {
        e.preventDefault();
        if (this.open && this.tab === 'pack') this.setOpen(false);
        else this.toggle('pack');
      }
      if (e.code === 'KeyG') {
        e.preventDefault();
        if (this.open && this.tab === 'guide') this.setOpen(false);
        else this.toggle('guide');
      }
      if (e.code === 'Escape' && this.open) {
        e.preventDefault();
        e.stopPropagation();
        this.setOpen(false);
      }
      const n = e.code.match(/^Digit([1-9])$/);
      if (n) {
        this.inventory.setHotbar(Number(n[1]) - 1);
        this.refresh();
        this.onChange?.();
      }
    });
  }

  private clickSlot(kind: SlotKind, index: number, right: boolean): void {
    if (kind === 'result') {
      this.takeResult();
      return;
    }
    if (kind === 'craft') {
      this.clickStack(this.craft.cells, index, right, (i, s) => this.craft.setCell(i, s));
      this.refresh();
      this.onChange?.();
      return;
    }
    this.clickStack(this.inventory.slots, index, right, (i, s) => this.inventory.setSlot(i, s));
    this.refresh();
    this.onChange?.();
  }

  private clickStack(
    arr: (ItemStack | null)[],
    index: number,
    right: boolean,
    write: (i: number, s: ItemStack | null) => void,
  ): void {
    const cell = arr[index];
    if (this.cursor) {
      if (!cell) {
        if (right) {
          write(index, { id: this.cursor.id, count: 1 });
          this.cursor.count -= 1;
          if (this.cursor.count <= 0) this.cursor = null;
        } else {
          write(index, this.cursor);
          this.cursor = null;
        }
      } else if (cell.id === this.cursor.id) {
        const room = STACK_MAX - cell.count;
        const give = right
          ? Math.min(1, this.cursor.count, room)
          : Math.min(this.cursor.count, room);
        cell.count += give;
        this.cursor.count -= give;
        if (this.cursor.count <= 0) this.cursor = null;
        write(index, cell);
      } else {
        write(index, this.cursor);
        this.cursor = { ...cell };
      }
    } else if (cell) {
      if (right) {
        const half = Math.ceil(cell.count / 2);
        this.cursor = { id: cell.id, count: half };
        cell.count -= half;
        write(index, cell.count > 0 ? cell : null);
      } else {
        this.cursor = { ...cell };
        write(index, null);
      }
    }
  }

  private takeResult(): void {
    const peek = this.craft.peekResult();
    if (!peek) return;
    if (this.cursor && (this.cursor.id !== peek.id || this.cursor.count + peek.count > STACK_MAX)) {
      return;
    }
    const made = this.craft.craftOnce();
    if (!made) return;
    if (this.cursor) this.cursor.count += made.count;
    else this.cursor = made;
    this.refresh();
    this.onChange?.();
  }

  private returnCursor(): void {
    if (this.cursor) {
      this.inventory.add(this.cursor.id, this.cursor.count);
      this.cursor = null;
    }
    for (let i = 0; i < 9; i++) {
      const c = this.craft.cells[i];
      if (c) {
        this.inventory.add(c.id, c.count);
        this.craft.setCell(i, null);
      }
    }
  }

  private paintRow(el: HTMLElement, hotbar: boolean): void {
    const nodes = el.querySelectorAll('.vy-slot');
    const count = hotbar ? HOTBAR_SIZE : INV_SIZE;
    for (let i = 0; i < count; i++) {
      const node = nodes[i] as HTMLElement;
      node.classList.toggle('is-active', hotbar && i === this.inventory.selectedHotbar);
      node.classList.toggle('vy-slot--band', !hotbar && i < HOTBAR_SIZE);
      paintSlot(node, this.inventory.slots[i]);
    }
  }

  private paintCraft(): void {
    const nodes = this.craftGridEl.querySelectorAll('.vy-slot');
    for (let i = 0; i < 9; i++) paintSlot(nodes[i] as HTMLElement, this.craft.cells[i]);
    const result = this.craft.peekResult();
    paintSlot(this.resultSlot, result);
    this.resultSlot.classList.toggle('is-ready', !!result);
  }

  private paintHotbarName(): void {
    const s = this.inventory.selected;
    this.hotbarNameEl.textContent = s ? (BLOCK_NAMES[s.id] ?? 'Block') : '';
  }

  private paintCursor(): void {
    if (!this.cursor) {
      this.cursorEl.hidden = true;
      return;
    }
    this.cursorEl.hidden = false;
    this.cursorEl.innerHTML = stackHtml(this.cursor);
  }
}

function slotHtml(kind: SlotKind, index: number, key: string): string {
  return `<div class="vy-slot" data-kind="${kind}" data-index="${index}">${
    key ? `<span class="vy-slot__key">${key}</span>` : ''
  }</div>`;
}

function paintSlot(el: HTMLElement, stack: ItemStack | null): void {
  const key = el.querySelector('.vy-slot__key');
  const keyHtml = key ? key.outerHTML : '';
  if (!stack) {
    el.innerHTML = keyHtml;
    el.title = '';
    return;
  }
  el.innerHTML = keyHtml + stackHtml(stack);
  el.title = `${BLOCK_NAMES[stack.id] ?? 'Block'} ×${stack.count}`;
}

function stackHtml(stack: ItemStack): string {
  return `<span class="vy-slot__swatch" style="background:${blockCssColor(stack.id)}"></span>
    <span class="vy-slot__count">${stack.count > 1 ? stack.count : ''}</span>`;
}
