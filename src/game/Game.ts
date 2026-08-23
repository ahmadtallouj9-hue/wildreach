import * as THREE from 'three';
import { WorldGen } from '../world/WorldGen';
import { ChunkManager } from '../world/ChunkManager';
import { PlayerController } from '../player/PlayerController';
import { BlockInteraction } from '../player/BlockInteraction';
import { Inventory } from '../player/Inventory';
import { Sky } from '../render/Sky';
import { TerrainMaterials } from '../render/TerrainMaterials';
import { PostFX } from '../render/PostFX';
import { DiscoverySystem } from '../discovery/DiscoverySystem';
import { Hud } from '../ui/Hud';
import { InventoryUi } from '../ui/InventoryUi';
import { TouchControls } from '../ui/TouchControls';
import { NetClient } from '../net/NetClient';
import { RemotePlayers } from '../net/RemotePlayers';
import { mpUrl, worldRoomId, type ProfileWire } from '../net/protocol';
import { loadProfile, loadSettings, type Profile, type Settings } from '../ui/prefs';
import { loadWorldSettings, WORLD_TIME_VALUES, type WorldSettings } from '../ui/worldSettings';
import { isTouchDevice } from '../util/isTouchDevice';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private world: WorldGen;
  private materials: TerrainMaterials;
  private chunks: ChunkManager;
  private player: PlayerController;
  private inventory: Inventory;
  private inventoryUi: InventoryUi;
  private interaction: BlockInteraction;
  private sky: Sky;
  private postfx: PostFX;
  private discovery: DiscoverySystem;
  private hud: Hud;
  private touchControls: TouchControls | null = null;
  private net: NetClient | null = null;
  private remotePlayers: RemotePlayers | null = null;
  private clock = new THREE.Clock();
  private running = false;
  private paused = true;
  readonly seed: string;
  onMenuRequest: (() => void) | null = null;

  constructor(host: HTMLElement, seed: string) {
    this.seed = seed;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouchDevice() ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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
      const playing = !this.paused && !open;
      this.player.setInputEnabled(playing);
      this.interaction.setEnabled(playing);
      this.touchControls?.setEnabled(playing);
      if (open && document.pointerLockElement) document.exitPointerLock();
    });

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
        onMenu: () => this.onMenuRequest?.(),
      });
      host.appendChild(this.touchControls.root);
      this.touchControls.setEnabled(false);
    }

    this.applyPrefs(loadProfile(), loadSettings());

    this.chunks.bootstrapAt(0, 0);
    this.player.spawnAt(0, 0);

    this.initMultiplayer(worldSettings, loadProfile());

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
  }

  get inventoryOpen(): boolean {
    return this.inventoryUi.isOpen;
  }

  closeInventory(): void {
    this.inventoryUi.setOpen(false);
  }

  applyPrefs(profile: Profile, settings: Settings, skinPixels?: Uint8ClampedArray): void {
    this.player.mouseSensitivity = settings.mouseSensitivity;
    this.player.setFov(settings.fov);
    this.player.setViewMode(settings.viewMode);
    this.player.applyProfile(profile);
    if (skinPixels) this.player.applySkinPixels(skinPixels);
    this.chunks.setRenderDistance(settings.renderDistance);
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
    this.inventoryUi.root.classList.toggle('menu-hidden', paused);
    if (paused) {
      this.inventoryUi.setOpen(false);
      if (document.pointerLockElement) document.exitPointerLock();
    }
    const playing = !paused && !this.inventoryUi.isOpen;
    this.player.setInputEnabled(playing);
    this.interaction.setEnabled(playing);
    this.touchControls?.setEnabled(playing);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  dispose(): void {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    this.hud.root.remove();
    this.inventoryUi.root.remove();
    this.touchControls?.root.remove();
    this.net?.disconnect();
    this.remotePlayers?.root.remove();
    this.renderer.domElement.remove();
    this.renderer.dispose();
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
    const playing = !this.paused && !this.inventoryUi.isOpen;
    const hudBlocking = this.hud.isJournalOpen || this.hud.isMapOpen;

    if (playing && !hudBlocking) {
      this.chunks.updateAround(this.player.position.x, this.player.position.z, 3);
      this.player.update(dt);
      this.interaction.update(dt);

      const biomeLive = this.chunks.getBiomeAt(this.player.position.x, this.player.position.z);
      this.discovery.checkBiome(biomeLive);
      const landmarksLive = this.chunks.getLandmarks();
      this.discovery.checkLandmarks(
        this.player.position.x,
        this.player.position.z,
        landmarksLive,
      );
    } else {
      this.chunks.updateAround(this.player.position.x, this.player.position.z, 1);
      this.interaction.update(dt);
    }

    const biome = this.chunks.getBiomeAt(this.player.position.x, this.player.position.z);
    const submersion = this.player.getSubmersion();
    this.sky.update(dt, biome, submersion);
    this.sky.follow(this.player.position.x, this.player.position.z);
    this.materials.update(
      dt,
      this.sky.sunDir,
      this.sky.timeOfDay,
      this.sky.fogColor,
      this.sky.fogDensity,
      submersion,
    );
    this.postfx.setUnderwater(submersion, dt);

    const landmarks = this.chunks.getLandmarks();
    const nearest = this.discovery.nearestLandmark(
      this.player.position.x,
      this.player.position.z,
      landmarks,
    );

    this.hud.setPointerLocked(this.player.aimActive && playing && !hudBlocking);
    this.hud.setTouchMode(this.player.touchControlsActive);
    this.touchControls?.setEnabled(playing && !hudBlocking);
    this.hud.setUnderwater(submersion);
    if (playing && !hudBlocking) {
      this.net?.tickState(dt, { t: 'state', ...this.player.getNetState() });
    }
    this.remotePlayers?.update(dt);
    const mpCount = (this.remotePlayers?.count() ?? 0) + (this.net?.connected ? 1 : 0);
    this.hud.setMultiplayer(mpCount, !!this.net?.connected);
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
      dt: playing ? dt : 0,
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

    this.net.on({
      onWelcome: (_id, players, edits) => {
        this.remotePlayers!.clear();
        for (const p of players) {
          this.remotePlayers!.add(p.id, p.profile, p.snapshot);
        }
        this.chunks.loadNetworkEdits(edits);
        if (players.length > 0) {
          this.hud.showToast('Connected', `${players.length + 1} in this world`);
        }
      },
      onPlayerJoin: (id, p, snapshot) => {
        this.remotePlayers!.add(id, p, snapshot);
        this.hud.showToast(`${snapshot.name} joined`, 'Same world link');
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
      onDisconnect: () => {
        this.hud.setMultiplayer(1, false);
      },
      onReconnecting: () => {
        this.hud.showToast('Reconnecting…', 'Finding your friends');
      },
    });

    this.interaction.setOnBlockChange((x, y, z, block) => {
      this.net?.sendBlock({ x, y, z, block });
    });

    this.net.connect(room, this.seed, worldWire, profileWire);
  }
}
