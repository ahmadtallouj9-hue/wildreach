import * as THREE from 'three';
import { Block } from '../world/blocks';
import type { LocalVoxelGrid } from './LocalVoxelGrid';
import type { TextureAtlasManager } from './TextureAtlasManager';

export interface VoxelFacePaintHit {
  matId: number;
  voxel: { x: number; y: number; z: number };
  /** Tile-local pixel 0…15 (top-left origin). */
  tx: number;
  ty: number;
  atlasU: number;
  atlasV: number;
  faceNormal: THREE.Vector3;
}

/**
 * Raycast visible voxel meshes and convert the hit triangle UV into an atlas tile pixel.
 */
export function raycastToTexturePixel(
  raycaster: THREE.Raycaster,
  meshes: THREE.Object3D[],
  grid: LocalVoxelGrid,
  atlas: TextureAtlasManager,
): VoxelFacePaintHit | null {
  const hits = raycaster.intersectObjects(meshes, false);
  const hit = hits[0];
  if (!hit?.uv || !hit.face) return null;

  const obj = hit.object as THREE.Mesh;
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  const local = hit.point.clone().applyMatrix4(inv);

  const n = hit.face.normal.clone().transformDirection(obj.matrixWorld).normalize();
  local.x -= n.x * 0.05;
  local.y -= n.y * 0.05;
  local.z -= n.z * 0.05;

  const x = Math.floor(local.x);
  const y = Math.floor(local.y);
  const z = Math.floor(local.z);
  const matId = grid.get(x, y, z);
  if (matId === Block.Air) return null;

  const { tx, ty } = atlas.atlasPixelFromHitUv(matId, hit.uv.x, hit.uv.y);
  return {
    matId,
    voxel: { x, y, z },
    tx,
    ty,
    atlasU: hit.uv.x,
    atlasV: hit.uv.y,
    faceNormal: n,
  };
}
