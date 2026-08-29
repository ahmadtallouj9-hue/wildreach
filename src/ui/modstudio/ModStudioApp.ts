/**
 * MOD Studio — VYTHERA chrome hosting the preserved VoxelEditorUi engine.
 */
import { createModAsset } from '../../modding/ModAsset';
import { LOCAL_GRID_SIZE } from '../../modding/constants';
import { listSavedMods, loadModAsset } from '../../modding/ModStorage';
import type { TerrainMaterials } from '../../render/TerrainMaterials';
import {
  MOD_CATEGORIES,
  buildPackage,
  bumpPatch,
  createManifest,
  creatorStats,
  getPublishBackendStatus,
  installPackage,
  listAuthoredPackages,
  listAuthoredVersions,
  listInstalled,
  packageToDownloadBlob,
  publishLocal,
  saveAuthoredPackage,
  type ModCategory,
  type ModManifest,
  type ModPackage,
  type ModVisibility,
} from '../../modhub';
import { VoxelEditorUi } from '../VoxelEditorUi';
import { BACKLOG_ITEMS } from '../../modding/ModBacklogChecklist';

type StudioView =
  | 'overview'
  | 'library'
  | 'create'
  | 'editor'
  | 'assets'
  | 'scripts'
  | 'testing'
  | 'checklist'
  | 'versions'
  | 'analytics'
  | 'publish';

const NAV: { id: StudioView; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'library', label: 'My Mods' },
  { id: 'create', label: 'Create' },
  { id: 'editor', label: 'Editor' },
  { id: 'assets', label: 'Assets' },
  { id: 'scripts', label: 'Scripts' },
  { id: 'testing', label: 'Testing' },
  { id: 'checklist', label: 'Checklist (1–500)' },
  { id: 'versions', label: 'Versions' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'publish', label: 'Publish' },
];

function emptyAsset(name: string) {
  const size = LOCAL_GRID_SIZE;
  return createModAsset(name, { version: 1, size, voxels: new Array(size * size * size).fill(0) });
}

