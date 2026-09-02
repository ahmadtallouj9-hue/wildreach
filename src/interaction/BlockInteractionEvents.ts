import type { BlockFace } from './BlockRaycast';

export interface BlockTargetedEvent {
  blockId: number;
  pos: { x: number; y: number; z: number };
  face: BlockFace;
  distance: number;
}

export interface BlockBreakStartedEvent {
  blockId: number;
  pos: { x: number; y: number; z: number };
  toolId: number;
  totalTicks: number;
}

export interface BlockBreakProgressEvent {
  blockId: number;
  pos: { x: number; y: number; z: number };
  progress: number;
}

export interface BlockBrokenEvent {
  blockId: number;
  pos: { x: number; y: number; z: number };
  toolId: number;
  drops: { itemId: number; count: number }[];
}

export interface BlockPlacedEvent {
  blockId: number;
  pos: { x: number; y: number; z: number };
  face: BlockFace;
}

export interface BlockUsedEvent {
  blockId: number;
  pos: { x: number; y: number; z: number };
  action: string;
}

export type BlockInteractionEventMap = {
  targeted: BlockTargetedEvent | null;
  breakStarted: BlockBreakStartedEvent;
  breakProgress: BlockBreakProgressEvent;
  broken: BlockBrokenEvent;
  placed: BlockPlacedEvent;
  used: BlockUsedEvent;
};

export class BlockInteractionEventEmitter {
  private listeners = new Map<keyof BlockInteractionEventMap, Array<(e: any) => void>>();

  on<K extends keyof BlockInteractionEventMap>(event: K, cb: (e: BlockInteractionEventMap[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(cb);
    return () => this.off(event, cb);
  }

  off<K extends keyof BlockInteractionEventMap>(event: K, cb: (e: BlockInteractionEventMap[K]) => void): void {
    const list = this.listeners.get(event);
    if (!list) return;
    this.listeners.set(event, list.filter((fn) => fn !== cb));
  }

  emit<K extends keyof BlockInteractionEventMap>(event: K, data: BlockInteractionEventMap[K]): void {
    const list = this.listeners.get(event);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      list[i]!(data);
    }
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
