/** Panel 2 — palette grid + material slot dropdowns. */
export const MID_RAIL_MATERIAL_HTML = `
  <div class="mod-studio-materials-inner">
    <p class="mod-studio-micro">Palette</p>
    <div class="voxel-editor-swatches mod-studio-swatches" aria-label="Material palette"></div>
    <div class="mod-studio-mat-slots">
      <label class="mod-studio-slot-lab">
        <span>Face</span>
        <select class="mod-studio-select vxl-mat-face" aria-label="Face material"></select>
      </label>
      <label class="mod-studio-slot-lab">
        <span>Torso</span>
        <select class="mod-studio-select vxl-mat-torso" aria-label="Body material"></select>
      </label>
    </div>
    <p class="mod-studio-micro">Materials in use</p>
    <ul class="mod-studio-used vxl-mats-in-use" aria-label="Materials in use"></ul>
  </div>
`;
