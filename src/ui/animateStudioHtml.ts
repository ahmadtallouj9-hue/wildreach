export const ANIMATE_STUDIO_HTML = `
  <aside class="mod-anim-outliner" aria-label="Parts hierarchy">
    <header class="mod-anim-panel-head">
      <p class="mod-anim-panel-title">1 — HIERARCHY</p>
      <div class="mod-anim-head-actions">
        <button type="button" class="voxel-editor-btn mod-anim-icon-btn vxl-btn-add-group" data-action="add-part" title="Add Group">Add Group</button>
        <button type="button" class="voxel-editor-btn mod-anim-icon-btn vxl-btn-delete" data-action="del-part" title="Delete">Delete</button>
      </div>
    </header>
    <ul class="mod-anim-tree" role="tree" aria-label="Part hierarchy"></ul>
    <div class="mod-tool-row mod-tool-row--2">
      <button type="button" class="mod-tool-btn" data-action="isolate-part" title="Hide other parts">Isolate</button>
      <button type="button" class="mod-tool-btn" data-action="show-all-parts" title="Show all parts">Show all</button>
    </div>
    <p class="mod-anim-outliner-hint">Click · eye · Isolate · ⌫ delete</p>
  </aside>

  <aside class="mod-anim-inspector" aria-label="Part inspector">
    <header class="mod-anim-panel-head">
      <p class="mod-anim-panel-title">Inspector</p>
    </header>

    <p class="mod-anim-section-label">Clip</p>
    <div class="mod-clip-row">
      <select class="mod-clip-select" aria-label="Active clip"></select>
      <button type="button" class="mod-tool-btn" data-action="clip-new" title="New clip">+</button>
      <button type="button" class="mod-tool-btn" data-action="clip-dup" title="Duplicate clip">⧉</button>
    </div>
    <label class="mod-anim-field">
      <span>Clip name</span>
      <input type="text" class="mod-clip-name" maxlength="24" spellcheck="false" />
    </label>
    <div class="mod-axis-row mod-clip-meta">
      <label>FPS <input type="number" class="mod-clip-fps" min="1" max="120" step="1" value="30" /></label>
      <label>Len <input type="number" class="mod-clip-len" min="1" max="600" step="1" value="48" /></label>
    </div>
    <div class="mod-tool-row mod-tool-row--3" data-loop-row>
      <button type="button" class="mod-tool-btn active" data-loop="loop">Loop</button>
      <button type="button" class="mod-tool-btn" data-loop="once">Once</button>
      <button type="button" class="mod-tool-btn" data-loop="hold">Hold</button>
    </div>

    <label class="mod-anim-field">
      <span>Name</span>
      <input type="text" class="mod-part-name" maxlength="20" spellcheck="false" />
    </label>
    <p class="mod-part-stats"></p>

    <label class="mod-anim-field">
      <span>Parent</span>
      <select class="mod-part-parent" aria-label="Parent bone"></select>
    </label>

    <p class="mod-anim-section-label">Pivot</p>
    <div class="mod-axis-row" data-axis="pivot">
      <label>X <input type="number" min="0" max="15" step="1" data-axis="x" /></label>
      <label>Y <input type="number" min="0" max="15" step="1" data-axis="y" /></label>
      <label>Z <input type="number" min="0" max="15" step="1" data-axis="z" /></label>
    </div>
    <div class="mod-tool-row mod-tool-row--2">
      <button type="button" class="mod-tool-btn" data-action="pivot-center">Center on voxels</button>
      <button type="button" class="mod-tool-btn" data-action="pivot-origin">Origin 8,8,8</button>
    </div>

    <p class="mod-anim-section-label">Rotation °</p>
    <div class="mod-axis-row mod-anim-rot-nums" data-axis="rot-num">
      <label>Y <input type="number" min="-180" max="180" step="0.01" data-rn="y" value="0" /></label>
      <label>X <input type="number" min="-180" max="180" step="0.01" data-rn="x" value="0" /></label>
      <label>Z <input type="number" min="-180" max="180" step="0.01" data-rn="z" value="0" /></label>
    </div>
    <div class="mod-axis-row" data-axis="rot">
      <label>Y <input type="range" min="-180" max="180" value="0" step="0.1" data-r="y" /></label>
      <label>X <input type="range" min="-180" max="180" value="0" step="0.1" data-r="x" /></label>
      <label>Z <input type="range" min="-180" max="180" value="0" step="0.1" data-r="z" /></label>
    </div>

    <p class="mod-anim-section-label">Position</p>
    <div class="mod-axis-row mod-anim-pos-nums" data-axis="pos-num">
      <label>X <input type="number" step="0.01" data-pn="x" value="0" /></label>
      <label>Y <input type="number" step="0.01" data-pn="y" value="0" /></label>
      <label>Z <input type="number" step="0.01" data-pn="z" value="0" /></label>
    </div>

    <p class="mod-anim-section-label">Scale</p>
    <div class="mod-axis-row mod-anim-scale-nums" data-axis="scale-num">
      <label>X <input type="number" step="0.01" min="0.05" max="8" data-sn="x" value="1" /></label>
      <label>Y <input type="number" step="0.01" min="0.05" max="8" data-sn="y" value="1" /></label>
      <label>Z <input type="number" step="0.01" min="0.05" max="8" data-sn="z" value="1" /></label>
    </div>

    <div class="mod-tool-row mod-tool-row--3">
      <button type="button" class="mod-tool-btn" data-action="pose-reset">Reset pose</button>
      <button type="button" class="mod-tool-btn" data-action="pose-copy">Copy pose</button>
      <button type="button" class="mod-tool-btn" data-action="pose-paste">Paste</button>
    </div>
    <div class="mod-tool-row mod-tool-row--2">
      <button type="button" class="mod-tool-btn" data-action="pose-mirror-x">Mirror X</button>
      <button type="button" class="mod-tool-btn" data-action="focus-part">Focus cam</button>
    </div>

    <p class="mod-anim-section-label">Keyframe easing</p>
    <label class="mod-anim-field mod-anim-ease-field">
      <span>Easing / curve</span>
      <select class="mod-kf-ease-select" disabled aria-label="Keyframe easing">
        <option value="">Select a key ◆ on timeline</option>
      </select>
    </label>
    <p class="mod-anim-kf-ease-hint">Applies to transition out of the selected key</p>

    <p class="mod-anim-section-label">Motion presets</p>
    <div class="mod-tool-row mod-motion-presets" data-motion-presets>
      <button type="button" class="mod-tool-btn" data-motion="float">Float</button>
      <button type="button" class="mod-tool-btn" data-motion="spin">Spin</button>
      <button type="button" class="mod-tool-btn" data-motion="wobble">Wobble</button>
      <button type="button" class="mod-tool-btn" data-motion="heartbeat">Heartbeat</button>
      <button type="button" class="mod-tool-btn" data-motion="pulse">Pulse</button>
      <button type="button" class="mod-tool-btn" data-motion="shake">Shake</button>
      <button type="button" class="mod-tool-btn" data-motion="nod">Nod</button>
      <button type="button" class="mod-tool-btn" data-motion="orbit">Orbit</button>
      <button type="button" class="mod-tool-btn" data-motion="none">Off</button>
    </div>
    <p class="mod-anim-motion-hint">Looping idle layered on playback</p>

    <p class="mod-anim-section-label">Gizmo</p>
    <div class="mod-tool-row mod-tool-row--3" data-gizmo-row>
      <button type="button" class="mod-tool-btn active" data-gizmo="rotate">Rotate</button>
      <button type="button" class="mod-tool-btn" data-gizmo="translate">Move</button>
      <button type="button" class="mod-tool-btn" data-gizmo="scale">Scale</button>
      <button type="button" class="mod-tool-btn" data-gizmo="off">Off</button>
    </div>
    <label class="mod-onion-toggle">
      <input type="checkbox" class="mod-autokey-check" checked />
      Auto-key on gizmo
    </label>

    <p class="mod-anim-section-label">Select voxels</p>
    <div class="mod-tool-row mod-tool-row--3" data-select-row>
      <button type="button" class="mod-tool-btn" data-action="voxel-select" data-select-mode="custom">Custom</button>
      <button type="button" class="mod-tool-btn" data-action="voxel-select" data-select-mode="chunk">Chunk</button>
      <button type="button" class="mod-tool-btn" data-action="clear-selection">Clear</button>
    </div>
    <div class="mod-tool-row mod-tool-row--3">
      <button type="button" class="mod-tool-btn" data-action="sel-part">All in part</button>
      <button type="button" class="mod-tool-btn" data-action="sel-invert">Invert</button>
      <button type="button" class="mod-tool-btn" data-action="sel-grow">Grow</button>
    </div>
    <p class="mod-select-stats">0 voxels selected</p>
    <div class="mod-tool-row mod-tool-row--2">
      <button type="button" class="voxel-editor-btn mod-assign-btn" data-action="part-from-selection">New part from sel</button>
      <button type="button" class="voxel-editor-btn mod-assign-btn" data-action="assign-selection">Add sel to part</button>
    </div>
    <p class="mod-anim-select-hint">Custom · Chunk · Grow · New part</p>

    <p class="mod-anim-section-label">Assign box</p>
    <div class="mod-axis-row mod-box-row" data-axis="box-min">
      <span class="mod-axis-tag">Min</span>
      <label>X <input type="number" min="0" max="15" data-b="x" value="0" /></label>
      <label>Y <input type="number" min="0" max="15" data-b="y" value="0" /></label>
      <label>Z <input type="number" min="0" max="15" data-b="z" value="0" /></label>
    </div>
    <div class="mod-axis-row mod-box-row" data-axis="box-max">
      <span class="mod-axis-tag">Max</span>
      <label>X <input type="number" min="0" max="15" data-b="x" value="15" /></label>
      <label>Y <input type="number" min="0" max="15" data-b="y" value="15" /></label>
      <label>Z <input type="number" min="0" max="15" data-b="z" value="15" /></label>
    </div>
    <button type="button" class="voxel-editor-btn mod-assign-btn" data-action="assign-box">Assign box to part</button>
    <label class="mod-onion-toggle">
      <input type="checkbox" class="mod-onion-check" />
      Onion skin
    </label>
    <label class="mod-onion-toggle">
      Snap playhead to keys
      <input type="checkbox" class="mod-snap-keys-check" />
    </label>
    <p class="mod-animate-hint">Clips · scale · auto-key · ←→ frames · [ ] keys</p>
  </aside>

  <footer class="mod-anim-timeline" aria-label="Timeline">
    <div class="mod-tl-toolbar" role="toolbar" aria-label="Timeline controls">
      <button type="button" class="mod-tl-btn" data-action="tl-start" title="Jump to start">⏮</button>
      <button type="button" class="mod-tl-btn" data-action="tl-prev-key" title="Previous key">◂◆</button>
      <button type="button" class="mod-tl-btn" data-action="tl-frame-back" title="Previous frame">◂</button>
      <button type="button" class="mod-tl-btn mod-tl-play" data-action="anim-play" title="Play / Pause">▶</button>
      <button type="button" class="mod-tl-btn" data-action="anim-stop" title="Stop">■</button>
      <button type="button" class="mod-tl-btn mod-tl-record" data-action="tl-record" title="Record key">●</button>
      <button type="button" class="mod-tl-btn" data-action="tl-frame-fwd" title="Next frame">▸</button>
      <button type="button" class="mod-tl-btn" data-action="tl-next-key" title="Next key">◆▸</button>
      <button type="button" class="mod-tl-btn" data-action="tl-end" title="Jump to end">⏭</button>
      <button type="button" class="mod-tl-btn mod-tl-key" data-action="tl-key-toggle" title="Add / remove key">◆+</button>
      <button type="button" class="mod-tl-btn" data-action="tl-key-all" title="Key all parts">◆∗</button>
      <button type="button" class="mod-tl-btn" data-action="tl-key-dup" title="Duplicate selected key">◆⧉</button>
      <button type="button" class="mod-tl-btn" data-action="tl-key-del" title="Delete selected key">◆⌫</button>
      <button type="button" class="mod-tl-btn" data-action="voxel-select" data-select-mode="custom" title="Custom select">Sel</button>
      <button type="button" class="mod-tl-btn mod-tl-curves-btn" data-action="tl-curves" title="Curves" aria-expanded="false">Curves</button>
      <label class="mod-tl-fps">
        <span>FPS</span>
        <select class="mod-tl-fps-select" aria-label="Timeline FPS">
          <option value="5">5</option>
          <option value="12">12</option>
          <option value="24">24</option>
          <option value="30" selected>30</option>
          <option value="60">60</option>
        </select>
      </label>
      <label class="mod-tl-speed">
        <span>Speed</span>
        <input type="range" class="mod-speed-slider" min="0.05" max="2" step="0.05" value="1" aria-label="Playback speed" />
        <span class="mod-speed-label">1×</span>
      </label>
      <div class="mod-tl-timecode" aria-live="polite">
        <span class="mod-tl-time">00:00:00</span>
        <span class="mod-tl-sep">/</span>
        <span class="mod-tl-frame-label">Frame <span class="mod-frame-label">0</span></span>
      </div>
    </div>

    <div class="mod-tl-curves-panel" hidden>
      <div class="mod-anim-curve-wrap">
        <div class="mod-anim-curve-head">
          <p class="mod-anim-section-label">Segment ease</p>
          <div class="mod-anim-curve-presets" data-curve-presets>
            <button type="button" class="mod-tool-btn" data-preset="linear">Linear</button>
            <button type="button" class="mod-tool-btn active" data-preset="smooth">Smooth</button>
            <button type="button" class="mod-tool-btn" data-preset="easeIn">In</button>
            <button type="button" class="mod-tool-btn" data-preset="easeOut">Out</button>
            <button type="button" class="mod-tool-btn" data-preset="snap">Snap</button>
            <button type="button" class="mod-tool-btn" data-preset="bounce">Bounce</button>
            <button type="button" class="mod-tool-btn" data-preset="elastic">Elastic</button>
          </div>
        </div>
        <div class="mod-anim-curve" aria-label="Custom easing curve">
          <svg class="mod-anim-curve-svg" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
            <line class="mod-curve-baseline" x1="0" y1="1" x2="1" y2="0" />
            <path class="mod-curve-path" d="M 0 1" />
            <rect class="mod-curve-touch" x="0" y="0" width="1" height="1" />
          </svg>
          <p class="mod-anim-curve-readout">0.6, 0.2</p>
          <p class="mod-anim-curve-hint">Drag left = start · right = end · unlocked center</p>
        </div>
      </div>
    </div>

    <div class="mod-tl-board">
      <div class="mod-tl-labels" aria-hidden="true"></div>
      <div class="mod-tl-lane" tabindex="0" aria-label="Multi-track timeline">
        <div class="mod-tl-ruler"></div>
        <div class="mod-tl-tracks"></div>
        <div class="mod-tl-playhead" aria-hidden="true">
          <button type="button" class="mod-tl-playhead-grip" title="Drag playhead" tabindex="-1"></button>
          <div class="mod-tl-playhead-line"></div>
        </div>
      </div>
    </div>
  </footer>
`;
