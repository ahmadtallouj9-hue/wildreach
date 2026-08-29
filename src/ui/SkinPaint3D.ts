import * as THREE from 'three';
import type { Profile } from './prefs';
import {
  BOX_FACES,
  FACE_LABELS,
  PART_LABELS,
  atlasPixelFromFaceUv,
  createDefaultSkin,
  type SkinFace,
  type SkinPart,
} from '../player/SkinAtlas';
import { PlayerAvatar } from '../player/PlayerAvatar';

export interface SkinPaint3DCallbacks {
  onStroke: (part: SkinPart, face: SkinFace, ax: number, ay: number) => void;
  onSelect: (part: SkinPart, face: SkinFace) => void;
}

const HINT_H = 32;
const DEFAULT_YAW = 0.55;
const DEFAULT_PITCH = 0.1;
const DEFAULT_DIST = 2.85;

/** Full-width 3D viewport — paint directly on the player model. */
export class SkinPaint3D {
  readonly root: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly avatar: PlayerAvatar;
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly paintMeshes: THREE.Mesh[] = [];
  private readonly callbacks: SkinPaint3DCallbacks;
  private readonly resizeObs: ResizeObserver;
  private readonly hintEl: HTMLElement;
  private raf = 0;
  private running = false;
  private painting = false;
  private orbiting = false;
  private lastX = 0;
  private lastY = 0;
  private orbitYaw = DEFAULT_YAW;
  private orbitPitch = DEFAULT_PITCH;
  private dist = DEFAULT_DIST;
  private lastPixel = '';

  constructor(callbacks: SkinPaint3DCallbacks) {
    this.callbacks = callbacks;
    this.root = document.createElement('div');
    this.root.className = 'skin-paint-3d';
    this.root.innerHTML = `
      <div class="skin-paint-3d-toolbar">
        <p class="skin-paint-3d-hint">Paint · right-drag rotate · scroll zoom</p>
        <button type="button" class="skin-paint-3d-reset" title="Reset view">↺</button>
      </div>`;

    this.hintEl = this.root.querySelector('.skin-paint-3d-hint')!;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.root.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x081216);

    const grid = new THREE.GridHelper(2.2, 12, 0xc9a227, 0x1a2e36);
    grid.position.y = 0.01;
    this.scene.add(grid);

