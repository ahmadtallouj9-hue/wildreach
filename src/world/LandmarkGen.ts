import type { ColumnInfo } from './ColumnInfo';

export type LandmarkType = 'monolith' | 'ruin' | 'crystal' | 'overlook';

export interface Landmark {
  id: string;
  type: LandmarkType;
  name: string;
  wx: number;
  wy: number;
  wz: number;
  cx: number;
  cz: number;
}

/** Landmark stamps (ruin walls, crystal clusters) are disabled. */
export class LandmarkGen {
  apply(
    _cx: number,
    _cz: number,
    _voxels: Uint8Array,
    _columns: ColumnInfo[],
  ): Landmark | null {
    return null;
  }
}
