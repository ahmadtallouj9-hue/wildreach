import type { ProfileWire, WorldSettingsWire } from './protocol';
import type {
  FriendSummary,
  JoinRequestWire,
  SocialClientMessage,
  SocialJoinInvite,
  SocialServerMessage,
} from './socialProtocol';
import { getAccountId } from '../ui/account';

export type SocialHandlers = {
  onRegistered?: (code: string, friends: FriendSummary[]) => void;
  onFriends?: (friends: FriendSummary[]) => void;
  onJoinRequest?: (request: JoinRequestWire) => void;
  onJoinInvite?: (invite: SocialJoinInvite) => void;
  onToast?: (title: string, body?: string) => void;
  onError?: (msg: string) => void;
  onConnection?: (connected: boolean) => void;
};

export type PresencePayload = {
  inGame: boolean;
  seed?: string;
  room?: string;
  world?: WorldSettingsWire;
  worldName?: string;
};

export class SocialClient {
  private ws: WebSocket | null = null;
  private handlers: SocialHandlers = {};
  private profile: ProfileWire | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;
  private friends: FriendSummary[] = [];
  private myCode = '';
  private joinRequests: JoinRequestWire[] = [];

  constructor(private url: string) {}

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  get friendCode(): string {
    return this.myCode;
  }

  get friendList(): FriendSummary[] {
    return this.friends;
  }

  get incomingRequests(): JoinRequestWire[] {
    return this.joinRequests;
  }

  on(handlers: SocialHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  connect(profile: ProfileWire): void {
    this.profile = profile;
    this.intentionalClose = false;
    this.openSocket();
  }

  updateProfile(profile: ProfileWire): void {
    this.profile = profile;
    if (this.connected) this.send({ t: 'social_register', accountId: getAccountId(), profile });
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this.reconnectAttempt = 0;
    this.handlers.onConnection?.(false);
  }

  addFriend(code: string): void {
    this.send({ t: 'social_friend_add', code: code.replace(/\D/g, '').slice(0, 6) });
  }

  removeFriend(accountId: string): void {
    this.send({ t: 'social_friend_remove', accountId });
  }

  requestJoin(accountId: string): void {
    this.send({ t: 'social_join_request', to: accountId });
  }

  respondJoin(requestId: string, accept: boolean): void {
    this.send({ t: 'social_join_respond', requestId, accept });
    this.joinRequests = this.joinRequests.filter((r) => r.id !== requestId);
  }

  /** Invite an online friend into your current world. */
  inviteToWorld(accountId: string): void {
    this.send({ t: 'social_world_invite', to: accountId });
  }

  setPresence(presence: PresencePayload): void {
    this.send({ t: 'social_presence', ...presence });
  }

  private openSocket(): void {
    if (!this.profile) return;
    this.ws?.close();
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      this.handlers.onConnection?.(true);
      this.send({
        t: 'social_register',
        accountId: getAccountId(),
        profile: this.profile!,
      });
    });
    this.ws.addEventListener('message', (ev) => {
      try {
        this.handle(JSON.parse(String(ev.data)) as SocialServerMessage);
      } catch {
        /* ignore */
      }
    });
    this.ws.addEventListener('close', () => {
      this.handlers.onConnection?.(false);
      if (!this.intentionalClose && this.profile) this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    const delay = Math.min(20_000, 800 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.intentionalClose && this.profile) this.openSocket();
    }, delay);
  }

  private send(msg: SocialClientMessage): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  private handle(msg: SocialServerMessage): void {
    switch (msg.t) {
      case 'social_registered':
        this.myCode = msg.code;
        this.friends = msg.friends;
        this.handlers.onRegistered?.(msg.code, msg.friends);
        this.handlers.onFriends?.(msg.friends);
        break;
      case 'social_friends':
        this.friends = msg.friends;
        this.handlers.onFriends?.(msg.friends);
        break;
      case 'social_join_request_in':
        if (!this.joinRequests.some((r) => r.id === msg.request.id)) {
          this.joinRequests.push(msg.request);
        }
        this.handlers.onJoinRequest?.(msg.request);
        break;
      case 'social_join_invite':
        this.handlers.onJoinInvite?.(msg);
        break;
      case 'social_toast':
        this.handlers.onToast?.(msg.title, msg.body);
        break;
      case 'social_error':
        this.handlers.onError?.(msg.msg);
        break;
      default:
        break;
    }
  }
}
