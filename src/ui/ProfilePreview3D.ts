import * as THREE from 'three';
import type { Profile } from './prefs';
import { PlayerAvatar } from '../player/PlayerAvatar';

/** Live 3D character preview for the profile hero. */
export class ProfilePreview3D {
  readonly root: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly avatar: PlayerAvatar;
  private readonly resizeObs: ResizeObserver;
  private raf = 0;
  private running = false;
  private dragging = false;
  private lastX = 0;
  private yaw = 0.28;
  private readonly pitch = 0.06;
  private dist = 3.65;
  private previewPose: 'stand' | 'sneak' | 'sit' = 'stand';
  private previewMove = 0;
  private autoSpin = true;

  constructor(opts?: {
    transparent?: boolean;
    className?: string;
    interactive?: boolean;
    autoSpin?: boolean;
  }) {
    const transparent = !!opts?.transparent;
    const interactive = opts?.interactive !== false;
    this.autoSpin = opts?.autoSpin !== false;
    this.root = document.createElement('div');
    this.root.className = opts?.className ?? 'profile-hero-3d';

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: transparent });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    if (transparent) {
      this.renderer.setClearColor(0x000000, 0);
    } else {
      this.renderer.setClearColor(0x122226, 1);
    }
    this.root.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = transparent ? null : new THREE.Color(0x122226);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.08, 30);
    this.updateCamera();

    const amb = new THREE.AmbientLight(0xe8f4f0, 0.85);
    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(2.2, 4.5, 3.2);
    const fill = new THREE.DirectionalLight(0x5ec4b0, 0.45);
    fill.position.set(-2.5, 1.8, -1.2);
    this.scene.add(amb, key, fill);

    this.avatar = new PlayerAvatar();
    this.avatar.root.visible = true;
    this.scene.add(this.avatar.root);

    if (interactive) this.bindDrag();
    else this.renderer.domElement.style.pointerEvents = 'none';
    this.resizeObs = new ResizeObserver(() => this.layout());
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    this.resizeObs.observe(parent);
    this.layout();
  }

  applyProfile(profile: Profile): void {
    this.avatar.applyProfile(profile);
  }

  syncPixels(pixels: Uint8ClampedArray): void {
    this.avatar.applySkinPixels(pixels);
  }

  setPose(mode: 'idle' | 'walk' | 'sneak' | 'sit'): void {
    if (mode === 'idle') {
      this.previewPose = 'stand';
      this.previewMove = 0;
    } else if (mode === 'walk') {
      this.previewPose = 'stand';
      this.previewMove = 1;
    } else if (mode === 'sneak') {
      this.previewPose = 'sneak';
      this.previewMove = 0.6;
    } else {
      this.previewPose = 'sit';
      this.previewMove = 0;
    }
    this.avatar.setPreviewMotion(this.previewPose, this.previewMove);
  }

  snapView(view: 'front' | 'side' | 'back'): void {
    this.autoSpin = false;
    // Face is on +Z; camera sits on +Z, so yaw 0 = looking at the face.
    if (view === 'front') this.yaw = 0;
    else if (view === 'side') this.yaw = Math.PI * 0.5;
    else this.yaw = Math.PI;
    this.avatar.root.rotation.y = this.yaw;
  }

  layout(): void {
    const host = this.root.parentElement ?? this.root;
    const w = Math.max(120, Math.floor(host.clientWidth || this.root.clientWidth || 180));
    const h = Math.max(160, Math.floor(host.clientHeight || this.root.clientHeight || 220));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    const baseFov = 35;
    if (w < h) {
      const targetAspect = 0.95;
      if (this.camera.aspect < targetAspect) {
        const vFovRad = THREE.MathUtils.degToRad(baseFov);
        const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * targetAspect);
        this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hFovRad / 2) / this.camera.aspect));
      } else {
        this.camera.fov = baseFov;
      }
    } else {
      this.camera.fov = baseFov;
    }
    this.camera.updateProjectionMatrix();
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.render(this.scene, this.camera);
  }

  start(): void {
    if (this.running) {
      requestAnimationFrame(() => this.layout());
      return;
    }
    this.running = true;
    this.layout();
    requestAnimationFrame(() => this.layout());
    let last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!this.dragging && this.autoSpin) this.yaw += dt * 0.4;
      this.avatar.root.rotation.y = this.yaw;
      const motion = this.avatar.getPreviewMotion();
      this.avatar.update(dt, motion.move, true, 0, motion.pose);
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
    const targetY = 0.92;
    const cp = Math.cos(this.pitch);
    // Fixed orbit angle — avatar spins in place (turntable).
    const camYaw = 0.45;
    this.camera.position.set(
      Math.sin(camYaw) * cp * this.dist,
      targetY + Math.sin(this.pitch) * this.dist * 0.4,
      Math.cos(camYaw) * cp * this.dist,
    );
    this.camera.lookAt(0, targetY, 0);
  }

  private bindDrag(): void {
    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.style.cursor = 'grab';
    el.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      el.style.cursor = 'grabbing';
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      this.yaw -= (e.clientX - this.lastX) * 0.014;
      this.lastX = e.clientX;
      this.avatar.root.rotation.y = this.yaw;
    });
    const end = () => {
      this.dragging = false;
      el.style.cursor = 'grab';
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.dist = THREE.MathUtils.clamp(this.dist + e.deltaY * 0.002, 2.2, 4.2);
        this.updateCamera();
      },
      { passive: false },
    );
  }
}
