import type { ModSummary } from '../modding/ModStorage';

export class ModLoadPicker {
  readonly root: HTMLElement;
  private listEl: HTMLElement;
  private emptyEl: HTMLElement;
  private resolve: ((id: string | null) => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'mod-load-overlay';
    this.root.hidden = true;
    this.root.innerHTML = `
      <div class="mod-load-dialog" role="dialog" aria-modal="true" aria-label="Load mod">
        <header class="mod-load-header">
          <p class="mod-load-title">Load saved mod</p>
          <button type="button" class="voxel-editor-btn" data-action="close-load">Cancel</button>
        </header>
        <ul class="mod-load-list"></ul>
        <p class="mod-load-empty" hidden>No saved mods yet — use Save first.</p>
      </div>`;

    this.listEl = this.root.querySelector('.mod-load-list') as HTMLElement;
    this.emptyEl = this.root.querySelector('.mod-load-empty') as HTMLElement;

    this.root.addEventListener('click', (e) => {
      if (e.target === this.root) this.close(null);
    });
    this.root.querySelector('[data-action="close-load"]')!.addEventListener('click', () => this.close(null));

    this.listEl.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-mod-id]');
      if (!btn) return;
      this.close(btn.dataset.modId ?? null);
    });
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  open(mods: ModSummary[]): Promise<string | null> {
    this.close(null);
    this.listEl.replaceChildren();
    this.emptyEl.hidden = mods.length > 0;
    this.listEl.hidden = mods.length === 0;

    for (const mod of mods) {
      const li = document.createElement('li');
      const when = new Date(mod.updatedAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      li.innerHTML = `
        <button type="button" class="mod-load-item" data-mod-id="${mod.id}">
          <span class="mod-load-name">${escapeHtml(mod.name)}</span>
          <span class="mod-load-meta">${mod.voxelCount} blocks · ${when}</span>
        </button>`;
      this.listEl.appendChild(li);
    }

    this.root.hidden = false;
    return new Promise((resolve) => {
      this.resolve = resolve;
    });
  }

  private close(id: string | null): void {
    if (this.root.hidden && !this.resolve) return;
    this.root.hidden = true;
    const done = this.resolve;
    this.resolve = null;
    done?.(id);
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
