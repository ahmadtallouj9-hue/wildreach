import * as THREE from 'three';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
import type { TerrainMaterials } from '../render/TerrainMaterials';
import { LOCAL_GRID_SIZE } from './constants';
import { LocalVoxelGrid } from './LocalVoxelGrid';
import { meshLocalGrid, type TexUvMode } from './LocalVoxelMesher';
import type { PartPose } from './ModAnimation';
import { eulerYXZFromQuat, previousKeyframeFrame, sampleAllPartPoses } from './ModAnimation';
import { identityQuat, type ModKeyframe, type ModPart, type Quat, type Vec3 } from './ModAsset';
import { cloneGridForPart, cloneGridForSelection, createPartMask, createVoxelSelection, selectConnectedChunk, type PartMask, type VoxelSelection } from './PartAssignment';
import { VoxelEditorInteraction } from './VoxelEditorInteraction';
import type { MirrorAxis } from './EditorTools';
import { boxBounds } from './EditorTools';
import { CustomMaterialPalette } from './CustomMaterials';
import { raycastToTexturePixel, type VoxelFacePaintHit } from './RaycastToUV';
import { TextureAtlasManager } from './TextureAtlasManager';
import { setActiveMaterialPalette } from './editorPalette';
import { cameraRayFromNdc, localVoxelRaycast } from './localVoxelRaycast';
import { rotateGrid90, translateGrid } from './ShapeOps';
import { Block } from '../world/blocks';
import { ModParticleFx } from './ModParticleFx';
import type { ParticleStyle } from './ModStudioAi';
import {
  applyPoseToGroups,
  buildVoxelSkeleton,
  localPivotOffset,
  type VoxelSkeleton,
} from './VoxelSkeleton';
const LOCAL_EXTENT = LOCAL_GRID_SIZE; // voxels occupy [0, LOCAL_EXTENT]
/** Geometric center of the editable volume (mesh + floor grid). */
const VOLUME_CENTER = LOCAL_EXTENT / 2;
const DEFAULT_YAW = 0.65;
const DEFAULT_PITCH = 0.35;
const DEFAULT_DIST = 36;

/** Terrain shaders hardcode alpha=1; patch so onion ghosts actually fade. */
function patchGhostOpacity(mat: THREE.ShaderMaterial, alpha: number): void {
  const src = mat.fragmentShader;
  if (!src.includes('gl_FragColor = vec4(color, 1.0);')) return;
  mat.fragmentShader = src.replace(
    'gl_FragColor = vec4(color, 1.0);',
    `gl_FragColor = vec4(color, ${alpha.toFixed(3)});`,
  );
  mat.needsUpdate = true;
}

