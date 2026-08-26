/** MOD Studio — Blockbench-style: toolstrip · outliner · viewport · UV/paint. */
export const MODEL_EDITOR_SHELL_HTML = `
  <div class="mod-studio-shell">
    <header class="mod-studio-menubar" aria-label="Editor menus">
      <nav class="mod-studio-menus" role="menubar">
        <div class="mod-studio-menu" data-menu="file">
          <button type="button" class="mod-studio-menu-btn" aria-haspopup="true">File</button>
          <div class="mod-studio-dropdown" hidden>
            <button type="button" data-action="save-mod">Save</button>
            <button type="button" data-action="load-mod">Load</button>
            <button type="button" data-action="export-mod">Export</button>
            <button type="button" data-action="import-mod">Import</button>
          </div>
        </div>
        <div class="mod-studio-menu" data-menu="edit">
          <button type="button" class="mod-studio-menu-btn" aria-haspopup="true">Edit</button>
          <div class="mod-studio-dropdown" hidden>
            <button type="button" data-op="undo">Undo</button>
            <button type="button" data-op="redo">Redo</button>
            <button type="button" data-action="clear">Clear model</button>
          </div>
        </div>
        <div class="mod-studio-menu" data-menu="view">
          <button type="button" class="mod-studio-menu-btn" aria-haspopup="true">View</button>
          <div class="mod-studio-dropdown" hidden>
            <button type="button" data-action="reset-view">Reset camera</button>
            <button type="button" data-action="toggle-grid">Toggle grid</button>
            <button type="button" data-action="toggle-check">Toggle checker</button>
          </div>
        </div>
        <span class="mod-studio-menu-sep" aria-hidden="true"></span>
        <button type="button" class="mod-studio-menu-link" data-mode="shape">Modeling</button>
        <button type="button" class="mod-studio-menu-link active" data-mode="texture">Texturing</button>
        <button type="button" class="mod-studio-menu-link" data-mode="animate">Animation</button>
        <button type="button" class="mod-studio-menu-link" data-mode="logic">Character</button>
        <span class="mod-studio-menu-sep" aria-hidden="true"></span>
        <button type="button" class="mod-studio-menu-link mod-studio-help-btn" data-action="open-guide" title="How to use MOD Studio">Guide</button>
      </nav>
      <div class="mod-studio-brand">MOD</div>
      <div class="mod-studio-top-actions">
        <input type="text" class="mod-studio-search" placeholder="Search…" aria-label="Search scene tree" />
        <button type="button" class="mod-studio-share-copy" data-action="copy-studio-link" title="Copy project link">Share</button>
      </div>
      <input type="file" class="mod-import-input" accept=".json,.mod.json,application/json" hidden />
      <input type="text" class="mod-name-input" maxlength="32" spellcheck="false" value="Character" hidden aria-hidden="true" />
      <a class="mod-studio-share-url" href="#" target="_blank" rel="noopener noreferrer" hidden></a>
    </header>

    <div class="mod-studio-body">
      <aside class="mod-studio-left" aria-label="Outliner and tools">
        <section class="mod-studio-panel mod-studio-panel--scene">
          <header class="mod-studio-panel-head"><h3 class="mod-studio-left-title">Tools</h3></header>
          <div class="mod-studio-hierarchy-slot"></div>
          <div class="mod-studio-scene-tools mod-shape-panel"></div>
        </section>
        <section class="mod-studio-panel mod-studio-panel--character mod-character-only" hidden>
          <header class="mod-studio-panel-head"><h3>Character</h3></header>
          <div class="mod-studio-character-tools">
            <p class="mod-studio-micro">Your skin in the model</p>
            <button type="button" class="voxel-editor-btn mod-char-add-btn" data-char-action="add-skin">
              Add my skin character
            </button>
            <button type="button" class="voxel-editor-btn" data-char-action="refresh-skin">
              Refresh skin
            </button>
            <p class="mod-studio-micro">Big shape starters</p>
            <div class="mod-studio-opgrid mod-studio-starters" role="group" aria-label="Shape starters">
              <button type="button" class="mod-seg-btn" data-starter="sword" title="Sword">Sword</button>
              <button type="button" class="mod-seg-btn" data-starter="dragon" title="Dragon">Dragon</button>
              <button type="button" class="mod-seg-btn" data-starter="animal" title="Animal">Animal</button>
              <button type="button" class="mod-seg-btn" data-starter="character" title="Humanoid from skin">Character</button>
            </div>
            <p class="mod-studio-hint-line">32×32×32 grid — build swords, dragons, animals</p>
          </div>
        </section>
      </aside>

      <section class="mod-studio-viewport-col">
        <header class="mod-studio-vp-head">
          <span class="mod-studio-vp-label">Viewport</span>
          <span class="mod-studio-vp-sep">·</span>
          <span class="mod-studio-vp-model"><strong class="forge-viewport-model forge-model-file">Character.vxl</strong></span>
          <span class="mod-studio-vp-sep">·</span>
          <span class="mod-studio-vp-stats voxel-editor-stats"><span data-blocks>0</span>/<span data-limit>32768</span></span>
          <span class="mod-studio-mode-pill forge-mode-label">Texturing</span>
        </header>
        <div class="mod-studio-vp-stage mod-workshop-viewport-wrap">
          <div class="mod-workshop-viewport"></div>
          <div class="mod-studio-vp-hint">LMB paint · RMB orbit · scroll zoom · middle pan</div>
        </div>
      </section>

      <aside class="mod-studio-right" aria-label="UV and paint">
        <section class="mod-studio-panel mod-studio-panel--materials">
          <header class="mod-studio-panel-head"><h3 class="mod-studio-mat-title">Blocks</h3></header>
          <div class="mod-studio-materials-slot"></div>
          <div class="mod-studio-materials-tex-slot mod-texture-rail"></div>
        </section>
        <section class="mod-studio-panel mod-studio-panel--paint">
          <header class="mod-studio-panel-head"><h3 class="mod-studio-paint-title">Place color</h3></header>
          <div class="mod-studio-paint-slot"></div>
          <header class="mod-studio-panel-head mod-texture-rail"><h3>Preview</h3></header>
          <div class="mod-studio-preview-slot mod-texture-rail"></div>
          <div class="mod-studio-inspector-slot"></div>
        </section>
        <section class="mod-studio-panel mod-studio-panel--logic mod-character-only" hidden>
          <header class="mod-studio-panel-head"><h3>Skin &amp; behaviors</h3></header>
          <div class="mod-studio-logic-slot"></div>
        </section>
      </aside>
    </div>

    <div class="mod-studio-timeline-slot"></div>

    <footer class="mod-studio-statusbar">
      <div class="mod-studio-progress">
        <div class="mod-studio-progress-bar"><span class="mod-studio-progress-fill"></span></div>
        <span class="mod-studio-progress-text voxel-editor-stats"><span data-blocks>0</span>/<span data-limit>32768</span></span>
      </div>
      <p class="mod-studio-status-model"><span class="mod-studio-status-name">Character.vxl</span> · <span class="forge-mode-label">Texturing</span></p>
      <p class="mod-studio-status-meta">
        <span>Frame <span data-frame>0</span></span>
        <span><span data-speed>1×</span></span>
        <span><span data-fps>30</span> fps</span>
      </p>
      <p class="voxel-editor-hint mod-studio-hint" aria-live="polite">Pick a tool · paint on canvas or model</p>
      <p class="mod-workshop-status mod-studio-toast" aria-live="polite"></p>
    </footer>
  </div>
`;
