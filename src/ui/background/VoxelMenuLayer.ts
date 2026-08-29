/**
 * Real voxel terrain layer for menu backgrounds — cinematic overlook shots.
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
  /** Extra camera lift above the scenic ground point. */
  eye: number;
  time: number;
  timeDrift: number;
  sway: number;
  distance: number;
  fov: number;
};

/** Menu-only camera recipes. Home uses golden-hour cinematic framing. */
const SHOTS: Record<VytheraBgContext, Shot> = {
  home: {
    eye: 9,
    time: WORLD_TIME_VALUES.sunset - 0.08, // golden hour, not night
    timeDrift: 0.005,
    sway: 0.28,
    distance: 8,
    fov: 50,
  },
  world: {
    eye: 11,
    time: WORLD_TIME_VALUES.day + 0.04,
    timeDrift: 0.008,
    sway: 0.28,
    distance: 6,
    fov: 54,
  },
  loading: {
    eye: 14,
    time: WORLD_TIME_VALUES.day + 0.08,
    timeDrift: 0.005,
    sway: 0.18,
    distance: 6,
    fov: 52,
  },
  hub: {
    eye: 13,
    time: WORLD_TIME_VALUES.day + 0.02,
    timeDrift: 0.006,
    sway: 0.22,
    distance: 6,
    fov: 54,
  },
  studio: {
    eye: 10,
    time: WORLD_TIME_VALUES.sunset - 0.06,
    timeDrift: 0.004,
    sway: 0.14,
    distance: 5,
    fov: 52,
  },
  settings: {
    eye: 10,
    time: WORLD_TIME_VALUES.day + 0.05,
    timeDrift: 0.003,
    sway: 0.1,
    distance: 5,
    fov: 50,
  },
  ai: {
    eye: 14,
    time: WORLD_TIME_VALUES.day + 0.08,
    timeDrift: 0.007,
    sway: 0.2,
    distance: 6,
    fov: 52,
  },
  pause: {
    eye: 11,
    time: WORLD_TIME_VALUES.day,
    timeDrift: 0,
    sway: 0,
    distance: 5,
    fov: 52,
  },
  customize: {
    eye: 10,
    time: WORLD_TIME_VALUES.day + 0.05,
    timeDrift: 0.004,
    sway: 0.14,
    distance: 5,
    fov: 52,
  },
  multiplayer: {
    eye: 12,
    time: WORLD_TIME_VALUES.day + 0.04,
    timeDrift: 0.006,
    sway: 0.2,
    distance: 6,
    fov: 54,
  },
};

type ScenicView = {
  camX: number;
  camY: number;
  camZ: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  streamX: number;
  streamZ: number;
};

const FOREST = new Set<BiomeId>([
  BiomeId.Forest,
  BiomeId.DenseForest,
  BiomeId.BirchForest,
  BiomeId.Jungle,
  BiomeId.Taiga,
  BiomeId.SnowyTaiga,
]);

const WATERISH = new Set<BiomeId>([
  BiomeId.Ocean,
  BiomeId.DeepOcean,
  BiomeId.Beach,
  BiomeId.River,
]);

const LOOK_DIRS: Array<[number, number]> = [
  [90, -130],
  [120, -90],
  [50, -160],
  [-30, -150],
  [110, -110],
  [70, -180],
  [-70, -140],
  [140, -60],
];

/**
 * Scout the seeded world for a cinematic overlook: elevated camera looking
 * across relief toward water, forest, or a ridge — not dirt underfoot at spawn.
 */
