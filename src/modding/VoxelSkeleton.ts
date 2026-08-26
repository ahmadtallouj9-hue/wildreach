import * as THREE from 'three';
import type { PartPose } from './ModAnimation';
import { identityQuat, type ModPart, type Quat, type Vec3 } from './ModAsset';

/** Runtime bone node derived from a ModPart (Blockbench-style hierarchy). */
export interface VoxelBone {
  id: string;
  name: string;
  /** Parent bone id, or null for roots. */
  parentId: string | null;
  /** Absolute grid-space pivot (rotation origin). */
  pivot: Vec3;
  /** Pivot relative to parent pivot (local bind offset). */
  localPivot: Vec3;
  /** Indices into the part/voxel mask for meshes attached to this bone. */
  partIndices: number[];
  parent: VoxelBone | null;
  children: VoxelBone[];
}

export interface VoxelSkeleton {
  bones: VoxelBone[];
  byId: Map<string, VoxelBone>;
  roots: VoxelBone[];
  /** Stable partId → parts[] index (for partMask). */
  indexById: Map<string, number>;
}

export function unitScale(): Vec3 {
  return { x: 1, y: 1, z: 1 };
}

/** Local pivot offset relative to parent (grid-space pivots). */
export function localPivotOffset(part: ModPart, parts: ModPart[]): Vec3 {
  const parent = part.parentId ? parts.find((p) => p.id === part.parentId) : undefined;
  if (!parent) return { x: part.pivot.x, y: part.pivot.y, z: part.pivot.z };
  return {
    x: part.pivot.x - parent.pivot.x,
    y: part.pivot.y - parent.pivot.y,
    z: part.pivot.z - parent.pivot.z,
  };
}

/**
 * Build a topologically sorted bone graph from ModParts.
 * Cycles / missing parents are detached to roots.
 */
export function buildVoxelSkeleton(parts: ModPart[]): VoxelSkeleton {
  const byId = new Map<string, VoxelBone>();
  const indexById = new Map<string, number>();

  parts.forEach((part, index) => {
    indexById.set(part.id, index);
    byId.set(part.id, {
      id: part.id,
      name: part.name,
      parentId: part.parentId && part.parentId !== part.id ? part.parentId : null,
      pivot: { ...part.pivot },
      localPivot: localPivotOffset(part, parts),
      partIndices: [index],
      parent: null,
      children: [],
    });
  });

  const roots: VoxelBone[] = [];
  for (const bone of byId.values()) {
    if (!bone.parentId || !byId.has(bone.parentId)) {
      bone.parentId = null;
      roots.push(bone);
      continue;
    }
    const parent = byId.get(bone.parentId)!;
    bone.parent = parent;
    parent.children.push(bone);
  }

  // Detect cycles: DFS; break edges that revisit a stack node.
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const breakCycle = (bone: VoxelBone): void => {
    if (visited.has(bone.id)) return;
    if (visiting.has(bone.id)) {
      if (bone.parent) {
        bone.parent.children = bone.parent.children.filter((c) => c.id !== bone.id);
        bone.parent = null;
        bone.parentId = null;
        if (!roots.includes(bone)) roots.push(bone);
      }
      return;
    }
    visiting.add(bone.id);
    for (const child of [...bone.children]) breakCycle(child);
    visiting.delete(bone.id);
    visited.add(bone.id);
  };
  for (const r of [...roots]) breakCycle(r);
  for (const bone of byId.values()) {
    if (!visited.has(bone.id)) breakCycle(bone);
  }

  // Topological order (parents before children).
  const bones: VoxelBone[] = [];
  const walk = (b: VoxelBone) => {
    bones.push(b);
    for (const c of b.children) walk(c);
  };
  for (const r of roots) walk(r);

  return { bones, byId, roots, indexById };
}

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scl = new THREE.Vector3();
const _pivotNeg = new THREE.Matrix4();
const _trs = new THREE.Matrix4();

