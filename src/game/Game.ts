import * as THREE from 'three';
import { WorldGen } from '../world/WorldGen';
import { formatGenDebug, parseGenDebugMode, type GenDebugMode } from '../world/gen/GenDebug';
import { ChunkManager } from '../world/ChunkManager';
import { PlayerController } from '../player/PlayerController';
import { BlockInteraction } from '../player/BlockInteraction';
import { Inventory } from '../player/Inventory';
import { Sky } from '../render/Sky';
import { TerrainMaterials } from '../render/TerrainMaterials';
import { PostFX } from '../render/PostFX';
import { FallingLeaves } from '../render/FallingLeaves';
import { WanderMob } from '../entity/WanderMob';
import { DiscoverySystem } from '../discovery/DiscoverySystem';
import { Hud } from '../ui/Hud';
import { InventoryUi } from '../ui/InventoryUi';
import { TouchControls } from '../ui/TouchControls';
import { ChatUi } from '../ui/ChatUi';
import { PauseMenu } from '../ui/PauseMenu';
import { NetClient, type NetLinkStatus } from '../net/NetClient';
import { RemotePlayers } from '../net/RemotePlayers';
import type { SocialClient } from '../net/SocialClient';
import { mpUrl, worldRoomId, type ProfileWire } from '../net/protocol';
import { loadProfile, loadSettings, type Profile, type Settings } from '../ui/prefs';
import { loadWorldSettings, WORLD_TIME_VALUES, type WorldSettings } from '../ui/worldSettings';
import { worldNameFromSeed } from '../ui/worldNames';
import { isTouchDevice } from '../util/isTouchDevice';
import { applyHudLayout, HudLayoutEditor, loadHudLayout } from '../ui/HudLayout';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private world: WorldGen;
  private materials: TerrainMaterials;
  private chunks: ChunkManager;
  private player: PlayerController;
  private inventory: Inventory;
  private inventoryUi: InventoryUi;
  private chatUi: ChatUi;
  private pauseMenu: PauseMenu;
  private interaction: BlockInteraction;
  private sky: Sky;
  private postfx: PostFX;
  private fallingLeaves: FallingLeaves | null = null;
  private mobs: WanderMob[] = [];
  private discovery: DiscoverySystem;
  private hud: Hud;
  private touchControls: TouchControls | null = null;
  private hudEditor = new HudLayoutEditor();
  private editingHud = false;
  private net: NetClient | null = null;
  private social: SocialClient | null = null;
  private remotePlayers: RemotePlayers | null = null;
  private worldLinkStatus: NetLinkStatus = 'offline';
  private playerName = 'Wanderer';
  private prefs: Settings = loadSettings();
  private genDebug: GenDebugMode = parseGenDebugMode();
  private clock = new THREE.Clock();
  private running = false;
  private paused = true;
  private ignorePointerUnlock = false;
  private onPointerLockChangeBound = () => this.onPointerLockChange();
  private onResizeBound = () => this.onResize();
  readonly seed: string;
  onMenuRequest: (() => void) | null = null;

  constructor(host: HTMLElement, seed: string) {
    this.seed = seed;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = false;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.classList.add('game-canvas');
    host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.materials = new TerrainMaterials();
    const worldSettings = loadWorldSettings(seed);
    this.world = new WorldGen(seed, {
      terrain: worldSettings.terrain,
      caves: worldSettings.caves,
    });
    this.chunks = new ChunkManager(
      this.scene,
      this.world,
      this.materials,
      worldSettings.structures,
    );
    this.chunks.setRenderDistance(worldSettings.renderDistance);
    this.player = new PlayerController(this.renderer.domElement, this.chunks);
    this.scene.add(this.player.avatar);
    this.sky = new Sky(this.scene);
    this.sky.viewDistanceChunks = worldSettings.renderDistance;
    this.sky.setTimeOfDay(WORLD_TIME_VALUES[worldSettings.time]);
    this.postfx = new PostFX(this.renderer, this.scene, this.player.camera);
    this.discovery = new DiscoverySystem();
    this.hud = new Hud(this.discovery, seed);
    host.appendChild(this.hud.root);
    this.hud.hidePalette();

    this.inventory = new Inventory();
    this.inventoryUi = new InventoryUi(this.inventory);
    host.appendChild(this.inventoryUi.root);
    this.inventoryUi.onToggle((open) => {
      this.syncControlState();
      if (open) this.exitPointerLockQuiet();
    });

    this.chatUi = new ChatUi();
    host.appendChild(this.chatUi.root);
    this.chatUi.onToggle(() => {
      // Chat only steals typing focus — world keeps running (Minecraft-style).
      this.syncControlState();
      if (this.chatUi.isOpen) this.exitPointerLockQuiet();
    });
    this.chatUi.onChatSend((text) => {
      this.chatUi.push({
        id: this.net?.playerId ?? 'local',
        name: this.playerName,
        text,
        self: true,
      });
      this.net?.sendChat(text);
    });

    this.pauseMenu = new PauseMenu();
    host.appendChild(this.pauseMenu.root);
    this.pauseMenu.on((action) => {
      if (action === 'resume') {
        this.setPaused(false);
        this.requestPointerLock();
        return;
      }
      this.onMenuRequest?.();
    });
    applyHudLayout(loadHudLayout());

    this.interaction = new BlockInteraction(
      this.scene,
      this.chunks,
      this.player,
      this.renderer.domElement,
      this.inventory,
      () => this.inventoryUi.refresh(),
    );

    if (isTouchDevice()) {
      document.documentElement.classList.add('touch-device');
      this.player.setTouchMode(true);
      this.touchControls = new TouchControls({
        onMove: (x, z) => this.player.setTouchMove(x, z),
        onLook: (dx, dy) => this.player.applyLookDelta(dx, dy),
        onJump: (down) => this.player.setTouchJump(down),
        onSneak: (on) => this.player.setTouchSneak(on),
        onBreak: () => this.interaction.tryBreak(),
        onPlace: () => this.interaction.tryPlace(),
        onPack: () => this.inventoryUi.toggle('pack'),
        onJournal: () => this.hud.toggleJournal(),
        onMap: () => this.hud.toggleMap(),
        onChat: () => this.chatUi.toggle(),
        onMenu: () => this.setPaused(true),
      });
      host.appendChild(this.touchControls.root);
      this.touchControls.setEnabled(false);
    }

    this.applyPrefs(loadProfile(), loadSettings());

    this.chunks.bootstrapAt(0, 0);
    this.player.spawnAt(0, 0);
    this.spawnMobs();

    this.initMultiplayer(worldSettings, loadProfile());

    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);
    window.addEventListener('resize', this.onResizeBound);
    this.onResize();
  }

  get inventoryOpen(): boolean {
    return this.inventoryUi.isOpen;
  }

  closeInventory(): void {
    this.inventoryUi.setOpen(false);
  }

  get chatOpen(): boolean {
    return this.chatUi.isOpen;
  }

  closeChat(): void {
    this.chatUi.setOpen(false);
  }

  applyPrefs(profile: Profile, settings: Settings, skinPixels?: Uint8ClampedArray): void {
    this.playerName = profile.name || 'Wanderer';
    this.player.mouseSensitivity = settings.mouseSensitivity;
    this.player.invertY = settings.invertY;
    this.player.setFov(settings.fov);
    this.player.setViewMode(settings.viewMode);
    this.hud.setViewMode(settings.viewMode);
    this.player.applyProfile(profile);
    if (skinPixels) this.player.applySkinPixels(skinPixels);
    this.chunks.setRenderDistance(settings.renderDistance);
    this.sky.cloudCover = settings.clouds;
    this.postfx.setBrightness(settings.brightness);
    this.hud.setShowFps(settings.showFps);
    this.prefs = settings;
    this.hud.setProfileName(profile.name, profile.accent);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.clock.start();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.hud.setMenuOpen(paused);
    this.pauseMenu.setOpen(paused);
    if (paused) this.syncPauseSocial();
    else {
      this.setSessionCoveredByTitle(false);
      this.reportPresence();
    }
    this.inventoryUi.root.classList.toggle('menu-hidden', paused);
    this.chatUi.root.classList.toggle('menu-hidden', paused);
    if (paused) {
      this.inventoryUi.setOpen(false);
      this.chatUi.setOpen(false);
      this.exitPointerLockQuiet();
    } else {
      // Returning from Game Menu — recapture mouse like Minecraft.
      window.setTimeout(() => this.requestPointerLock(), 0);
    }
    this.syncControlState();
  }

  /** Leave to title: keep the world paused, hide the canvas, mark yourself as in menu. */
  returnToTitle(): void {
    this.paused = true;
    this.pauseMenu.setOpen(false);
    this.hud.setMenuOpen(true);
    this.inventoryUi.root.classList.add('menu-hidden');
    this.chatUi.root.classList.add('menu-hidden');
    this.inventoryUi.setOpen(false);
    this.chatUi.setOpen(false);
    this.exitPointerLockQuiet();
    this.setSessionCoveredByTitle(true);
    this.social?.setPresence({ inGame: false });
    this.syncControlState();
  }

  /** Hide the live world under the title menu so presence/UI match what you see. */
  private setSessionCoveredByTitle(covered: boolean): void {
    document.body.classList.toggle('title-over-session', covered);
    this.renderer.domElement.classList.toggle('game-canvas--title-covered', covered);
    this.hud.root.classList.toggle('hud--title-covered', covered);
    this.pauseMenu.root.classList.toggle('pause-menu--title-covered', covered);
    if (covered) {
      this.renderer.setAnimationLoop(null);
    } else if (this.running) {
      this.renderer.setAnimationLoop(() => this.frame());
    }
  }

  get isPaused(): boolean {
    return this.paused;
  }

  /** Minecraft-style: Escape opens this pause menu (not the title screen). */
  openPauseMenu(): void {
    if (this.paused) return;
    this.setPaused(true);
  }

  setSocial(social: SocialClient): void {
    this.social = social;
    this.reportPresence();
    this.social.on({
      onJoinRequest: () => {
        this.syncPauseSocial();
        this.showJoinRequestToast();
      },
      onFriends: () => this.syncPauseSocial(),
      onToast: (title, body) => this.hud.showToast(title, body ?? ''),
    });
    this.pauseMenu.onJoinRequestRespond((id, accept) => {
      this.social?.respondJoin(id, accept);
      this.syncPauseSocial();
    });
    this.syncPauseSocial();
  }

  showJoinRequestToast(): void {
    this.hud.showToast('Join request', 'Press Esc to accept or deny');
  }

  private syncPauseSocial(): void {
    if (!this.social) return;
    this.pauseMenu.setSocial({
      requests: this.social.incomingRequests.map((r) => ({
        id: r.id,
        name: r.from.profile.name || 'Friend',
      })),
    });
  }

  private reportPresence(): void {
    if (!this.social) return;
    const worldSettings = loadWorldSettings(this.seed);
    const worldWire = {
      terrain: worldSettings.terrain,
      caves: worldSettings.caves,
      structures: worldSettings.structures,
      time: worldSettings.time,
      renderDistance: worldSettings.renderDistance,
    };
    this.social.setPresence({
      inGame: true,
      seed: this.seed,
      room: worldRoomId(this.seed, worldWire),
      world: worldWire,
      worldName: worldNameFromSeed(this.seed),
    });
  }

  
  /** Open the drag-to-move HUD editor (from Settings). Keeps the world paused. */
  beginHudEdit(): void {
    this.editingHud = true;
    this.setSessionCoveredByTitle(false);
    this.pauseMenu.setOpen(false);
    this.hud.setMenuOpen(false);
    this.inventoryUi.root.classList.remove('menu-hidden');
    this.chatUi.root.classList.add('menu-hidden');
    // Keep world paused so you don't walk while dragging; show all controls.
    this.paused = true;
    this.player.setInputEnabled(false);
    this.interaction.setEnabled(false);
    this.touchControls?.setEnabled(true);
    this.touchControls?.setLayoutEditMode(true);
    this.exitPointerLockQuiet();

    this.hudEditor.start(() => {
      this.editingHud = false;
      this.touchControls?.setLayoutEditMode(false);
      this.setPaused(false);
      if (!isTouchDevice()) this.requestPointerLock();
    });
  }

  private syncControlState(): void {
    if (this.editingHud) {
      this.player.setInputEnabled(false);
      this.interaction.setEnabled(false);
      this.touchControls?.setEnabled(true);
      this.touchControls?.setLayoutEditMode(true);
      return;
    }
    const canControl =
      !this.paused && !this.inventoryUi.isOpen && !this.chatUi.isOpen;
    this.player.setInputEnabled(canControl);
    this.interaction.setEnabled(canControl);
    this.touchControls?.setEnabled(canControl);
  }

  private exitPointerLockQuiet(): void {
    if (!document.pointerLockElement) return;
    this.ignorePointerUnlock = true;
    document.exitPointerLock();
    window.setTimeout(() => {
      this.ignorePointerUnlock = false;
    }, 0);
  }

  private requestPointerLock(): void {
    if (isTouchDevice() || this.paused || this.chatUi.isOpen || this.inventoryUi.isOpen) return;
    this.renderer.domElement.requestPointerLock?.();
  }

  private onPointerLockChange(): void {
    if (isTouchDevice()) return;
    if (document.pointerLockElement === this.renderer.domElement) return;
    if (this.ignorePointerUnlock) return;
    if (this.paused || this.chatUi.isOpen || this.inventoryUi.isOpen) return;
    // Lost aim lock (Alt-Tab / Escape) → Game Menu, not "Click to play".
    this.setPaused(true);
  }

  dispose(): void {
    this.running = false;
    this.setSessionCoveredByTitle(false);
    this.social?.setPresence({ inGame: false });
    this.renderer.setAnimationLoop(null);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
    window.removeEventListener('resize', this.onResizeBound);
    this.hud.root.remove();
    this.inventoryUi.root.remove();
    this.chatUi.root.remove();
    this.pauseMenu.root.remove();
    this.touchControls?.root.remove();
    this.net?.disconnect();
    this.remotePlayers?.root.remove();
    this.fallingLeaves?.dispose();
    this.fallingLeaves = null;
    for (const m of this.mobs) m.dispose();
    this.mobs = [];
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }

  private spawnMobs(): void {
    // Mobs / A* pathfinding deferred — too costly while chunk streaming.
  }

  private onResize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.player.camera.aspect = w / h;
    this.player.camera.updateProjectionMatrix();
    this.postfx.setSize(w, h);
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const worldLive = !this.paused && !this.inventoryUi.isOpen;
    const canControl = worldLive && !this.chatUi.isOpen;
    // Journal is modal; map is an overlay — keep walking/looking while it's open.
    const journalBlocking = this.hud.isJournalOpen;

    if (worldLive && !journalBlocking) {
      this.chunks.updateAround(this.player.position.x, this.player.position.z, 1);
      if (canControl) {
        this.player.update(dt);
        this.interaction.update(dt);
      } else {
        // Chat open: keep standing still but world/time continue.
        this.player.update(0);
      }

      const biomeLive = this.chunks.getBiomeAt(this.player.position.x, this.player.position.z);
      this.discovery.checkBiome(biomeLive);
      const landmarksLive = this.chunks.getLandmarks();
      this.discovery.checkLandmarks(
        this.player.position.x,
        this.player.position.z,
        landmarksLive,
      );
      this.chunks.tickWorld(dt, this.player.position.x, this.player.position.z);
    } else {
      this.chunks.updateAround(this.player.position.x, this.player.position.z, 1);
      this.interaction.update(dt);
    }

    const biome = this.chunks.getBiomeAt(this.player.position.x, this.player.position.z);
    const lavaSub = this.player.getLavaSubmersion();
    const submersion = lavaSub > 0.02 ? 0 : this.player.getSubmersion();
    this.sky.update(dt, biome, submersion);
    this.sky.follow(this.player.position.x, this.player.position.z, this.player.position.y);
    this.materials.update(
      dt,
      this.sky.sunDir,
      this.sky.timeOfDay,
      this.sky.fogColor,
      this.sky.fogDensity,
      submersion,
    );
    this.postfx.setUnderwater(this.prefs.underwaterFx ? submersion : 0, dt);
    this.postfx.setSun(
      this.sky.sunDir,
      Math.max(0, this.sky.sunDir.y),
      this.player.position,
    );

    const landmarks = this.chunks.getLandmarks();
    const nearest = this.discovery.nearestLandmark(
      this.player.position.x,
      this.player.position.z,
      landmarks,
    );

    this.hud.setPointerLocked(this.player.aimActive && canControl && !journalBlocking);
    this.hud.setTouchMode(this.player.touchControlsActive);
    this.hud.setViewMode(this.player.viewMode);
    this.touchControls?.setEnabled(this.editingHud || (canControl && !journalBlocking));
    this.hud.setUnderwater(this.prefs.underwaterFx ? submersion : 0);
    this.hud.setInLava(lavaSub);
    this.hud.tickFps(dt);
    if (worldLive && !journalBlocking) {
      this.net?.tickState(dt, { t: 'state', ...this.player.getNetState() });
    }
    this.remotePlayers?.update(dt);
    const others = this.remotePlayers?.getMapMarkers() ?? [];
    const mpCount = others.length + (this.worldLinkStatus === 'connected' ? 1 : 0);
    this.hud.setWorldLink({
      status: this.net ? this.worldLinkStatus : 'offline',
      count: Math.max(1, mpCount),
      worldName: worldNameFromSeed(this.seed),
      others: others.map((p) => p.name),
    });
    this.hud.update({
      biome,
      facingDeg: this.player.facingDegrees(),
      distance: this.player.distanceWalked,
      nearest,
      playerX: this.player.position.x,
      playerY: this.player.position.y,
      playerZ: this.player.position.z,
      explored: this.chunks.getExploredKeys(),
      landmarks,
      players: others,
      dt: worldLive ? dt : 0,
      lookAt: this.interaction.getLookAt(),
      genDebug:
        this.genDebug === 'off'
          ? ''
          : formatGenDebug(
              this.world,
              Math.floor(this.player.position.x),
              Math.floor(this.player.position.z),
              this.genDebug,
            ),
    });

    this.postfx.render();
  }

  private initMultiplayer(worldSettings: WorldSettings, profile: Profile): void {
    const url = mpUrl();
    this.remotePlayers = new RemotePlayers();
    this.scene.add(this.remotePlayers.root);

    this.net = new NetClient(url);
    const worldWire = {
      terrain: worldSettings.terrain,
      caves: worldSettings.caves,
      structures: worldSettings.structures,
      time: worldSettings.time,
      renderDistance: worldSettings.renderDistance,
    };
    const profileWire: ProfileWire = { ...profile };
    const room = worldRoomId(this.seed, worldWire);

    this.worldLinkStatus = 'connecting';
    this.hud.setWorldLink({
      status: 'connecting',
      count: 1,
      worldName: worldNameFromSeed(this.seed),
      others: [],
    });
    this.hud.setLocalPlayerName(profile.name || this.playerName);
    this.net.on({
      onStatus: (status) => {
        this.worldLinkStatus = status;
      },
      onWelcome: (_id, players, edits) => {
        this.remotePlayers!.clear();
        for (const p of players) {
          this.remotePlayers!.add(p.id, p.profile, p.snapshot);
        }
        this.chunks.loadNetworkEdits(edits);
        this.worldLinkStatus = 'connected';
        const total = players.length + 1;
        this.hud.setWorldLink({
          status: 'connected',
          count: total,
          worldName: worldNameFromSeed(this.seed),
          others: players.map((p) => p.snapshot.name),
        });
        this.hud.showToast(
          'Connected to world',
          total > 1 ? `${total} explorers here` : 'You are the first here',
        )
      },
      onPlayerJoin: (id, p, snapshot) => {
        this.remotePlayers!.add(id, p, snapshot);
        this.hud.showToast(`${snapshot.name} joined`, 'Joined your world');
      },
      onPlayerLeave: (id) => {
        this.remotePlayers!.remove(id);
      },
      onPlayerState: (id, state) => {
        this.remotePlayers!.setState(id, state);
      },
      onBlockEdit: (edit) => {
        this.chunks.applyRemoteEdit(edit.x, edit.y, edit.z, edit.block);
      },
      onChat: (id, name, text) => {
        if (id === this.net?.playerId) return;
        this.chatUi.push({ id, name, text });
      },
      onDisconnect: () => {
        this.worldLinkStatus = this.net ? 'reconnecting' : 'offline';
        this.hud.setWorldLink({
          status: this.worldLinkStatus,
          count: 1,
          worldName: worldNameFromSeed(this.seed),
          others: [],
        });
      },
      onReconnecting: () => {
        this.worldLinkStatus = 'reconnecting';
        this.hud.setWorldLink({
          status: 'reconnecting',
          count: 1,
          worldName: worldNameFromSeed(this.seed),
          others: [],
        });
      },
    });

    this.interaction.setOnBlockChange((x, y, z, block) => {
      this.net?.sendBlock({ x, y, z, block });
    });

    this.net.connect(room, this.seed, worldWire, profileWire);
    this.reportPresence();
  }
}
