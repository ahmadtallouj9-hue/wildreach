import { WebSocketServer, type WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import type {
  BlockEditWire,
  ClientMessage,
  ProfileWire,
  ServerMessage,
  WorldSettingsWire,
} from '../src/net/protocol.ts';
import { editKey } from '../src/net/protocol.ts';

const PORT = Number(process.env.PORT) || 8787;

type PlayerState = {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  pose: 'stand' | 'sneak' | 'sit';
  onGround: boolean;
  profile: ProfileWire;
  lastBlockAt: number;
};

type Room = {
  seed: string;
  world: WorldSettingsWire;
  players: Map<string, PlayerState>;
  edits: Map<string, number>;
  sockets: Map<string, WebSocket>;
};

const rooms = new Map<string, Room>();

function getRoom(id: string, seed: string, world: WorldSettingsWire): Room {
  let room = rooms.get(id);
  if (!room) {
    room = { seed, world, players: new Map(), edits: new Map(), sockets: new Map() };
    rooms.set(id, room);
  } else {
    room.world = world;
  }
  return room;
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: ServerMessage, except?: string): void {
  for (const [pid, ws] of room.sockets) {
    if (pid !== except) send(ws, msg);
  }
}

function broadcastAll(room: Room, msg: ServerMessage): void {
  for (const ws of room.sockets.values()) send(ws, msg);
}

function snapshot(p: PlayerState) {
  return {
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    z: p.z,
    yaw: p.yaw,
    pitch: p.pitch,
    pose: p.pose,
    onGround: p.onGround,
    profile: p.profile,
  };
}

function validateBlock(
  p: PlayerState,
  edit: BlockEditWire,
): boolean {
  if (edit.y < 0 || edit.y > 255) return false;
  if (edit.y === 0 && edit.block === 0) return false;
  const dx = edit.x + 0.5 - p.x;
  const dy = edit.y + 0.5 - p.y;
  const dz = edit.z + 0.5 - p.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist > 10) return false;
  const now = Date.now();
  if (now - p.lastBlockAt < 40) return false;
  p.lastBlockAt = now;
  return true;
}

const wss = new WebSocketServer({ port: PORT });
console.log(`Wildreach multiplayer on ws://0.0.0.0:${PORT}`);

wss.on('connection', (ws) => {
  let playerId: string | null = null;
  let roomId: string | null = null;

  ws.on('message', (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(String(raw)) as ClientMessage;
    } catch {
      return;
    }

    if (msg.t === 'leave') {
      ws.close();
      return;
    }

    if (msg.t === 'join') {
      playerId = randomUUID();
      roomId = msg.room || msg.seed;
      const room = getRoom(roomId, msg.seed, msg.world);
      const player: PlayerState = {
        id: playerId,
        name: msg.profile.name || 'Wanderer',
        x: 0,
        y: 80,
        z: 0,
        yaw: 0,
        pitch: 0,
        pose: 'stand',
        onGround: false,
        profile: msg.profile,
        lastBlockAt: 0,
      };
      room.players.set(playerId, player);
      room.sockets.set(playerId, ws);

      const others = [...room.players.values()]
        .filter((p) => p.id !== playerId)
        .map(snapshot);

      const edits: BlockEditWire[] = [...room.edits.entries()].map(([key, block]) => {
        const [x, y, z] = key.split(',').map(Number);
        return { x, y, z, block };
      });

      send(ws, {
        t: 'welcome',
        id: playerId,
        players: others,
        edits,
        world: room.world,
      });

      broadcast(room, { t: 'player_join', player: snapshot(player) }, playerId);
      return;
    }

    if (!playerId || !roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;

    if (msg.t === 'state') {
      player.x = msg.x;
      player.y = msg.y;
      player.z = msg.z;
      player.yaw = msg.yaw;
      player.pitch = msg.pitch;
      player.pose = msg.pose;
      player.onGround = msg.onGround;
      broadcast(
        room,
        {
          t: 'state',
          id: playerId,
          x: msg.x,
          y: msg.y,
          z: msg.z,
          yaw: msg.yaw,
          pitch: msg.pitch,
          pose: msg.pose,
          onGround: msg.onGround,
        },
        playerId,
      );
      return;
    }

    if (msg.t === 'block') {
      if (!validateBlock(player, msg)) return;
      room.edits.set(editKey(msg.x, msg.y, msg.z), msg.block);
      broadcastAll(room, { t: 'block', x: msg.x, y: msg.y, z: msg.z, block: msg.block });
    }
  });

  ws.on('close', () => {
    if (!playerId || !roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;
    room.players.delete(playerId);
    room.sockets.delete(playerId);
    broadcast(room, { t: 'player_leave', id: playerId });
    if (room.sockets.size === 0) rooms.delete(roomId);
  });
});
