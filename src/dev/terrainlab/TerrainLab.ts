/**
 * Developer-only terrain resolution comparison lab.
 *
 * Renders a fixed deterministic benchmark region from fixed scenic cameras at
 * four terrain resolutions, with real measurements, A/B compare, overlay, and
 * reference-image comparison. Evaluation prototype: it never touches gameplay,
 * saves, collision, multiplayer, or the production chunk pipeline.
 */
import * as THREE from 'three';
import { TERRAIN_RESOLUTIONS, TerrainField, type TerrainResolution } from '../../world/preview/TerrainField';
import { TerrainView, type ViewMetrics } from '../../world/preview/TerrainView';
import {
  CameraControls,
  buildPoses,
  findRegion,
  type Pose,
  type RegionInfo,
  type ViewName,
} from '../../world/preview/CameraRig';
import { PixelBackgroundEngine } from '../../ui/background/PixelBackgroundEngine';
import { DEFAULT_BG_PREFS } from '../../ui/background/backgroundPrefs';
import { LabPanel } from './LabPanel';
import { loadTarget, saveTarget } from './labConfig';

export const BENCH_SEED = 'vythera-bench-01';
export const REGION_BLOCKS = 512;

export type LabMode = 'single' | 'split' | 'overlay' | 'reference';

export class TerrainLab {
  private root: HTMLDivElement;
  private stage: HTMLDivElement;
  private skyHost: HTMLDivElement;
  private sky: PixelBackgroundEngine;
  private referenceImg: HTMLImageElement;

  private viewA = new TerrainView('vy-lab__canvas vy-lab__canvas--a');
  private viewB = new TerrainView('vy-lab__canvas vy-lab__canvas--b');
  private cameraA = new THREE.PerspectiveCamera(58, 1, 0.5, 1600);
  private cameraB = new THREE.PerspectiveCamera(58, 1, 0.5, 1600);
  private controls: CameraControls;

  private field: TerrainField;
  private region: RegionInfo;
  private poses: Record<ViewName, Pose>;

  private panel: LabPanel;
  private resA: TerrainResolution = 1;
  private resB: TerrainResolution = 0.25;
  private view: ViewName = 'panorama';
  private mode: LabMode = 'single';
  private linkCameras = true;
  private overlay = 0.5;
  private building = false;

  private raf = 0;
  private frames = 0;
  private fpsAccum = 0;
  private lastFrame = performance.now();
  private fps = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'vy-lab';

    this.stage = document.createElement('div');
    this.stage.className = 'vy-lab__stage';

    this.skyHost = document.createElement('div');
    this.skyHost.className = 'vy-lab__sky';
    this.sky = new PixelBackgroundEngine({ ...DEFAULT_BG_PREFS }, 'sky-only');

    this.referenceImg = document.createElement('img');
    this.referenceImg.className = 'vy-lab__reference';
    this.referenceImg.src = '/dev-reference/ref3.png';

    this.stage.append(this.skyHost, this.referenceImg, this.viewA.canvas, this.viewB.canvas);
    this.root.append(this.stage);

    this.field = new TerrainField(BENCH_SEED, 'balanced');
    this.region = findRegion(this.field, REGION_BLOCKS);
    this.poses = buildPoses(this.field, this.region, REGION_BLOCKS);

    this.controls = new CameraControls(this.cameraA, this.stage, () => this.syncCameras());

