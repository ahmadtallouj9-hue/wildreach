import type { WorldGen, WorldGenOptions } from '../WorldGen';
import type { ColumnInfo } from '../ColumnInfo';
import { CHUNK_HEIGHT, CHUNK_SIZE } from '../blocks';

/** Protocol shared between ChunkManager's GenWorkerClient and the generation worker. */
export interface GenRequest {
  t: 'gen';
  id: number;
  cx: number;
  cz: number;
}

export interface GenInit {
  t: 'init';
  seed: string;
  options: WorldGenOptions;
}

export type GenWorkerIn = GenInit | GenRequest;

export interface GenOk {
  t: 'gen-result';
  id: number;
  cx: number;
  cz: number;
  voxels: Uint8Array;
  columns: ColumnInfo[];
}

export interface GenErr {
  t: 'gen-error';
  id: number;
  error: string;
}

export type GenWorkerOut = GenOk | GenErr;

const VOL = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;

/**
 * Executes one generation request against a working WorldGen.
 * Shared by the Web Worker entry and the same-thread parity test — this is
 * the entire worker boundary: raw terrain fill only. Landmarks, player edits,
 * fluids, lighting and meshing stay on the main thread.
 */
export function handleGenRequest(world: WorldGen, req: GenRequest): GenOk {
  const voxels = new Uint8Array(VOL);
  const columns = world.fillChunk(req.cx, req.cz, voxels);
  return { t: 'gen-result', id: req.id, cx: req.cx, cz: req.cz, voxels, columns };
}
