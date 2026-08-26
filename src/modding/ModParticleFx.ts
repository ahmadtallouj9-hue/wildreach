import * as THREE from 'three';
import type { ParticleStyle } from './ModStudioAi';

interface Burst {
  points: THREE.Points;
  velocities: Float32Array;
  life: number;
  maxLife: number;
}

/** Lightweight particle FX for MOD workshop previews. */
export class ModParticleFx {
  readonly root = new THREE.Group();
  private bursts: Burst[] = [];
  private readonly geomPool: THREE.BufferGeometry[] = [];

  spawn(
    style: ParticleStyle,
    color: [number, number, number],
    origin: THREE.Vector3,
    count = 48,
  ): void {
    const n = Math.max(8, Math.min(120, count));
    const positions = new Float32Array(n * 3);
    const velocities = new Float32Array(n * 3);
    const cols = new Float32Array(n * 3);

    const spread =
      style === 'trail' ? 0.35 : style === 'smoke' ? 0.8 : style === 'burst' ? 1.4 : 0.9;
    const up =
      style === 'fire' || style === 'smoke' ? 2.2 : style === 'snow' ? -0.6 : 1.2;

    for (let i = 0; i < n; i++) {
      positions[i * 3] = origin.x + (Math.random() - 0.5) * 0.4;
      positions[i * 3 + 1] = origin.y + (Math.random() - 0.5) * 0.4;
      positions[i * 3 + 2] = origin.z + (Math.random() - 0.5) * 0.4;
      velocities[i * 3] = (Math.random() - 0.5) * spread * 4;
      velocities[i * 3 + 1] = Math.random() * up + 0.4;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * spread * 4;
      const flicker = 0.75 + Math.random() * 0.35;
      cols[i * 3] = color[0] * flicker;
      cols[i * 3 + 1] = color[1] * flicker;
      cols[i * 3 + 2] = color[2] * flicker;
      if (style === 'smoke') {
        cols[i * 3] = cols[i * 3 + 1] = cols[i * 3 + 2] = 0.45 + Math.random() * 0.2;
      }
      if (style === 'hearts') {
        cols[i * 3] = 0.95;
        cols[i * 3 + 1] = 0.35;
        cols[i * 3 + 2] = 0.5;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const mat = new THREE.PointsMaterial({
      size: style === 'snow' ? 0.18 : style === 'sparkle' ? 0.12 : 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    this.root.add(points);
    this.bursts.push({
      points,
      velocities,
      life: 0,
      maxLife: style === 'trail' ? 1.6 : style === 'smoke' ? 2.2 : 1.35,
    });
  }

  update(dt: number): void {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i]!;
      b.life += dt;
      const pos = b.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const damp = 1 - Math.min(0.95, dt * 1.8);
      for (let p = 0; p < arr.length; p += 3) {
        b.velocities[p]! *= damp;
        b.velocities[p + 1]! = b.velocities[p + 1]! * damp - dt * 1.6;
        b.velocities[p + 2]! *= damp;
        arr[p]! += b.velocities[p]! * dt;
        arr[p + 1]! += b.velocities[p + 1]! * dt;
        arr[p + 2]! += b.velocities[p + 2]! * dt;
      }
      pos.needsUpdate = true;
      const mat = b.points.material as THREE.PointsMaterial;
      mat.opacity = Math.max(0, 0.95 * (1 - b.life / b.maxLife));
      if (b.life >= b.maxLife) {
        this.root.remove(b.points);
        b.points.geometry.dispose();
        mat.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  clear(): void {
    for (const b of this.bursts) {
      this.root.remove(b.points);
      b.points.geometry.dispose();
      (b.points.material as THREE.Material).dispose();
    }
    this.bursts.length = 0;
    for (const g of this.geomPool) g.dispose();
    this.geomPool.length = 0;
  }

  dispose(): void {
    this.clear();
  }
}
