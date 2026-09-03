/**
 * MOD HUB — discovery / library / details (local catalog + import).
 */
import './mod-hub.css';
import {
  MOD_CATEGORIES,
  addReport,
  creatorStats,
  gameCompatible,
  getCatalogEntry,
  getInstalled,
  getPublishBackendStatus,
  importPackageFile,
  installPackage,
  listCatalog,
  listInstalled,
  rateMod,
  removeInstalled,
  searchCatalog,
  setInstalledEnabled,
  type CatalogEntry,
} from '../../modhub';

type HubView = 'home' | 'browse' | 'details' | 'library' | 'import' | 'creator';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

function stars(sum: number, count: number): string {
  if (!count) return '—';
  return `${(sum / count).toFixed(1)}★ (${count})`;
}

export class ModHubApp {
  readonly root: HTMLElement;
  private view: HubView = 'home';
  private selectedId: string | null = null;
  private query = '';
  private category = 'all';

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'mh-app';
    this.root.innerHTML = `
      <header class="mh-top">
        <div class="mh-brand"><span>◈</span><div><h2>MOD HUB</h2><p>Discover · install · play</p></div></div>
        <div class="mh-search">
          <input class="vy-input" data-q placeholder="Search mods, creators, tags…" />
          <select class="vy-input" data-cat>
            <option value="all">All categories</option>
            ${MOD_CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join('')}
          </select>
          <button type="button" class="vy-btn" data-nav="browse">Search</button>
        </div>
        <nav class="mh-tabs">
          <button type="button" class="mh-tab is-active" data-nav="home">Home</button>
          <button type="button" class="mh-tab" data-nav="browse">Browse</button>
          <button type="button" class="mh-tab" data-nav="library">My Library</button>
          <button type="button" class="mh-tab" data-nav="import">Import</button>
          <button type="button" class="mh-tab" data-nav="creator">Creator</button>
        </nav>
      </header>
      <div class="mh-body" data-body></div>`;
    this.root.querySelectorAll<HTMLButtonElement>('[data-nav]').forEach((b) => {
      b.addEventListener('click', () => this.setView(b.dataset.nav as HubView));
    });
    this.root.querySelector('[data-q]')?.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        this.query = (e.target as HTMLInputElement).value;
        this.setView('browse');
      }
    });
    this.root.querySelector('[data-cat]')?.addEventListener('change', (e) => {
      this.category = (e.target as HTMLSelectElement).value;
    });
    this.setView('home');
  }

  refresh(): void {
    this.render();
  }

  private setView(view: HubView): void {
    this.view = view;
    this.root.querySelectorAll('.mh-tab').forEach((t) => {
      t.classList.toggle('is-active', (t as HTMLElement).dataset.nav === view);
    });
    this.render();
  }

  private render(): void {
    const body = this.root.querySelector('[data-body]') as HTMLElement;
    if (this.view === 'home') body.innerHTML = this.renderHome();
    else if (this.view === 'browse') body.innerHTML = this.renderBrowse();
    else if (this.view === 'details') body.innerHTML = this.renderDetails();
    else if (this.view === 'library') body.innerHTML = this.renderLibrary();
    else if (this.view === 'import') body.innerHTML = this.renderImport();
    else body.innerHTML = this.renderCreator();
    this.bind(body);
  }

  private card(e: CatalogEntry): string {
    const m = e.package.manifest;
    const compat = gameCompatible(m);
    return `<article class="mh-card" data-open="${esc(m.id)}">
      <div class="mh-card__art"${m.iconDataUrl ? ` style="background-image:url(${m.iconDataUrl})"` : ''}></div>
      <div class="mh-card__body">
        <h4>${esc(m.displayName)}</h4>
        <p>${esc(m.description || 'No description')}</p>
        <div class="mh-card__meta">
          <span>${esc(m.author)}</span>
          <span>v${esc(m.version)}</span>
          <span>${e.downloads} dl</span>
          <span class="mh-pill mh-pill--${compat}">${compat}</span>
        </div>
      </div>
    </article>`;
  }

  private renderHome(): string {
    const backend = getPublishBackendStatus();
    const all = listCatalog().filter((e) => e.package.manifest.visibility === 'public');
    const featured = all[0];
    const trending = [...all].sort((a, b) => b.downloads - a.downloads).slice(0, 8);
    const newest = [...all].sort((a, b) => b.listedAt - a.listedAt).slice(0, 8);
    return `<p class="mh-banner">${esc(backend.message)}</p>
      ${
        featured
          ? `<section class="mh-featured" data-open="${esc(featured.package.manifest.id)}">
        <div class="mh-featured__art"${
          featured.package.manifest.iconDataUrl
            ? ` style="background-image:url(${featured.package.manifest.iconDataUrl})"`
            : ''
        }></div>
        <div><p class="mh-kicker">Featured</p>
          <h3>${esc(featured.package.manifest.displayName)}</h3>
          <p>${esc(featured.package.manifest.description || '')}</p>
          <button type="button" class="vy-btn vy-btn--primary" data-open="${esc(featured.package.manifest.id)}">View mod</button>
        </div></section>`
          : `<section class="mh-empty"><h3>No public mods on this device yet</h3>
            <p class="ms-muted">Publish from MOD Studio (Public) or Import a .vymod.json package.</p></section>`
      }
      <h4 class="mh-section">Trending</h4>
      <div class="mh-grid">${trending.map((e) => this.card(e)).join('') || '<p class="ms-muted">None</p>'}</div>
      <h4 class="mh-section">New</h4>
      <div class="mh-grid">${newest.map((e) => this.card(e)).join('') || '<p class="ms-muted">None</p>'}</div>`;
  }

  private renderBrowse(): string {
    const q = (this.root.querySelector('[data-q]') as HTMLInputElement)?.value ?? this.query;
    this.query = q;
    const results = searchCatalog(q, this.category);
    return `<h4 class="mh-section">Results (${results.length})</h4>
      <div class="mh-grid">${results.map((e) => this.card(e)).join('') || '<p class="ms-muted">No matches</p>'}</div>`;
  }

  private renderDetails(): string {
    const id = this.selectedId;
    const entry = id ? getCatalogEntry(id) : null;
    if (!entry) return `<p class="ms-muted">Mod not found.</p><button type="button" class="vy-btn" data-nav="home">Back</button>`;
    const m = entry.package.manifest;
    const installed = getInstalled(m.id);
    const compat = gameCompatible(m);
    return `<article class="mh-detail">
      <button type="button" class="vy-btn" data-nav="browse">← Back</button>
      <header class="mh-detail__head">
        <div class="mh-detail__icon"${m.iconDataUrl ? ` style="background-image:url(${m.iconDataUrl})"` : ''}></div>
        <div>
          <h3>${esc(m.displayName)}</h3>
          <p class="ms-muted">by ${esc(m.author)} · v${esc(m.version)} · ${esc(m.category)}</p>
          <div class="mh-card__meta">
            <span>${entry.downloads} downloads</span>
            <span>${stars(entry.ratingSum, entry.ratingCount)}</span>
            <span class="mh-pill mh-pill--${compat}">${compat}</span>
            <span>Updated ${fmtDate(m.updatedAt)}</span>
          </div>
          <div class="ms-actions" style="margin-top:12px">
            ${
              installed
                ? `<button type="button" class="vy-btn" disabled>Installed</button>
                   <button type="button" class="vy-btn" data-toggle>${installed.enabled ? 'Disable' : 'Enable'}</button>
                   <button type="button" class="vy-btn" data-remove>Remove</button>`
                : `<button type="button" class="vy-btn vy-btn--primary" data-install>Install</button>`
            }
            <button type="button" class="vy-btn" data-rate>Rate ★★★★★</button>
            <button type="button" class="vy-btn" data-report>Report</button>
          </div>
        </div>
      </header>
      <section><h4>Description</h4><p>${esc(m.description || '—')}</p></section>
      <section><h4>Features</h4><ul>${
        m.features.length ? m.features.map((f) => `<li>${esc(f)}</li>`).join('') : '<li class="ms-muted">—</li>'
      }</ul></section>
      <section><h4>Changelog</h4><pre class="mh-pre">${esc(m.changelog || '—')}</pre></section>
      <section><h4>Requirements</h4>
        <ul><li>VYTHERA ${esc(m.gameVersion)}</li>
        ${m.dependencies.map((d) => `<li>${esc(d.id)} @ ${esc(d.version)}</li>`).join('')}</ul>
      </section>
      <section><h4>Screenshots</h4>
        <div class="mh-shots">${
          m.screenshots.length
            ? m.screenshots.map((s) => `<img src="${s}" alt="" />`).join('')
            : '<p class="ms-muted">No screenshots</p>'
        }</div>
      </section>
      <p class="ms-status" data-detail-status></p>
    </article>`;
  }

  private renderLibrary(): string {
    const mods = listInstalled();
    return `<h4 class="mh-section">Installed (${mods.length})</h4>
      <div class="mh-lib">
        ${
          mods.length
            ? mods
                .map((m) => {
                  const man = m.package.manifest;
                  return `<div class="mh-lib__row">
                    <div><strong>${esc(man.displayName)}</strong>
                      <span class="ms-muted">v${esc(man.version)} · ${m.enabled ? 'enabled' : 'disabled'} · ${m.source}</span></div>
                    <div class="ms-actions">
                      <button type="button" class="vy-btn" data-lib-toggle="${esc(man.id)}">${m.enabled ? 'Disable' : 'Enable'}</button>
                      <button type="button" class="vy-btn" data-lib-remove="${esc(man.id)}">Remove</button>
                      <button type="button" class="vy-btn" data-open="${esc(man.id)}">View</button>
                    </div>
                  </div>`;
                })
                .join('')
            : '<p class="ms-muted">Library empty — install from Browse or Import.</p>'
        }
      </div>`;
  }

  private renderImport(): string {
    return `<div class="ms-panel"><h3>Import package</h3>
      <p class="ms-muted">Load a .vymod.json package. Packages are validated (paths, integrity, size) before install. Code is never executed during validation.</p>
      <div style="margin: 12px 0;">
        <label class="vy-file-pill modhub-import-pill">
          <span class="vy-file-pill__btn vy-btn--primary">Choose file</span>
          <input type="file" accept=".json,.vymod.json,application/json" data-file hidden />
          <span class="vy-file-pill__name" hidden></span>
          <button type="button" class="vy-file-pill__clear" hidden title="Clear file" aria-label="Clear file">✕</button>
        </label>
      </div>
      <p class="ms-status" data-import-status></p></div>`;
  }

  private renderCreator(): string {
    const s = creatorStats();
    return `<div class="ms-panel"><h3>Creator profile (local)</h3>
      <p class="ms-muted">Only intentional public creator fields are shown. No emails, IPs, or filesystem paths.</p>
      <div class="ms-statgrid">
        <div class="ms-stat"><span>${s.mods}</span><em>Mods</em></div>
        <div class="ms-stat"><span>${s.published}</span><em>Published</em></div>
        <div class="ms-stat"><span>${s.downloads}</span><em>Downloads</em></div>
      </div>
      <p class="ms-muted">Create and publish from MOD Studio.</p></div>`;
  }

  private bind(body: HTMLElement): void {
    body.querySelectorAll<HTMLElement>('[data-open]').forEach((el) => {
      el.addEventListener('click', () => {
        this.selectedId = el.dataset.open || null;
        this.setView('details');
      });
    });
    body.querySelectorAll<HTMLElement>('[data-nav]').forEach((el) => {
      el.addEventListener('click', () => this.setView(el.dataset.nav as HubView));
    });

    const status = body.querySelector('[data-detail-status]') as HTMLElement | null;
    const entry = this.selectedId ? getCatalogEntry(this.selectedId) : null;

    body.querySelector('[data-install]')?.addEventListener('click', async () => {
      if (!entry || !status) return;
      status.textContent = 'Installing…';
      const res = await installPackage(entry.package, 'hub');
      status.textContent = res.ok ? 'Installed' : res.reason;
      status.className = res.ok ? 'ms-ok' : 'ms-err';
      if (res.ok) this.render();
    });
    body.querySelector('[data-toggle]')?.addEventListener('click', () => {
      if (!entry) return;
      const inst = getInstalled(entry.package.manifest.id);
      if (!inst) return;
      setInstalledEnabled(entry.package.manifest.id, !inst.enabled);
      this.render();
    });
    body.querySelector('[data-remove]')?.addEventListener('click', () => {
      if (!entry) return;
      if (!confirm('Remove this mod from your library?')) return;
      removeInstalled(entry.package.manifest.id);
      this.render();
    });
    body.querySelector('[data-rate]')?.addEventListener('click', () => {
      if (!entry) return;
      const n = Number(prompt('Rate 1–5', '5'));
      if (!Number.isFinite(n)) return;
      rateMod(entry.package.manifest.id, n);
      this.render();
    });
    body.querySelector('[data-report]')?.addEventListener('click', () => {
      if (!entry) return;
      const category = prompt('Report category: broken | inappropriate | malicious | spam | copyright | other', 'broken');
      if (!category) return;
      addReport({
        modId: entry.package.manifest.id,
        version: entry.package.manifest.version,
        category: (['broken', 'inappropriate', 'malicious', 'spam', 'copyright', 'other'].includes(category)
          ? category
          : 'other') as 'broken',
        note: prompt('Optional note') || '',
      });
      if (status) {
        status.textContent = 'Report recorded locally';
        status.className = 'ms-ok';
      }
    });

    body.querySelectorAll<HTMLButtonElement>('[data-lib-toggle]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.libToggle!;
        const inst = getInstalled(id);
        if (!inst) return;
        setInstalledEnabled(id, !inst.enabled);
        this.render();
      });
    });
    body.querySelectorAll<HTMLButtonElement>('[data-lib-remove]').forEach((b) => {
      b.addEventListener('click', () => {
        if (!confirm('Remove this mod from your library?')) return;
        removeInstalled(b.dataset.libRemove!);
        this.render();
      });
    });

    const file = body.querySelector('[data-file]') as HTMLInputElement | null;
    const nameEl = body.querySelector('.modhub-import-pill .vy-file-pill__name') as HTMLElement | null;
    const clearBtn = body.querySelector('.modhub-import-pill .vy-file-pill__clear') as HTMLButtonElement | null;
    const importStatus = body.querySelector('[data-import-status]') as HTMLElement | null;

    clearBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (file) file.value = '';
      if (nameEl) { nameEl.textContent = ''; nameEl.hidden = true; }
      if (clearBtn) clearBtn.hidden = true;
      if (importStatus) { importStatus.textContent = ''; importStatus.className = 'ms-status'; }
    });

    file?.addEventListener('change', async () => {
      const f = file.files?.[0];
      if (!f || !importStatus) return;
      if (nameEl) {
        nameEl.textContent = f.name;
        nameEl.hidden = false;
      }
      if (clearBtn) clearBtn.hidden = false;
      importStatus.textContent = 'Validating…';
      try {
        const raw = await f.text();
        const res = await importPackageFile(raw);
        importStatus.textContent = res.ok
          ? `Installed ${res.package.manifest.displayName}`
          : res.reason;
        importStatus.className = res.ok ? 'ms-ok' : 'ms-err';
      } catch (e) {
        importStatus.textContent = e instanceof Error ? e.message : 'Import failed';
        importStatus.className = 'ms-err';
      }
    });
  }
}
