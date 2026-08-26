/** Panel 1 — Scene tree slot + sculpt/paint tools + model ops. */
export const LEFT_RAIL_HTML = `
  <div class="mod-studio-tools-inner">
    <div class="mod-studio-toolgrid mod-texture-only" data-tex-tool-row role="group" aria-label="Paint tools">
      <button type="button" class="mod-tool-icon active" data-tex-tool="paint" title="Brush"><span aria-hidden="true">🖌</span><span>Brush</span></button>
      <button type="button" class="mod-tool-icon" data-tex-tool="erase" title="Erase"><span aria-hidden="true">⌫</span><span>Erase</span></button>
      <button type="button" class="mod-tool-icon" data-tex-tool="bucket" title="Fill"><span aria-hidden="true">▣</span><span>Fill</span></button>
      <button type="button" class="mod-tool-icon" data-tex-tool="line" title="Line"><span aria-hidden="true">╱</span><span>Line</span></button>
      <button type="button" class="mod-tool-icon" data-tex-tool="eyedrop" title="Pick"><span aria-hidden="true">◉</span><span>Pick</span></button>
      <button type="button" class="mod-tool-icon mod-tool-icon--ghost" data-action="import-texture" title="Import"><span aria-hidden="true">↓</span><span>Import</span></button>
      <button type="button" class="mod-tool-icon mod-tool-icon--ghost" data-action="export-texture" title="Export"><span aria-hidden="true">↑</span><span>Export</span></button>
      <button type="button" class="mod-tool-icon mod-tool-icon--ghost" data-tog="grid" title="Grid"><span aria-hidden="true">#</span><span>Grid</span></button>
    </div>

    <div class="mod-studio-toolgrid mod-modeling-only" data-tool-row role="group" aria-label="Sculpt tools">
      <button type="button" class="mod-tool-icon active" data-tool="brush" title="Brush (B)"><span aria-hidden="true">🖌</span><span>Brush</span></button>
      <button type="button" class="mod-tool-icon" data-tool="erase" title="Erase (E)"><span aria-hidden="true">⌫</span><span>Erase</span></button>
      <button type="button" class="mod-tool-icon" data-tool="box" title="Box volume"><span aria-hidden="true">▢</span><span>Box</span></button>
      <button type="button" class="mod-tool-icon" data-tool="flood" title="Flood fill (G)"><span aria-hidden="true">▣</span><span>Fill</span></button>
      <button type="button" class="mod-tool-icon" data-tool="extrude" title="Extrude (X)"><span aria-hidden="true">⬆</span><span>Extrude</span></button>
      <button type="button" class="mod-tool-icon" data-tool="texpaint" title="UV Paint"><span aria-hidden="true">◫</span><span>UV</span></button>
      <button type="button" class="mod-tool-icon mod-tool-icon--ghost" data-action="reset-view" title="Reset view"><span aria-hidden="true">↻</span><span>Reset</span></button>
      <button type="button" class="mod-tool-icon mod-tool-icon--ghost" data-op="center" title="Center model"><span aria-hidden="true">◎</span><span>Center</span></button>
    </div>

    <div class="mod-studio-brush mod-texture-only" data-brush-row role="group" aria-label="Brush size">
      <span class="mod-studio-micro">Brush</span>
      <button type="button" class="mod-seg-pill active" data-brush="1">1</button>
      <button type="button" class="mod-seg-pill" data-brush="2">2</button>
      <button type="button" class="mod-seg-pill" data-brush="3">3</button>
      <button type="button" class="mod-seg-pill" data-brush="4">4</button>
    </div>

    <div class="mod-studio-brush mod-modeling-only" data-sculpt-brush-row role="group" aria-label="Voxel brush size">
      <span class="mod-studio-micro">Size</span>
      <button type="button" class="mod-seg-pill active" data-brush="1">1</button>
      <button type="button" class="mod-seg-pill" data-brush="2">2</button>
      <button type="button" class="mod-seg-pill" data-brush="3">3</button>
      <button type="button" class="mod-seg-pill" data-brush="4">4</button>
    </div>

    <div class="mod-studio-ops">
      <p class="mod-studio-micro">Model ops</p>
      <p class="mod-studio-micro mod-modeling-only">Gizmo</p>
      <div class="mod-seg mod-modeling-only mod-studio-gizmo-row" data-model-gizmo-row role="group" aria-label="Model gizmo">
        <button type="button" class="mod-seg-btn" data-model-gizmo="rotate" title="Rotate model">Rotate</button>
        <button type="button" class="mod-seg-btn" data-model-gizmo="translate" title="Move model">Move</button>
        <button type="button" class="mod-seg-btn" data-model-gizmo="scale" title="Scale model (preview)">Scale</button>
        <button type="button" class="mod-seg-btn active" data-model-gizmo="off" title="Gizmo off — paint voxels">Off</button>
      </div>
      <div class="mod-seg mod-modeling-only" data-mirror-row role="group" aria-label="Mirror">
        <button type="button" class="mod-seg-btn active" data-mirror="none">OFF</button>
        <button type="button" class="mod-seg-btn" data-mirror="x">Mirror X</button>
        <button type="button" class="mod-seg-btn" data-mirror="z">Mirror Z</button>
      </div>
      <div class="mod-seg mod-texture-only" data-uv-row role="group" aria-label="UV mapping">
        <button type="button" class="mod-seg-btn active" data-uv="per_voxel" title="Each block face uses the full 16×16 tile">Per face</button>
        <button type="button" class="mod-seg-btn" data-uv="projection" title="Stretch one texture across the whole model (advanced)">Project</button>
      </div>
      <label class="mod-switch mod-modeling-only">
        <input type="checkbox" class="mod-glow-check" />
        <span class="mod-switch-track" aria-hidden="true"></span>
        <span class="mod-switch-label">Place glowing voxels</span>
      </label>
      <label class="mod-switch mod-texture-only">
        <input type="checkbox" class="mod-tex-apply-shape" />
        <span class="mod-switch-track" aria-hidden="true"></span>
        <span class="mod-switch-label">Highlight this color only</span>
      </label>
      <p class="mod-studio-hint-line mod-texture-only">Paint the 16×16 for the selected color, or use UV tool and click faces on the model.</p>
    </div>

    <div class="mod-studio-shape-ops mod-modeling-only">
      <p class="mod-studio-micro">Starters</p>
      <div class="mod-studio-opgrid mod-studio-starters" role="group" aria-label="Shape starters">
        <button type="button" class="mod-seg-btn" data-starter="sword" title="Sword silhouette">Sword</button>
        <button type="button" class="mod-seg-btn" data-starter="dragon" title="Dragon silhouette">Dragon</button>
        <button type="button" class="mod-seg-btn" data-starter="animal" title="Animal silhouette">Animal</button>
        <button type="button" class="mod-seg-btn" data-starter="character" title="Humanoid colored from your SKIN">Character</button>
      </div>
      <p class="mod-studio-hint-line">32×32×32 grid · big builds OK</p>
      <p class="mod-studio-micro">Shape ops</p>
      <div class="mod-studio-opgrid">
        <button type="button" class="mod-seg-btn" data-op="flip-x" title="Flip X">Flip X</button>
        <button type="button" class="mod-seg-btn" data-op="flip-z" title="Flip Z">Flip Z</button>
        <button type="button" class="mod-seg-btn" data-op="rot-y" title="Rotate Y">Rot Y</button>
        <button type="button" class="mod-seg-btn" data-op="floor" title="Floor">Floor</button>
        <button type="button" class="mod-seg-btn" data-op="dup" title="Duplicate">Dup</button>
        <button type="button" class="mod-seg-btn" data-op="hollow" title="Hollow">Hollow</button>
        <button type="button" class="mod-seg-btn" data-op="copy" title="Copy">Copy</button>
        <button type="button" class="mod-seg-btn" data-op="paste" title="Paste">Paste</button>
      </div>
    </div>

    <div class="mod-studio-hidden-ops" aria-hidden="true">
      <button type="button" data-op="undo" hidden></button>
      <button type="button" data-op="redo" hidden></button>
    </div>
  </div>
`;

/** Panel 3 — color picker + apply actions. */
export const PAINT_PANEL_HTML = `
  <div class="mod-studio-paint-inner">
    <div class="mod-color-host"></div>
    <p class="mod-studio-hex vxl-hex-readout">#DB4747</p>
    <div class="mod-studio-paint-actions">
      <button type="button" class="mod-btn mod-btn--ghost" data-action="save-color">Save color</button>
      <button type="button" class="mod-btn mod-btn--ghost" data-action="add-color">Add color</button>
      <button type="button" class="mod-btn mod-btn--ghost" data-action="new-block">New material</button>
      <button type="button" class="mod-btn mod-btn--primary" data-action="apply-texture">Apply to material</button>
    </div>
    <p class="mod-brush-name mod-studio-mat-name" aria-live="polite"></p>
  </div>
`;
