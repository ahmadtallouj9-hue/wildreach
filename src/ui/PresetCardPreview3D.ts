import * as THREE from 'three';
import type { Profile } from './prefs';
import { PlayerAvatar } from '../player/PlayerAvatar';

/** Mini live 3D preview for skin preset cards. */
export class PresetCardPreview3D {
  readonly root: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly avatar: PlayerAvatar;
  private raf = 0;
  private running = false;
  private yaw = 0.35;
  private t = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'skin-preset-3d-thumb';

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.style.pointerEvents = 'none';
    this.root.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(34, 72 / 112, 0.05, 20);
    this.camera.position.set(0.35, 0.92, 2.65);
    this.camera.lookAt(0, 0.82, 0);

    const amb = new THREE.AmbientLight(0xf0f4f2, 0.9);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(1.5, 3.5, 2.5);
    const fill = new THREE.DirectionalLight(0x8ec4b8, 0.35);
    fill.position.set(-2, 1.2, -1);
    this.scene.add(amb, key, fill);

    this.avatar = new PlayerAvatar();
    this.avatar.root.visible = true;
    this.scene.add(this.avatar.root);
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
    this.layout();
  }

  applyProfile(profile: Profile): void {
    this.avatar.applyProfile(profile);
  }

  applyPixels(pixels: Uint8ClampedArray): void {
    this.avatar.applySkinPixels(pixels);
  }

  layout(): void {
    const w = 72;
    const h = 112;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.layout();
    let last = performance.now();
    const tick = (now: number) => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.t += dt;
      this.yaw = 0.35 + Math.sin(this.t * 0.55) * 0.18;
      this.avatar.root.rotation.y = this.yaw;
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
    this.renderer.dispose();
    this.root.remove();
  }
}