    this.camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.08, 30);
    this.updateCamera();

    const amb = new THREE.AmbientLight(0xe8f4f0, 0.75);
    const key = new THREE.DirectionalLight(0xffffff, 1);
    key.position.set(2.5, 5, 3.5);
    const fill = new THREE.DirectionalLight(0x7ad4c2, 0.45);
    fill.position.set(-2.5, 2, -2);
    const rim = new THREE.DirectionalLight(0xffffff, 0.25);
    rim.position.set(0, 2, -4);
    this.scene.add(amb, key, fill, rim);

    this.avatar = new PlayerAvatar();
    this.avatar.root.visible = true;
    this.scene.add(this.avatar.root);
    for (const { mesh } of this.avatar.getPaintTargets()) {
      this.paintMeshes.push(mesh);
    }
    this.avatar.applySkinPixels(
      createDefaultSkin('#FFF0E6', '#2B2A2D', '#F4B6C2', {
        hair: '#8C827B',
        eyes: '#8C827B',
        shoes: '#9E9088',
        hairStyle: 'bangs',
        face: 'kawaii',
        sleeves: 'long',
        pants: '#FAFAFA',
      }),
    );

    this.bindInput();
    this.resizeObs = new ResizeObserver(() => this.layout());
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    this.resizeObs.observe(parent);
    this.root.querySelector('.skin-paint-3d-reset')!.addEventListener('click', () => this.resetView());
    this.layout();
  }

  applyProfile(profile: Profile): void {
    this.avatar.applyProfile(profile);
  }

  syncPixels(pixels: Uint8ClampedArray): void {
    this.avatar.applySkinPixels(pixels);
  }

  resetView(): void {
    this.orbitYaw = DEFAULT_YAW;
    this.orbitPitch = DEFAULT_PITCH;
    this.dist = DEFAULT_DIST;
    this.updateCamera();
  }

  layout(): void {
    const host = this.root.parentElement;
    if (!host || host.hidden) return;
    const w = Math.max(280, host.clientWidth);
    const h = Math.max(260, host.clientHeight);
    const canvasH = Math.max(220, h - HINT_H);
    this.renderer.setSize(w, canvasH, false);
    this.camera.aspect = w / canvasH;
    this.camera.updateProjectionMatrix();
    if (this.running) this.renderer.render(this.scene, this.camera);
  }

  start(): void {
    if (this.running) {
      this.layout();
      return;
    }
    this.running = true;
    this.layout();
    let last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.avatar.update(dt, 0, true, 0, 'stand');
      this.renderer.render(this.scene, this.camera);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  dispose(): void {
    this.stop();
    this.resizeObs.disconnect();
    this.renderer.dispose();
  }

  private updateCamera(): void {
    const targetY = 0.88;
    const cp = Math.cos(this.orbitPitch);
    this.camera.position.set(
      Math.sin(this.orbitYaw) * cp * this.dist,
      targetY + Math.sin(this.orbitPitch) * this.dist * 0.85,
      Math.cos(this.orbitYaw) * cp * this.dist,
    );
    this.camera.lookAt(0, targetY, 0);
  }

  private setHint(part?: SkinPart, face?: SkinFace): void {
    if (part && face) {
      this.hintEl.textContent = `${PART_LABELS[part]} · ${FACE_LABELS[face]} — paint · right-drag · scroll`;
      return;
    }
    this.hintEl.textContent = 'Paint · right-drag rotate · scroll zoom';
  }

  private bindInput(): void {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';

    el.addEventListener('pointerdown', (e) => {
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      if (e.button === 2 || e.button === 1) {
        this.orbiting = true;
        el.setPointerCapture(e.pointerId);
        return;
      }
      if (e.button !== 0) return;
      const hit = this.pick(e);
      if (hit) {
        this.painting = true;
        this.stroke(hit);
        el.setPointerCapture(e.pointerId);
      } else {
        this.orbiting = true;
        el.setPointerCapture(e.pointerId);
      }
    });

    el.addEventListener('pointermove', (e) => {
      if (this.painting) {
        const hit = this.pick(e);
        if (hit) this.stroke(hit);
        return;
      }
      if (this.orbiting) {
        const dx = e.clientX - this.lastX;
        const dy = e.clientY - this.lastY;
        this.lastX = e.clientX;
        this.lastY = e.clientY;
        this.orbitYaw -= dx * 0.012;
        this.orbitPitch = THREE.MathUtils.clamp(this.orbitPitch - dy * 0.008, -0.3, 0.65);
        this.updateCamera();
        return;
      }
      const hit = this.pick(e);
      if (hit) this.setHint(hit.part, hit.face);
      else this.setHint();
    });

    el.addEventListener('pointerleave', () => this.setHint());

    const end = (e: PointerEvent) => {
      if (e.button === 0) this.painting = false;
      if (e.button === 2 || e.button === 1) this.orbiting = false;
      this.lastPixel = '';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('contextmenu', (e) => e.preventDefault());

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.dist = THREE.MathUtils.clamp(this.dist + e.deltaY * 0.0025, 1.8, 4.2);
        this.updateCamera();
      },
      { passive: false },
    );
  }

  private pick(e: PointerEvent): { part: SkinPart; face: SkinFace; ax: number; ay: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.paintMeshes, false);
    const hit = hits[0];
    if (!hit?.uv || hit.face == null) return null;

    const part = (hit.object as THREE.Mesh).userData.skinPart as SkinPart | undefined;
    if (!part) return null;

    const matIdx = hit.face.materialIndex ?? 0;
    const face = BOX_FACES[matIdx];
    if (!face) return null;

    const { x, y } = atlasPixelFromFaceUv(part, face, hit.uv.x, hit.uv.y);
    return { part, face, ax: x, ay: y };
  }

  private stroke(hit: { part: SkinPart; face: SkinFace; ax: number; ay: number }): void {
    const key = `${hit.part}:${hit.face}:${hit.ax}:${hit.ay}`;
    if (key === this.lastPixel) return;
    this.lastPixel = key;
    this.setHint(hit.part, hit.face);
    this.callbacks.onSelect(hit.part, hit.face);
    this.callbacks.onStroke(hit.part, hit.face, hit.ax, hit.ay);
  }
}