/** Floor grid lines on integer cell edges [0…S], slightly below y=0 to avoid z-fight. */
function makeFloorGrid(size: number): THREE.LineSegments {
  const positions: number[] = [];
  const y = -0.01;
  for (let i = 0; i <= size; i++) {
    positions.push(i, y, 0, i, y, size);
    positions.push(0, y, i, size, y, i);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0x3a5560,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.renderOrder = -1;
  return lines;
}

/** Isolated Three.js viewport for the in-game voxel shape editor. */
export class VoxelEditorViewport {
  readonly root: HTMLElement;
  readonly grid = new LocalVoxelGrid();
  readonly interaction: VoxelEditorInteraction;
  readonly materialsPalette = new CustomMaterialPalette();
  readonly textureAtlas: TextureAtlasManager;

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly materials: TerrainMaterials;
  private readonly studioSolid: THREE.ShaderMaterial;
  private readonly studioCutout: THREE.ShaderMaterial;
  private readonly onEdit?: () => void;
  private readonly pivotNode = new THREE.Group();
  private readonly modelNode = new THREE.Group();
  private readonly solidMesh = new THREE.Mesh();
  private readonly cutoutMesh = new THREE.Mesh();
  private readonly highlight: THREE.LineSegments;
  private readonly bounds: THREE.LineSegments;
  private readonly partRoot = new THREE.Group();
  private readonly pivotMarkers = new THREE.Group();
  private readonly ghostRoot = new THREE.Group();
  private readonly dragPreview = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0x5ec4b0, transparent: true, opacity: 0.55 }),
  );
  private readonly mirrorX = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(LOCAL_GRID_SIZE / 2 - 0.5, 0, 0),
      new THREE.Vector3(LOCAL_GRID_SIZE / 2 - 0.5, LOCAL_GRID_SIZE, LOCAL_GRID_SIZE),
    ]),
    new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.45 }),
  );
  private readonly mirrorY = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, LOCAL_GRID_SIZE / 2 - 0.5, 0),
      new THREE.Vector3(LOCAL_GRID_SIZE, LOCAL_GRID_SIZE / 2 - 0.5, LOCAL_GRID_SIZE),
    ]),
    new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.45 }),
  );
  private readonly mirrorZ = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, LOCAL_GRID_SIZE / 2 - 0.5),
      new THREE.Vector3(LOCAL_GRID_SIZE, LOCAL_GRID_SIZE, LOCAL_GRID_SIZE / 2 - 0.5),
    ]),
    new THREE.LineBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.45 }),
  );
  private readonly ghostSolidMat: THREE.ShaderMaterial;
  private readonly ghostCutoutMat: THREE.ShaderMaterial;
  private readonly resizeObs: ResizeObserver;
  private readonly partMask: PartMask = createPartMask();

  private animateMode = false;
  private onionSkin = false;
  private texUvMode: TexUvMode = 'per_voxel';
  private animateParts: ModPart[] = [];
  private skeleton: VoxelSkeleton | null = null;
  private animateKeyframes: ModKeyframe[] = [];
  private animateFrame = 0;
  private partVisuals = new Map<
    string,
    { pivot: THREE.Group; model: THREE.Group; solid: THREE.Mesh; cutout: THREE.Mesh }
  >();
  private ghostVisuals = new Map<
    string,
    { pivot: THREE.Group; model: THREE.Group; solid: THREE.Mesh; cutout: THREE.Mesh }
  >();
  private transformControls: TransformControls | null = null;
  private transformDragging = false;
  private selectedPartId: string | null = null;
  private gizmoMode: 'rotate' | 'translate' | 'scale' | 'off' = 'off';
  private onPartPicked: ((partId: string) => void) | null = null;
  private onTransformChange:
    | ((partId: string, euler: { y: number; x: number; z: number }, pos: Vec3) => void)
    | null = null;
  /** Called before baking a modeling gizmo transform into voxels (undo snapshot). */
  private onBeforeModelBake: (() => void) | null = null;
  private onModelBakeDone: ((msg: string) => void) | null = null;
  private modelingGizmoOrigin = new THREE.Vector3(VOLUME_CENTER, VOLUME_CENTER, VOLUME_CENTER);
  private readonly particles = new ModParticleFx();
  private playbackTick: ((dtMs: number) => void) | null = null;
  private lastPlaybackTs = 0;
  private readonly pickRaycaster = new THREE.Raycaster();
  private readonly pickNdc = new THREE.Vector2();
  private voxelSelectMode = false;
  /** custom = paint exact voxels; chunk = flood-fill connected solid. */
  private voxelSelectStyle: 'custom' | 'chunk' = 'custom';
  private readonly voxelSelection: VoxelSelection = createVoxelSelection();
  private selectPainting = false;
  private selectPaintValue = 1;
  private onVoxelSelectionChange: ((count: number) => void) | null = null;
  private readonly selectionRoot = new THREE.Group();
  private selectionSolid: THREE.Mesh | null = null;
  private selectionOutline: THREE.LineSegments | null = null;
  private selectionOutlineBg: THREE.LineSegments | null = null;
  private selectionMat: THREE.MeshBasicMaterial | null = null;
  private selectionOutlineMat: THREE.LineBasicMaterial | null = null;
  private selectionOutlineBgMat: THREE.LineBasicMaterial | null = null;

  private raf = 0;
  private running = false;
  private orbiting = false;
  private panning = false;
  private lastX = 0;
  private lastY = 0;
  private yaw = DEFAULT_YAW;
  private pitch = DEFAULT_PITCH;
  private dist = DEFAULT_DIST;
  /** Orbit look-at point (starts at volume center; middle-drag / Shift-drag to pan). */
  private readonly lookAt = new THREE.Vector3(VOLUME_CENTER, VOLUME_CENTER, VOLUME_CENTER);
  private readonly panRight = new THREE.Vector3();
  private readonly panUp = new THREE.Vector3();

  constructor(materials: TerrainMaterials, onEdit?: () => void) {
    this.materials = materials;
    this.onEdit = onEdit;
    this.textureAtlas = new TextureAtlasManager(this.materialsPalette);
    setActiveMaterialPalette(this.materialsPalette);
    this.studioSolid = materials.solid.clone();
    this.studioCutout = materials.cutout.clone();
    // Bind custom color/texture atlas (clone alone keeps the world wood atlas).
    this.studioSolid.uniforms.map.value = this.materialsPalette.atlasTexture;
    this.studioCutout.uniforms.map.value = this.materialsPalette.atlasTexture;
    this.ghostSolidMat = this.studioSolid.clone();
    this.ghostSolidMat.transparent = true;
    this.ghostSolidMat.depthWrite = false;
    this.ghostSolidMat.uniforms.map.value = this.materialsPalette.atlasTexture;
    patchGhostOpacity(this.ghostSolidMat, 0.22);
    this.ghostCutoutMat = this.studioCutout.clone();
    this.ghostCutoutMat.transparent = true;
    this.ghostCutoutMat.depthWrite = false;
    this.ghostCutoutMat.uniforms.map.value = this.materialsPalette.atlasTexture;
    patchGhostOpacity(this.ghostCutoutMat, 0.22);
    this.root = document.createElement('div');
    this.root.className = 'voxel-editor-viewport';
    this.root.style.width = '100%';
    this.root.style.height = '100%';

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x141e22, 1);
    this.renderer.domElement.style.cursor = 'crosshair';
    this.root.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x141e22);

    const gridHelper = makeFloorGrid(LOCAL_GRID_SIZE);
    this.scene.add(gridHelper);

    this.bounds = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(LOCAL_EXTENT, LOCAL_EXTENT, LOCAL_EXTENT)),
      new THREE.LineBasicMaterial({ color: 0x5ec4b0, transparent: true, opacity: 0.35 }),
    );
    this.bounds.position.set(VOLUME_CENTER, VOLUME_CENTER, VOLUME_CENTER);
    this.scene.add(this.bounds);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.05, 120);
    this.updateCamera();

    const amb = new THREE.AmbientLight(0xe8f4f0, 0.82);
    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(8, 14, 10);
    const fill = new THREE.DirectionalLight(0x5ec4b0, 0.42);
    fill.position.set(-6, 6, -4);
    this.scene.add(amb, key, fill);

    this.solidMesh.material = this.studioSolid;
    this.cutoutMesh.material = this.studioCutout;
    this.modelNode.add(this.solidMesh, this.cutoutMesh);
    this.pivotNode.add(this.modelNode);
    this.scene.add(this.pivotNode);
    this.scene.add(this.particles.root);
    this.partRoot.visible = false;
    this.ghostRoot.visible = false;
    this.selectionRoot.visible = false;
    this.dragPreview.visible = false;
    this.mirrorX.visible = false;
    this.mirrorY.visible = false;
    this.mirrorZ.visible = false;
    this.scene.add(
      this.partRoot,
      this.pivotMarkers,
      this.ghostRoot,
      this.selectionRoot,
      this.dragPreview,
      this.mirrorX,
      this.mirrorY,
      this.mirrorZ,
    );

    this.highlight = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02)),
      new THREE.LineBasicMaterial({ color: 0xffffff }),
    );
    this.highlight.visible = false;
    this.scene.add(this.highlight);

    this.interaction = new VoxelEditorInteraction(
      this.grid,
      this.renderer.domElement,
      () => this.camera,
      () => {
        this.rebuildMesh();
        if (this.animateMode) this.rebuildPartMeshes(this.animateParts);
        this.onEdit?.();
      },
      (a, b) => this.updateDragPreview(a, b),
    );

    this.materialsPalette.onChange(() => {
      this.studioSolid.uniforms.map.value = this.materialsPalette.atlasTexture;
      this.studioCutout.uniforms.map.value = this.materialsPalette.atlasTexture;
      this.ghostSolidMat.uniforms.map.value = this.materialsPalette.atlasTexture;
      this.ghostCutoutMat.uniforms.map.value = this.materialsPalette.atlasTexture;
      this.rebuildMesh();
    });
    this.bindOrbit();
    this.bindPartPick();
    this.bindVoxelSelect();
    this.rebuildMesh();
    this.resizeObs = new ResizeObserver(() => this.layout());
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    this.resizeObs.observe(parent);
    this.layout();
  }

  layout(): void {
    const host = this.root.parentElement;
    if (!host) return;
    // Must match the displayed canvas size — padding buffer height breaks raycasts.
    const w = Math.max(1, Math.floor(host.clientWidth));
    const h = Math.max(1, Math.floor(host.clientHeight));
    if (w < 8 || h < 8) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    if (this.running) this.renderFrame();
  }

  start(): void {
    if (this.running) {
      this.layout();
      return;
    }
    this.running = true;
    this.setupStudioLighting();
    this.interaction.bind();
    this.layout();
    const tick = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      if (this.playbackTick) {
        const now = performance.now();
        const dt = now - this.lastPlaybackTs;
        this.lastPlaybackTs = now;
        if (dt > 0) this.playbackTick(dt);
      }
      this.particles.update(1 / 60);
      this.updateHighlight();
      this.renderFrame();
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.interaction.unbind();
    this.highlight.visible = false;
  }

  dispose(): void {
    this.stop();
    this.disposeTransformControls();
    this.particles.dispose();
    this.resizeObs.disconnect();
    this.disposeMesh(this.solidMesh.geometry);
    this.disposeMesh(this.cutoutMesh.geometry);
    this.renderer.dispose();
  }

  clearGrid(): void {
    this.grid.clear();
    this.rebuildMesh();
  }

  setMirrorAxis(axis: MirrorAxis): void {
    this.interaction.setMirrorAxis(axis);
    this.mirrorX.visible = axis.includes('x');
    this.mirrorY.visible = axis.includes('y');
    this.mirrorZ.visible = axis.includes('z');
  }

  setOnionSkin(on: boolean): void {
    this.onionSkin = on;
    this.refreshOnionSkin();
  }

  setBrush(block: number): void {
    this.interaction.setSelectedBlock(block);
  }

  setTexUvMode(mode: TexUvMode): void {
    if (this.texUvMode === mode) return;
    this.texUvMode = mode;
    this.rebuildMesh();
  }

  getTexUvMode(): TexUvMode {
    return this.texUvMode;
  }

  rebuildMesh(): void {
    if (this.animateMode) {
      this.rebuildPartMeshes(this.animateParts);
      return;
    }
    const { solid, cutout } = meshLocalGrid(this.grid, this.texUvMode);
    this.swapGeometry(this.solidMesh, solid);
    this.swapGeometry(this.cutoutMesh, cutout);
    this.solidMesh.visible = solid !== null;
    this.cutoutMesh.visible = cutout !== null;
  }

  getPartMask(): PartMask {
    return this.partMask;
  }

  setPartMask(mask: PartMask): void {
    this.partMask.set(mask);
  }

  /** Switch between combined shape mesh and per-part meshes. */
  setAnimateMode(on: boolean, parts: ModPart[]): void {
    this.animateMode = on;
    this.animateParts = parts.map((p) => ({ ...p, pivot: { ...p.pivot } }));
    this.pivotNode.visible = !on;
    this.partRoot.visible = on;
    this.ghostRoot.visible = on && this.onionSkin;
    this.pivotMarkers.visible = on;
    if (on) {
      this.solidMesh.visible = false;
      this.cutoutMesh.visible = false;
      this.ensureTransformControls();
      this.rebuildPartMeshes(this.animateParts);
      this.updatePivotMarkers(this.animateParts);
      this.setPartVisibility(this.animateParts);
      this.refreshOnionSkin();
      this.attachGizmoToSelected();
      this.refreshSelectionOverlay();
    } else {
      this.setVoxelSelectMode(false);
      this.clearVoxelSelection();
      this.detachGizmo();
      this.clearPartMeshes();
      this.clearGhostMeshes();
      this.clearPosePreview();
      this.rebuildMesh();
    }
  }

  setOnVoxelSelectionChange(cb: ((count: number) => void) | null): void {
    this.onVoxelSelectionChange = cb;
  }

  setVoxelSelectMode(on: boolean, style: 'custom' | 'chunk' = 'custom'): void {
    this.voxelSelectStyle = style;
    this.voxelSelectMode = on && this.animateMode;
    if (this.voxelSelectMode) {
      this.setTransformGizmo('off');
      // Bind pose so grid picks + gold overlay match what you tap.
      this.snapPartsToBindPose(this.animateParts);
    }
    this.selectionRoot.visible = this.voxelSelectMode && this.countVoxelSelection() > 0;
    this.refreshSelectionOverlay();
    this.renderer.domElement.style.cursor = this.voxelSelectMode
      ? this.voxelSelectStyle === 'custom'
        ? 'cell'
        : 'copy'
      : 'crosshair';
  }

  getVoxelSelectStyle(): 'custom' | 'chunk' {
    return this.voxelSelectStyle;
  }

  isVoxelSelectMode(): boolean {
    return this.voxelSelectMode;
  }

  getVoxelSelection(): VoxelSelection {
    return this.voxelSelection;
  }

  countVoxelSelection(): number {
    let n = 0;
    for (let i = 0; i < this.voxelSelection.length; i++) {
      if (this.voxelSelection[i] && this.grid.voxels[i] !== Block.Air) n++;
    }
    return n;
  }

  clearVoxelSelection(): void {
    this.voxelSelection.fill(0);
    this.refreshSelectionOverlay();
    this.onVoxelSelectionChange?.(0);
  }

  /** Re-draw selection overlay after external mask edits. */
  notifyVoxelSelectionChanged(): void {
    this.refreshSelectionOverlay();
    this.onVoxelSelectionChange?.(this.countVoxelSelection());
  }

  setTransformGizmo(mode: 'rotate' | 'translate' | 'scale' | 'off'): void {
    this.gizmoMode = mode;
    this.ensureTransformControls();
    if (!this.transformControls) return;
    if (mode === 'off') {
      this.transformControls.getHelper().visible = false;
      this.transformControls.enabled = false;
      this.detachGizmo();
      if (!this.animateMode) this.clearPosePreview();
      return;
    }
    this.transformControls.setMode(mode);
    this.configureTransformSnapping();
    this.transformControls.getHelper().visible = true;
    this.transformControls.enabled = true;
    this.attachGizmoToSelected();
  }

  setOnBeforeModelBake(cb: (() => void) | null): void {
    this.onBeforeModelBake = cb;
  }

  setOnModelBakeDone(cb: ((msg: string) => void) | null): void {
    this.onModelBakeDone = cb;
  }

  getTransformGizmoMode(): 'rotate' | 'translate' | 'scale' | 'off' {
    return this.gizmoMode;
  }

  spawnParticles(style: ParticleStyle, color: [number, number, number]): void {
    this.particles.spawn(style, color, new THREE.Vector3(VOLUME_CENTER, VOLUME_CENTER + 4, VOLUME_CENTER));
  }

  setSelectedPart(partId: string | null): void {
    this.selectedPartId = partId;
    this.attachGizmoToSelected();
  }

  setOnPartPicked(cb: ((partId: string) => void) | null): void {
    this.onPartPicked = cb;
  }

  setOnTransformChange(
    cb: ((partId: string, euler: { y: number; x: number; z: number }, pos: Vec3) => void) | null,
  ): void {
    this.onTransformChange = cb;
  }

  isTransformDragging(): boolean {
    return this.transformDragging;
  }

  /** Timeline playback tick — runs on the viewport render loop for smooth interpolation. */
  setPlaybackTick(tick: ((dtMs: number) => void) | null): void {
    this.playbackTick = tick;
    this.lastPlaybackTs = performance.now();
  }

  setPartVisibility(parts: ModPart[]): void {
    for (const part of parts) {
      const vis = this.partVisuals.get(part.id);
      if (vis) vis.pivot.visible = !part.hidden;
    }
  }

  /** Timeline frame; optional onion refresh (skip during scrub for smoothness). */
  setAnimateTimeline(keyframes: ModKeyframe[], frame: number, refreshOnion = true): void {
    this.animateKeyframes = keyframes;
    this.animateFrame = frame;
    if (refreshOnion) this.refreshOnionSkin();
  }

  /** Rest pose (no keyframe offset) so voxel picking lines up with the grid. */
  snapPartsToBindPose(parts: ModPart[]): void {
    if (!this.animateMode) return;
    this.skeleton = buildVoxelSkeleton(parts);
    const bind: PartPose = {
      position: { x: 0, y: 0, z: 0 },
      rotation: identityQuat(),
      scale: { x: 1, y: 1, z: 1 },
    };
    for (const bone of this.skeleton.bones) {
      const vis = this.partVisuals.get(bone.id);
      if (!vis) continue;
      applyPoseToGroups(vis.pivot, vis.model, bone, bind);
    }
  }

  /** Apply slerp-sampled poses for every part (animate preview / playback). */
  setAnimationPoses(parts: ModPart[], poses: Map<string, PartPose>): void {
    if (!this.animateMode) return;
    // Keep bind pose while painting a voxel selection.
    if (this.voxelSelectMode) {
      this.snapPartsToBindPose(parts);
      return;
    }
    this.skeleton = buildVoxelSkeleton(parts);
    const fallback: PartPose = {
      position: { x: 0, y: 0, z: 0 },
      rotation: identityQuat(),
      scale: { x: 1, y: 1, z: 1 },
    };
    for (const bone of this.skeleton.bones) {
      const vis = this.partVisuals.get(bone.id);
      if (!vis) continue;
      applyPoseToGroups(vis.pivot, vis.model, bone, poses.get(bone.id) ?? fallback);
    }
  }

  private refreshOnionSkin(): void {
    this.clearGhostMeshes();
    if (!this.animateMode || !this.onionSkin || this.animateFrame <= 0) {
      this.ghostRoot.visible = false;
      return;
    }
    this.ghostRoot.visible = true;
    const prev = previousKeyframeFrame(this.animateKeyframes, this.animateFrame);
    const poses = sampleAllPartPoses(this.animateParts, this.animateKeyframes, prev);
    this.rebuildGhostMeshes(this.animateParts, poses);
  }

  private rebuildGhostMeshes(parts: ModPart[], poses: Map<string, PartPose>): void {
    const skeleton = buildVoxelSkeleton(parts);
    const fallback: PartPose = {
      position: { x: 0, y: 0, z: 0 },
      rotation: identityQuat(),
      scale: { x: 1, y: 1, z: 1 },
    };
    parts.forEach((part, index) => {
      const partGrid = cloneGridForPart(this.grid, this.partMask, index);
      const { solid, cutout } = meshLocalGrid(partGrid, this.texUvMode);
      const pivot = new THREE.Group();
      const model = new THREE.Group();
      const solidMesh = new THREE.Mesh(solid ?? new THREE.BufferGeometry(), this.ghostSolidMat);
      const cutoutMesh = new THREE.Mesh(cutout ?? new THREE.BufferGeometry(), this.ghostCutoutMat);
      solidMesh.visible = solid !== null;
      cutoutMesh.visible = cutout !== null;
      model.add(solidMesh, cutoutMesh);
      pivot.add(model);
      const bone = skeleton.byId.get(part.id);
      if (bone) applyPoseToGroups(pivot, model, bone, poses.get(part.id) ?? fallback);
      this.ghostVisuals.set(part.id, { pivot, model, solid: solidMesh, cutout: cutoutMesh });
    });
    this.nestPartPivots(parts, this.ghostVisuals, this.ghostRoot);
  }

  private clearGhostMeshes(): void {
    for (const vis of this.ghostVisuals.values()) {
      vis.solid.geometry.dispose();
      vis.cutout.geometry.dispose();
      vis.pivot.removeFromParent();
    }
    this.ghostVisuals.clear();
  }

  private updateDragPreview(
    a: { x: number; y: number; z: number } | null,
    b: { x: number; y: number; z: number } | null,
  ): void {
    if (!a || !b) {
      this.dragPreview.visible = false;
      return;
    }
    const { min, max } = boxBounds(a, b);
    const sx = max.x - min.x + 1;
    const sy = max.y - min.y + 1;
    const sz = max.z - min.z + 1;
    this.dragPreview.scale.set(sx, sy, sz);
    this.dragPreview.position.set(min.x + sx / 2, min.y + sy / 2, min.z + sz / 2);
    this.dragPreview.visible = true;
  }

  rebuildPartMeshes(parts: ModPart[]): void {
    this.animateParts = parts;
    this.skeleton = buildVoxelSkeleton(parts);
    this.clearPartMeshes();
    parts.forEach((part, index) => {
      const partGrid = cloneGridForPart(this.grid, this.partMask, index);
      const { solid, cutout } = meshLocalGrid(partGrid, this.texUvMode);
      const pivot = new THREE.Group();
      const model = new THREE.Group();
      const solidMesh = new THREE.Mesh(solid ?? new THREE.BufferGeometry(), this.studioSolid);
      const cutoutMesh = new THREE.Mesh(cutout ?? new THREE.BufferGeometry(), this.studioCutout);
      solidMesh.visible = solid !== null;
      cutoutMesh.visible = cutout !== null;
      solidMesh.userData.partId = part.id;
      cutoutMesh.userData.partId = part.id;
      model.add(solidMesh, cutoutMesh);
      pivot.add(model);
      this.partVisuals.set(part.id, { pivot, model, solid: solidMesh, cutout: cutoutMesh });
    });
    this.nestPartPivots(parts, this.partVisuals, this.partRoot);
    const bind: PartPose = {
      position: { x: 0, y: 0, z: 0 },
      rotation: identityQuat(),
      scale: { x: 1, y: 1, z: 1 },
    };
    for (const bone of this.skeleton.bones) {
      const vis = this.partVisuals.get(bone.id);
      if (!vis) continue;
      applyPoseToGroups(vis.pivot, vis.model, bone, bind);
    }
    this.setPartVisibility(parts);
    this.attachGizmoToSelected();
  }

  /** Parent pivot groups so children move with bones (Outliner hierarchy). */
  private nestPartPivots(
    parts: ModPart[],
    visuals: Map<string, { pivot: THREE.Group; model: THREE.Group; solid: THREE.Mesh; cutout: THREE.Mesh }>,
    root: THREE.Group,
  ): void {
    const byId = new Map(parts.map((p) => [p.id, p]));
    for (const part of parts) {
      const vis = visuals.get(part.id);
      if (!vis) continue;
      const parentId = part.parentId;
      const parentVis = parentId ? visuals.get(parentId) : undefined;
      if (parentVis && byId.has(parentId!) && parentId !== part.id) {
        parentVis.pivot.add(vis.pivot);
      } else {
        root.add(vis.pivot);
      }
    }
  }

  private clearPartMeshes(): void {
    this.detachGizmo();
    for (const vis of this.partVisuals.values()) {
      vis.solid.geometry.dispose();
      vis.cutout.geometry.dispose();
      vis.pivot.removeFromParent();
    }
    this.partVisuals.clear();
    this.pivotMarkers.clear();
  }

  private updatePivotMarkers(parts: ModPart[]): void {
    this.pivotMarkers.clear();
    const geo = new THREE.SphereGeometry(0.18, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
    for (const part of parts) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(part.pivot.x, part.pivot.y, part.pivot.z);
      this.pivotMarkers.add(m);
    }
  }

  /** Orbit look-at toward a grid point (focus selected bone). */
  focusOn(x: number, y: number, z: number): void {
    this.lookAt.set(x, y, z);
    this.updateCamera();
  }

  /** Restore default orbit framing on the volume center. */
  resetView(): void {
    this.yaw = DEFAULT_YAW;
    this.pitch = DEFAULT_PITCH;
    this.dist = DEFAULT_DIST;
    this.lookAt.set(VOLUME_CENTER, VOLUME_CENTER, VOLUME_CENTER);
    this.updateCamera();
  }

  /** Preview animation pose around a part pivot (legacy single-part path). */
  setPosePreview(pivot: Vec3, position: Vec3, rotation: Quat): void {
    if (this.animateMode) return;
    this.pivotNode.position.set(
      pivot.x + position.x,
      pivot.y + position.y,
      pivot.z + position.z,
    );
    this.pivotNode.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
    this.modelNode.position.set(-pivot.x, -pivot.y, -pivot.z);
  }

  clearPosePreview(): void {
    if (this.animateMode) return;
    this.pivotNode.position.set(0, 0, 0);
    this.pivotNode.quaternion.identity();
    this.modelNode.position.set(0, 0, 0);
  }

  private swapGeometry(mesh: THREE.Mesh, geometry: THREE.BufferGeometry | null): void {
    const prev = mesh.geometry;
    mesh.geometry = geometry ?? new THREE.BufferGeometry();
    if (prev && prev !== mesh.geometry) prev.dispose();
  }

  private disposeMesh(geometry: THREE.BufferGeometry | null): void {
    geometry?.dispose();
  }

  private updateHighlight(): void {
    // Hover cube removed — placement uses tools without a floating 1×1 outline.
    this.highlight.visible = false;
  }

  private renderFrame(): void {
    this.studioSolid.uniforms.time.value += 0.016;
    this.studioCutout.uniforms.time.value += 0.016;
    this.materials.uniforms.time.value += 0.016;
    this.renderer.render(this.scene, this.camera);
  }

  /** Bright, fog-free lighting so atlas colors read true; dimmer ambient shows emissive glow. */
  private setupStudioLighting(): void {
    const apply = (mat: THREE.ShaderMaterial) => {
      mat.uniforms.fogDensity.value = 0;
      mat.uniforms.fogColor.value.setHex(0x141e22);
      mat.uniforms.sunDir.value.set(0.45, 0.9, 0.35).normalize();
      mat.uniforms.sunColor.value.setRGB(0.85, 0.82, 0.78);
      mat.uniforms.ambientColor.value.setRGB(0.28, 0.3, 0.34);
    };
    apply(this.studioSolid);
    apply(this.studioCutout);
    apply(this.materials.solid);
  }

  private updateCamera(): void {
    const cp = Math.cos(this.pitch);
    const t = this.lookAt;
    this.camera.position.set(
      t.x + Math.sin(this.yaw) * cp * this.dist,
      t.y + Math.sin(this.pitch) * this.dist * 0.75 + 2,
      t.z + Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(t);
  }

  private ensureTransformControls(): void {
    if (this.transformControls) return;
    const controls = new TransformControls(this.camera, this.renderer.domElement);
    controls.setSize(0.85);
    controls.setSpace('local');
    controls.translationSnap = null;
    controls.rotationSnap = null;
    controls.scaleSnap = null;
    controls.addEventListener('dragging-changed', (e) => {
      const dragging = Boolean((e as { value?: boolean }).value);
      const wasDragging = this.transformDragging;
      this.transformDragging = dragging;
      if (wasDragging && !dragging && !this.animateMode) {
        this.bakeModelingGizmo();
      }
    });
    controls.addEventListener('objectChange', () => this.emitTransformChange());
    const helper = controls.getHelper();
    helper.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.material) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!('opacity' in mat)) continue;
        mat.transparent = true;
        mat.opacity = 0.72;
        if ('metalness' in mat) (mat as THREE.MeshStandardMaterial).metalness = 0.65;
        if ('roughness' in mat) (mat as THREE.MeshStandardMaterial).roughness = 0.35;
      }
    });
    this.scene.add(helper);
    this.transformControls = controls;
  }

  private configureTransformSnapping(): void {
    if (!this.transformControls) return;
    this.transformControls.translationSnap = null;
    this.transformControls.rotationSnap = null;
    this.transformControls.scaleSnap = null;
  }

  private disposeTransformControls(): void {
    if (!this.transformControls) return;
    this.detachGizmo();
    this.scene.remove(this.transformControls.getHelper());
    this.transformControls.dispose();
    this.transformControls = null;
  }

  private attachGizmoToSelected(): void {
    if (!this.transformControls || this.gizmoMode === 'off') {
      this.detachGizmo();
      return;
    }
    if (!this.animateMode) {
      this.prepareModelingGizmoPivot();
      this.transformControls.attach(this.pivotNode);
      this.transformControls.setMode(this.gizmoMode);
      this.transformControls.getHelper().visible = true;
      this.transformControls.enabled = true;
      return;
    }
    const id = this.selectedPartId;
    if (!id) {
      this.detachGizmo();
      return;
    }
    const vis = this.partVisuals.get(id);
    if (!vis || !vis.pivot.visible) {
      this.detachGizmo();
      return;
    }
    this.transformControls.attach(vis.pivot);
    this.transformControls.setMode(this.gizmoMode);
    this.transformControls.getHelper().visible = true;
    this.transformControls.enabled = true;
  }

  /** Center the modeling pivot so Move/Rotate/Scale handles sit in the volume. */
  private prepareModelingGizmoPivot(): void {
    const o = this.modelingGizmoOrigin;
    o.set(VOLUME_CENTER, VOLUME_CENTER, VOLUME_CENTER);
    this.pivotNode.position.copy(o);
    this.pivotNode.quaternion.identity();
    this.pivotNode.scale.set(1, 1, 1);
    this.modelNode.position.set(-o.x, -o.y, -o.z);
  }

  /** Snap gizmo transform into the voxel grid (modeling mode). */
  private bakeModelingGizmo(): void {
    const origin = this.modelingGizmoOrigin;
    const dx = Math.round(this.pivotNode.position.x - origin.x);
    const dy = Math.round(this.pivotNode.position.y - origin.y);
    const dz = Math.round(this.pivotNode.position.z - origin.z);

    const e = new THREE.Euler().setFromQuaternion(this.pivotNode.quaternion, 'YXZ');
    const snapTurns = (rad: number) => {
      let t = Math.round(rad / (Math.PI / 2)) % 4;
      if (t < 0) t += 4;
      return t;
    };
    const turnsY = snapTurns(e.y);
    const turnsX = snapTurns(e.x);
    const turnsZ = snapTurns(e.z);

    const scaled =
      Math.abs(this.pivotNode.scale.x - 1) > 0.08 ||
      Math.abs(this.pivotNode.scale.y - 1) > 0.08 ||
      Math.abs(this.pivotNode.scale.z - 1) > 0.08;

    const moved = dx !== 0 || dy !== 0 || dz !== 0;
    const rotated = turnsX !== 0 || turnsY !== 0 || turnsZ !== 0;

    if (!moved && !rotated) {
      this.prepareModelingGizmoPivot();
      if (this.gizmoMode !== 'off') this.attachGizmoToSelected();
      if (scaled) this.onModelBakeDone?.('Scale is preview-only in Modeling');
      return;
    }

    this.onBeforeModelBake?.();
    let changed = false;
    if (moved) changed = translateGrid(this.grid, dx, dy, dz) || changed;
    for (let i = 0; i < turnsY; i++) changed = rotateGrid90(this.grid, 'y') || changed;
    for (let i = 0; i < turnsX; i++) changed = rotateGrid90(this.grid, 'x') || changed;
    for (let i = 0; i < turnsZ; i++) changed = rotateGrid90(this.grid, 'z') || changed;

    this.rebuildMesh();
    this.prepareModelingGizmoPivot();
    if (this.gizmoMode !== 'off') this.attachGizmoToSelected();
    this.onEdit?.();
    const bits: string[] = [];
    if (moved) bits.push('moved');
    if (rotated) bits.push('rotated');
    if (scaled) bits.push('scale preview reset');
    this.onModelBakeDone?.(
      changed ? `Model ${bits.join(' + ')}` : bits.length ? bits.join(' + ') : 'No change',
    );
  }

  private detachGizmo(): void {
    this.transformControls?.detach();
  }

  private emitTransformChange(): void {
    if (!this.selectedPartId || !this.onTransformChange) return;
    const part = this.animateParts.find((p) => p.id === this.selectedPartId);
    const vis = this.partVisuals.get(this.selectedPartId);
    if (!part || !vis) return;
    // Keep animated scale; gizmo currently edits rotate/translate only.
    const q = vis.pivot.quaternion;
    const e = eulerYXZFromQuat({ x: q.x, y: q.y, z: q.z, w: q.w });
    const base = localPivotOffset(part, this.animateParts);
    const pos = {
      x: vis.pivot.position.x - base.x,
      y: vis.pivot.position.y - base.y,
      z: vis.pivot.position.z - base.z,
    };
    this.onTransformChange(this.selectedPartId, e, pos);
  }

  private bindPartPick(): void {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', (e) => {
      if (!this.animateMode || this.voxelSelectMode || e.button !== 0 || this.transformDragging) return;
      if (this.transformControls?.dragging) return;
      const rect = el.getBoundingClientRect();
      this.pickNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pickNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.pickRaycaster.setFromCamera(this.pickNdc, this.camera);
      const meshes: THREE.Object3D[] = [];
      for (const vis of this.partVisuals.values()) {
        if (vis.solid.visible) meshes.push(vis.solid);
        if (vis.cutout.visible) meshes.push(vis.cutout);
      }
      const hits = this.pickRaycaster.intersectObjects(meshes, false);
      if (!hits.length) return;
      const partId = hits[0]!.object.userData.partId as string | undefined;
      if (partId) this.onPartPicked?.(partId);
    });
  }

  /** Hit a solid voxel under the pointer (mesh first, then grid DDA). */
  private pickSolidVoxel(clientX: number, clientY: number): { x: number; y: number; z: number } | null {
    const el = this.renderer.domElement;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    this.pickNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pickNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    // Prefer visible part meshes (matches what you see on screen).
    this.partRoot.updateMatrixWorld(true);
    this.pickRaycaster.setFromCamera(this.pickNdc, this.camera);
    const meshes: THREE.Object3D[] = [];
    for (const vis of this.partVisuals.values()) {
      if (vis.pivot.visible && vis.solid.visible) meshes.push(vis.solid);
      if (vis.pivot.visible && vis.cutout.visible) meshes.push(vis.cutout);
    }
    const hits = this.pickRaycaster.intersectObjects(meshes, false);
    if (hits.length) {
      const hit = hits[0]!;
      const inv = new THREE.Matrix4().copy(hit.object.matrixWorld).invert();
      const local = hit.point.clone().applyMatrix4(inv);
      if (hit.face) {
        local.x -= hit.face.normal.x * 0.05;
        local.y -= hit.face.normal.y * 0.05;
        local.z -= hit.face.normal.z * 0.05;
      }
      const x = Math.floor(local.x);
      const y = Math.floor(local.y);
      const z = Math.floor(local.z);
      if (this.grid.get(x, y, z) !== Block.Air) return { x, y, z };
    }

    const { origin, direction } = cameraRayFromNdc(this.camera, this.pickNdc.x, this.pickNdc.y);
    const hit = localVoxelRaycast(origin, direction, 64, (x, y, z) => this.grid.get(x, y, z));
    if (!hit || this.grid.get(hit.x, hit.y, hit.z) === Block.Air) return null;
    return { x: hit.x, y: hit.y, z: hit.z };
  }

  /** Raycast mesh UV → atlas tile pixel for 3D texture painting. */
  pickTextureHit(clientX: number, clientY: number): VoxelFacePaintHit | null {
    const el = this.renderer.domElement;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    this.pickNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pickNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.pickRaycaster.setFromCamera(this.pickNdc, this.camera);

    const meshes: THREE.Object3D[] = [];
    if (this.animateMode) {
      this.partRoot.updateMatrixWorld(true);
      for (const vis of this.partVisuals.values()) {
        if (vis.pivot.visible && vis.solid.visible) meshes.push(vis.solid);
        if (vis.pivot.visible && vis.cutout.visible) meshes.push(vis.cutout);
      }
    } else {
      this.pivotNode.updateMatrixWorld(true);
      if (this.solidMesh.visible) meshes.push(this.solidMesh);
      if (this.cutoutMesh.visible) meshes.push(this.cutoutMesh);
    }
    if (!meshes.length) return null;

    const hit = raycastToTexturePixel(
      this.pickRaycaster,
      meshes,
      this.grid,
      this.textureAtlas,
    );
    return hit;
  }

  private isPrimaryPointer(e: PointerEvent): boolean {
    // Touch / pen often report button 0; some browsers use -1 on pointerdown.
    return e.button === 0 || e.button === -1 || e.pointerType === 'touch';
  }

  private bindVoxelSelect(): void {
    const el = this.renderer.domElement;
    const paintAt = (clientX: number, clientY: number) => {
      if (!this.voxelSelectMode || !this.animateMode) return;
      const cell = this.pickSolidVoxel(clientX, clientY);
      if (!cell) return;
      const i = this.grid.index(cell.x, cell.y, cell.z);
      const next = this.selectPaintValue;
      if (this.voxelSelection[i] === next) return;
      this.voxelSelection[i] = next;
      this.refreshSelectionOverlay();
      this.onVoxelSelectionChange?.(this.countVoxelSelection());
    };

    el.addEventListener(
      'pointerdown',
      (e) => {
        if (!this.voxelSelectMode || !this.animateMode || !this.isPrimaryPointer(e)) return;
        e.preventDefault();
        e.stopImmediatePropagation();

        const cell = this.pickSolidVoxel(e.clientX, e.clientY);
        if (!cell) return;

        const i = this.grid.index(cell.x, cell.y, cell.z);

        // Chunk mode (or Shift+custom): flood-fill the connected solid.
        if (this.voxelSelectStyle === 'chunk' || e.shiftKey) {
          const erase = this.voxelSelection[i] === 1;
          if (erase) {
            const temp = createVoxelSelection();
            selectConnectedChunk(temp, this.grid, cell.x, cell.y, cell.z, 1);
            for (let j = 0; j < temp.length; j++) {
              if (temp[j]) this.voxelSelection[j] = 0;
            }
          } else {
            selectConnectedChunk(this.voxelSelection, this.grid, cell.x, cell.y, cell.z, 1);
          }
          this.refreshSelectionOverlay();
          this.onVoxelSelectionChange?.(this.countVoxelSelection());
          return;
        }

        // Custom: tap/drag exact voxels (paint or erase).
        this.selectPaintValue = this.voxelSelection[i] ? 0 : 1;
        this.selectPainting = true;
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
        paintAt(e.clientX, e.clientY);
      },
      { capture: true },
    );

    el.addEventListener('pointermove', (e) => {
      if (!this.selectPainting) return;
      paintAt(e.clientX, e.clientY);
    });

    const endPaint = () => {
      this.selectPainting = false;
    };
    el.addEventListener('pointerup', endPaint);
    el.addEventListener('pointercancel', endPaint);
  }

  private clearSelectionOverlayMeshes(): void {
    if (this.selectionSolid) {
      this.selectionRoot.remove(this.selectionSolid);
      this.selectionSolid.geometry.dispose();
      this.selectionSolid = null;
    }
    if (this.selectionOutline) {
      this.selectionRoot.remove(this.selectionOutline);
      this.selectionOutline.geometry.dispose();
      this.selectionOutline = null;
    }
    if (this.selectionOutlineBg) {
      this.selectionRoot.remove(this.selectionOutlineBg);
      this.selectionOutlineBg.geometry.dispose();
      this.selectionOutlineBg = null;
    }
  }

  /** Wireframe box edges slightly outside each selected voxel (clear pick feedback). */
  private buildSelectionOutlineGeometry(pad: number): THREE.BufferGeometry | null {
    const pos: number[] = [];
    const pushEdge = (
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
    ) => {
      pos.push(x0, y0, z0, x1, y1, z1);
    };
    for (let i = 0; i < this.voxelSelection.length; i++) {
      if (!this.voxelSelection[i] || this.grid.voxels[i] === Block.Air) continue;
      const x = i % LOCAL_GRID_SIZE;
      const y = Math.floor(i / (LOCAL_GRID_SIZE * LOCAL_GRID_SIZE));
      const z = Math.floor(i / LOCAL_GRID_SIZE) % LOCAL_GRID_SIZE;
      const x0 = x - pad;
      const y0 = y - pad;
      const z0 = z - pad;
      const x1 = x + 1 + pad;
      const y1 = y + 1 + pad;
      const z1 = z + 1 + pad;
      // Bottom square
      pushEdge(x0, y0, z0, x1, y0, z0);
      pushEdge(x1, y0, z0, x1, y0, z1);
      pushEdge(x1, y0, z1, x0, y0, z1);
      pushEdge(x0, y0, z1, x0, y0, z0);
      // Top square
      pushEdge(x0, y1, z0, x1, y1, z0);
      pushEdge(x1, y1, z0, x1, y1, z1);
      pushEdge(x1, y1, z1, x0, y1, z1);
      pushEdge(x0, y1, z1, x0, y1, z0);
      // Verticals
      pushEdge(x0, y0, z0, x0, y1, z0);
      pushEdge(x1, y0, z0, x1, y1, z0);
      pushEdge(x1, y0, z1, x1, y1, z1);
      pushEdge(x0, y0, z1, x0, y1, z1);
    }
    if (!pos.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return geo;
  }

  private refreshSelectionOverlay(): void {
    this.clearSelectionOverlayMeshes();
    const count = this.countVoxelSelection();
    this.selectionRoot.visible = this.voxelSelectMode && count > 0;
    if (!this.voxelSelectMode || count === 0) return;

    if (!this.selectionMat) {
      this.selectionMat = new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
      });
    }
    if (!this.selectionOutlineBgMat) {
      this.selectionOutlineBgMat = new THREE.LineBasicMaterial({
        color: 0x0a0c10,
        transparent: true,
        opacity: 0.9,
        depthTest: true,
        depthWrite: false,
      });
    }
    if (!this.selectionOutlineMat) {
      this.selectionOutlineMat = new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
      });
    }

    const selGrid = cloneGridForSelection(this.grid, this.voxelSelection);
    const { solid } = meshLocalGrid(selGrid, this.texUvMode);
    if (solid) {
      this.selectionSolid = new THREE.Mesh(solid, this.selectionMat);
      this.selectionSolid.renderOrder = 4;
      this.selectionRoot.add(this.selectionSolid);
    }

    const bgGeo = this.buildSelectionOutlineGeometry(0.06);
    const fgGeo = this.buildSelectionOutlineGeometry(0.04);
    if (bgGeo) {
      this.selectionOutlineBg = new THREE.LineSegments(bgGeo, this.selectionOutlineBgMat);
      this.selectionOutlineBg.renderOrder = 5;
      this.selectionRoot.add(this.selectionOutlineBg);
    }
    if (fgGeo) {
      this.selectionOutline = new THREE.LineSegments(fgGeo, this.selectionOutlineMat);
      this.selectionOutline.renderOrder = 6;
      this.selectionRoot.add(this.selectionOutline);
    }
  }

  private bindOrbit(): void {
    const el = this.renderer.domElement;
    const pad = 4;
    const clampLook = () => {
      this.lookAt.x = THREE.MathUtils.clamp(this.lookAt.x, -pad, LOCAL_GRID_SIZE + pad);
      this.lookAt.y = THREE.MathUtils.clamp(this.lookAt.y, -pad, LOCAL_GRID_SIZE + pad);
      this.lookAt.z = THREE.MathUtils.clamp(this.lookAt.z, -pad, LOCAL_GRID_SIZE + pad);
    };

    el.addEventListener('pointerdown', (e) => {
      if (this.interaction.isBusy()) return;
      if (this.transformDragging || this.transformControls?.dragging) return;
      const shiftPan = e.shiftKey && e.button === 2;
      const midPan = e.button === 1;
      const orbitRmb = e.button === 2 && !e.shiftKey && !this.interaction.getHoverHit();
      if (midPan || shiftPan) {
        this.panning = true;
        this.orbiting = false;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        el.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (orbitRmb) {
        this.orbiting = true;
        this.panning = false;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        el.setPointerCapture(e.pointerId);
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (this.interaction.isBusy()) return;
      if (this.transformDragging || this.transformControls?.dragging) return;
      if (!this.orbiting && !this.panning) return;
      const dx = e.clientX - this.lastX;
      const dy = e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;

      if (this.panning) {
        const scale = this.dist * 0.0022;
        this.panRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
        this.panUp.set(
          -Math.sin(this.yaw) * Math.sin(this.pitch),
          Math.cos(this.pitch),
          -Math.cos(this.yaw) * Math.sin(this.pitch),
        );
        this.lookAt.addScaledVector(this.panRight, -dx * scale);
        this.lookAt.addScaledVector(this.panUp, dy * scale);
        clampLook();
        this.updateCamera();
        return;
      }

      this.yaw -= dx * 0.012;
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.008, -0.35, 1.35);
      this.updateCamera();
    });

    const endDrag = () => {
      this.orbiting = false;
      this.panning = false;
    };
    el.addEventListener('pointerup', endDrag);
    el.addEventListener('pointercancel', endDrag);

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.dist = THREE.MathUtils.clamp(this.dist + e.deltaY * 0.015, 8, 80);
        this.updateCamera();
      },
      { passive: false },
    );
  }
}
