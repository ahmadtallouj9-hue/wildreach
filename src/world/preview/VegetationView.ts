/**
 * Instanced vegetation for the Custom World preview.
 *
 * Placement is not decided here. Every plant comes from the shared
 * VegetationPlacement rules that real chunk generation uses, so what a player
 * sees is the layout the generated world will actually have. This module only
 * turns those decisions into geometry.
 *
 * Plants are drawn at world scale — a tree is measured in gameplay blocks —
 * and are deliberately independent of terrain voxel size, so raising terrain
 * resolution refines the ground without shrinking the forest.
 *
 * Everything is instanced: one draw call per plant kind and species rather
 * than one object per plant, which is what keeps a few thousand trees cheap
 * enough to rebuild while a slider is moving.
 */
import * as THREE from 'three';
import { forEachPlant, type PlantKind, type PlantSite } from '../gen/VegetationPlacement';
import type { TerrainField } from './TerrainField';

export interface VegetationMetrics {
  trees: number;
  bushes: number;
  grass: number;
  flowers: number;
  rocks: number;
  total: number;
  /** Time spent deciding placement, i.e. sampling terrain and climate. */
  placeMs: number;
  /** Time spent building instanced meshes. */
  buildMs: number;
  drawCalls: number;
}

export const EMPTY_VEGETATION: VegetationMetrics = {
  trees: 0,
  bushes: 0,
  grass: 0,
  flowers: 0,
  rocks: 0,
  total: 0,
  placeMs: 0,
  buildMs: 0,
  drawCalls: 0,
};

/**
 * Ground cover is only legible close to the eye, so it is placed in a tight
 * radius while trees, bushes and rocks fill the wider scene. This is a
 * rendering budget, not a change to the rules: the same site would still hold
 * the same plant if the radius were larger.
 */
const TREE_RADIUS = 300;
const COVER_RADIUS = 110;

/** Hard ceilings so a density of 3 cannot exhaust memory on a weak machine. */
const LIMITS: Record<PlantKind, number> = {
  tree: 9000,
  bush: 9000,
  grass: 26000,
  flower: 14000,
  rock: 9000,
};

const TRUNK_COLOR = new THREE.Color(0.29, 0.19, 0.11);
const LEAF_COLORS: Record<string, THREE.Color> = {
  oak: new THREE.Color(0.24, 0.5, 0.24),
  birch: new THREE.Color(0.42, 0.62, 0.27),
  canopy: new THREE.Color(0.19, 0.45, 0.23),
  pine: new THREE.Color(0.15, 0.36, 0.24),
  jungle: new THREE.Color(0.16, 0.5, 0.21),
  willow: new THREE.Color(0.3, 0.53, 0.3),
  cactus: new THREE.Color(0.29, 0.5, 0.26),
};
const FLOWER_COLORS = [
  new THREE.Color(0.92, 0.86, 0.35),
  new THREE.Color(0.87, 0.4, 0.45),
  new THREE.Color(0.7, 0.55, 0.9),
  new THREE.Color(0.95, 0.95, 0.95),
];

interface Bucket {
  sites: PlantSite[];
  heights: number[];
}

function bucket(): Bucket {
  return { sites: [], heights: [] };
}

/**
 * Build the vegetation layer for a region.
 *
 * Yields between bands so a slider drag can cancel an obsolete pass, matching
 * how terrain tiles are built.
 */