/**
 * Local bone matrix with Blockbench pivot convention:
 *   T(localPivot + animPos) · R · S · T(-bindPivot)
 * Mesh vertices stay in absolute grid space; T(-bindPivot) orbits them
 * around the bone pivot before parent composition.
 */
export function composeBoneLocalMatrix(
  bone: VoxelBone,
  pose: PartPose,
  out = new THREE.Matrix4(),
): THREE.Matrix4 {
  const sx = pose.scale?.x ?? 1;
  const sy = pose.scale?.y ?? 1;
  const sz = pose.scale?.z ?? 1;
  _pos.set(
    bone.localPivot.x + pose.position.x,
    bone.localPivot.y + pose.position.y,
    bone.localPivot.z + pose.position.z,
  );
  _quat.set(pose.rotation.x, pose.rotation.y, pose.rotation.z, pose.rotation.w);
  _scl.set(sx, sy, sz);
  _trs.compose(_pos, _quat, _scl);
  _pivotNeg.makeTranslation(-bone.pivot.x, -bone.pivot.y, -bone.pivot.z);
  return out.copy(_trs).multiply(_pivotNeg);
}

/**
 * Same local TRS decomposed for THREE.Group hierarchy (editor path):
 * pivot Group = T(localPivot+pos) · R · S, model Group = T(-bindPivot).
 */
export function decomposeBoneLocalForGroups(
  bone: VoxelBone,
  pose: PartPose,
): {
  pivotPosition: Vec3;
  pivotRotation: Quat;
  pivotScale: Vec3;
  modelOffset: Vec3;
} {
  return {
    pivotPosition: {
      x: bone.localPivot.x + pose.position.x,
      y: bone.localPivot.y + pose.position.y,
      z: bone.localPivot.z + pose.position.z,
    },
    pivotRotation: { ...pose.rotation },
    pivotScale: {
      x: pose.scale?.x ?? 1,
      y: pose.scale?.y ?? 1,
      z: pose.scale?.z ?? 1,
    },
    modelOffset: { x: -bone.pivot.x, y: -bone.pivot.y, z: -bone.pivot.z },
  };
}

/**
 * Top-down world matrix evaluation (parent × local).
 * Use for in-game / headless paths that don't own a Three scene graph.
 */
export function evaluateWorldMatrices(
  skeleton: VoxelSkeleton,
  poses: Map<string, PartPose>,
  out = new Map<string, THREE.Matrix4>(),
): Map<string, THREE.Matrix4> {
  out.clear();
  const identity = identityQuat();
  const bind: PartPose = {
    position: { x: 0, y: 0, z: 0 },
    rotation: identity,
    scale: unitScale(),
  };

  for (const bone of skeleton.bones) {
    const pose = poses.get(bone.id) ?? bind;
    const local = composeBoneLocalMatrix(bone, pose, new THREE.Matrix4());
    if (bone.parent) {
      const parentWorld = out.get(bone.parent.id);
      out.set(
        bone.id,
        parentWorld
          ? new THREE.Matrix4().multiplyMatrices(parentWorld, local)
          : local,
      );
    } else {
      out.set(bone.id, local);
    }
  }
  return out;
}

/** Convenience: bind-pose local offset for a part (no animation). */
export function bindLocalOffset(part: ModPart, parts: ModPart[]): Vec3 {
  return localPivotOffset(part, parts);
}

/** Apply decomposed local TRS onto editor pivot/model groups. */
export function applyPoseToGroups(
  pivot: THREE.Object3D,
  model: THREE.Object3D,
  bone: VoxelBone,
  pose: PartPose,
): void {
  const d = decomposeBoneLocalForGroups(bone, pose);
  pivot.position.set(d.pivotPosition.x, d.pivotPosition.y, d.pivotPosition.z);
  pivot.quaternion.set(d.pivotRotation.x, d.pivotRotation.y, d.pivotRotation.z, d.pivotRotation.w);
  pivot.scale.set(d.pivotScale.x, d.pivotScale.y, d.pivotScale.z);
  model.position.set(d.modelOffset.x, d.modelOffset.y, d.modelOffset.z);
}
