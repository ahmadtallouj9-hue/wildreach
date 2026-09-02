import * as THREE from 'three';

export interface AttackSwungEvent {
  toolId: number;
  isCritical: boolean;
  direction: THREE.Vector3;
}

export interface AttackHitEvent {
  entityId: string;
  entityType: string;
  damage: number;
  knockback: number;
  toolId: number;
  isCritical: boolean;
  hitPosition: THREE.Vector3;
}

export interface AttackMissedEvent {
  toolId: number;
  direction: THREE.Vector3;
}

export type CombatEventMap = {
  swung: AttackSwungEvent;
  hit: AttackHitEvent;
  missed: AttackMissedEvent;
};

export class CombatEventEmitter {
  private listeners = new Map<keyof CombatEventMap, Array<(e: any) => void>>();

  on<K extends keyof CombatEventMap>(event: K, cb: (e: CombatEventMap[K]) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(cb);
    return () => this.off(event, cb);
  }

  off<K extends keyof CombatEventMap>(event: K, cb: (e: CombatEventMap[K]) => void): void {
    const list = this.listeners.get(event);
    if (!list) return;
    this.listeners.set(event, list.filter((fn) => fn !== cb));
  }

  emit<K extends keyof CombatEventMap>(event: K, data: CombatEventMap[K]): void {
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
