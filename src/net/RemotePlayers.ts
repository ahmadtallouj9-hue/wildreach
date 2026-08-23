import * as THREE from 'three';
import type { PlayerStatePayload, ProfileWire } from './protocol';
import { PlayerAvatar, type AvatarPose } from '../player/PlayerAvatar';
import type { Profile } from '../ui/prefs';

export type MapPlayerMarker = {
  id: string;
  name: string;
  accent: string;
  x: number;
  z: number;
  yaw: number;
};

type RemoteEntry = {
  avatar: PlayerAvatar;
  target: PlayerStatePayload;
  prev: THREE.Vector3;
  name: string;
  accent: string;
};

export class RemotePlayers {
  readonly root = new THREE.Group();

  private players = new Map<string, RemoteEntry>();

  add(id: string, profile: ProfileWire, state: PlayerStatePayload & { name: string }): void {
    if (this.players.has(id)) return;
    const model = new PlayerAvatar();
    model.root.visible = true;
    model.applyProfile(profile as Profile);
    this.root.add(model.root);
    const entry: RemoteEntry = {
      avatar: model,
      target: { ...state },
      prev: new THREE.Vector3(state.x, state.y, state.z),
      name: state.name || profile.name || 'Wanderer',
      accent: profile.accent || '#5ec4b0',
    };
    entry.avatar.root.position.set(state.x, state.y, state.z);
    entry.avatar.root.rotation.y = state.yaw;
    this.players.set(id, entry);
  }

  remove(id: string): void {
    const entry = this.players.get(id);
    if (!entry) return;
    this.root.remove(entry.avatar.root);
    this.players.delete(id);
  }

  setState(id: string, state: PlayerStatePayload): void {
    const entry = this.players.get(id);
    if (!entry) return;
    entry.target = { ...state };
  }

  update(dt: number): void {
    for (const entry of this.players.values()) {
      const { avatar, target } = entry;
      const pos = avatar.root.position;
      const alpha = Math.min(1, dt * 12);
      pos.x += (target.x - pos.x) * alpha;
      pos.y += (target.y - pos.y) * alpha;
      pos.z += (target.z - pos.z) * alpha;
      avatar.root.rotation.y += (target.yaw - avatar.root.rotation.y) * alpha;

      const horiz = Math.hypot(pos.x - entry.prev.x, pos.z - entry.prev.z);
      const moveAmt = Math.min(1, horiz / Math.max(dt, 0.001) / 6);
      entry.prev.copy(pos);

      avatar.update(dt, moveAmt, target.onGround, 0, target.pose as AvatarPose, false);
    }
  }

  count(): number {
    return this.players.size;
  }

  /** Live positions for the sketch map. */
  getMapMarkers(): MapPlayerMarker[] {
    const out: MapPlayerMarker[] = [];
    for (const [id, entry] of this.players) {
      const pos = entry.avatar.root.position;
      out.push({
        id,
        name: entry.name,
        accent: entry.accent,
        x: pos.x,
        z: pos.z,
        yaw: entry.avatar.root.rotation.y,
      });
    }
    return out;
  }

  names(): string[] {
    return [...this.players.values()].map((e) => e.name);
  }

  clear(): void {
    for (const id of [...this.players.keys()]) this.remove(id);
  }
}
