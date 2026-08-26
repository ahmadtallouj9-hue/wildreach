import * as THREE from 'three';
import { Block } from '../world/blocks';
import {
  boxFillCells,
  placeBlock,
  removeBlock,
  type EditorTool,
  type MirrorAxis,
} from './EditorTools';
import { applyFaceExtrude, type FaceNormal } from './FaceExtrude';
import { isEditorPaletteBlock } from './editorPalette';
import type { LocalVoxelGrid } from './LocalVoxelGrid';
import {
  brushTipCells,
  cellsForShape,
  isShapeGenTool,
} from './ShapeGenerators';
import { floodFill } from './ShapeOps';
import {
  cameraRayFromNdc,
  localVoxelRaycast,
  type LocalRayHit,
} from './localVoxelRaycast';

const REACH = 80;

export interface VoxelEditorPick {
  hit: LocalRayHit | null;
  ndcX: number;
  ndcY: number;
}

/**
 * Pointer-driven raycast + block edit for the local editor viewport.
 */
export class VoxelEditorInteraction {
  private selectedBlock = 1;
  private hoverHit: LocalRayHit | null = null;
  private bound = false;
  private enabled = true;
  private tool: EditorTool = 'brush';
  private mirror: MirrorAxis = 'none';
  private placeEmissive = false;
  private brushSize = 1;
  private dragging = false;
  private painting = false;
  private strokeSaved = false;
  /** MagicaVoxel box-fill: erase volume when true (RMB / Alt). */
  private dragErase = false;
  private dragStart: { x: number; y: number; z: number } | null = null;
  private dragEnd: { x: number; y: number; z: number } | null = null;
  private lastPaintKey = '';
  private activePointerId = -1;
  private onBeforeEdit: (() => void) | null = null;
  private onEyedrop: ((block: number) => void) | null = null;
  private onStampTex: ((block: number) => void) | null = null;
  private onTexPaint:
    | ((clientX: number, clientY: number, phase: 'down' | 'move' | 'up') => void)
    | null = null;
  private texPainting = false;

  constructor(
    private readonly grid: LocalVoxelGrid,
    private readonly canvas: HTMLCanvasElement,
    private readonly getCamera: () => THREE.Camera,
    private readonly onGridChange: () => void,
    private readonly onDragPreview?: (
      a: { x: number; y: number; z: number } | null,
      b: { x: number; y: number; z: number } | null,
    ) => void,
  ) {}

  setBeforeEdit(cb: (() => void) | null): void {
    this.onBeforeEdit = cb;
  }

  setEyedropHandler(cb: ((block: number) => void) | null): void {
    this.onEyedrop = cb;
  }

  setStampTexHandler(cb: ((block: number) => void) | null): void {
    this.onStampTex = cb;
  }

  setTexPaintHandler(
    cb: ((clientX: number, clientY: number, phase: 'down' | 'move' | 'up') => void) | null,
  ): void {
    this.onTexPaint = cb;
  }

  isBusy(): boolean {
    return this.dragging || this.painting || this.texPainting;
  }

  setSelectedBlock(block: number): void {
    if (!isEditorPaletteBlock(block)) return;
    this.selectedBlock = block;
  }

  getSelectedBlock(): number {
    return this.selectedBlock;
  }

  getHoverHit(): LocalRayHit | null {
    return this.hoverHit;
  }

  setTool(tool: EditorTool): void {
    this.tool = tool;
    this.cancelDrag();
    this.endPaint();
    this.endTexPaint();
  }

  getTool(): EditorTool {
    return this.tool;
  }

  setBrushSize(size: number): void {
    this.brushSize = Math.max(1, Math.min(5, size | 0));
  }

  getBrushSize(): number {
    return this.brushSize;
  }

  setMirrorAxis(axis: MirrorAxis): void {
    this.mirror = axis;
  }

  getMirrorAxis(): MirrorAxis {
    return this.mirror;
  }

  setPlaceEmissive(on: boolean): void {
    this.placeEmissive = on;
  }

