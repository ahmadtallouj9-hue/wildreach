import type { ProfileWire, WorldSettingsWire } from './protocol';

export type FriendSummary = {
  accountId: string;
  code: string;
  profile: ProfileWire;
  online: boolean;
  inGame: boolean;
  worldName?: string;
  seed?: string;
};

export type JoinRequestWire = {
  id: string;
  from: FriendSummary;
};

export type SocialRegister = { t: 'social_register'; accountId: string; profile: ProfileWire };
export type SocialFriendAdd = { t: 'social_friend_add'; code: string };
export type SocialFriendRemove = { t: 'social_friend_remove'; accountId: string };
export type SocialPresence = {
  t: 'social_presence';
  inGame: boolean;
  seed?: string;
  room?: string;
  world?: WorldSettingsWire;
  worldName?: string;
};
export type SocialJoinRequest = { t: 'social_join_request'; to: string };
export type SocialJoinRespond = { t: 'social_join_respond'; requestId: string; accept: boolean };
/** Host invites an online friend into the host's current world. */
export type SocialWorldInvite = { t: 'social_world_invite'; to: string };

export type SocialClientMessage =
  | SocialRegister
  | SocialFriendAdd
  | SocialFriendRemove
  | SocialPresence
  | SocialJoinRequest
  | SocialJoinRespond
  | SocialWorldInvite;

export type SocialRegistered = {
  t: 'social_registered';
  accountId: string;
  code: string;
  friends: FriendSummary[];
};
export type SocialFriends = { t: 'social_friends'; friends: FriendSummary[] };
export type SocialJoinRequestIn = { t: 'social_join_request_in'; request: JoinRequestWire };
export type SocialJoinInvite = {
  t: 'social_join_invite';
  seed: string;
  room: string;
  world: WorldSettingsWire;
  worldName: string;
  hostName: string;
};
export type SocialToast = { t: 'social_toast'; title: string; body?: string };
export type SocialError = { t: 'social_error'; msg: string };

export type SocialServerMessage =
  | SocialRegistered
  | SocialFriends
  | SocialJoinRequestIn
  | SocialJoinInvite
  | SocialToast
  | SocialError;

const SOCIAL_CLIENT_TYPES = new Set<string>([
  'social_register',
  'social_friend_add',
  'social_friend_remove',
  'social_presence',
  'social_join_request',
  'social_join_respond',
  'social_world_invite',
]);

export function isSocialClientMessage(msg: { t?: string }): msg is SocialClientMessage {
  return typeof msg.t === 'string' && SOCIAL_CLIENT_TYPES.has(msg.t);
}

export function accountToCode(accountId: string): string {
  let h = 0;
  for (let i = 0; i < accountId.length; i++) {
    h = (Math.imul(31, h) + accountId.charCodeAt(i)) >>> 0;
  }
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += String(h % 10);
    h = Math.imul(h, 2654435761) >>> 0;
  }
  return code;
}
