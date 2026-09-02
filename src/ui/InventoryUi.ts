import { BLOCK_COLORS } from '../world/blocks';
import { CraftingGrid, RECIPES } from '../player/Crafting';
import {
  HOTBAR_SIZE,
  INV_SIZE,
  STACK_MAX,
  type Inventory,
  type ItemStack,
} from '../player/Inventory';
import {
  ITEM_NAMES,
  ITEM_KINDS,
  ITEM_ICONS,
  ITEM_COLORS,
} from '../player/items';
import { EquipmentSystem } from '../equipment/EquipmentSystem';
import type { EquipmentSlot } from '../equipment/EquipmentSlot';
import { ProfilePreview3D } from './ProfilePreview3D';
import type { Profile } from './prefs';

export const BLOCK_NAMES = ITEM_NAMES;
export const BLOCK_KINDS = ITEM_KINDS;

export function blockCssColor(id: number): string {
  const c = ITEM_COLORS[id] ?? BLOCK_COLORS[id] ?? [1, 0, 1];
  return `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
}

type PanelTab = 'pack' | 'guide';
type SlotKind = 'inv' | 'craft' | 'result' | 'equip';

/** Maps 2x2 grid indices (0..3) to 3x3 CraftingGrid cell positions [row 0 (0,1), row 1 (3,4)]. */
const CRAFT_2X2_MAP = [0, 1, 3, 4] as const;

export class InventoryUi {
  readonly root: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly hotbarEl: HTMLElement;
  private readonly hotbarNameEl: HTMLElement;
  private readonly storageGridEl: HTMLElement;
  private readonly panelHotbarGridEl: HTMLElement;
  private readonly craftGridEl: HTMLElement;
  private readonly craftSectionTitleEl: HTMLElement;
  private readonly resultSlot: HTMLElement;
  private readonly cursorEl: HTMLElement;
  private readonly equipSlotsEl: HTMLElement;
  private readonly armorStatsEl: HTMLElement;
  private readonly preview3d: ProfilePreview3D | null;
  private profile: Profile | null = null;
  private tab: PanelTab = 'pack';
  private open = false;
  private isTableMode = false;
  private cursor: ItemStack | null = null;
  private readonly craft = new CraftingGrid();
  readonly equipment: EquipmentSystem;
  private onChange: (() => void) | null = null;
  private onOpenChange: ((open: boolean) => void) | null = null;

  constructor(
    private readonly inventory: Inventory,
    opts?: { profile?: Profile; equipment?: EquipmentSystem },
  ) {
    this.profile = opts?.profile ?? null;
    this.equipment = opts?.equipment ?? new EquipmentSystem();
    this.preview3d = this.profile
      ? new ProfilePreview3D({ autoSpin: true, interactive: false, transparent: true })
      : null;
    this.root = document.createElement('div');
    this.root.className = 'inv-root vy-inv';
    this.root.innerHTML = `
      <div class="vy-hotbar">
        <div class="vy-hotbar__name" aria-live="polite"></div>
        <div class="vy-hotbar__row" role="listbox" aria-label="Hotbar"></div>
      </div>
      <div class="vy-inv-panel" hidden>
        <div class="vy-inv-card">
          <header class="vy-inv-head">
            <div class="vy-inv-tabs">
              <button type="button" class="vy-inv-tab is-active" data-tab="pack">Pack</button>
              <button type="button" class="vy-inv-tab" data-tab="guide">Guide</button>
            </div>
            <button type="button" class="vy-btn vy-btn--ghost vy-inv-close" data-close aria-label="Close">✕</button>
          </header>

          <div class="vy-inv-body" data-view="pack">
            <div class="vy-inv-top">
              <div class="vy-inv-equip-col">
                <div class="vy-inv-equip__slots">
                  <div class="vy-slot vy-slot--equip" data-kind="equip" data-slot="HEAD" title="Head / Helmet"></div>
                  <div class="vy-slot vy-slot--equip" data-kind="equip" data-slot="CHEST" title="Chest / Chestplate"></div>
                  <div class="vy-slot vy-slot--equip" data-kind="equip" data-slot="LEGS" title="Legs / Leggings"></div>
                  <div class="vy-slot vy-slot--equip" data-kind="equip" data-slot="FEET" title="Feet / Boots"></div>
                </div>
                <div class="vy-inv-armor-stats" aria-label="Armor stats"></div>
              </div>
              <div class="vy-inv-preview-wrap">
                <div class="vy-inv-preview" aria-label="Wanderer preview"></div>
              </div>
              <section class="vy-inv-craft">
                <h3 class="vy-inv-section__title vy-craft__title">Crafting (2×2)</h3>
                <div class="vy-inv-craft__row">
                  <div class="vy-inv-craft__grid"></div>
                  <span class="vy-inv-craft__arrow" aria-hidden="true">→</span>
                  <div class="vy-slot vy-slot--result" data-kind="result" data-index="0" title="Crafting result"></div>
                </div>
              </section>
            </div>

            <div class="vy-inv-bottom">
              <section class="vy-inv-section">
                <h3 class="vy-inv-section__title">Storage</h3>
                <div class="vy-inv-storage__grid"></div>
              </section>
              <section class="vy-inv-section">
                <h3 class="vy-inv-section__title">Hotbar</h3>
                <div class="vy-inv-hotbar__grid"></div>
              </section>
            </div>
          </div>

          <div class="vy-inv-body" data-view="guide" hidden>
            <div class="vy-inv-guide-content">
              <section class="vy-inv-guide-sec">
                <h3>Controls</h3>
                <ul class="vy-guide__list">
                  <li><kbd>E</kbd> Pack &amp; craft</li>
                  <li><kbd>T</kbd> / <kbd>Enter</kbd> Chat</li>
                  <li><kbd>Ctrl</kbd> Sneak</li>
                  <li><kbd>C</kbd> Sit / stand</li>
                  <li><kbd>Space</kbd> Jump</li>
                  <li><kbd>Shift</kbd> Sprint</li>
                  <li><kbd>V</kbd> First / third / front view</li>
                  <li><kbd>1–9</kbd> Hotbar · <kbd>F</kbd> / RMB place / eat · LMB break / swing</li>
                  <li><kbd>J</kbd> Discovery · <kbd>M</kbd> Map</li>
                </ul>
              </section>
              <section class="vy-inv-guide-sec">
                <h3>Recipes</h3>
                <ul class="vy-guide__recipes"></ul>
              </section>
            </div>
          </div>
        </div>
      </div>
      <div class="vy-inv-cursor" hidden></div>
    `;

    this.panel = this.root.querySelector('.vy-inv-panel')!;
    this.hotbarEl = this.root.querySelector('.vy-hotbar__row')!;
    this.hotbarNameEl = this.root.querySelector('.vy-hotbar__name')!;
    this.storageGridEl = this.root.querySelector('.vy-inv-storage__grid')!;
    this.panelHotbarGridEl = this.root.querySelector('.vy-inv-hotbar__grid')!;
    this.craftGridEl = this.root.querySelector('.vy-inv-craft__grid')!;
    this.craftSectionTitleEl = this.root.querySelector('.vy-craft__title')!;
    this.resultSlot = this.root.querySelector('[data-kind="result"]')!;
    this.cursorEl = this.root.querySelector('.vy-inv-cursor')!;
    this.equipSlotsEl = this.root.querySelector('.vy-inv-equip__slots')!;
    this.armorStatsEl = this.root.querySelector('.vy-inv-armor-stats')!;

    const previewHost = this.root.querySelector('.vy-inv-preview') as HTMLElement | null;
    if (this.preview3d && previewHost) {
      this.preview3d.mount(previewHost);
      if (this.profile) this.preview3d.applyProfile(this.profile);
    } else if (previewHost) {
      previewHost.hidden = true;
    }

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

  applyProfile(profile: Profile): void {
    this.profile = profile;
    if (this.preview3d) {
      this.preview3d.applyProfile(profile);
      this.preview3d.start();
    }
  }

  get isOpen(): boolean {
    return this.open;
  }

  setOpen(open: boolean): void {
    if (this.open === open) return;
    this.open = open;
    this.panel.hidden = !open;
    if (open) {
      this.buildGuide();
    } else {
      this.returnCursor();
      this.isTableMode = false;
      this.rebuildCraftGrid(false);
    }
    this.onOpenChange?.(open);
    this.refresh();
  }

  openCraftingTable(): void {
    this.isTableMode = true;
    this.rebuildCraftGrid(true);
    this.setTab('pack');
    this.setOpen(true);
  }

  toggle(tab?: PanelTab): void {
    if (tab) {
      this.setTab(tab);
      this.setOpen(true);
      return;
    }
    this.setOpen(!this.open);
  }

  private rebuildCraftGrid(is3x3: boolean): void {
    this.craftSectionTitleEl.textContent = is3x3 ? 'Workbench (3×3)' : 'Crafting (2×2)';
    this.craftGridEl.classList.toggle('vy-inv-craft__grid--3x3', is3x3);
    const count = is3x3 ? 9 : 4;
    this.craftGridEl.innerHTML = Array.from({ length: count }, (_, i) =>
      slotHtml('craft', i, ''),
    ).join('');
    this.refresh();
  }

  refresh(): void {
    this.paintSlots(this.hotbarEl);
    this.paintSlots(this.storageGridEl);
    this.paintSlots(this.panelHotbarGridEl);
    this.paintCraft();
    this.paintEquipment();
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
    // HUD hotbar row
    this.hotbarEl.innerHTML = Array.from({ length: HOTBAR_SIZE }, (_, i) =>
      slotHtml('inv', i, String(i + 1)),
    ).join('');

    // Storage 9x3 = 27 slots (indices 9..35)
    this.storageGridEl.innerHTML = Array.from({ length: INV_SIZE - HOTBAR_SIZE }, (_, i) =>
      slotHtml('inv', i + HOTBAR_SIZE, ''),
    ).join('');

    // Panel hotbar row = 9 slots (indices 0..8)
    this.panelHotbarGridEl.innerHTML = Array.from({ length: HOTBAR_SIZE }, (_, i) =>
      slotHtml('inv', i, String(i + 1)),
    ).join('');

    // Default 2x2 Crafting grid = 4 slots (indices 0..3)
    this.rebuildCraftGrid(false);
  }

  private buildGuide(): void {
    const list = this.root.querySelector('.vy-guide__recipes');
    if (!list) return;
    list.innerHTML = RECIPES.map((r) => {
      const icon = ITEM_ICONS[r.result.id];
      const iconMarkup = icon
        ? `<img class="vy-guide__icon" src="${icon}" alt="${r.name}" onerror="this.style.display='none'" />`
        : `<span class="vy-slot__swatch vy-guide__swatch" style="background:${blockCssColor(r.result.id)}"></span>`;

      return `<li class="vy-guide__recipe" data-recipe-id="${r.id}" style="cursor:pointer;">
        <div class="vy-guide__thumb">${iconMarkup}</div>
        <div class="vy-guide__recipe-info">
          <strong>${r.name}${r.result.count > 1 ? ` ×${r.result.count}` : ''}</strong>
          <span>${r.hint}</span>
        </div>
      </li>`;
    }).join('');

    list.querySelectorAll<HTMLElement>('.vy-guide__recipe').forEach((el) => {
      el.addEventListener('click', () => {
        const rId = el.dataset.recipeId;
        const rec = RECIPES.find((r) => r.id === rId);
        if (!rec) return;

        // Try to automatically populate crafting grid from inventory
        this.craft.clear();
        for (let i = 0; i < 9; i++) {
          const reqId = rec.pattern[i];
          if (reqId && reqId > 0) {
            const hasSlot = this.inventory.slots.findIndex((s) => s && s.id === reqId && s.count > 0);
            if (hasSlot >= 0) {
              const itm = this.inventory.slots[hasSlot]!;
              this.craft.set(i, { id: reqId, count: 1 });
              if (itm.count > 1) {
                itm.count--;
              } else {
                this.inventory.setSlot(hasSlot, null);
              }
            }
          }
        }
        this.setTab('pack');
        this.refresh();
        this.onChange?.();
      });
    });
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
        slot,
      );
    });

    this.root.addEventListener('contextmenu', (e) => {
      const slot = (e.target as HTMLElement).closest('.vy-slot') as HTMLElement | null;
      if (!slot || !this.open) return;
      e.preventDefault();
      this.clickSlot(slot.dataset.kind as SlotKind, Number(slot.dataset.index), true, slot);
    });

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('keydown', this.onKeyDown);
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.cursor) return;
    this.cursorEl.style.left = `${e.clientX + 12}px`;
    this.cursorEl.style.top = `${e.clientY + 12}px`;
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.cursor) return;
    this.cursorEl.style.left = `${e.clientX + 12}px`;
    this.cursorEl.style.top = `${e.clientY + 12}px`;
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'KeyE') {
      e.preventDefault();
      if (this.open && this.tab === 'pack') this.setOpen(false);
      else this.toggle('pack');
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
  };

  dispose(): void {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }

  private clickSlot(kind: SlotKind, index: number, right: boolean, slotEl?: HTMLElement): void {
    if (kind === 'result') {
      this.takeResult();
      return;
    }
    if (kind === 'equip') {
      const slotName = slotEl?.dataset.slot as EquipmentSlot | undefined;
      if (!slotName) return;
      this.clickEquipSlot(slotName);
      this.refresh();
      this.onChange?.();
      return;
    }
    if (kind === 'craft') {
      const cellIndex = this.isTableMode ? index : (CRAFT_2X2_MAP[index] ?? index);
      this.clickStack(this.craft.cells, cellIndex, right, (i, s) => this.craft.setCell(i, s));
      this.refresh();
      this.onChange?.();
      return;
    }
    this.clickStack(this.inventory.slots, index, right, (i, s) => this.inventory.setSlot(i, s));
    this.refresh();
    this.onChange?.();
  }

  private clickEquipSlot(slot: EquipmentSlot): void {
    if (this.cursor) {
      if (this.equipment.canEquip(slot, this.cursor)) {
        const prev = this.equipment.equip(slot, this.cursor);
        this.cursor = prev;
      }
    } else {
      const current = this.equipment.unequip(slot);
      this.cursor = current;
    }
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
          write(index, { ...this.cursor, count: 1 });
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
        this.cursor = { ...cell, count: half };
        cell.count -= half;
        if (cell.count <= 0) write(index, null);
      } else {
        this.cursor = { ...cell };
        write(index, null);
      }
    }
  }

  private takeResult(): void {
    const peek = this.craft.peekResult(this.isTableMode);
    if (!peek) return;
    if (this.cursor && (this.cursor.id !== peek.id || this.cursor.count + peek.count > STACK_MAX)) {
      return;
    }
    const made = this.craft.craftOnce(this.isTableMode);
    if (!made) return;
    if (this.cursor) this.cursor.count += made.count;
    else this.cursor = made;
    this.refresh();
    this.onChange?.();
  }

  private returnCursor(): void {
    if (this.cursor) {
      this.inventory.add(this.cursor.id, this.cursor.count, {
        durability: this.cursor.durability,
        maxDurability: this.cursor.maxDurability,
      });
      this.cursor = null;
    }
    for (let i = 0; i < 9; i++) {
      const c = this.craft.cells[i];
      if (c) {
        this.inventory.add(c.id, c.count, {
          durability: c.durability,
          maxDurability: c.maxDurability,
        });
        this.craft.setCell(i, null);
      }
    }
  }

  private paintSlots(el: HTMLElement): void {
    const nodes = el.querySelectorAll<HTMLElement>('.vy-slot');
    nodes.forEach((node) => {
      const idx = Number(node.dataset.index);
      if (!Number.isFinite(idx)) return;
      const isHotbar = idx < HOTBAR_SIZE;
      node.classList.toggle('is-active', isHotbar && idx === this.inventory.selectedHotbar);
      paintSlot(node, this.inventory.slots[idx]);
    });
  }

  private paintCraft(): void {
    const nodes = this.craftGridEl.querySelectorAll('.vy-slot');
    const slotCount = this.isTableMode ? 9 : 4;
    for (let i = 0; i < slotCount; i++) {
      const cellIndex = this.isTableMode ? i : CRAFT_2X2_MAP[i];
      paintSlot(nodes[i] as HTMLElement, this.craft.cells[cellIndex]);
    }
    const result = this.craft.peekResult(this.isTableMode);
    paintSlot(this.resultSlot, result);
    this.resultSlot.classList.toggle('is-ready', !!result);
  }

  private paintEquipment(): void {
    if (!this.equipSlotsEl) return;
    const slots = this.equipSlotsEl.querySelectorAll<HTMLElement>('.vy-slot--equip');
    slots.forEach((node) => {
      const slotName = node.dataset.slot as EquipmentSlot | undefined;
      if (!slotName) return;
      const stack = this.equipment.getSlot(slotName);
      paintSlot(node, stack);
    });

    if (this.armorStatsEl) {
      const stats = this.equipment.stats;
      this.armorStatsEl.innerHTML = `
        <span class="vy-armor-stat">🛡️ Armor: <strong>${stats.armorPoints}</strong></span>
      `;
    }
  }

  private paintHotbarName(): void {
    const s = this.inventory.selected;
    this.hotbarNameEl.textContent = s ? (ITEM_NAMES[s.id] ?? 'Item') : '';
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

function paintSlot(slot: HTMLElement, stack: ItemStack | null | undefined): void {
  if (!stack || stack.count <= 0) {
    slot.innerHTML = slot.querySelector('.vy-slot__key')?.outerHTML ?? '';
    slot.removeAttribute('title');
    return;
  }
  const key = slot.querySelector('.vy-slot__key')?.outerHTML ?? '';
  slot.innerHTML = `${key}${stackHtml(stack)}`;
  slot.title = `${ITEM_NAMES[stack.id] ?? 'Item'} ×${stack.count}`;
}

function stackHtml(stack: ItemStack): string {
  const icon = ITEM_ICONS[stack.id];
  const c = blockCssColor(stack.id);

  let visualHtml = '';
  if (icon) {
    visualHtml = `<img class="vy-slot__icon" src="${icon}" alt="${ITEM_NAMES[stack.id] ?? 'Item'}" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" /><span class="vy-slot__swatch" style="background:${c};display:none"></span>`;
  } else {
    visualHtml = `<span class="vy-slot__swatch" style="background:${c}"></span>`;
  }

  let durHtml = '';
  if (stack.durability != null && stack.maxDurability != null && stack.maxDurability > 0) {
    const pct = Math.max(0, Math.min(100, (stack.durability / stack.maxDurability) * 100));
    durHtml = `<span class="vy-slot__durability"><span style="width:${pct}%"></span></span>`;
  }

  return `${visualHtml}${
    stack.count > 1 ? `<span class="vy-slot__count">${stack.count}</span>` : ''
  }${durHtml}`;
}