  getPlaceEmissive(): boolean {
    return this.placeEmissive;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.hoverHit = null;
      this.cancelDrag();
      this.endPaint();
      this.endTexPaint();
    }
  }

  bind(): void {
    if (this.bound) return;
    this.bound = true;
    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.canvas.addEventListener('pointermove', this.onPointerMove);
    this.canvas.addEventListener('pointerup', this.onPointerUp);
    this.canvas.addEventListener('pointercancel', this.onPointerCancel);
    this.canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  unbind(): void {
    if (!this.bound) return;
    this.bound = false;
    this.canvas.removeEventListener('pointerdown', this.onPointerDown);
    this.canvas.removeEventListener('pointermove', this.onPointerMove);
    this.canvas.removeEventListener('pointerup', this.onPointerUp);
    this.canvas.removeEventListener('pointercancel', this.onPointerCancel);
    this.canvas.removeEventListener('pointerleave', this.onPointerLeave);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.hoverHit = null;
    this.cancelDrag();
    this.endPaint();
    this.endTexPaint();
  }

  pick(clientX: number, clientY: number): VoxelEditorPick {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      return { hit: null, ndcX: 0, ndcY: 0 };
    }
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const { origin, direction } = cameraRayFromNdc(this.getCamera(), ndcX, ndcY);
    const hit = localVoxelRaycast(origin, direction, REACH, (x, y, z) => this.grid.get(x, y, z));
    return { hit, ndcX, ndcY };
  }

  tryPlace(hit: LocalRayHit, block = this.selectedBlock, overwrite = false): boolean {
    if (!isEditorPaletteBlock(block)) return false;
    const { x, y, z } = this.placeCell(hit);
    return placeBlock(this.grid, x, y, z, block, this.placeEmissive, this.mirror, overwrite);
  }

  tryRemove(hit: LocalRayHit): boolean {
    if (hit.x === hit.px && hit.y === hit.py && hit.z === hit.pz) return false;
    if (this.grid.get(hit.x, hit.y, hit.z) === Block.Air) return false;
    return removeBlock(this.grid, hit.x, hit.y, hit.z, this.mirror);
  }

  private placeCell(hit: LocalRayHit): { x: number; y: number; z: number } {
    return { x: hit.px, y: hit.py, z: hit.pz };
  }

  private solidCell(hit: LocalRayHit): { x: number; y: number; z: number } {
    return { x: hit.x, y: hit.y, z: hit.z };
  }

  private isSolidHit(hit: LocalRayHit): boolean {
    return this.grid.get(hit.x, hit.y, hit.z) !== Block.Air;
  }

  /**
   * MagicaVoxel box/fill anchors: prefer the solid cell when starting on a
   * surface; otherwise the adjacent air placement cell.
   */
  private dragAnchor(hit: LocalRayHit): { x: number; y: number; z: number } {
    if (this.tool === 'fill' || this.tool === 'box') {
      return this.isSolidHit(hit) ? this.solidCell(hit) : this.placeCell(hit);
    }
    return this.placeCell(hit);
  }

  private cellKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }

  private beginStroke(): void {
    if (this.strokeSaved) return;
    this.onBeforeEdit?.();
    this.strokeSaved = true;
  }

  private capturePointer(e: PointerEvent): void {
    this.activePointerId = e.pointerId;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  private releasePointer(): void {
    if (this.activePointerId < 0) return;
    try {
      this.canvas.releasePointerCapture(this.activePointerId);
    } catch {
      /* ignore */
    }
    this.activePointerId = -1;
  }

  private cancelDrag(): void {
    this.dragging = false;
    this.dragErase = false;
    this.dragStart = null;
    this.dragEnd = null;
    this.strokeSaved = false;
    this.onDragPreview?.(null, null);
    if (!this.painting) this.releasePointer();
  }

  private endPaint(): void {
    this.painting = false;
    this.lastPaintKey = '';
    this.strokeSaved = false;
    if (!this.dragging && !this.texPainting) this.releasePointer();
  }

  private endTexPaint(): void {
    this.texPainting = false;
    if (!this.dragging && !this.painting) this.releasePointer();
  }

  /** MagicaVoxel 3D box drag-fill — places or erases the AABB once on release. */
  private applyBoxFill(
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
    erase: boolean,
  ): boolean {
    this.beginStroke();
    let changed = false;
    for (const c of boxFillCells(start, end)) {
      if (erase) {
        if (removeBlock(this.grid, c.x, c.y, c.z, this.mirror)) changed = true;
      } else if (
        placeBlock(
          this.grid,
          c.x,
          c.y,
          c.z,
          this.selectedBlock,
          this.placeEmissive,
          this.mirror,
          true,
        )
      ) {
        changed = true;
      }
    }
    return changed;
  }

  private applyShapeTool(
    start: { x: number; y: number; z: number },
    end: { x: number; y: number; z: number },
    erase: boolean,
  ): boolean {
    if (this.tool === 'fill' || this.tool === 'box') {
      return this.applyBoxFill(start, end, erase);
    }
    if (!isShapeGenTool(this.tool)) return false;
    this.beginStroke();
    let changed = false;
    const cells = cellsForShape(this.tool, start, end);
    for (const c of cells) {
      if (erase) {
        if (removeBlock(this.grid, c.x, c.y, c.z, this.mirror)) changed = true;
      } else if (
        placeBlock(
          this.grid,
          c.x,
          c.y,
          c.z,
          this.selectedBlock,
          this.placeEmissive,
          this.mirror,
          false,
        )
      ) {
        changed = true;
      }
    }
    return changed;
  }

  private applyExtrude(hit: LocalRayHit, mode: 'pull' | 'push'): boolean {
    if (!this.isSolidHit(hit)) return false;
    const normal = hit.face as FaceNormal;
    if (normal[0] === 0 && normal[1] === 0 && normal[2] === 0) return false;
    this.beginStroke();
    const n = applyFaceExtrude(
      this.grid,
      this.solidCell(hit),
      normal,
      mode,
      this.selectedBlock,
      this.placeEmissive,
    );
    return n > 0;
  }

  private paintBrush(hit: LocalRayHit | null, erase: boolean, overwrite: boolean): boolean {
    if (!hit) return false;
    const cell = erase || overwrite ? this.solidCell(hit) : this.placeCell(hit);
    if (erase || overwrite) {
      if (
        hit.x === hit.px &&
        hit.y === hit.py &&
        hit.z === hit.pz &&
        this.grid.get(hit.x, hit.y, hit.z) === Block.Air
      ) {
        return false;
      }
    }
    const key = this.cellKey(cell.x, cell.y, cell.z) + (erase ? 'e' : overwrite ? 'p' : 'b');
    if (key === this.lastPaintKey) return false;
    this.lastPaintKey = key;

    this.beginStroke();
    let changed = false;
    const tip = brushTipCells(cell.x, cell.y, cell.z, this.brushSize);
    for (const c of tip) {
      if (erase) {
        if (removeBlock(this.grid, c.x, c.y, c.z, this.mirror)) changed = true;
      } else if (
        placeBlock(
          this.grid,
          c.x,
          c.y,
          c.z,
          this.selectedBlock,
          this.placeEmissive,
          this.mirror,
          overwrite,
        )
      ) {
        changed = true;
      }
    }
    if (changed) this.onGridChange();
    return changed;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (e.button !== 0 && e.button !== 2) return;

    if (this.tool === 'texpaint' && e.button === 0) {
      this.texPainting = true;
      this.capturePointer(e);
      this.onTexPaint?.(e.clientX, e.clientY, 'down');
      e.preventDefault();
      return;
    }

    const { hit } = this.pick(e.clientX, e.clientY);
    if (!hit) return;

    // MagicaVoxel face extrude — LMB pull, RMB push/inset.
    if (this.tool === 'extrude') {
      const mode = e.button === 2 ? 'push' : 'pull';
      if (this.applyExtrude(hit, mode)) this.onGridChange();
      e.preventDefault();
      return;
    }

    // MagicaVoxel box-fill (Box tool) — LMB place volume, RMB erase volume.
    if ((this.tool === 'fill' || this.tool === 'box') && (e.button === 0 || e.button === 2)) {
      this.dragging = true;
      this.dragErase = e.button === 2 || e.altKey;
      this.strokeSaved = false;
      this.dragStart = this.dragAnchor(hit);
      this.dragEnd = this.dragStart;
      this.capturePointer(e);
      this.onDragPreview?.(this.dragStart, this.dragStart);
      e.preventDefault();
      return;
    }

    // Flood fill adjacent air / same-color region.
    if (this.tool === 'flood' && e.button === 0) {
      this.beginStroke();
      const air = this.grid.get(hit.px, hit.py, hit.pz) === Block.Air;
      const n = air
        ? floodFill(this.grid, hit.px, hit.py, hit.pz, this.selectedBlock, this.placeEmissive, 'air')
        : floodFill(this.grid, hit.x, hit.y, hit.z, this.selectedBlock, this.placeEmissive, 'same');
      if (n > 0) this.onGridChange();
      e.preventDefault();
      return;
    }

    if (e.button === 2 || this.tool === 'erase') {
      this.painting = true;
      this.lastPaintKey = '';
      this.strokeSaved = false;
      this.capturePointer(e);
      this.paintBrush(hit, true, false);
      e.preventDefault();
      return;
    }

    if (this.tool === 'eyedrop') {
      const id = this.grid.get(hit.x, hit.y, hit.z);
      if (id !== Block.Air && isEditorPaletteBlock(id)) this.onEyedrop?.(id);
      e.preventDefault();
      return;
    }

    if (this.tool === 'stamptex') {
      const id = this.grid.get(hit.x, hit.y, hit.z);
      if (id !== Block.Air && isEditorPaletteBlock(id)) this.onStampTex?.(id);
      e.preventDefault();
      return;
    }

    if (this.tool === 'brush' || this.tool === 'paint') {
      this.painting = true;
      this.lastPaintKey = '';
      this.strokeSaved = false;
      this.capturePointer(e);
      this.paintBrush(hit, false, this.tool === 'paint');
      e.preventDefault();
      return;
    }

    // Shape drag tools (line / box outline / sphere / …).
    this.dragging = true;
    this.dragErase = e.altKey;
    this.strokeSaved = false;
    this.dragStart = this.dragAnchor(hit);
    this.dragEnd = this.dragStart;
    this.capturePointer(e);
    this.onDragPreview?.(this.dragStart, this.dragStart);
    e.preventDefault();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (!this.enabled) {
      this.hoverHit = null;
      return;
    }
    const { hit } = this.pick(e.clientX, e.clientY);
    this.hoverHit = hit;

    if (this.painting && (e.buttons & 1 || e.buttons & 2)) {
      const erase = this.tool === 'erase' || !!(e.buttons & 2);
      this.paintBrush(hit, erase, this.tool === 'paint' && !erase);
      return;
    }

    if (this.texPainting && (e.buttons & 1)) {
      this.onTexPaint?.(e.clientX, e.clientY, 'move');
      return;
    }

    if (this.dragging && this.dragStart) {
      const end = hit ? this.dragAnchor(hit) : this.dragEnd;
      if (end) {
        this.dragEnd = end;
        this.onDragPreview?.(this.dragStart, end);
      }
    }
  };

  private finishDrag(clientX: number, clientY: number): void {
    const start = this.dragStart;
    const cachedEnd = this.dragEnd;
    const erase = this.dragErase;
    this.cancelDrag();
    if (!start) return;

    const { hit } = this.pick(clientX, clientY);
    const end = hit ? this.dragAnchor(hit) : cachedEnd;
    if (!end) return;
    // Mesh rebuild once on release — not during drag preview.
    if (this.applyShapeTool(start, end, erase)) this.onGridChange();
  }

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (this.texPainting && (e.button === 0 || e.button === -1)) {
      this.onTexPaint?.(e.clientX, e.clientY, 'up');
      this.endTexPaint();
      e.preventDefault();
      return;
    }
    if (this.painting && (e.button === 0 || e.button === 2 || e.button === -1)) {
      this.endPaint();
      e.preventDefault();
      return;
    }
    if (!this.dragging) return;
    this.finishDrag(e.clientX, e.clientY);
    e.preventDefault();
  };

  private readonly onPointerCancel = (e: PointerEvent): void => {
    if (this.texPainting) {
      this.onTexPaint?.(e.clientX, e.clientY, 'up');
      this.endTexPaint();
    }
    if (this.painting) this.endPaint();
    if (this.dragging) this.cancelDrag();
    void e;
  };

  private readonly onPointerLeave = (): void => {
    if (!this.painting && !this.dragging && !this.texPainting) this.hoverHit = null;
  };

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };
}
