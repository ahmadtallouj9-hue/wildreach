import type { Profile } from '../ui/prefs';
import type { TerrainType, WorldTime } from '../ui/worldSettings';

export type AvatarPoseWire = 'stand' | 'sneak' | 'sit';

export type WorldSettingsWire = {
  terrain: TerrainType;
  caves: boolean;
  structures: boolean;
  time: WorldTime;
  renderDistance: number;
};

export type ProfileWire = Pick<
  Profile,
  | 'name'
  | 'accent'
  | 'skin'
  | 'outfit'
  | 'pants'
  | 'hair'
  | 'eyes'
  | 'shoes'
  | 'style'
  | 'hat'
  | 'hairStyle'
  | 'face'
  | 'glasses'
  | 'facial'
  | 'sleeves'
  | 'cape'
> & { skinData?: string };

export type PlayerSnapshot = {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  pose: AvatarPoseWire;
  onGround: boolean;
};

export type BlockEditWire = {
  x: number;
  y: number;
  z: number;
  block: number;
};

export type ClientJoin = {
  t: 'join';
  room: string;
  seed: string;
  world: WorldSettingsWire;
  profile: ProfileWire;
};

export type PlayerStatePayload = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  pose: AvatarPoseWire;
  onGround: boolean;
};

export type ClientState = PlayerStatePayload & { t: 'state' };

export type ClientBlock = BlockEditWire & { t: 'block' };

export type ClientChat = { t: 'chat'; text: string };

export type ClientMessage = ClientJoin | ClientState | ClientBlock | ClientChat | { t: 'leave' };

export type ServerWelcome = {
  t: 'welcome';
  id: string;
  players: (PlayerSnapshot & { profile: ProfileWire })[];
  edits: BlockEditWire[];
  world: WorldSettingsWire;
};

export type ServerPlayerJoin = {
  t: 'player_join';
  player: PlayerSnapshot & { profile: ProfileWire };
};

export type ServerPlayerLeave = { t: 'player_leave'; id: string };

export type ServerState = { t: 'state'; id: string } & Omit<PlayerSnapshot, 'id' | 'name'>;

export type ServerBlock = BlockEditWire & { t: 'block' };

export type ServerChat = {
  t: 'chat';
  id: string;
  name: string;
  text: string;
};

export type ServerMessage =
  | ServerWelcome
  | ServerPlayerJoin
  | ServerPlayerLeave
  | ServerState
  | ServerBlock
  | ServerChat
  | { t: 'error'; msg: string };

export function editKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function mpUrl(): string {
  const env = import.meta.env.VITE_MP_URL as string | undefined;
  if (env) return env;
  // Production default: Render multiplayer / friends server
  if (typeof location !== 'undefined' && location.hostname.endsWith('vercel.app')) {
    return 'wss://wildreach-mp.onrender.com';
  }
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export function worldRoomId(
  seed: string,
  world: Pick<WorldSettingsWire, 'terrain' | 'caves' | 'structures' | 'time' | 'renderDistance'>,
): string {
  return `${seed.trim()}|${world.terrain}|${world.caves ? 1 : 0}|${world.structures ? 1 : 0}|${world.time}|${world.renderDistance}`;
}
