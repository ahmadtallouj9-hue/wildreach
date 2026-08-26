export const SHAPE_STUDIO_HTML = `
  <div class="mod-workshop-palette-inner mod-shape-inner">
    <section class="mod-shape-card vxl-section--material">
      <div class="mod-shape-card-title">1 — MATERIAL</div>
      <div class="voxel-editor-swatches" aria-label="Color palette"></div>
      <div class="vxl-mat-selects">
        <label class="vxl-mat-lab">Face <select class="vxl-mat-face" aria-label="Face material"></select></label>
        <label class="vxl-mat-lab">Torso <select class="vxl-mat-torso" aria-label="Torso material"></select></label>
      </div>
      <p class="vxl-mats-label">Materials in use</p>
      <ul class="vxl-mats-in-use" aria-label="Materials in use"></ul>
      <p class="mod-brush-name" aria-live="polite"></p>
    </section>

    <section class="mod-shape-card vxl-section--draw">
      <div class="mod-shape-card-title">3 — DRAW</div>
      <div class="vxl-tex-tool-row" data-tex-tool-row role="group" aria-label="Paint tools">
        <button type="button" class="vxl-tex-icon active" data-tex-tool="paint" title="Voxel">Voxel</button>
        <button type="button" class="vxl-tex-icon" data-tex-tool="erase" title="Erase">Erase</button>
        <button type="button" class="vxl-tex-icon" data-tex-tool="eyedrop" title="Pick">Pick</button>
        <button type="button" class="vxl-tex-icon" data-tex-tool="bucket" title="Fill">Fill</button>
        <button type="button" class="vxl-tex-icon" data-tex-tool="line" title="Line">Line</button>
      </div>
      <div class="vxl-shape-tool-row vxl-modeling-only" data-tool-row>
        <button type="button" class="mod-tool-btn" data-tool="fill">Box voxel</button>
        <button type="button" class="mod-tool-btn" data-tool="extrude">Face extrude</button>
        <button type="button" class="mod-tool-btn" data-tool="texpaint">Voxel select</button>
      </div>
      <div class="mod-shape-sublabel">Brush size</div>
      <div class="mod-tool-row vxl-brush-row" data-brush-row>
        <button type="button" class="mod-tool-btn active" data-brush="1">1</button>
        <button type="button" class="mod-tool-btn" data-brush="2">2</button>
        <button type="button" class="mod-tool-btn" data-brush="3">3</button>
        <button type="button" class="mod-tool-btn" data-brush="4">4</button>
      </div>
      <div class="vxl-tex-toggles-row">
        <button type="button" class="vxl-tex-tog active" data-tog="grid">Grid</button>
        <button type="button" class="vxl-tex-tog active" data-tog="check">Check</button>
        <button type="button" class="vxl-tex-tog" data-tog="mx">Mirror X</button>
        <button type="button" class="vxl-tex-tog" data-tog="my">Mirror Y</button>
      </div>
      <div class="vxl-modeling-only">
        <div class="mod-tool-row mod-tool-row--3" data-tool-row>
          <button type="button" class="mod-tool-btn active" data-tool="brush">Brush</button>
          <button type="button" class="mod-tool-btn" data-tool="erase">Erase</button>
          <button type="button" class="mod-tool-btn" data-tool="paint">Paint</button>
          <button type="button" class="mod-tool-btn" data-tool="box">Box</button>
          <button type="button" class="mod-tool-btn" data-tool="sphere">Sph</button>
        </div>
        <label class="mod-glow-toggle">
          <input type="checkbox" class="mod-glow-check" />
          <span>✦ Glow</span>
        </label>
      </div>
    </section>

    <section class="mod-shape-card vxl-modeling-only">
      <div class="mod-shape-card-title">Mirror &amp; UV</div>
      <div class="mod-tool-row" data-uv-row role="group" aria-label="UV mapping">
        <button type="button" class="mod-tool-btn active" data-uv="projection">Project</button>
        <button type="button" class="mod-tool-btn" data-uv="per_voxel">Per voxel</button>
      </div>
      <div class="mod-tool-row mod-tool-row--3" data-mirror-row>
        <button type="button" class="mod-tool-btn active" data-mirror="none">Off</button>
        <button type="button" class="mod-tool-btn" data-mirror="x">X</button>
        <button type="button" class="mod-tool-btn" data-mirror="y">Y</button>
        <button type="button" class="mod-tool-btn" data-mirror="z">Z</button>
      </div>
      <div class="mod-tool-row" data-op-row>
        <button type="button" class="mod-tool-btn" data-op="undo">Undo</button>
        <button type="button" class="mod-tool-btn" data-op="redo">Redo</button>
        <button type="button" class="mod-tool-btn" data-op="center">Center</button>
      </div>
    </section>

    <section class="mod-shape-card vxl-section--color">
      <div class="mod-shape-card-title">5 — COLOR PICKER</div>
      <div class="mod-color-host"></div>
      <p class="vxl-hex-readout">#87907B</p>
      <div class="vxl-color-actions">
        <button type="button" class="vxl-btn-primary" data-action="apply-texture">Apply texture</button>
        <button type="button" class="vxl-btn-secondary" data-action="new-block">+ New block</button>
      </div>
    </section>
  </div>
`;