function fmtDate(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '—';
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class ModStudioApp {
  readonly root: HTMLElement;
  private view: StudioView = 'overview';
  private workshop: VoxelEditorUi | null = null;
  private activeManifest: ModManifest | null = null;
  private lastBuild: { ok: boolean; message: string; at: number } | null = null;
  private readonly materials: TerrainMaterials;

  constructor(materials: TerrainMaterials) {
    this.materials = materials;
    this.root = document.createElement('div');
    this.root.className = 'ms-app';
    this.root.innerHTML = `
      <aside class="ms-nav" aria-label="MOD Studio">
        <div class="ms-nav__brand"><span class="ms-nav__mark">◈</span><div>
          <p class="ms-nav__title">MOD Studio</p><p class="ms-nav__sub">Creator workspace</p>
        </div></div>
        <nav class="ms-nav__list" role="tablist"></nav>
        <p class="ms-nav__hint">Engine preserved · VYTHERA chrome</p>
      </aside>
      <section class="ms-main">
        <header class="ms-top">
          <div class="ms-top__left">
            <button type="button" class="ms-nav-toggle vy-btn vy-btn--ghost" aria-label="Toggle navigation" title="Menu">☰</button>
            <h2 class="ms-top__title" data-ms-title>Overview</h2>
          </div>
          <div class="ms-top__actions">
            <button type="button" class="vy-btn" data-ms-go="create">New mod</button>
            <button type="button" class="vy-btn vy-btn--primary" data-ms-go="editor">Open editor</button>
          </div>
        </header>
        <div class="ms-body" data-ms-body></div>
        <div class="ms-editor-shell" data-ms-editor-shell hidden>
          <div class="ms-editor-host" data-ms-editor-host></div>
        </div>
      </section>`;
    const list = this.root.querySelector('.ms-nav__list')!;
    for (const item of NAV) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ms-nav__btn';
      btn.dataset.view = item.id;
      btn.textContent = item.label;
      btn.addEventListener('click', () => this.setView(item.id));
      list.appendChild(btn);
    }
    this.root.querySelectorAll<HTMLButtonElement>('[data-ms-go]').forEach((b) => {
      b.addEventListener('click', () => this.setView(b.dataset.msGo as StudioView));
    });
    const navToggle = this.root.querySelector<HTMLButtonElement>('.ms-nav-toggle');
    if (navToggle) {
      navToggle.addEventListener('click', () => {
        this.root.classList.toggle('ms-nav-open');
      });
    }
    this.setView('overview');
  }

  start(): void {
    if (this.view === 'editor') this.workshop?.start();
    this.render();
  }

  stop(): void {
    this.workshop?.stop();
  }

  layout(): void {
    this.workshop?.layout();
  }

  getEditorHost() {
    return this.workshop?.getEditorHost();
  }

  private setView(view: StudioView): void {
    this.view = view;
    this.root.classList.remove('ms-nav-open');
    this.root.querySelectorAll('.ms-nav__btn').forEach((b) => {
      b.classList.toggle('is-active', (b as HTMLElement).dataset.view === view);
    });
    const titleEl = this.root.querySelector('[data-ms-title]');
    if (titleEl) titleEl.textContent = NAV.find((n) => n.id === view)?.label ?? 'MOD Studio';
    this.render();
    if (view === 'editor') {
      requestAnimationFrame(() => {
        this.ensureWorkshop();
        this.workshop?.start();
        this.workshop?.layout();
      });
    } else {
      this.workshop?.stop();
    }
  }

  private ensureWorkshop(): void {
    if (this.workshop) return;
    const host = this.root.querySelector('[data-ms-editor-host]');
    if (!host) return;
    this.workshop = new VoxelEditorUi(this.materials);
    this.workshop.mount(host as HTMLElement);
  }

  private render(): void {
    const body = this.root.querySelector('[data-ms-body]') as HTMLElement;
    const editorShell = this.root.querySelector('[data-ms-editor-shell]') as HTMLElement;
    const showEditor = this.view === 'editor';
    body.hidden = showEditor;
    editorShell.hidden = !showEditor;
    if (showEditor) {
      this.ensureWorkshop();
      return;
    }
    if (this.view === 'overview') {
      body.innerHTML = this.renderOverview();
      body.querySelector('[data-go-create]')?.addEventListener('click', () => this.setView('create'));
      body.querySelector('[data-go-editor]')?.addEventListener('click', () => this.setView('editor'));
      return;
    }
    if (this.view === 'library') {
      body.innerHTML = this.renderLibrary();
      body.querySelector('[data-go-create]')?.addEventListener('click', () => this.setView('create'));
      body.querySelectorAll<HTMLElement>('[data-mod-id]').forEach((card) => {
        card.addEventListener('click', () => {
          const pkg = listAuthoredPackages().find((p) => p.manifest.id === card.dataset.modId);
          if (pkg) {
            this.activeManifest = pkg.manifest;
            this.setView('publish');
          }
        });
      });
      return;
    }
    if (this.view === 'create') {
      body.innerHTML = this.renderCreate();
      this.bindCreate(body);
      return;
    }
    if (this.view === 'assets') {
      const saved = listSavedMods();
      body.innerHTML = `<div class="ms-panel"><h3>Editor assets</h3>
        <p class="ms-muted">Shapes from the voxel editor storage.</p>
        <ul class="ms-list">${
          saved.length
            ? saved
                .map((s) => `<li><strong>${esc(s.name)}</strong> · ${s.voxelCount} voxels · ${fmtDate(s.updatedAt)}</li>`)
                .join('')
            : '<li class="ms-muted">No saved shapes yet</li>'
        }</ul></div>`;
      return;
    }
    if (this.view === 'scripts') {
      body.innerHTML = `<div class="ms-panel"><h3>Scripts</h3>
        <p class="ms-muted">Author behaviors in Editor → Character. AI Studio can assist when both are open.</p>
        <button type="button" class="vy-btn vy-btn--primary" data-go-editor>Open editor</button></div>`;
      body.querySelector('[data-go-editor]')?.addEventListener('click', () => this.setView('editor'));
      return;
    }
    if (this.view === 'testing') {
      body.innerHTML = this.renderTesting();
      this.bindTesting(body);
      return;
    }
    if (this.view === 'checklist') {
      body.innerHTML = this.renderChecklist();
      return;
    }
    if (this.view === 'versions') {
      body.innerHTML = this.renderVersions();
      body.querySelector('[data-bump]')?.addEventListener('click', () => {
        if (!this.activeManifest) return;
        this.activeManifest = {
          ...this.activeManifest,
          version: bumpPatch(this.activeManifest.version),
          updatedAt: Date.now(),
        };
        this.setView('testing');
      });
      return;
    }
    if (this.view === 'analytics') {
      const s = creatorStats();
      body.innerHTML = `<div class="ms-statgrid">
        <div class="ms-stat"><span>${s.mods}</span><em>Mods</em></div>
        <div class="ms-stat"><span>${s.published}</span><em>Published</em></div>
        <div class="ms-stat"><span>${s.downloads}</span><em>Downloads</em></div>
      </div><p class="ms-muted">Local-device totals only — never fabricated.</p>`;
      return;
    }
    body.innerHTML = this.renderPublish();
    this.bindPublish(body);
  }

  private modCard(pkg: ModPackage): string {
    const m = pkg.manifest;
    return `<article class="ms-card" data-mod-id="${esc(m.id)}">
      <div class="ms-card__icon"${m.iconDataUrl ? ` style="background-image:url(${m.iconDataUrl})"` : ''}></div>
      <div class="ms-card__body">
        <h5>${esc(m.displayName)}</h5>
        <p>${esc(m.description || 'No description')}</p>
        <div class="ms-card__meta">
          <span>v${esc(m.version)}</span>
          <span class="ms-pill ms-pill--${m.lifecycle}">${m.lifecycle}</span>
          <span>${fmtDate(m.updatedAt)}</span>
        </div>
      </div>
    </article>`;
  }

  private renderOverview(): string {
    const authored = listAuthoredPackages();
    const installed = listInstalled();
    const stats = creatorStats();
    const backend = getPublishBackendStatus();
    return `<div class="ms-hero"><div>
      <p class="ms-kicker">Creator workspace</p>
      <h3>Shape · animate · package · share</h3>
      <p class="ms-muted">Build with the live voxel engine, then package for your library or the on-device MOD HUB catalog.</p>
      <div class="ms-actions">
        <button type="button" class="vy-btn vy-btn--primary" data-go-create>Create mod</button>
        <button type="button" class="vy-btn" data-go-editor>Continue editing</button>
      </div></div>
      <div class="ms-statgrid">
        <div class="ms-stat"><span>${stats.mods}</span><em>Authored</em></div>
        <div class="ms-stat"><span>${stats.published}</span><em>Published</em></div>
        <div class="ms-stat"><span>${installed.length}</span><em>Installed</em></div>
        <div class="ms-stat"><span>${stats.downloads}</span><em>Local downloads</em></div>
      </div></div>
      <p class="ms-banner">${esc(backend.message)}</p>
      <h4 class="ms-section-title">Recent mods</h4>
      <div class="ms-cardgrid">${
        authored.length
          ? authored.slice(0, 6).map((p) => this.modCard(p)).join('')
          : '<p class="ms-muted">No authored mods yet.</p>'
      }</div>`;
  }

  private renderLibrary(): string {
    const authored = listAuthoredPackages();
    const drafts = authored.filter((p) => p.manifest.lifecycle === 'draft');
    const published = authored.filter((p) => p.manifest.lifecycle === 'published');
    return `<div class="ms-actions" style="margin-bottom:16px">
      <button type="button" class="vy-btn vy-btn--primary" data-go-create>Create mod</button></div>
      <h4 class="ms-section-title">Published (${published.length})</h4>
      <div class="ms-cardgrid">${published.map((p) => this.modCard(p)).join('') || '<p class="ms-muted">None yet</p>'}</div>
      <h4 class="ms-section-title">Drafts (${drafts.length})</h4>
      <div class="ms-cardgrid">${drafts.map((p) => this.modCard(p)).join('') || '<p class="ms-muted">None yet</p>'}</div>`;
  }

  private renderCreate(): string {
    const cats = MOD_CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join('');
    return `<form class="ms-form" data-create-form>
      <label>Mod name<input name="name" class="vy-input" required maxlength="64" placeholder="crystal-bridge" /></label>
      <label>Display name<input name="displayName" class="vy-input" maxlength="80" placeholder="Crystal Bridge" /></label>
      <label>Author<input name="author" class="vy-input" required maxlength="64" placeholder="Wanderer" /></label>
      <label>Description<textarea name="description" class="vy-input" rows="4" maxlength="4000"></textarea></label>
      <label>Category<select name="category" class="vy-input">${cats}</select></label>
      <label>Tags<input name="tags" class="vy-input" placeholder="bridge, crystal" /></label>
      <label>Version<input name="version" class="vy-input" value="0.1.0" /></label>
      <div class="ms-actions"><button type="submit" class="vy-btn vy-btn--primary">Create draft</button></div>
      <p class="ms-muted" data-create-status></p></form>`;
  }

  private bindCreate(body: HTMLElement): void {
    body.querySelector('[data-create-form]')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target as HTMLFormElement);
      const status = body.querySelector('[data-create-status]') as HTMLElement;
      try {
        const name = String(fd.get('name') || '');
        const manifest = createManifest({
          name,
          displayName: String(fd.get('displayName') || name),
          author: String(fd.get('author') || ''),
          description: String(fd.get('description') || ''),
          version: String(fd.get('version') || '0.1.0'),
          category: String(fd.get('category') || 'other') as ModCategory,
          tags: String(fd.get('tags') || '')
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          visibility: 'private',
          lifecycle: 'draft',
        });
        const pkg = await buildPackage(manifest, emptyAsset(manifest.displayName));
        saveAuthoredPackage(pkg);
        this.activeManifest = pkg.manifest;
        status.textContent = `Draft created: ${pkg.manifest.id}@${pkg.manifest.version}`;
        status.className = 'ms-ok';
        this.setView('editor');
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'Create failed';
        status.className = 'ms-err';
      }
    });
  }

  private renderTesting(): string {
    const st = this.lastBuild;
    return `<div class="ms-panel"><h3>Build & validate</h3>
      <p class="ms-muted">Packages must validate before publish. Messages are privacy-sanitized.</p>
      <div class="ms-actions">
        <button type="button" class="vy-btn vy-btn--primary" data-run-build>Build package</button>
      </div>
      <p class="ms-status" data-test-status>${
        st ? `${st.ok ? 'PASSED' : 'FAILED'} · ${esc(st.message)} · ${fmtDate(st.at)}` : 'READY'
      }</p></div>`;
  }

  private bindTesting(body: HTMLElement): void {
    const status = body.querySelector('[data-test-status]') as HTMLElement;
    body.querySelector('[data-run-build]')?.addEventListener('click', async () => {
      status.textContent = 'BUILDING…';
      try {
        const manifest =
          this.activeManifest ??
          createManifest({ name: 'untitled', author: 'wanderer', displayName: 'Untitled' });
        const asset = (this.activeManifest && loadModAsset(this.activeManifest.id)) || emptyAsset(manifest.displayName);
        const pkg = await buildPackage({ ...manifest, lifecycle: 'draft' }, asset);
        saveAuthoredPackage(pkg);
        this.activeManifest = pkg.manifest;
        this.lastBuild = { ok: true, message: `${pkg.manifest.id}@${pkg.manifest.version}`, at: Date.now() };
        status.textContent = `PASSED · ${this.lastBuild.message}`;
        status.className = 'ms-ok';
      } catch (err) {
        this.lastBuild = { ok: false, message: err instanceof Error ? err.message : 'Build failed', at: Date.now() };
        status.textContent = `FAILED · ${this.lastBuild.message}`;
        status.className = 'ms-err';
      }
    });
  }

  private renderChecklist(): string {
    const doneCount = BACKLOG_ITEMS.filter((i) => i.status === 'done').length;
    const skipCount = BACKLOG_ITEMS.filter((i) => i.status === 'skipped').length;
    const blockCount = BACKLOG_ITEMS.filter((i) => i.status === 'blocked').length;

    const sections = Array.from(new Set(BACKLOG_ITEMS.map((i) => i.section)));

    return `<div class="ms-panel" style="max-height: 80vh; overflow-y: auto;">
      <h3>Mod Studio 500-Item Backlog Checklist</h3>
      <p class="ms-muted">Strict data-driven architecture. No eval/fetch/Function. No world-gen rewrites. No dimensions. No guns/explosives.</p>
      <div class="ms-statgrid" style="margin: 14px 0;">
        <div class="ms-stat"><span>${doneCount}</span><em>DONE</em></div>
        <div class="ms-stat"><span>${skipCount}</span><em>SKIPPED (spec rules)</em></div>
        <div class="ms-stat"><span>${blockCount}</span><em>BLOCKED</em></div>
      </div>
      ${sections
        .map((sec) => {
          const items = BACKLOG_ITEMS.filter((i) => i.section === sec);
          return `<h4 style="color:var(--vy-gold); margin: 18px 0 8px 0; font-size: 0.85rem; letter-spacing: 0.1em; text-transform: uppercase;">${esc(sec)}</h4>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 6px;">
              ${items
                .map((it) => {
                  const badgeColor =
                    it.status === 'done'
                      ? 'background:rgba(80,200,120,0.2);color:#80e890;border:1px solid rgba(80,200,120,0.4)'
                      : it.status === 'skipped'
                      ? 'background:rgba(255,200,80,0.15);color:#ffd060;border:1px solid rgba(255,200,80,0.3)'
                      : 'background:rgba(255,80,80,0.2);color:#ff8080;border:1px solid rgba(255,80,80,0.4)';
                  return `<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;background:rgba(255,255,255,0.03);border-radius:4px;font-size:0.75rem;">
                    <span><strong>#${it.id}</strong> ${esc(it.name)}</span>
                    <span style="font-size:0.65rem;font-weight:bold;padding:2px 6px;border-radius:3px;text-transform:uppercase;${badgeColor}">${it.status}</span>
                  </div>`;
                })
                .join('')}
            </div>`;
        })
        .join('')}
    </div>`;
  }

  private renderVersions(): string {
    const id = this.activeManifest?.id;
    const versions = id ? listAuthoredVersions(id) : [];
    return `<div class="ms-panel"><h3>Versions ${id ? `· ${esc(id)}` : ''}</h3>
      ${
        versions.length
          ? `<ul class="ms-list">${versions
              .map(
                (p) =>
                  `<li><strong>v${esc(p.manifest.version)}</strong> · ${p.manifest.lifecycle} · ${fmtDate(p.manifest.updatedAt)}</li>`,
              )
              .join('')}</ul><button type="button" class="vy-btn" data-bump>Bump patch version</button>`
          : `<p class="ms-muted">Create a mod and build to record versions.</p>`
      }</div>`;
  }

  private renderPublish(): string {
    const backend = getPublishBackendStatus();
    const m = this.activeManifest;
    return `<div class="ms-panel"><p class="ms-banner">${esc(backend.message)}</p>
      <h3>Publish</h3>
      <ol class="ms-steps"><li>Create mod</li><li>Build & validate</li><li>Set visibility</li><li>Publish / export</li></ol>
      <p>Active: <strong>${m ? esc(`${m.displayName} @ ${m.version}`) : 'none'}</strong></p>
      <label>Visibility<select class="vy-input" data-vis>
        <option value="private">Private</option>
        <option value="unlisted">Unlisted</option>
        <option value="public">Public (local catalog)</option>
      </select></label>
      <div class="ms-actions" style="margin-top:12px">
        <button type="button" class="vy-btn vy-btn--primary" data-publish>Publish</button>
        <button type="button" class="vy-btn" data-export>Export .vymod.json</button>
        <button type="button" class="vy-btn" data-install>Install to library</button>
      </div>
      <p class="ms-status" data-pub-status></p></div>`;
  }

  private bindPublish(body: HTMLElement): void {
    const status = body.querySelector('[data-pub-status]') as HTMLElement;
    const vis = () => (body.querySelector('[data-vis]') as HTMLSelectElement).value as ModVisibility;
    const ensurePkg = async (): Promise<ModPackage> => {
      if (!this.activeManifest) throw new Error('Create or select a mod first');
      const asset = loadModAsset(this.activeManifest.id) || emptyAsset(this.activeManifest.displayName);
      return buildPackage(this.activeManifest, asset);
    };
    body.querySelector('[data-publish]')?.addEventListener('click', async () => {
      status.textContent = 'Publishing…';
      try {
        const res = await publishLocal(await ensurePkg(), vis());
        if (!res.ok) {
          status.textContent = res.validation.issues.map((i) => i.message).join(' · ');
          status.className = 'ms-err';
          return;
        }
        this.activeManifest = res.package.manifest;
        status.textContent = `Published locally as ${res.package.manifest.visibility}`;
        status.className = 'ms-ok';
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'Publish failed';
        status.className = 'ms-err';
      }
    });
    body.querySelector('[data-export]')?.addEventListener('click', async () => {
      try {
        const pkg = await ensurePkg();
        const blob = packageToDownloadBlob(pkg);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${pkg.manifest.id}-${pkg.manifest.version}.vymod.json`;
        a.click();
        URL.revokeObjectURL(a.href);
        status.textContent = 'Exported package';
        status.className = 'ms-ok';
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'Export failed';
        status.className = 'ms-err';
      }
    });
    body.querySelector('[data-install]')?.addEventListener('click', async () => {
      try {
        const res = await installPackage(await ensurePkg(), 'local-publish');
        status.textContent = res.ok ? 'Installed to library' : res.reason;
        status.className = res.ok ? 'ms-ok' : 'ms-err';
      } catch (err) {
        status.textContent = err instanceof Error ? err.message : 'Install failed';
        status.className = 'ms-err';
      }
    });
  }
}
