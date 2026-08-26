/** Texture canvas (panel 2) + orientation preview (panel 3). */
export const TEXTURE_STUDIO_HTML = `
  <div class="mod-tex-root">
    <section class="mod-tex-canvas-section">
      <div class="mod-studio-tex-head">
        <p class="mod-studio-micro">UV / Texture</p>
        <span class="mod-tex-coords mod-studio-tex-coords">${16}×${16}</span>
      </div>
      <div class="mod-tex-stage mod-studio-tex-stage">
        <div class="mod-tex-canvas-wrap mod-studio-tex-wrap">
          <canvas class="mod-tex-canvas" width="256" height="256" aria-label="Paint texture"></canvas>
          <canvas class="mod-tex-overlay" width="256" height="256" aria-hidden="true"></canvas>
        </div>
      </div>
      <p class="mod-tex-status mod-studio-tex-status">16×16 pixels</p>
    </section>

    <section class="mod-tex-preview-section">
      <p class="mod-studio-micro">Orientation</p>
      <div class="mod-studio-orient-wrap">
        <div class="mod-tex-preview-wrap mod-studio-preview-wrap">
          <canvas class="mod-tex-preview" width="96" height="96" aria-hidden="true"></canvas>
        </div>
        <div class="mod-studio-face-labels" aria-hidden="true">
          <span class="mod-face mod-face--top">Top</span>
          <span class="mod-face mod-face--front">Front</span>
          <span class="mod-face mod-face--back">Back</span>
          <span class="mod-face mod-face--left">L-Side</span>
          <span class="mod-face mod-face--right">R-Side</span>
          <span class="mod-face mod-face--bottom">Bottom</span>
        </div>
      </div>
      <div class="mod-studio-preview-modes" role="group" aria-label="Preview angle">
        <button type="button" class="mod-seg-pill active mod-tex-mode" data-preview="cube">3D</button>
        <button type="button" class="mod-seg-pill mod-tex-mode" data-preview="flat">Flat</button>
        <button type="button" class="mod-seg-pill mod-tex-mode" data-preview="top">Top</button>
        <button type="button" class="mod-seg-pill mod-tex-mode" data-preview="side">Side</button>
      </div>
    </section>

    <div class="mod-tex-meta mod-studio-hidden-meta">
      <div class="mod-tex-chips" role="listbox" aria-label="Materials"></div>
      <select class="mod-tex-mat-select" aria-label="Material to edit"></select>
      <input type="text" class="mod-tex-name" maxlength="16" placeholder="Block name" />
      <input type="checkbox" class="mod-tex-apply-shape" checked />
      <label class="mod-tex-import">
        <input type="file" accept="image/png,image/jpeg,image/webp" />
      </label>
      <button type="button" data-tex="apply">Apply</button>
      <button type="button" data-tex="new">New</button>
    </div>
  </div>
`;
