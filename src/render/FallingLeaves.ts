import * as THREE from 'three';
import { Block } from '../world/blocks';
import type { ChunkManager } from '../world/ChunkManager';

type Flake = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rx: number;
  ry: number;
  rz: number;
  scale: number;
  spinX: number;
  spinY: number;
  life: number;
  maxLife: number;
};

const COUNT = 64;
const TINTS = [0x4cb85a, 0x6fd06a, 0x3a9a48, 0x9ec84a, 0xd4b45a, 0x58a86e];

function makeLeafTexture(): THREE.CanvasTexture {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const nx = (x - 7.5) / 7.5;
      const ny = (y - 7.5) / 8.5;
      const leaf = nx * nx * 0.85 + (ny + 0.15) * (ny + 0.15) * 1.15;
      const stem = Math.abs(x - 7.5) < 0.85 && y > 11;
      if (leaf > 1 && !stem) {
        d[i + 3] = 0;
        continue;
      }
      const vein = Math.abs(x - 7.5) < 1.1 && y > 3 && y < 13;
      const shade = ((x + y * 3) & 3) === 0 ? -18 : 0;
      d[i] = (vein ? 48 : 62) + shade;
      d[i + 1] = (vein ? 110 : 168) + shade;
      d[i + 2] = (vein ? 52 : 70) + shade;
      d[i + 3] = stem ? 220 : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Tiny leaf flakes that shed from canopies — unlit so they stay vivid day and night. */
export class FallingLeaves {
  readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private readonly flakes: Flake[] = [];
  private readonly leafTex: THREE.CanvasTexture;
  private spawnAcc = 0;
  private time = 0;
  private enabled = true;

  constructor(
    scene: THREE.Scene,
    private chunks: ChunkManager,
  ) {
    this.leafTex = makeLeafTexture();
    const geo = new THREE.PlaneGeometry(0.22, 0.16);
    const mat = new THREE.MeshBasicMaterial({
      map: this.leafTex,
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.2,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
      toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, COUNT);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);

    for (let i = 0; i < COUNT; i++) {
      this.flakes.push(this.deadFlake());
      this.hide(i);
      this.mesh.setColorAt(i, this.color.setHex(TINTS[0]!));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.mesh.visible = on;
  }

  update(dt: number, origin: THREE.Vector3): void {
    if (!this.enabled) return;
    this.time += dt;
    this.spawnAcc += dt;
    const want = 0.055;
    while (this.spawnAcc >= want) {
      this.spawnAcc -= want;
      this.trySpawn(origin);
    }

    const wind = Math.sin(this.time * 0.4) * 0.7;
    for (let i = 0; i < COUNT; i++) {
      const p = this.flakes[i]!;
      if (p.life <= 0) continue;
      p.life -= dt;
      p.vx += (wind - p.vx) * 0.4 * dt;
      p.vz += Math.sin(this.time * 1.2 + p.x * 0.4) * 0.9 * dt;
      p.vy -= 1.35 * dt;
      if (p.vy < -1.45) p.vy = -1.45;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.rx += p.spinX * dt;
      p.ry += p.spinY * dt;
      p.rz += p.spinX * 0.45 * dt;

      const gy = Math.floor(p.y);
      const below = this.chunks.getBlock(Math.floor(p.x), gy, Math.floor(p.z));
      const fade = Math.min(1, p.life * 2.2, (p.maxLife - p.life) * 3);
      if (p.life <= 0 || fade < 0.04 || (below !== Block.Air && below !== Block.Leaves && below !== Block.Water)) {
        p.life = 0;
        this.hide(i);
      } else {
        this.dummy.position.set(p.x, p.y, p.z);
        this.dummy.rotation.set(p.rx, p.ry, p.rz);
        this.dummy.scale.setScalar(p.scale * fade);
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(i, this.dummy.matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.leafTex.dispose();
  }

  private hide(i: number): void {
    this.dummy.scale.setScalar(0);
    this.dummy.position.set(0, -999, 0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
  }

  private trySpawn(origin: THREE.Vector3): void {
    const slot = this.flakes.findIndex((f) => f.life <= 0);
    if (slot < 0) return;

    for (let n = 0; n < 5; n++) {
      const x = origin.x + (Math.random() - 0.5) * 22;
      const z = origin.z + (Math.random() - 0.5) * 22;
      const yTop = Math.floor(origin.y + 2 + Math.random() * 10);
      for (let y = yTop; y >= origin.y; y -= 2) {
        if (this.chunks.getBlock(x, y, z) !== Block.Leaves) continue;
        if (this.chunks.getBlock(x, y - 1, z) === Block.Leaves && Math.random() < 0.28) continue;
        this.birth(
          slot,
          Math.floor(x) + 0.25 + Math.random() * 0.5,
          y - 0.12,
          Math.floor(z) + 0.25 + Math.random() * 0.5,
        );
        return;
      }
    }
  }

  private birth(i: number, x: number, y: number, z: number): void {
    const p = this.flakes[i]!;
    p.x = x;
    p.y = y;
    p.z = z;
    p.vx = (Math.random() - 0.5) * 0.55;
    p.vy = -0.2 - Math.random() * 0.3;
    p.vz = (Math.random() - 0.5) * 0.55;
    p.rx = Math.random() * Math.PI * 2;
    p.ry = Math.random() * Math.PI * 2;
    p.rz = Math.random() * Math.PI * 2;
    p.scale = 0.75 + Math.random() * 0.85;
    p.spinX = (Math.random() - 0.5) * 5;
    p.spinY = 1.4 + Math.random() * 3.2;
    p.maxLife = 5 + Math.random() * 4;
    p.life = p.maxLife;
    this.mesh.setColorAt(i, this.color.setHex(TINTS[(Math.random() * TINTS.length) | 0]!));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  private deadFlake(): Flake {
    return {
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      scale: 1,
      spinX: 0,
      spinY: 0,
      life: 0,
      maxLife: 1,
    };
  }
}
