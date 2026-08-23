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
  [Block.Wood]: 'Wood',
  [Block.Leaves]: 'Leaves',
  [Block.Snow]: 'Snow',
  [Block.Clay]: 'Clay',
  [Block.Crystal]: 'Crystal',
  [Block.Ruin]: 'Ruin',
  [Block.Moss]: 'Moss',
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
    this.root.className = 'inv-root';
    this.root.innerHTML = `
      <div class="hotbar-wrap">
        <div class="hotbar-name" aria-live="polite"></div>
        <div class="hotbar" role="listbox" aria-label="Hotbar"></div>
      </div>
      <div class="inv-panel" hidden>
        <header class="inv-header">
          <div class="inv-tabs">
            <button type="button" class="inv-tab active" data-tab="pack">Pack</button>
            <button type="button" class="inv-tab" data-tab="guide">Guide</button>
          </div>
          <button type="button" class="inv-close" aria-label="Close">✕</button>
        </header>
        <div class="inv-body" data-view="pack">
          <section class="craft-bay">
            <h3>Craft</h3>
            <div class="craft-row">
              <div class="craft-grid"></div>
              <span class="craft-arrow" aria-hidden="true">→</span>
              <div class="result-slot slot" data-kind="result" data-index="0"></div>
            </div>
            <p class="craft-hint">Arrange materials, then click the result.</p>
          </section>
          <section class="pack-bay">
            <h3>Satchel</h3>
            <div class="inv-grid"></div>
          </section>
        </div>
        <div class="inv-body guide-body" data-view="guide" hidden>
          <section>
            <h3>Controls</h3>
            <ul class="guide-controls">
              <li><kbd>E</kbd> Pack &amp; craft</li>
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
          <section>
            <h3>Recipes</h3>
            <ul class="guide-recipes"></ul>
          </section>
        </div>
      </div>
      <div class="inv-cursor" hidden></div>
    `;

    this.panel = this.root.querySelector('.inv-panel')!;
    this.hotbarEl = this.root.querySelector('.hotbar')!;
    this.hotbarNameEl = this.root.querySelector('.hotbar-name')!;
    this.invGrid = this.root.querySelector('.inv-grid')!;
    this.craftGridEl = this.root.querySelector('.craft-grid')!;
    this.resultSlot = this.root.querySelector('.result-slot')!;
    this.cursorEl = this.root.querySelector('.inv-cursor')!;

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
    this.root.querySelectorAll('.inv-tab').forEach((el) => {
      el.classList.toggle('active', (el as HTMLElement).dataset.tab === tab);
    });
    this.root.querySelectorAll('.inv-body').forEach((el) => {
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
    const list = this.root.querySelector('.guide-recipes')!;
    list.innerHTML = RECIPES.map(
      (r) => `<li>
        <span class="guide-swatch" style="background:${blockCssColor(r.result.id)}"></span>
        <div>
          <strong>${r.name}</strong>
          <span>${r.hint}</span>
        </div>
      </li>`,
    ).join('');
  }

  private bind(): void {
    this.root.querySelector('.inv-close')!.addEventListener('click', () => this.setOpen(false));
    this.root.querySelectorAll('.inv-tab').forEach((btn) => {
      btn.addEventListener('click', () =>
        this.setTab((btn as HTMLElement).dataset.tab as PanelTab),
      );
    });

    this.hotbarEl.addEventListener('click', (e) => {
      const slot = (e.target as HTMLElement).closest('.slot') as HTMLElement | null;
      if (!slot || slot.closest('.inv-panel')) return;
      const idx = Number(slot.dataset.index);
      if (!Number.isFinite(idx)) return;
      this.inventory.setHotbar(idx);
      this.refresh();
      this.onChange?.();
    });

    this.root.addEventListener('click', (e) => {
      const slot = (e.target as HTMLElement).closest('.slot') as HTMLElement | null;
      if (!slot || !this.open) return;
      this.clickSlot(
        slot.dataset.kind as SlotKind,
        Number(slot.dataset.index),
        (e as MouseEvent).shiftKey,
      );
    });

    this.root.addEventListener('contextmenu', (e) => {
      const slot = (e.target as HTMLElement).closest('.slot') as HTMLElement | null;
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
    const nodes = el.querySelectorAll('.slot');
    const count = hotbar ? HOTBAR_SIZE : INV_SIZE;
    for (let i = 0; i < count; i++) {
      const node = nodes[i] as HTMLElement;
      node.classList.toggle('active', hotbar && i === this.inventory.selectedHotbar);
      node.classList.toggle('hotbar-band', !hotbar && i < HOTBAR_SIZE);
      paintSlot(node, this.inventory.slots[i]);
    }
  }

  private paintCraft(): void {
    const nodes = this.craftGridEl.querySelectorAll('.slot');
    for (let i = 0; i < 9; i++) paintSlot(nodes[i] as HTMLElement, this.craft.cells[i]);
    const result = this.craft.peekResult();
    paintSlot(this.resultSlot, result);
    this.resultSlot.classList.toggle('ready', !!result);
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
  return `<div class="slot" data-kind="${kind}" data-index="${index}">${
    key ? `<span class="slot-key">${key}</span>` : ''
  }</div>`;
}

function paintSlot(el: HTMLElement, stack: ItemStack | null): void {
  const key = el.querySelector('.slot-key');
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
  return `<span class="slot-swatch" style="background:${blockCssColor(stack.id)}"></span>
    <span class="slot-count">${stack.count > 1 ? stack.count : ''}</span>
    <span class="slot-label">${BLOCK_NAMES[stack.id] ?? ''}</span>`;
}
