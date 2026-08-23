import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { WebSocket } from 'ws';
import type { ProfileWire, WorldSettingsWire } from '../src/net/protocol.ts';
import {
  accountToCode,
  type FriendSummary,
  type JoinRequestWire,
  type SocialClientMessage,
  type SocialServerMessage,
} from '../src/net/socialProtocol.ts';

type Presence = {
  inGame: boolean;
  seed?: string;
  room?: string;
  world?: WorldSettingsWire;
  worldName?: string;
};

type Account = {
  id: string;
  code: string;
  profile: ProfileWire;
  friends: Set<string>;
  presence: Presence;
};

type JoinRequest = {
  id: string;
  from: string;
  to: string;
  at: number;
};

type StoredAccount = {
  id: string;
  code: string;
  profile: ProfileWire;
  friends: string[];
};

const DATA_FILE = process.env.SOCIAL_DATA_PATH || join(process.cwd(), 'data', 'social.json');

const accounts = new Map<string, Account>();
const codeIndex = new Map<string, string>();
const sockets = new Map<string, WebSocket>();
const wsAccount = new WeakMap<WebSocket, string>();
const joinRequests = new Map<string, JoinRequest>();

function send(ws: WebSocket, msg: SocialServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function uniqueCodeFor(id: string): string {
  let code = accountToCode(id);
  let n = 0;
  while (codeIndex.has(code) && codeIndex.get(code) !== id) {
    n += 1;
    code = accountToCode(`${id}:${n}`);
  }
  return code;
}

function loadStore(): void {
  try {
    if (!existsSync(DATA_FILE)) return;
    const raw = JSON.parse(readFileSync(DATA_FILE, 'utf8')) as { accounts?: StoredAccount[] };
    for (const row of raw.accounts ?? []) {
      if (!row?.id || !row?.code) continue;
      const acc: Account = {
        id: row.id,
        code: row.code,
        profile: row.profile,
        friends: new Set(row.friends ?? []),
        presence: { inGame: false },
      };
      accounts.set(acc.id, acc);
      codeIndex.set(acc.code, acc.id);
    }
    console.log(`Social: loaded ${accounts.size} accounts from disk`);
  } catch (err) {
    console.warn('Social: failed to load store', err);
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleSave(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      mkdirSync(dirname(DATA_FILE), { recursive: true });
      const payload = {
        accounts: [...accounts.values()].map((a) => ({
          id: a.id,
          code: a.code,
          profile: a.profile,
          friends: [...a.friends],
        })),
      };
      writeFileSync(DATA_FILE, JSON.stringify(payload));
    } catch (err) {
      console.warn('Social: failed to save store', err);
    }
  }, 250);
}

loadStore();

function getOrCreateAccount(id: string, profile: ProfileWire): Account {
  let acc = accounts.get(id);
  if (!acc) {
    const code = uniqueCodeFor(id);
    acc = {
      id,
      code,
      profile,
      friends: new Set(),
      presence: { inGame: false },
    };
    accounts.set(id, acc);
    codeIndex.set(code, id);
    scheduleSave();
  } else {
    acc.profile = profile;
    // Keep existing code; re-index in case store was partial.
    codeIndex.set(acc.code, id);
  }
  return acc;
}

function friendSummary(acc: Account): FriendSummary {
  const online = sockets.has(acc.id);
  return {
    accountId: acc.id,
    code: acc.code,
    profile: acc.profile,
    online,
    inGame: online && acc.presence.inGame,
    worldName: acc.presence.worldName,
    seed: acc.presence.seed,
  };
}

function friendsFor(accountId: string): FriendSummary[] {
  const acc = accounts.get(accountId);
  if (!acc) return [];
  return [...acc.friends]
    .map((fid) => accounts.get(fid))
    .filter((a): a is Account => !!a)
    .map(friendSummary);
}

function pushFriends(accountId: string): void {
  const ws = sockets.get(accountId);
  if (!ws) return;
  send(ws, { t: 'social_friends', friends: friendsFor(accountId) });
}

function notifyFriendsOf(accountId: string): void {
  const acc = accounts.get(accountId);
  if (!acc) return;
  for (const fid of acc.friends) pushFriends(fid);
  pushFriends(accountId);
}

