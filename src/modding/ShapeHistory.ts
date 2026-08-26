import type { LocalVoxelGrid } from './LocalVoxelGrid';

interface Snap {
  v: Uint8Array;
  e: Uint8Array;
}

const MAX = 40;

/** Snapshot undo/redo for the 16³ shape grid. */
export class ShapeHistory {
  private undoStack: Snap[] = [];
  private redoStack: Snap[] = [];

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  push(grid: LocalVoxelGrid): void {
    this.undoStack.push({
      v: new Uint8Array(grid.voxels),
      e: new Uint8Array(grid.emissive),
    });
    if (this.undoStack.length > MAX) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(grid: LocalVoxelGrid): boolean {
    const snap = this.undoStack.pop();
    if (!snap) return false;
    this.redoStack.push({
      v: new Uint8Array(grid.voxels),
      e: new Uint8Array(grid.emissive),
    });
    grid.voxels.set(snap.v);
    grid.emissive.set(snap.e);
    grid.recount();
    return true;
  }

  redo(grid: LocalVoxelGrid): boolean {
    const snap = this.redoStack.pop();
    if (!snap) return false;
    this.undoStack.push({
      v: new Uint8Array(grid.voxels),
      e: new Uint8Array(grid.emissive),
    });
    grid.voxels.set(snap.v);
    grid.emissive.set(snap.e);
    grid.recount();
    return true;
  }
}
