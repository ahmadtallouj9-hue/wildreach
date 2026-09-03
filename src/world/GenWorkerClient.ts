import type { WorldGen } from './WorldGen';
import type { ColumnInfo } from './ColumnInfo';
import { CHUNK_HEIGHT, CHUNK_SIZE } from './blocks';
import type { GenWorkerIn, GenWorkerOut } from './gen/GenProtocol';

export interface GenFilled {
  cx: number;
  cz: number;
  voxels: Uint8Array;
  columns: ColumnInfo[];
}

interface PendingGen {
  resolve: (msg: GenWorkerOut) => void;
  reject: (err: Error) => void;
}

const VOL = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;

/**
 * Async raw-terrain filler for ChunkManager.
 *
 * Uses a dedicated module Worker when the platform provides one (browsers,
 * Vite dev and build both handle the `new URL(..., import.meta.url)` module-
 * worker pattern). In Worker-less environments — Node tests, old engines —
 * generation runs inline on the calling thread with identical semantics.
 * A worker error permanently falls back to inline generation, so scoring the
 * game as "worker-ready" is never a hard dependency.
 */
export class GenWorkerClient {
  /** True while answers come from a real Worker thread. */
  workerActive = false;

  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, PendingGen>();
  private world: WorldGen | null;

  constructor(world: WorldGen) {
    this.world = world;
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(
          new URL('./gen/generationWorker.ts', import.meta.url),
          { type: 'module' },
        );
        this.worker.onmessage = (ev: MessageEvent<GenWorkerOut>) => this.handleMessage(ev.data);
        this.worker.onerror = () => this.failWorker('worker error event');
        this.workerActive = true;
      } catch {
        this.worker = null;
      }
    }
    if (this.worker) {
      const init: GenWorkerIn = { t: 'init', seed: world.seed, options: world.workerOptions() };
      this.worker.postMessage(init);
    }
  }

  /** Terrain-filled block data for one chunk; rejects only after dispose(). */
  request(cx: number, cz: number): Promise<GenFilled> {
    if (!this.world) return Promise.reject(new Error('GenWorkerClient disposed'));
    if (!this.worker) return Promise.resolve(this.runInline(cx, cz));
    const id = this.nextId++;
    return new Promise<GenFilled>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (msg: GenWorkerOut) => {
          if (msg.t === 'gen-result') {
            resolve({ cx: msg.cx, cz: msg.cz, voxels: msg.voxels, columns: msg.columns });
          } else {
            reject(new Error(msg.error));
          }
        },
        reject,
      });
      const msg: GenWorkerIn = { t: 'gen', id, cx, cz };
      this.worker!.postMessage(msg);
    });
  }

  dispose(): void {
    for (const p of this.pending.values()) p.reject(new Error('GenWorkerClient disposed'));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.world = null;
    this.workerActive = false;
  }

  private handleMessage(msg: GenWorkerOut): void {
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    p.resolve(msg);
  }

  /** Worker died: reject in-flight, switch permanently to inline generation. */
  private failWorker(reason: string): void {
    for (const p of this.pending.values()) p.reject(new Error(`generation worker failed: ${reason}`));
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
    this.workerActive = false;
  }

  private runInline(cx: number, cz: number): GenFilled {
    const voxels = new Uint8Array(VOL);
    const columns = this.world!.fillChunk(cx, cz, voxels);
    return { cx, cz, voxels, columns };
  }
}
