/**
 * Style browser: the saved library plus import/export entry points.
 *
 * Destructive actions confirm first, and imports go through the untrusted-input
 * validator before anything reaches the library.
 */
import {
  deleteStyle,
  duplicateStyle,
  exportStyleToFile,
  getThumbnail,
  importStyleFromFile,
  listStyles,
  renameStyle,
  type StoredStyle,
} from '../../world/style/StyleStore';
import { checkCompatibility } from '../../world/style/styleValidation';
import type { VytheraWorldStyle } from '../../world/style/WorldStyle';

export type LibraryTab = 'mine' | 'imported' | 'community';

export interface StyleLibraryHandlers {
  onOpen: (style: VytheraWorldStyle) => void;
  onNotice: (message: string, kind: 'info' | 'error') => void;
}

export class StyleLibrary {
  readonly root = document.createElement('aside');
  private list = document.createElement('div');
  private tab: LibraryTab = 'mine';
  private activeId: string | null = null;

  constructor(private handlers: StyleLibraryHandlers) {
    this.root.className = 'vy-cw__library';
    this.list.className = 'vy-cw__stylelist';
    this.root.append(this.header(), this.list);
    this.refresh();
  }

  setActive(id: string): void {
    this.activeId = id;
    this.refresh();
  }

  private header(): HTMLElement {
    const head = document.createElement('div');
    head.className = 'vy-cw__libhead';

    const title = document.createElement('h3');
    title.textContent = 'World styles';

    const tabs = document.createElement('div');
    tabs.className = 'vy-cw__row';
    for (const [id, name] of [
      ['mine', 'My styles'],
      ['imported', 'Imported'],
      ['community', 'Community'],
    ] as [LibraryTab, string][]) {
      const btn = document.createElement('button');
      btn.textContent = name;
      if (id === this.tab) btn.classList.add('is-active');
      btn.onclick = () => {
        this.tab = id;
        this.refresh();
      };
      tabs.append(btn);
    }

    const importPill = document.createElement('label');
    importPill.className = 'vy-file-pill';
    const importBtn = document.createElement('span');
    importBtn.className = 'vy-file-pill__btn';
    importBtn.textContent = 'Import style';
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vyworld,application/json';
    input.hidden = true;
    const nameEl = document.createElement('span');
    nameEl.className = 'vy-file-pill__name';
    nameEl.hidden = true;
    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'vy-file-pill__clear';
    clearBtn.hidden = true;
    clearBtn.title = 'Clear file';
    clearBtn.setAttribute('aria-label', 'Clear file');
    clearBtn.textContent = '✕';

    importPill.append(importBtn, input, nameEl, clearBtn);

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      nameEl.textContent = file.name;
      nameEl.hidden = false;
      clearBtn.hidden = false;
      const result = await importStyleFromFile(file);
      if (!result.ok || !result.style) {
        this.handlers.onNotice(result.errors.join(' ') || 'Import failed.', 'error');
        return;
      }
      for (const warning of result.warnings) this.handlers.onNotice(warning, 'info');
      this.handlers.onNotice(`Imported "${result.style.name}".`, 'info');
      this.refresh();
      this.handlers.onOpen(result.style);
    };

    clearBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.value = '';
      nameEl.textContent = '';
      nameEl.hidden = true;
      clearBtn.hidden = true;
    };

    head.append(title, tabs, importPill);
    return head;
  }

  refresh(): void {
    this.list.innerHTML = '';

    if (this.tab === 'community') {
      const empty = document.createElement('p');
      empty.className = 'vy-cw__note';
      empty.textContent =
        'Community styles will appear here once Mod Hub sharing is switched on. Everything else works offline.';
      this.list.append(empty);
      return;
    }

    const entries = listStyles().filter((e) =>
      this.tab === 'imported' ? e.origin === 'imported' : e.origin !== 'imported',
    );

    if (entries.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'vy-cw__note';
      empty.textContent =
        this.tab === 'imported'
          ? 'No imported styles yet.'
          : 'No saved styles yet. Adjust the settings and choose Save style.';
      this.list.append(empty);
      return;
    }

    for (const entry of entries) this.list.append(this.card(entry));
  }

  private card(entry: StoredStyle): HTMLElement {
    const { style } = entry;
    const card = document.createElement('div');
    card.className = 'vy-cw__stylecard';
    if (style.id === this.activeId) card.classList.add('is-active');

    const thumb = document.createElement('div');
    thumb.className = 'vy-cw__thumb';
    const src = getThumbnail(style.id);
    if (src) {
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      thumb.append(img);
    }

    const info = document.createElement('div');
    info.className = 'vy-cw__styleinfo';
    const name = document.createElement('b');
    name.textContent = style.name;
    const meta = document.createElement('span');
    const compat = checkCompatibility(style);
    meta.textContent = `v${style.version} · worldgen v${style.generationVersion} · ${style.terrainVoxelSize}`;
    const status = document.createElement('span');
    status.className = compat.compatible ? 'vy-cw__ok' : 'vy-cw__bad';
    status.textContent = compat.compatible ? 'Compatible' : 'Not compatible';
    info.append(name, meta, status);
    if (compat.notes.length > 0) {
      const note = document.createElement('span');
      note.className = 'vy-cw__hint';
      note.textContent = compat.notes.join(' ');
      info.append(note);
    }

    const actions = document.createElement('div');
    actions.className = 'vy-cw__row';
    actions.append(
      button('Edit', () => this.handlers.onOpen(style)),
      button('Duplicate', () => {
        const copy = duplicateStyle(style.id);
        this.refresh();
        if (copy) this.handlers.onOpen(copy);
      }),
      button('Rename', () => {
        const next = prompt('Rename world style', style.name);
        if (next === null) return;
        renameStyle(style.id, next);
        this.refresh();
      }),
      button('Export', () => exportStyleToFile(style)),
      button('Delete', () => {
        if (!confirm(`Delete world style "${style.name}"? This cannot be undone.`)) return;
        deleteStyle(style.id);
        this.refresh();
      }),
    );

    card.append(thumb, info, actions);
    return card;
  }
}

function button(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = text;
  btn.onclick = onClick;
  return btn;
}
