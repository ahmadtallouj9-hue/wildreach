/**
 * VYTHERA generation worker entry (module worker).
 *
 * Receives an init message (seed + resolved WorldGen options), then answers
 * `gen` requests with terrain-filled voxel data. The voxel buffer is
 * transferred, not copied. Only the pure ChunkPipeline runs here — everything
 * that touches main-thread state (landmarks registry, saved edits, fluids,
 * lighting, meshes) is deliberately excluded.
 */
import { WorldGen } from '../WorldGen';
import { handleGenRequest, type GenWorkerIn, type GenWorkerOut } from './GenProtocol';

let world: WorldGen | null = null;

self.onmessage = (ev: MessageEvent<GenWorkerIn>) => {
  const msg = ev.data;
  if (msg.t === 'init') {
    try {
      world = new WorldGen(msg.seed, msg.options);
    } catch (err) {
      const res: GenWorkerOut = { t: 'gen-error', id: -1, error: `init failed: ${String(err)}` };
      self.postMessage(res);
    }
    return;
  }
  if (msg.t !== 'gen' || !world) return;
  try {
    const res = handleGenRequest(world, msg);
    (self as unknown as Worker).postMessage(res, [res.voxels.buffer]);
  } catch (err) {
    const res: GenWorkerOut = { t: 'gen-error', id: msg.id, error: String(err) };
    self.postMessage(res);
  }
};

export {};
