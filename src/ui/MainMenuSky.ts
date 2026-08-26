/** Main-menu sky: the same world sky + a live terrain vista. */
import * as THREE from 'three';
import { Sky } from '../render/Sky';
import { TerrainMaterials } from '../render/TerrainMaterials';
import { WorldGen } from '../world/WorldGen';
import { ChunkManager } from '../world/ChunkManager';
import { SEA_LEVEL } from '../world/blocks';
import { FallingLeaves } from '../render/FallingLeaves';
import { loadSettings } from './prefs';
import { isTouchDevice } from '../util/isTouchDevice';
import { WORLD_TIME_VALUES, loadWorldSettings } from './worldSettings';
import { loadLastWorld } from './worldNames';

export type MainMenuSkySpeeds = readonly [number, number, number];

export interface MainMenuSkyOptions {
  cloudSpeed?: MainMenuSkySpeeds;
}

const MENU_TIME = WORLD_TIME_VALUES.day + 0.06;

function pickView(world: WorldGen): { x: number; y: number; z: number } {
  const spots: Array<[number, number]> = [
    [24, 24],
    [48, 12],
    [12, 56],
    [40, 40],
    [72, 28],
  ];
  for (const [x, z] of spots) {
    const h = world.getHeight(x, z);
    if (h > SEA_LEVEL + 1) return { x, y: h + 5.4, z };
  }
  const h = world.getHeight(24, 24);
  return { x: 24, y: Math.max(h, SEA_LEVEL) + 5.4, z: 24 };
}

/** Animated menu sky. */
export class MainMenuSky {
  readonly root: HTMLDivElement;
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private sky: Sky | null = null;
  private materials: TerrainMaterials | null = null;
  private chunks: ChunkManager | null = null;
  private fallingLeaves: FallingLeaves | null = null;
  private view = { x: 0, y: 12, z: 0 };
  private running = false;
  private raf = 0;
  private last = 0;
  private onResize = (): void => this.resize();
  private ro: ResizeObserver | null = null;

  constructor(_opts: MainMenuSkyOptions = {}) {
    this.root = document.createElement('div');
    this.root.className = 'menu-sky-stack';
    this.root.setAttribute('aria-hidden', 'true');
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'menu-sky-canvas';
    this.root.append(this.canvas);
  }

  setCloudSpeed(_seconds: MainMenuSkySpeeds): void {
    /* in-game sky uses settings.clouds */
  }

  mount(host: HTMLElement): void {
    host.replaceChildren(this.root);
    this.disposeGl();

    const seed = loadLastWorld() ?? 'vythera';
    const worldOpts = loadWorldSettings(seed);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x6a9ec8, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 400);

    this.sky = new Sky(this.scene);
    this.sky.setTimeOfDay(MENU_TIME);
    this.sky.cloudCover = loadSettings().clouds;

    this.materials = new TerrainMaterials();
    const world = new WorldGen(seed, { terrain: worldOpts.terrain, caves: false });
    this.chunks = new ChunkManager(this.scene, world, this.materials, worldOpts.structures);
    this.chunks.setRenderDistance(5);

    this.view = pickView(world);
    this.camera.position.set(this.view.x, this.view.y, this.view.z);
    this.camera.lookAt(this.view.x + 28, this.view.y + 4, this.view.z - 72);
    this.sky.follow(this.view.x, this.view.z, this.view.y);

    this.chunks.bootstrapAt(this.view.x, this.view.z);
    for (let i = 0; i < 10; i++) this.chunks.updateAround(this.view.x, this.view.z, 8);
    this.fallingLeaves = new FallingLeaves(this.scene, this.chunks);

    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    window.addEventListener('resize', this.onResize);
    this.resize();
  }

  start(): void {
    this.running = true;
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose(): void {
    this.stop();
    this.ro?.disconnect();
    this.ro = null;
    window.removeEventListener('resize', this.onResize);
    this.disposeGl();
    this.root.remove();
  }

  private frame(dt: number): void {
    const sky = this.sky;
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    const chunks = this.chunks;
    const materials = this.materials;
    if (!sky || !renderer || !scene || !camera || !chunks || !materials) return;

    chunks.updateAround(this.view.x, this.view.z, 3);
    const biome = chunks.getBiomeAt(this.view.x, this.view.z);
    sky.setTimeOfDay(MENU_TIME);
    sky.update(dt, biome, 0);
    sky.setTimeOfDay(MENU_TIME);
    sky.follow(this.view.x, this.view.z, this.view.y);
    materials.update(dt, sky.sunDir, sky.timeOfDay, sky.fogColor, sky.fogDensity, 0);
    this.fallingLeaves?.update(dt, camera.position);
    renderer.render(scene, camera);
  }

  private resize(): void {
    const renderer = this.renderer;
    const camera = this.camera;
    if (!renderer || !camera) return;
    const parent = this.root.parentElement ?? this.root;
    let w = parent.clientWidth;
    let h = parent.clientHeight;
    if (w < 2 || h < 2) {
      w = window.innerWidth;
      h = window.innerHeight;
    }
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    const dpr = Math.min(window.devicePixelRatio || 1, isTouchDevice() ? 1.5 : 2);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  private disposeGl(): void {
    this.fallingLeaves?.dispose();
    this.fallingLeaves = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.sky = null;
    this.materials = null;
    this.chunks = null;
  }
}

export { MainMenuSky as TitleSky };