export async function buildVegetation(
  field: TerrainField,
  origin: { x: number; z: number },
  blocks: number,
  anchor: THREE.Vector3,
  onProgress: (done: number, total: number) => void,
  token: { cancelled: boolean } = { cancelled: false },
): Promise<{ group: THREE.Group; metrics: VegetationMetrics } | null> {
  const group = new THREE.Group();
  const t0 = performance.now();

  const buckets: Record<PlantKind, Bucket> = {
    tree: bucket(),
    bush: bucket(),
    grass: bucket(),
    flower: bucket(),
    rock: bucket(),
  };

  // Restrict the lattice walk to the area that can actually be seen, clamped
  // to the preview region so plants never float outside the terrain.
  const minX = Math.max(origin.x, anchor.x - TREE_RADIUS);
  const maxX = Math.min(origin.x + blocks, anchor.x + TREE_RADIUS);
  const minZ = Math.max(origin.z, anchor.z - TREE_RADIUS);
  const maxZ = Math.min(origin.z + blocks, anchor.z + TREE_RADIUS);

  const bandHeight = 48;
  const bands = Math.max(1, Math.ceil((maxZ - minZ) / bandHeight));

  for (let band = 0; band < bands; band++) {
    const z0 = minZ + band * bandHeight;
    const zEnd = Math.min(maxZ, z0 + bandHeight);
    if (zEnd <= z0) continue;

    forEachPlant(
      minX,
      z0,
      Math.max(1, maxX - minX),
      field.vegetationSalt,
      0,
      (x, z) => {
        if (z < z0 || z >= zEnd) return null;
        const d = Math.hypot(x - anchor.x, z - anchor.z);
        if (d > TREE_RADIUS) return null;
        const height = field.heightAt(x, z);
        if (height <= field.seaLevel) return null;
        return {
          biome: field.biomeAt(x, z),
          climate: field.sampleClimate(x, z),
          height,
          slope: field.slopeAt(x, z, height),
          seaLevel: field.seaLevel,
          veg: field.vegetation,
        };
      },
      (site) => {
        const isCover = site.kind === 'grass' || site.kind === 'flower';
        if (isCover && Math.hypot(site.x - anchor.x, site.z - anchor.z) > COVER_RADIUS) return;
        const b = buckets[site.kind];
        if (b.sites.length >= LIMITS[site.kind]) return;
        b.sites.push(site);
        b.heights.push(field.heightAt(site.x, site.z));
      },
    );

    onProgress(band + 1, bands);
    await new Promise((res) => requestAnimationFrame(() => res(null)));
    if (token.cancelled) return null;
  }

  const placeMs = performance.now() - t0;
  const t1 = performance.now();

  addTrees(group, buckets.tree);
  addBushes(group, buckets.bush);
  addRocks(group, buckets.rock);
  addGrass(group, buckets.grass);
  addFlowers(group, buckets.flower);

  const buildMs = performance.now() - t1;

  let drawCalls = 0;
  group.traverse((o) => {
    if ((o as THREE.InstancedMesh).isInstancedMesh) drawCalls++;
  });

  const metrics: VegetationMetrics = {
    trees: buckets.tree.sites.length,
    bushes: buckets.bush.sites.length,
    grass: buckets.grass.sites.length,
    flowers: buckets.flower.sites.length,
    rocks: buckets.rock.sites.length,
    total:
      buckets.tree.sites.length +
      buckets.bush.sites.length +
      buckets.grass.sites.length +
      buckets.flower.sites.length +
      buckets.rock.sites.length,
    placeMs,
    buildMs,
    drawCalls,
  };

  return { group, metrics };
}