function pickScenicView(world: WorldGen): ScenicView {
  let best: {
    score: number;
    x: number;
    z: number;
    h: number;
    tx: number;
    tz: number;
    th: number;
  } | null = null;

  // Stand on a mid-elevation hillside looking *out* toward peaks / coast —
  // not from a summit straight down onto a green carpet.
  const idealCamH = SEA_LEVEL + 18;
  for (let z = -300; z <= 300; z += 24) {
    for (let x = -300; x <= 300; x += 24) {
      const h = world.getHeight(x, z);
      if (h < SEA_LEVEL + 6 || h > SEA_LEVEL + 42) continue;
      const bio = world.getBiome(x, z);
      const forestHere = FOREST.has(bio);
      for (const [dx, dz] of LOOK_DIRS) {
        const tx = x + dx;
        const tz = z + dz;
        const th = world.getHeight(tx, tz);
        const tb = world.getBiome(tx, tz);
        const mx = (x + tx) >> 1;
        const mz = (z + tz) >> 1;
        const mid = world.getHeight(mx, mz);
        const midBio = world.getBiome(mx, mz);
        const waterAhead = th <= SEA_LEVEL + 2 || WATERISH.has(tb) || WATERISH.has(midBio);
        const forestMid = FOREST.has(midBio) || FOREST.has(tb);
        const peakAhead = Math.max(0, th - h, mid - h);
        const ridgeAhead = Math.max(0, mid - Math.min(h, th));
        const waterOnly = waterAhead && peakAhead < 6 && !forestMid;
        const score =
          peakAhead * 2.1 +
          ridgeAhead * 1.4 +
          (waterAhead && !waterOnly ? 26 : 0) +
          (forestHere ? 18 : 0) +
          (forestMid ? 16 : 0) +
          (tb === BiomeId.Mountains || tb === BiomeId.SnowyMountains ? 18 : 0) -
          Math.abs(h - idealCamH) * 0.7 -
          (waterOnly ? 28 : 0);
        if (!best || score > best.score) {
          best = { score, x, z, h, tx, tz, th };
        }
      }
    }
  }

  const pick = best ?? {
    score: 0,
    x: 56,
    z: 112,
    h: Math.max(world.getHeight(56, 112), SEA_LEVEL + 10),
    tx: 26,
    tz: -38,
    th: world.getHeight(26, -38),
  };

  const camY = Math.max(pick.h + 2, SEA_LEVEL + 12);
  // Aim ~55% along the scout ray, near subject height, for a readable horizon
  // under the title (terrain fills the lower/mid frame).
  const lookX = pick.x + (pick.tx - pick.x) * 0.55;
  const lookZ = pick.z + (pick.tz - pick.z) * 0.55;
  const midH = world.getHeight(Math.floor(lookX), Math.floor(lookZ));
  const subjectH = Math.max(midH, pick.th);
  const lookY = Math.max(
    Math.min(subjectH + 4, camY - 2),
    SEA_LEVEL + (subjectH <= SEA_LEVEL + 2 ? 4 : 10),
  );

  return {
    camX: pick.x + 0.5,
    camY,
    camZ: pick.z + 0.5,
    lookX: lookX + 0.5,
    lookY,
    lookZ: lookZ + 0.5,
    streamX: (pick.x + lookX) * 0.5,
    streamZ: (pick.z + lookZ) * 0.5,
  };
}

export class VoxelMenuLayer {
  readonly canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer | null = null;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private sky: Sky | null = null;
  private materials: TerrainMaterials | null = null;
  private chunks: ChunkManager | null = null;
  /** Camera stand point (elevated overlook). */
  private anchor = { x: 0, y: 12, z: 0 };
  /** Look-at target across the landscape (ridge / coast / forest). */
  private lookTarget = { x: 80, y: 20, z: -120 };
  /** Chunk streaming focus between camera and subject. */
  private streamAt = { x: 0, z: 0 };
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
    // Prefer the player's last world so the title screen feels like *their* land.
    const seed = loadLastWorld() ?? 'vythera';
    const worldOpts = loadWorldSettings(seed);
    const world = new WorldGen(seed, { terrain: worldOpts.terrain, caves: false });
    this.chunks = new ChunkManager(this.scene, world, this.materials, false);
    const dist = this.prefs.mode === 'performance' ? 4 : shot.distance;
    this.chunks.setRenderDistance(dist);

    const scenic = pickScenicView(world);
    this.anchor = { x: scenic.camX, y: scenic.camY, z: scenic.camZ };
    this.lookTarget = { x: scenic.lookX, y: scenic.lookY, z: scenic.lookZ };
    this.streamAt = { x: scenic.streamX, z: scenic.streamZ };
    this.poseCamera(0, shot);
    this.chunks.bootstrapAt(this.streamAt.x, this.streamAt.z);
    const boot = this.prefs.mode === 'performance' ? 8 : 18;
    for (let i = 0; i < boot; i++) {
      this.chunks.updateAround(this.streamAt.x, this.streamAt.z, 10);
      this.chunks.updateAround(this.anchor.x, this.anchor.z, 6);
      this.chunks.updateAround(this.lookTarget.x, this.lookTarget.z, 6);
    }

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
    // Slow idle drift only — no orbit spin.
    const ox = Math.sin(t * 0.045) * sway;
    const oy = Math.sin(t * 0.032 + 1.2) * sway * 0.2;
    const oz = Math.cos(t * 0.038 + 0.4) * sway * 0.35;
    const eyeY = this.anchor.y + shot.eye + oy;

    // Phone: bias the look target right so the left glass panel does not bury
    // the interesting ridge / water in the frame.
    const narrow = isTouchDevice() || (typeof window !== 'undefined' && window.innerWidth < 720);
    const sideBias = narrow ? 28 : 8;

    camera.position.set(this.anchor.x + ox, eyeY, this.anchor.z + oz);
    camera.lookAt(
      this.lookTarget.x + ox * 0.12 + sideBias,
      this.lookTarget.y + oy * 0.25,
      this.lookTarget.z,
    );
    const drift = this.motion ? Math.sin(t * 0.01) * shot.timeDrift : 0;
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
    const budget = this.prefs.mode === 'performance' ? 2 : 3;
    chunks.updateAround(this.streamAt.x, this.streamAt.z, budget);
    const biome = chunks.getBiomeAt(this.streamAt.x, this.streamAt.z);
    this.poseCamera(this.elapsed, shot);
    sky.update(dt, biome, 0);
    // Soft fog for depth; keep it readable (not black night).
    materials.update(dt, sky.sunDir, sky.timeOfDay, sky.fogColor, sky.fogDensity * 0.95, 0);
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