export function handleSocialMessage(ws: WebSocket, raw: SocialClientMessage): boolean {
  if (raw.t === 'social_register') {
    const accountId = String(raw.accountId ?? '').trim();
    if (!accountId || accountId.length < 8) {
      send(ws, { t: 'social_error', msg: 'Invalid account' });
      return true;
    }
    const acc = getOrCreateAccount(accountId, raw.profile);
    const prev = sockets.get(accountId);
    if (prev && prev !== ws) prev.close();
    sockets.set(accountId, ws);
    wsAccount.set(ws, accountId);
    send(ws, {
      t: 'social_registered',
      accountId: acc.id,
      code: acc.code,
      friends: friendsFor(accountId),
    });
    notifyFriendsOf(accountId);
    scheduleSave();
    return true;
  }

  const accountId = wsAccount.get(ws);
  if (!accountId) {
    send(ws, { t: 'social_error', msg: 'Register first' });
    return true;
  }
  const self = accounts.get(accountId);
  if (!self) return true;

  if (raw.t === 'social_friend_add') {
    const code = String(raw.code ?? '')
      .replace(/\D/g, '')
      .slice(0, 6);
    if (code.length !== 6) {
      send(ws, { t: 'social_error', msg: 'Enter a 6-digit friend code' });
      return true;
    }
    const targetId = codeIndex.get(code);
    if (!targetId) {
      send(ws, {
        t: 'social_error',
        msg: 'No player with that code. They must open Wildreach once while online.',
      });
      return true;
    }
    if (targetId === accountId) {
      send(ws, { t: 'social_error', msg: 'That is your own code' });
      return true;
    }
    if (self.friends.has(targetId)) {
      send(ws, { t: 'social_toast', title: 'Already friends', body: accounts.get(targetId)?.profile.name });
      return true;
    }
    self.friends.add(targetId);
    const target = accounts.get(targetId);
    if (target) target.friends.add(accountId);
    notifyFriendsOf(accountId);
    notifyFriendsOf(targetId);
    scheduleSave();
    send(ws, {
      t: 'social_toast',
      title: 'Friend added',
      body: target?.profile.name ?? 'Player',
    });
    const targetWs = sockets.get(targetId);
    if (targetWs) {
      send(targetWs, {
        t: 'social_toast',
        title: 'New friend',
        body: self.profile.name ?? 'Player',
      });
    }
    return true;
  }

  if (raw.t === 'social_friend_remove') {
    const fid = String(raw.accountId ?? '').trim();
    self.friends.delete(fid);
    accounts.get(fid)?.friends.delete(accountId);
    notifyFriendsOf(accountId);
    notifyFriendsOf(fid);
    scheduleSave();
    return true;
  }

  if (raw.t === 'social_presence') {
    self.presence = {
      inGame: !!raw.inGame,
      seed: raw.seed,
      room: raw.room,
      world: raw.world,
      worldName: raw.worldName,
    };
    notifyFriendsOf(accountId);
    return true;
  }

  if (raw.t === 'social_join_request') {
    const to = String(raw.to ?? '').trim();
    if (!self.friends.has(to)) {
      send(ws, { t: 'social_error', msg: 'Not on your friend list' });
      return true;
    }
    const host = accounts.get(to);
    if (!host?.presence.inGame || !host.presence.seed || !host.presence.room || !host.presence.world) {
      send(ws, { t: 'social_error', msg: 'Friend is not in a world right now' });
      return true;
    }
    const requestId = randomUUID();
    joinRequests.set(requestId, { id: requestId, from: accountId, to, at: Date.now() });
    const hostWs = sockets.get(to);
    if (hostWs) {
      send(hostWs, {
        t: 'social_join_request_in',
        request: { id: requestId, from: friendSummary(self) },
      });
    }
    send(ws, { t: 'social_toast', title: 'Request sent', body: host.profile.name ?? 'Friend' });
    return true;
  }

  if (raw.t === 'social_join_respond') {
    const req = joinRequests.get(raw.requestId);
    if (!req || req.to !== accountId) {
      send(ws, { t: 'social_error', msg: 'Request not found' });
      return true;
    }
    joinRequests.delete(raw.requestId);
    const guest = accounts.get(req.from);
    const guestWs = sockets.get(req.from);
    if (!guest || !guestWs) return true;

    if (!raw.accept) {
      send(guestWs, {
        t: 'social_toast',
        title: 'Request declined',
        body: self.profile.name ?? 'Host',
      });
      return true;
    }

    if (!self.presence.inGame || !self.presence.seed || !self.presence.room || !self.presence.world) {
      send(guestWs, { t: 'social_error', msg: 'Host left the world' });
      return true;
    }

    send(guestWs, {
      t: 'social_join_invite',
      seed: self.presence.seed,
      room: self.presence.room,
      world: self.presence.world,
      worldName: self.presence.worldName ?? self.presence.seed,
      hostName: self.profile.name ?? 'Friend',
    });
    send(ws, { t: 'social_toast', title: 'Invite sent', body: guest.profile.name ?? 'Friend' });
    return true;
  }

  if (raw.t === 'social_world_invite') {
    const to = String(raw.to ?? '').trim();
    if (!self.friends.has(to)) {
      send(ws, { t: 'social_error', msg: 'Not on your friend list' });
      return true;
    }
    if (!self.presence.inGame || !self.presence.seed || !self.presence.room || !self.presence.world) {
      send(ws, { t: 'social_error', msg: 'Enter a world before inviting' });
      return true;
    }
    const guest = accounts.get(to);
    const guestWs = sockets.get(to);
    if (!guest || !guestWs) {
      send(ws, { t: 'social_error', msg: 'Friend is offline' });
      return true;
    }
    send(guestWs, {
      t: 'social_join_invite',
      seed: self.presence.seed,
      room: self.presence.room,
      world: self.presence.world,
      worldName: self.presence.worldName ?? self.presence.seed,
      hostName: self.profile.name ?? 'Friend',
    });
    send(ws, { t: 'social_toast', title: 'Invite sent', body: guest.profile.name ?? 'Friend' });
    send(guestWs, {
      t: 'social_toast',
      title: 'World invite',
      body: `${self.profile.name ?? 'Friend'} invited you`,
    });
    return true;
  }

  return false;
}

export function handleSocialClose(ws: WebSocket): void {
  const accountId = wsAccount.get(ws);
  if (!accountId) return;
  if (sockets.get(accountId) === ws) sockets.delete(accountId);
  const acc = accounts.get(accountId);
  if (acc) {
    acc.presence = { inGame: false };
    notifyFriendsOf(accountId);
  }
  wsAccount.delete(ws);
}

export function pendingJoinRequestsFor(accountId: string): JoinRequestWire[] {
  const out: JoinRequestWire[] = [];
  for (const req of joinRequests.values()) {
    if (req.to !== accountId) continue;
    const from = accounts.get(req.from);
    if (!from) continue;
    out.push({ id: req.id, from: friendSummary(from) });
  }
  return out;
}