function instanced(
  geometry: THREE.BufferGeometry,
  count: number,
  transparent = false,
): THREE.InstancedMesh {
  const material = new THREE.MeshLambertMaterial({
    vertexColors: false,
    transparent,
    alphaTest: transparent ? 0.5 : 0,
    side: transparent ? THREE.DoubleSide : THREE.FrontSide,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  mesh.frustumCulled = false;
  return mesh;
}

const m4 = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const pos = new THREE.Vector3();
const scale = new THREE.Vector3();

function setInstance(
  mesh: THREE.InstancedMesh,
  i: number,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  yaw: number,
  color: THREE.Color,
): void {
  pos.set(x, y, z);
  quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  scale.set(sx, sy, sz);
  m4.compose(pos, quat, scale);
  mesh.setMatrixAt(i, m4);
  mesh.setColorAt(i, color);
}

function addTrees(group: THREE.Group, b: Bucket): void {
  if (!b.sites.length) return;

  // Trunks share one box; the canopy geometry differs per species silhouette,
  // so conifers read as cones and broadleaves as rounded crowns even at a
  // distance, which is most of what makes a forest legible from a hilltop.
  const trunks = instanced(new THREE.BoxGeometry(1, 1, 1), b.sites.length);
  const bySpecies = new Map<string, { sites: PlantSite[]; heights: number[] }>();

  for (let i = 0; i < b.sites.length; i++) {
    const s = b.sites[i]!;
    const h = b.heights[i]!;
    const trunkH = s.size;
    const width = s.treeKind === 'jungle' || s.treeKind === 'canopy' ? 0.9 : 0.65;
    setInstance(trunks, i, s.x + 0.5, h + trunkH / 2, s.z + 0.5, width, trunkH, width, 0, TRUNK_COLOR);
    let list = bySpecies.get(s.treeKind);
    if (!list) {
      list = { sites: [], heights: [] };
      bySpecies.set(s.treeKind, list);
    }
    list.sites.push(s);
    list.heights.push(h);
  }
  trunks.instanceMatrix.needsUpdate = true;
  group.add(trunks);

  for (const [kind, list] of bySpecies) {
    const conifer = kind === 'pine';
    const geo = conifer
      ? new THREE.ConeGeometry(1, 1, 7)
      : new THREE.IcosahedronGeometry(0.5, 0);
    const mesh = instanced(geo, list.sites.length);
    const base = LEAF_COLORS[kind] ?? LEAF_COLORS.oak!;

    for (let i = 0; i < list.sites.length; i++) {
      const s = list.sites[i]!;
      const h = list.heights[i]!;
      // Shade each crown slightly by its own roll so a forest is not a
      // single flat green.
      const tint = base.clone().multiplyScalar(0.82 + s.roll * 0.36);
      if (kind === 'cactus') {
        setInstance(mesh, i, s.x + 0.5, h + s.size * 0.5, s.z + 0.5, 0.9, s.size, 0.9, 0, tint);
        continue;
      }
      const crownR = conifer ? 2.1 : kind === 'jungle' ? 4 : kind === 'canopy' ? 3.4 : 2.6;
      const crownH = conifer ? s.size * 1.15 : crownR * 1.5;
      const cy = conifer ? h + s.size * 0.55 + crownH / 2 : h + s.size + crownH * 0.22;
      setInstance(
        mesh,
        i,
        s.x + 0.5,
        cy,
        s.z + 0.5,
        crownR * 2,
        crownH,
        crownR * 2,
        s.roll * Math.PI,
        tint,
      );
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
}

function addBushes(group: THREE.Group, b: Bucket): void {
  if (!b.sites.length) return;
  const mesh = instanced(new THREE.IcosahedronGeometry(0.5, 0), b.sites.length);
  for (let i = 0; i < b.sites.length; i++) {
    const s = b.sites[i]!;
    const h = b.heights[i]!;
    const r = 0.9 + s.roll * 0.9;
    const tint = (LEAF_COLORS[s.treeKind] ?? LEAF_COLORS.oak!)
      .clone()
      .multiplyScalar(0.75 + s.roll * 0.3);
    setInstance(mesh, i, s.x + 0.5, h + r * 0.4, s.z + 0.5, r, r * 0.8, r, s.roll * 3, tint);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

function addRocks(group: THREE.Group, b: Bucket): void {
  if (!b.sites.length) return;
  const mesh = instanced(new THREE.IcosahedronGeometry(0.5, 0), b.sites.length);
  for (let i = 0; i < b.sites.length; i++) {
    const s = b.sites[i]!;
    const h = b.heights[i]!;
    const r = 0.7 + s.size * 0.5 + s.roll * 0.8;
    const grey = 0.34 + s.roll * 0.22;
    setInstance(
      mesh,
      i,
      s.x + 0.5,
      h + r * 0.3,
      s.z + 0.5,
      r,
      r * 0.7,
      r * 0.9,
      s.roll * 5,
      new THREE.Color(grey, grey * 1.02, grey * 1.05),
    );
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

/** A crossed pair of quads reads as a tuft from any angle for two triangles. */
function coverGeometry(): THREE.BufferGeometry {
  const a = new THREE.PlaneGeometry(1, 1);
  a.translate(0, 0.5, 0);
  const b = new THREE.PlaneGeometry(1, 1);
  b.translate(0, 0.5, 0);
  b.rotateY(Math.PI / 2);
  const merged = new THREE.BufferGeometry();
  const posA = a.getAttribute('position').array as Float32Array;
  const posB = b.getAttribute('position').array as Float32Array;
  const positions = new Float32Array(posA.length + posB.length);
  positions.set(posA, 0);
  positions.set(posB, posA.length);
  const idxA = Array.from(a.getIndex()!.array);
  const idxB = Array.from(b.getIndex()!.array).map((v) => v + posA.length / 3);
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setIndex([...idxA, ...idxB]);
  merged.computeVertexNormals();
  a.dispose();
  b.dispose();
  return merged;
}

function addGrass(group: THREE.Group, b: Bucket): void {
  if (!b.sites.length) return;
  const mesh = instanced(coverGeometry(), b.sites.length, true);
  for (let i = 0; i < b.sites.length; i++) {
    const s = b.sites[i]!;
    const h = b.heights[i]!;
    const tall = 0.45 + s.roll * 0.5;
    const green = 0.4 + s.roll * 0.22;
    setInstance(
      mesh,
      i,
      s.x + 0.5,
      h,
      s.z + 0.5,
      0.8,
      tall,
      0.8,
      s.roll * Math.PI,
      new THREE.Color(green * 0.55, green, green * 0.42),
    );
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

function addFlowers(group: THREE.Group, b: Bucket): void {
  if (!b.sites.length) return;
  const mesh = instanced(coverGeometry(), b.sites.length, true);
  for (let i = 0; i < b.sites.length; i++) {
    const s = b.sites[i]!;
    const h = b.heights[i]!;
    const color = FLOWER_COLORS[Math.floor(s.roll * FLOWER_COLORS.length * 997) % FLOWER_COLORS.length]!;
    setInstance(mesh, i, s.x + 0.5, h, s.z + 0.5, 0.5, 0.55, 0.5, s.roll * Math.PI, color);
  }
  mesh.instanceMatrix.needsUpdate = true;
  group.add(mesh);
}

/** Release every geometry and material a vegetation group owns. */
export function disposeVegetation(group: THREE.Group): void {
  group.traverse((o) => {
    const mesh = o as THREE.InstancedMesh;
    if (!mesh.isInstancedMesh) return;
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  });
}
