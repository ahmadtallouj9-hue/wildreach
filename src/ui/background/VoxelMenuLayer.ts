/**
 * Real voxel terrain layer for menu backgrounds — "lay of the land" overview shots.
 */
import * as THREE from 'three';
import { Sky } from '../../render/Sky';
import { TerrainMaterials } from '../../render/TerrainMaterials';
import { WorldGen } from '../../world/WorldGen';
import { ChunkManager } from '../../world/ChunkManager';
import { SEA_LEVEL } from '../../world/blocks';
import { BiomeId } from '../../world/Biomes';
import { loadSettings } from '../prefs';
import { isTouchDevice } from '../../util/isTouchDevice';
import { WORLD_TIME_VALUES, loadWorldSettings } from '../worldSettings';
import { loadLastWorld } from '../worldNames';
import type { VytheraBgPrefs } from './backgroundPrefs';
import type { VytheraBgContext } from './backgroundContext';

type Shot = {
  look: [number, number, number];
  eye: number;
  time: number;
  timeDrift: number;
  sway: number;
  distance: number;
  fov: number;
};

const SHOTS: Record<VytheraBgContext, Shot> = {
  home: {
    look: [96, 8, -140],
    eye: 22,
    time: WORLD_TIME_VALUES.day + 0.06,
    timeDrift: 0.012,
    sway: 0.55,
    distance: 6,
    fov: 58,
  },
  world: {
    look: [72, 4, -110],
    eye: 16,
    time: WORLD_TIME_VALUES.day + 0.03,
    timeDrift: 0.01,
    sway: 0.35,
    distance: 6,
    fov: 60,
  },
  loading: {
    look: [48, 10, -120],
    eye: 26,
    time: WORLD_TIME_VALUES.noon,
    timeDrift: 0.008,
    sway: 0.2,
    distance: 5,
    fov: 56,
  },
  hub: {
    look: [64, 12, -100],
    eye: 28,
    time: WORLD_TIME_VALUES.day,
    timeDrift: 0.008,
    sway: 0.3,
    distance: 5,
    fov: 58,
  },
  studio: {
    look: [40, 6, -80],
    eye: 14,
    time: WORLD_TIME_VALUES.sunset - 0.03,
    timeDrift: 0.005,
    sway: 0.18,
    distance: 4,
    fov: 54,
  },
  settings: {
    look: [32, 4, -70],
    eye: 12,
    time: WORLD_TIME_VALUES.day + 0.02,
    timeDrift: 0.004,
    sway: 0.12,
    distance: 4,
    fov: 52,
  },
  ai: {
    look: [80, 14, -130],
    eye: 30,
    time: WORLD_TIME_VALUES.day + 0.1,
    timeDrift: 0.01,
    sway: 0.28,
    distance: 5,
    fov: 56,
  },
  pause: {
    look: [56, 6, -90],
    eye: 18,
    time: WORLD_TIME_VALUES.day,
    timeDrift: 0,
    sway: 0,
    distance: 4,
    fov: 54,
  },
  customize: {
    look: [44, 6, -85],
    eye: 16,
    time: WORLD_TIME_VALUES.day + 0.04,
    timeDrift: 0.006,
    sway: 0.2,
    distance: 4,
    fov: 55,
  },
  multiplayer: {
    look: [68, 8, -105],
    eye: 20,
    time: WORLD_TIME_VALUES.day + 0.05,
    timeDrift: 0.009,
    sway: 0.25,
    distance: 5,
    fov: 58,
  },
};

function pickOverlook(world: WorldGen): { x: number; y: number; z: number } {
  const spots: Array<[number, number]> = [
    [48, 36],
    [72, 52],
    [24, 64],
    [96, 40],
    [60, 88],
  ];
  let best = { x: 48, y: SEA_LEVEL + 12, z: 36, score: -Infinity };
  for (const [x, z] of spots) {
    const h = world.getHeight(x, z);
    const bio = world.getBiome(x, z);
    const sample = world.sampleClimate(x, z);
    const score =
      h +
      sample.climate.ridgeStrength * 20 -
      Math.abs(h - (SEA_LEVEL + 18)) * 0.5 +
      (bio === BiomeId.Wetlands || bio === BiomeId.Forest ? 6 : 0);
    if (score > best.score) best = { x, y: h, z, score };
  }
  return { x: best.x, y: Math.max(best.y, SEA_LEVEL + 4), z: best.z };
}

