/** In-editor help for MOD Studio — every tab and tool. */
export const MOD_STUDIO_GUIDE_HTML = `
  <div class="mod-studio-guide" hidden role="dialog" aria-modal="true" aria-labelledby="mod-guide-title">
    <div class="mod-studio-guide-backdrop" data-guide-close tabindex="-1" aria-hidden="true"></div>
    <div class="mod-studio-guide-card">
      <header class="mod-studio-guide-head">
        <h2 id="mod-guide-title">MOD Studio guide</h2>
        <button type="button" class="mod-studio-guide-close" data-guide-close aria-label="Close">×</button>
      </header>
      <div class="mod-studio-guide-body">
        <section>
          <h3>Tabs</h3>
          <ul>
            <li><strong>Modeling</strong> — place and erase voxels. Build swords, dragons, animals, characters, cities.</li>
            <li><strong>Texturing</strong> — paint the 16×16 tile for each color, or click faces on the 3D model (UV).</li>
            <li><strong>Animation</strong> — split into parts, pose with gizmos, add timeline keyframes.</li>
            <li><strong>Character</strong> — skin preview, stamp your skin character, workshop tests. Use <strong>AI Studio</strong> from the main menu for chat and training.</li>
          </ul>
        </section>
        <section>
          <h3>AI Studio (separate)</h3>
          <ul>
            <li><strong>Main menu → AI Studio</strong> — full local AI workspace (chat, vision, datasets, training).</li>
            <li>Open <strong>MOD Studio</strong> too if you want AI tools to apply into the live voxel project.</li>
            <li>Cloud AI stays off. Optional BYOK only where settings allow.</li>
          </ul>
        </section>
        <section>
          <h3>Modeling tools</h3>
          <ul>
            <li><strong>Brush</strong> — left-click place · right-click erase</li>
            <li><strong>Erase / Box / Fill / Extrude</strong> — sculpt tools</li>
            <li><strong>Gizmo</strong> — Rotate / Move / Scale / Off</li>
            <li><strong>Starters</strong> — Sword · Dragon · Animal · Character</li>
            <li><strong>Shape ops</strong> — flip, rotate, floor, hollow, copy/paste</li>
          </ul>
          <p>Camera: right-drag orbit · scroll zoom · middle-drag pan</p>
        </section>
        <section>
          <h3>Texturing</h3>
          <ul>
            <li>Pick a <strong>material color</strong> used by your model.</li>
            <li>Paint only that color’s <strong>16×16</strong> tile — it does not overwrite other colors.</li>
            <li><strong>Per face</strong> (default) vs <strong>Project</strong> UV.</li>
            <li><strong>UV tool</strong> — paint on the face you click.</li>
          </ul>
        </section>
        <section>
          <h3>Animation</h3>
          <ul>
            <li><strong>Outliner</strong> — parts · isolate · delete</li>
            <li><strong>Gizmo</strong> — move / rotate / scale</li>
            <li><strong>Timeline</strong> — keys · ease · play · FPS (stops at last key)</li>
          </ul>
        </section>
        <section>
          <h3>File</h3>
          <ul>
            <li><strong>Save / Load</strong> — browser storage</li>
            <li><strong>Export / Import</strong> — JSON mod files</li>
            <li>Workspace is <strong>32×32×32</strong> (32 768 cells)</li>
          </ul>
        </section>
      </div>
      <footer class="mod-studio-guide-foot">
        <button type="button" class="voxel-editor-btn" data-guide-close>Got it</button>
      </footer>
    </div>
  </div>
`;