    this.panel = new LabPanel({
      initialTarget: loadTarget(),
      onResolution: (slot, r) => this.setResolution(slot, r),
      onView: (v) => this.setView(v),
      onMode: (m) => this.setMode(m),
      onLink: (on) => {
        this.linkCameras = on;
        this.syncCameras();
      },
      onOverlay: (v) => {
        this.overlay = v;
        this.applyLayout();
      },
      onReference: (i) => {
        this.referenceImg.src = `/dev-reference/ref${i}.png`;
      },
      onSetTarget: (r) => saveTarget(r),
      onRecenter: () => this.applyPose(),
    });
    this.root.appendChild(this.panel.root);
  }

  async mount(host: HTMLElement): Promise<void> {
    host.appendChild(this.root);
    this.sky.mount(this.skyHost);
    this.sky.start();
    this.resize();
    window.addEventListener('resize', this.resize);
    this.applyPose();
    this.applyLayout();
    await this.rebuild();
    this.loop();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.controls.dispose();
    this.sky.stop();
    this.viewA.dispose();
    this.viewB.dispose();
    this.root.remove();
  }

  private get compareActive(): boolean {
    return this.mode === 'split' || this.mode === 'overlay';
  }

  private resize = (): void => {
    const w = this.stage.clientWidth || window.innerWidth;
    const h = this.stage.clientHeight || window.innerHeight;
    const halfW = this.mode === 'split' || this.mode === 'reference' ? w / 2 : w;

    this.viewA.setSize(this.mode === 'split' || this.mode === 'reference' ? halfW : w, h);
    this.viewB.setSize(this.mode === 'split' ? halfW : w, h);

    const aspectA = (this.mode === 'split' || this.mode === 'reference' ? halfW : w) / h;
    this.cameraA.aspect = aspectA;
    this.cameraA.updateProjectionMatrix();
    this.cameraB.aspect = this.mode === 'split' ? halfW / h : w / h;
    this.cameraB.updateProjectionMatrix();
  };

  private applyPose(): void {
    this.controls.applyPose(this.poses[this.view]);
    this.syncCameras();
  }

  private syncCameras(): void {
    if (!this.linkCameras) return;
    this.cameraB.position.copy(this.cameraA.position);
    this.cameraB.quaternion.copy(this.cameraA.quaternion);
    this.cameraB.fov = this.cameraA.fov;
    this.cameraB.updateProjectionMatrix();
    this.cameraB.updateMatrixWorld();
  }

  private applyLayout(): void {
    this.root.dataset.mode = this.mode;
    this.viewB.canvas.style.opacity = this.mode === 'overlay' ? String(this.overlay) : '1';
    this.resize();
  }

  private setView(v: ViewName): void {
    this.view = v;
    this.applyPose();
    void this.rebuild();
  }

  private setMode(m: LabMode): void {
    this.mode = m;
    this.applyLayout();
    void this.rebuild();
  }

  private setResolution(slot: 'a' | 'b', r: TerrainResolution): void {
    if (slot === 'a') this.resA = r;
    else this.resB = r;
    void this.rebuild();
  }

  private async rebuild(): Promise<void> {
    if (this.building) return;
    this.building = true;
    this.panel.setStatus(`Building ${this.resA}…`, 0);

    const a = await this.viewA.build(
      this.field,
      this.region.origin,
      REGION_BLOCKS,
      this.resA,
      this.poses[this.view].eye,
      (done, total) => this.panel.setStatus(`Building ${this.resA}…`, done / total),
    );

    let b: ViewMetrics | null = null;
    if (this.compareActive) {
      this.panel.setStatus(`Building ${this.resB}…`, 0);
      b = await this.viewB.build(
        this.field,
        this.region.origin,
        REGION_BLOCKS,
        this.resB,
        this.poses[this.view].eye,
        (done, total) => this.panel.setStatus(`Building ${this.resB}…`, done / total),
      );
    }

    this.panel.setStatus('Ready', 1);
    this.panel.setMetrics(a, b);
    this.building = false;
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (this.controls.update(dt)) this.syncCameras();

    this.fpsAccum += dt * 1000;
    this.frames++;
    if (this.fpsAccum >= 500) {
      this.fps = (this.frames * 1000) / this.fpsAccum;
      this.frames = 0;
      this.fpsAccum = 0;
      if (this.viewA.metrics) this.viewA.metrics.drawCalls = this.viewA.renderer.info.render.calls;
      if (this.viewB.metrics) this.viewB.metrics.drawCalls = this.viewB.renderer.info.render.calls;
      this.panel.setRuntime(this.fps);
    }

    this.viewA.render(this.cameraA);
    if (this.compareActive) this.viewB.render(this.cameraB);
  };
}

export { TERRAIN_RESOLUTIONS };