export class VoxelMenuLayer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private sky: Sky | null = null;
  private materials: TerrainMaterials | null = null;
  private chunks: ChunkManager | null = null;
  private anchor = { x: 0, y: 12, z: 0 };
  private context: VytheraBgContext = 'home';
  private prefs: VytheraBgPrefs;
  private running = false;
  private raf = 0;
  private last = 0;
  private elapsed = 0;
  private motion = false;
  private onResize = (): void => this.resize();
  private ro: ResizeObserver | null = null;

  constructor(prefs: VytheraBgPrefs) {
    this.prefs = prefs;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'vy-world-bg__canvas vy-voxel-menu__canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
  }

  mount(container: HTMLElement): boolean {
    this.disposeGl();
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: this.prefs.mode !== 'performance',
        alpha: true,
        powerPreference: this.prefs.mode === 'performance' ? 'low-power' : 'high-performance',
        stencil: false,
      });
    } catch {
      return false;
    }

    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    const shot = SHOTS[this.context];
    this.camera = new THREE.PerspectiveCamera(shot.fov, 1, 0.1, 480);

    this.sky = new Sky(this.scene);
    // The pixel-art sky renders behind this canvas, so the dome would just
    // occlude it. Keep the Sky system for sun direction and fog colour.
    this.sky.setDomeVisible(false);
    this.sky.setTimeOfDay(shot.time);
    this.sky.cloudCover = loadSettings().clouds;

    this.materials = new TerrainMaterials();
    const seed = loadLastWorld() ?? 'vythera';
    const worldOpts = loadWorldSettings(seed);
    const world = new WorldGen(seed, { terrain: worldOpts.terrain, caves: false });
    this.chunks = new ChunkManager(this.scene, world, this.materials, false);
    const dist = this.prefs.mode === 'performance' ? 4 : shot.distance;
    this.chunks.setRenderDistance(dist);

    this.anchor = pickOverlook(world);
    this.poseCamera(0, shot);
    this.chunks.bootstrapAt(this.anchor.x, this.anchor.z);
    const boot = this.prefs.mode === 'performance' ? 5 : 10;
    for (let i = 0; i < boot; i++) this.chunks.updateAround(this.anchor.x, this.anchor.z, 8);

    container.appendChild(this.canvas);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    window.addEventListener('resize', this.onResize);
    this.resize();
    return true;
  }

  setContext(ctx: VytheraBgContext): void {
    this.context = ctx;
    this.applyShot(true);
  }

  setPrefs(prefs: VytheraBgPrefs, motion: boolean): void {
    this.prefs = prefs;
    this.motion = motion;
    if (this.sky) this.sky.cloudCover = loadSettings().clouds;
    this.applyShot(true);
  }

  start(): void {
    this.running = true;
    if (this.raf) return;
    this.last = performance.now();
    const tick = (now: number) => {
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
    this.canvas.remove();
  }

  private applyShot(forcePose: boolean): void {
    const shot = SHOTS[this.context];
    const camera = this.camera;
    const sky = this.sky;
    const chunks = this.chunks;
    if (!camera || !sky) return;
    camera.fov = shot.fov;
    camera.updateProjectionMatrix();
    sky.setTimeOfDay(shot.time);
    if (chunks) {
      const dist = this.prefs.mode === 'performance' ? 4 : shot.distance;
      chunks.setRenderDistance(dist);
    }
    if (forcePose) this.poseCamera(this.elapsed, shot);
  }

  private poseCamera(t: number, shot: Shot): void {
    const camera = this.camera;
    const sky = this.sky;
    if (!camera || !sky) return;
    const sway = this.motion ? shot.sway : 0;
    const ox = Math.sin(t * 0.06) * sway;
    const oy = Math.sin(t * 0.04 + 1.2) * sway * 0.22;
    const eyeY = this.anchor.y + shot.eye + oy;
    camera.position.set(this.anchor.x + ox, eyeY, this.anchor.z + ox * 0.35);
    camera.lookAt(
      this.anchor.x + shot.look[0] + ox * 0.15,
      this.anchor.y + shot.look[1] + oy * 0.3,
      this.anchor.z + shot.look[2],
    );
    const drift = this.motion ? Math.sin(t * 0.012) * shot.timeDrift : 0;
    sky.setTimeOfDay(shot.time + drift);
    sky.follow(camera.position.x, camera.position.z, camera.position.y);
  }

  private frame(dt: number): void {
    const sky = this.sky;
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    const chunks = this.chunks;
    const materials = this.materials;
    if (!sky || !renderer || !scene || !camera || !chunks || !materials) return;

    this.elapsed += dt;
    const shot = SHOTS[this.context];
    chunks.updateAround(this.anchor.x, this.anchor.z, this.prefs.mode === 'performance' ? 2 : 3);
    const biome = chunks.getBiomeAt(this.anchor.x, this.anchor.z);
    this.poseCamera(this.elapsed, shot);
    sky.update(dt, biome, 0);
    materials.update(dt, sky.sunDir, sky.timeOfDay, sky.fogColor, sky.fogDensity * 1.08, 0);
    renderer.render(scene, camera);
  }

  private resize(): void {
    const renderer = this.renderer;
    const camera = this.camera;
    if (!renderer || !camera) return;
    const parent = this.canvas.parentElement ?? this.canvas;
    let w = parent.clientWidth;
    let h = parent.clientHeight;
    if (w < 2 || h < 2) {
      w = window.innerWidth;
      h = window.innerHeight;
    }
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    const cap = this.prefs.mode === 'performance' ? 1.25 : isTouchDevice() ? 1.5 : 2;
    const dpr = Math.min(window.devicePixelRatio || 1, cap);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  private disposeGl(): void {
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.sky = null;
    this.materials = null;
    this.chunks = null;
  }
}
