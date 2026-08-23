import type {
  BlockEditWire,
  ClientMessage,
  ClientState,
  PlayerStatePayload,
  ProfileWire,
  ServerMessage,
  WorldSettingsWire,
} from './protocol';

export type NetLinkStatus = 'offline' | 'connecting' | 'connected' | 'reconnecting';

export type NetHandlers = {
  onWelcome?: (
    id: string,
    players: { id: string; profile: ProfileWire; snapshot: PlayerStatePayload & { name: string } }[],
    edits: BlockEditWire[],
    world: WorldSettingsWire,
  ) => void;
  onPlayerJoin?: (id: string, profile: ProfileWire, snapshot: PlayerStatePayload & { name: string }) => void;
  onPlayerLeave?: (id: string) => void;
  onPlayerState?: (id: string, state: PlayerStatePayload) => void;
  onBlockEdit?: (edit: BlockEditWire) => void;
  onChat?: (id: string, name: string, text: string) => void;
  onDisconnect?: () => void;
  onReconnecting?: () => void;
  onStatus?: (status: NetLinkStatus) => void;
};

type JoinParams = {
  room: string;
  seed: string;
  world: WorldSettingsWire;
  profile: ProfileWire;
};

export class NetClient {
  private ws: WebSocket | null = null;
  private id: string | null = null;
  private sendAcc = 0;
  private handlers: NetHandlers = {};
  private joinParams: JoinParams | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private intentionalClose = false;
  private linkStatus: NetLinkStatus = 'offline';

  constructor(private url: string) {}

  get playerId(): string | null {
    return this.id;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.linkStatus === 'connected';
  }

  get status(): NetLinkStatus {
    return this.linkStatus;
  }

  on(handlers: NetHandlers): void {
    this.handlers = { ...this.handlers, ...handlers };
  }

  connect(room: string, seed: string, world: WorldSettingsWire, profile: ProfileWire): void {
    this.intentionalClose = false;
    this.joinParams = { room, seed, world, profile };
    this.setStatus('connecting');
    this.openSocket();
  }

  disconnect(): void {
    this.intentionalClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ t: 'leave' });
    }
    this.ws?.close();
    this.ws = null;
    this.id = null;
    this.joinParams = null;
    this.reconnectAttempt = 0;
    this.setStatus('offline');
  }

  tickState(dt: number, state: ClientState): void {
    if (!this.connected) return;
    this.sendAcc += dt;
    if (this.sendAcc < 1 / 15) return;
    this.sendAcc = 0;
    this.send(state);
  }

  sendBlock(edit: BlockEditWire): void {
    if (!this.connected) return;
    this.send({ t: 'block', ...edit });
  }

  sendChat(text: string): void {
    if (!this.connected) return;
    const cleaned = text.replace(/[\u0000-\u001F\u007F]/g, '').trim().slice(0, 160);
    if (!cleaned) return;
    this.send({ t: 'chat', text: cleaned });
  }

  private setStatus(status: NetLinkStatus): void {
    if (this.linkStatus === status) return;
    this.linkStatus = status;
    this.handlers.onStatus?.(status);
  }

  private openSocket(): void {
    if (!this.joinParams) return;
    this.ws?.close();
    if (this.linkStatus !== 'reconnecting') this.setStatus('connecting');
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener('open', () => {
      this.reconnectAttempt = 0;
      const p = this.joinParams!;
      this.send({ t: 'join', room: p.room, seed: p.seed, world: p.world, profile: p.profile });
    });
    this.ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        this.handle(msg);
      } catch {
        /* ignore bad packets */
      }
    });
    this.ws.addEventListener('close', () => {
      this.id = null;
      this.handlers.onDisconnect?.();
      if (!this.intentionalClose && this.joinParams) this.scheduleReconnect();
      else if (this.intentionalClose) this.setStatus('offline');
      else this.setStatus('offline');
    });
    this.ws.addEventListener('error', () => {
      /* close handler runs reconnect */
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || !this.joinParams) return;
    this.setStatus('reconnecting');
    this.handlers.onReconnecting?.();
    const delay = Math.min(20_000, 800 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.joinParams && !this.intentionalClose) this.openSocket();
    }, delay);
  }

  private send(msg: ClientMessage): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  private handle(msg: ServerMessage): void {
    switch (msg.t) {
      case 'welcome':
        this.id = msg.id;
        this.setStatus('connected');
        this.handlers.onWelcome?.(
          msg.id,
          msg.players.map((p) => ({
            id: p.id,
            profile: p.profile,
            snapshot: {
              name: p.name,
              x: p.x,
              y: p.y,
              z: p.z,
              yaw: p.yaw,
              pitch: p.pitch,
              pose: p.pose,
              onGround: p.onGround,
            },
          })),
          msg.edits,
          msg.world,
        );
        break;
      case 'player_join':
        this.handlers.onPlayerJoin?.(msg.player.id, msg.player.profile, {
          name: msg.player.name,
          x: msg.player.x,
          y: msg.player.y,
          z: msg.player.z,
          yaw: msg.player.yaw,
          pitch: msg.player.pitch,
          pose: msg.player.pose,
          onGround: msg.player.onGround,
        });
        break;
      case 'player_leave':
        this.handlers.onPlayerLeave?.(msg.id);
        break;
      case 'state':
        this.handlers.onPlayerState?.(msg.id, {
          x: msg.x,
          y: msg.y,
          z: msg.z,
          yaw: msg.yaw,
          pitch: msg.pitch,
          pose: msg.pose,
          onGround: msg.onGround,
        });
        break;
      case 'block':
        this.handlers.onBlockEdit?.({ x: msg.x, y: msg.y, z: msg.z, block: msg.block });
        break;
      case 'chat':
        this.handlers.onChat?.(msg.id, msg.name, msg.text);
        break;
      default:
        break;
    }
  }
}
