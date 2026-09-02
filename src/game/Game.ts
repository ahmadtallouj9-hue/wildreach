import * as THREE from 'three';
import { WorldGen } from '../world/WorldGen';
import { formatGenDebug, parseGenDebugMode, type GenDebugMode } from '../world/gen/GenDebug';
import { ChunkManager } from '../world/ChunkManager';
import { PlayerController } from '../player/PlayerController';
import { BlockInteraction } from '../player/BlockInteraction';
import { Inventory } from '../player/Inventory';
import { PlayerSurvival } from '../player/PlayerSurvival';
import { MobManager } from '../mobs/MobManager';
import { EquipmentSystem } from '../equipment/EquipmentSystem';
import { loadSurvivalState, saveSurvivalState } from '../world/survivalStore';
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
import { styleFingerprint } from '../world/style/styleHash';
import { isTouchDevice } from '../util/isTouchDevice';
import { applyHudLayout, HudLayoutEditor, loadHudLayout } from '../ui/HudLayout';
import { loadGfxPrefs, saveGfxPrefs, getPresetConfig, type GfxPrefs, type GfxPreset } from '../render/gfxPrefs';
import { ModManager } from '../modding/ModSystem';
import { FixedTimestep } from '../engine/core/FixedTimestep';
import { profiler } from '../engine/core/Profiler';

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private world: WorldGen;
  private materials: TerrainMaterials;
  private chunks: ChunkManager;
  private player: PlayerController;
  private inventory: Inventory;
  private inventoryUi: InventoryUi;
  private survival: PlayerSurvival;
  private mobManager: MobManager;
  private survivalSaveTimer = 0;
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
  private gfx: GfxPrefs = loadGfxPrefs();
  private fpsCapAccumulator = 0;

  private lowFpsTimer = 0;
  /** Deterministic 20 Hz simulation clock (engine core). */
  private readonly timestep = new FixedTimestep(0.05, 0.25);
  private genDebug: GenDebugMode = parseGenDebugMode();
  private clock = new THREE.Clock();
  private running = false;
  private paused = true;
  private ignorePointerUnlock = false;
  private onPointerLockChangeBound = () => this.onPointerLockChange();
  private onResizeBound = () => this.onResize();
  private onVisibilityChangeBound = () => this.onVisibilityChange();
  readonly seed: string;
  onMenuRequest: ((panel?: 'settings' | 'multiplayer') => void) | null = null;

  constructor(host: HTMLElement, seed: string) {
    this.seed = seed;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.gfx.pixelRatioCap));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = this.gfx.shadows !== 'none';
    if (this.gfx.shadows === 'soft') {
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    } else {
      this.renderer.shadowMap.type = THREE.BasicShadowMap;
    }
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.classList.add('game-canvas');
    host.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    ModManager.get().rebuildRuntimeRegistrations();
    this.materials = new TerrainMaterials(this.prefs.texturePack || 'default');
    this.materials.setGfx(this.gfx);
    const worldSettings = loadWorldSettings(seed);
    this.world = new WorldGen(seed, {
      terrain: worldSettings.terrain,
      caves: worldSettings.caves,
      style: worldSettings.style ?? null,
    });
    this.chunks = new ChunkManager(
      this.scene,
      this.world,
      this.materials,
      worldSettings.structures,
    );
    this.chunks.setRenderDistance(this.gfx.renderDistance);
    this.chunks.setChunkBudget(this.gfx.chunkBudget);
    this.player = new PlayerController(this.renderer.domElement, this.chunks);
    this.scene.add(this.player.avatar);
    this.sky = new Sky(this.scene);
    this.sky.setGfx(this.gfx);
    this.sky.setTimeOfDay(WORLD_TIME_VALUES[worldSettings.time]);
    this.postfx = new PostFX(this.renderer, this.scene, this.player.camera);
    this.postfx.setGfx(this.gfx);
    this.discovery = new DiscoverySystem();
    this.hud = new Hud(this.discovery, seed);
    host.appendChild(this.hud.root);
    this.hud.hidePalette();

    const savedSurvival = loadSurvivalState(seed);
    const equipment = new EquipmentSystem();
    if (savedSurvival?.equipment) {
      equipment.deserialize(savedSurvival.equipment);
    }

    this.survival = new PlayerSurvival(
      savedSurvival ? { health: savedSurvival.health, hunger: savedSurvival.hunger } : undefined,
      equipment,
    );

    this.inventory = new Inventory();
    if (savedSurvival?.slots) {
      savedSurvival.slots.forEach((s, idx) => this.inventory.setSlot(idx, s));
    }
    if (savedSurvival?.selectedHotbar != null) {
      this.inventory.setHotbar(savedSurvival.selectedHotbar);
    }

    this.inventoryUi = new InventoryUi(this.inventory, { profile: loadProfile(), equipment });
    host.appendChild(this.inventoryUi.root);
    this.inventoryUi.onToggle((open) => {
      this.syncControlState();
      if (open) this.exitPointerLockQuiet();
    });

    this.mobManager = new MobManager(
      this.scene,
      this.chunks,
      (itemId, count, durability, maxDurability) => {
        this.inventory.add(itemId, count, { durability, maxDurability });
        this.inventoryUi.refresh();
        this.saveSurvival();
      },
    );

    this.survival.onDeath(() => {
      this.syncControlState();
      this.hud.showDeathScreen(true);
      for (let i = 0; i < this.inventory.slots.length; i++) {
        const s = this.inventory.slots[i];
        if (s && s.count > 0) {
          this.mobManager.dropItem(s.id, s.count, this.player.position);
          this.inventory.setSlot(i, null);
        }
      }
      this.inventoryUi.refresh();
      this.saveSurvival();
      this.exitPointerLockQuiet();
    });

    this.hud.onDeathActions({
      onRespawn: () => {
        this.player.spawnAt(0, 0);
        this.survival.respawn();
        this.hud.showDeathScreen(false);
        this.syncControlState();
        this.saveSurvival();
        if (!this.player.touchControlsActive) {
          this.requestPointerLock();
        }
      },
      onTitle: () => {
        this.saveSurvival();
        this.onMenuRequest?.();
      },
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
      if (action === 'settings') {
        this.onMenuRequest?.('settings');
        return;
      }
      if (action === 'social') {
        this.onMenuRequest?.('multiplayer');
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
      this.survival,
      this.mobManager,
      () => this.inventoryUi.openCraftingTable(),
      () => {
        this.inventoryUi.refresh();
        this.saveSurvival();
      },
      (x, y, z, block) => this.net?.sendBlock({ x, y, z, block }),
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
        onHotbarPrev: () => {
          this.inventory.cycleHotbar(-1);
          this.inventoryUi.refresh();
        },
        onHotbarNext: () => {
          this.inventory.cycleHotbar(1);
          this.inventoryUi.refresh();
        },
      });
      host.appendChild(this.touchControls.root);
      this.touchControls.setEnabled(false);
    }

    this.applyPrefs(loadProfile(), loadSettings());

    this.chunks.bootstrapAt(0, 0);
    this.player.spawnAt(0, 0);
    if (savedSurvival?.position && Number.isFinite(savedSurvival.position.x)) {
      this.player.position.set(
        savedSurvival.position.x,
        savedSurvival.position.y,
        savedSurvival.position.z,
      );
      if (savedSurvival.yaw != null) this.player.yaw = savedSurvival.yaw;
      if (savedSurvival.pitch != null) this.player.pitch = savedSurvival.pitch;
    }
    this.spawnMobs();

    this.initMultiplayer(worldSettings, loadProfile());

    document.addEventListener('pointerlockchange', this.onPointerLockChangeBound);
    document.addEventListener('visibilitychange', this.onVisibilityChangeBound);
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

  applyGfx(gfx: GfxPrefs): void {
    this.gfx = gfx;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, gfx.pixelRatioCap));
    if (gfx.shadows === 'none') {
      this.renderer.shadowMap.enabled = false;
    } else {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type =
        gfx.shadows === 'soft' ? THREE.PCFSoftShadowMap : THREE.BasicShadowMap;
    }
    this.sky.setGfx(gfx);
    this.materials.setGfx(gfx);
    this.postfx.setGfx(gfx);
    this.fallingLeaves?.setEnabled(gfx.particles);
    this.chunks.setRenderDistance(gfx.renderDistance);
    this.chunks.setChunkBudget(gfx.chunkBudget);
    this.onResize();
  }

  setGfxPreset(preset: GfxPreset): void {
    const config = getPresetConfig(preset);
    saveGfxPrefs(config);
    this.applyGfx(config);
  }

  private onVisibilityChange(): void {
    const hidden = document.hidden;
    this.chunks.setPausedHidden(hidden);
  }

  applyPrefs(profile: Profile, settings: Settings, skinPixels?: Uint8ClampedArray, gfxPrefs?: GfxPrefs): void {
    this.playerName = profile.name || 'Wanderer';
    this.player.mouseSensitivity = settings.mouseSensitivity;
    this.player.invertY = settings.invertY;
    this.player.setFov(settings.fov);
    this.player.setViewMode(settings.viewMode);
    this.hud.setViewMode(settings.viewMode);
    this.player.applyProfile(profile);
    if (skinPixels) this.player.applySkinPixels(skinPixels);
    this.sky.cloudCover = settings.clouds;
    this.postfx.setBrightness(settings.brightness);
    this.hud.setShowFps(settings.showFps);
    if (settings.texturePack && settings.texturePack !== this.materials.texturePack) {
      this.materials.setTexturePack(settings.texturePack);
    }
    this.prefs = settings;
    if (gfxPrefs) {
      this.applyGfx(gfxPrefs);
    } else {
      this.chunks.setRenderDistance(this.gfx.renderDistance);
    }
    this.hud.setProfileName(profile.name, profile.accent);
    this.inventoryUi.applyProfile(profile);
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
      styleHash: styleFingerprint(worldSettings.style),
      styleName: worldSettings.style?.name,
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
      !this.paused && !this.inventoryUi.isOpen && !this.chatUi.isOpen && !this.survival.isDead;
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
    if (isTouchDevice() || this.paused || this.chatUi.isOpen || this.inventoryUi.isOpen || this.survival.isDead) return;
    this.renderer.domElement.requestPointerLock?.();
  }

  private onPointerLockChange(): void {
    if (isTouchDevice()) return;
    if (document.pointerLockElement === this.renderer.domElement) return;
    if (this.ignorePointerUnlock) return;
    if (this.paused || this.chatUi.isOpen || this.inventoryUi.isOpen || this.survival.isDead) return;
    // Lost aim lock (Alt-Tab / Escape) → Game Menu, not "Click to play".
    this.setPaused(true);
  }

  dispose(): void {
    this.saveSurvival();
    this.running = false;
    this.setSessionCoveredByTitle(false);
    this.social?.setPresence({ inGame: false });
    this.renderer.setAnimationLoop(null);
    document.removeEventListener('pointerlockchange', this.onPointerLockChangeBound);
    document.removeEventListener('visibilitychange', this.onVisibilityChangeBound);
    window.removeEventListener('resize', this.onResizeBound);
    this.hud.root.remove();
    this.inventoryUi.dispose();
    this.chatUi.root.remove();
    this.pauseMenu.root.remove();
    this.touchControls?.root.remove();
    this.net?.disconnect();
    this.net = null;
    this.remotePlayers?.root.remove();
    this.remotePlayers = null;
    this.fallingLeaves?.dispose();
    this.fallingLeaves = null;
    for (const m of this.mobs) m.dispose();
    this.mobs = [];
    this.mobManager?.dispose();
    this.interaction.dispose();
    this.player.dispose();
    this.chunks.dispose();
    this.scene.clear();
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }

  private saveSurvival(): void {
    if (!this.survival || !this.player || !this.inventory) return;
    saveSurvivalState(this.seed, {
      health: this.survival.health,
      hunger: this.survival.hunger,
      position: {
        x: this.player.position.x,
        y: this.player.position.y,
        z: this.player.position.z,
      },
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      slots: this.inventory.slots,
      selectedHotbar: this.inventory.selectedHotbar,
      equipment: this.inventoryUi?.equipment?.serialize(),
      savedAt: Date.now(),
    });
  }

  private spawnMobs(): void {
    // Mobs / A* pathfinding deferred — too costly while chunk streaming.
  }

  private onResize(): void {
    let w = window.innerWidth;
    let h = window.innerHeight;
    const maxDim = this.gfx.maxRenderDimension;
    const longSide = Math.max(w, h);
    if (longSide > maxDim) {
      const scale = maxDim / longSide;
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }
    this.renderer.setSize(w, h, false);
    this.player.camera.aspect = window.innerWidth / window.innerHeight;
    this.player.camera.updateProjectionMatrix();
    this.postfx.setSize(w, h);
  }

  private frame(): void {
    const rawDt = Math.min(this.clock.getDelta(), 0.05);
    // Frame interval in ms — the primary frame-time metric (engine Profiler).
    profiler.record('frame.dt', rawDt * 1000);

    // Optional 30 FPS cap for Very Low preset on low-end devices
    if (this.gfx.fpsCap === 30) {
      this.fpsCapAccumulator += rawDt;
      if (this.fpsCapAccumulator < 0.031) {
        return;
      }
      this.fpsCapAccumulator = 0;
    }

    const dt = rawDt;

    // Max preset auto-drop: if FPS < 25 for 3 seconds continuously, drop to High
    if (this.gfx.preset === 'max' && !this.paused) {
      const currentFps = dt > 0 ? 1 / dt : 60;
      if (currentFps < 25) {
        this.lowFpsTimer += dt;
        if (this.lowFpsTimer >= 3.0) {
          this.lowFpsTimer = 0;
          this.setGfxPreset('high');
          this.hud.showToast('Graphics adjusted', 'Lowered to High preset for performance');
        }
      } else {
        this.lowFpsTimer = 0;
      }
    }

    const worldLive = !this.paused && !this.inventoryUi.isOpen;
    const canControl = worldLive && !this.chatUi.isOpen;
    // Journal is modal; map is an overlay — keep walking/looking while it's open.
    const journalBlocking = this.hud.isJournalOpen;

    if (worldLive && !journalBlocking) {
      this.chunks.updateAround(this.player.position.x, this.player.position.z, 1);

      // Deterministic 20 Hz fixed simulation step (engine core FixedTimestep)
      this.timestep.addTime(dt);

      const simEnd = profiler.begin('frame.sim');
      while (this.timestep.hasStep()) {
        if (canControl) {
          const snapshot = this.player.simulateTick(this.survival.damageSystem, this.survival.hungerSystem);
          this.interaction.simulateTick(snapshot);
        }
        this.survival.tick();
        this.timestep.consumeStep();
      }
      simEnd();

      const renderAlpha = this.timestep.alpha;
      this.player.render(renderAlpha, dt);
      this.interaction.update(dt);

      if (typeof window !== 'undefined' && (window as any).CAMERA_DEBUG) {
        this.hud.setCameraDebug(this.player.getCameraDebugInfo(renderAlpha, dt));
      } else {
        this.hud.setCameraDebug(null);
      }

      const isMoving = this.player.velocity.lengthSq() > 0.05;
      const isSprinting = this.player.isSprinting;
      const lavaSub = this.player.getLavaSubmersion();
      const submersion = lavaSub > 0.02 ? 0 : this.player.getSubmersion();

      this.survival.update(dt, {
        onGround: this.player.isOnGround,
        posY: this.player.position.y,
        isMoving,
        isSprinting,
        inLava: lavaSub > 0.02,
        isSubmerged: submersion > 0.5,
      });

      const isNight = this.sky.sunDir.y < 0.1;
      this.mobManager.update(dt, this.player.position, isNight, (dmg) => {
        this.survival.damage(dmg, 'mob');
        this.player.velocity.y += 0.3;
      });

      this.survivalSaveTimer += dt;
      if (this.survivalSaveTimer >= 5.0) {
        this.survivalSaveTimer = 0;
        this.saveSurvival();
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

    this.hud.setSurvival(
      this.survival.health,
      this.survival.maxHealth,
      this.survival.hunger,
      this.survival.maxHunger,
      this.survival.hurtFlash,
    );

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
            ) + '\n' + this.perfDebugLine(),
    });

    const renderEnd = profiler.begin('frame.render');
    this.postfx.render();
    renderEnd();
  }

  /** One-line profiler summary for the engine debug overlay (?genDebug=…). */
  private perfDebugLine(): string {
    const dtS = profiler.stats('frame.dt');
    const simS = profiler.stats('frame.sim');
    const renderS = profiler.stats('frame.render');
    const genS = profiler.stats('chunk.gen');
    const meshS = profiler.stats('chunk.mesh');
    const info = this.renderer.info.render;
    const parts: string[] = [];
    if (dtS) parts.push(`frame ${dtS.avg.toFixed(2)}ms`);
    if (simS) parts.push(`sim ${simS.avg.toFixed(2)}ms`);
    if (renderS) parts.push(`render ${renderS.avg.toFixed(2)}ms`);
    if (genS) parts.push(`gen ${genS.avg.toFixed(1)}ms`);
    if (meshS) parts.push(`mesh ${meshS.avg.toFixed(1)}ms`);
    const queues = `${this.chunks.loadedChunks}c +${this.chunks.genPending}g/${this.chunks.buildPending}b`;
    const draw = `${info.calls}dc ${info.triangles}tri`;
    return `${parts.join(' · ')}\n${queues} · ${draw}`;
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
      styleHash: styleFingerprint(worldSettings.style),
      styleName: worldSettings.style?.name,
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
        const others =
          status === 'connected'
            ? (this.remotePlayers?.getMapMarkers().map((p) => p.name) ?? [])
            : [];
        this.hud.setWorldLink({
          status,
          count: status === 'connected' ? Math.max(1, others.length + 1) : 1,
          worldName: worldNameFromSeed(this.seed),
          others,
        });
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
        );
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
        // Prefer NetClient status (may already be offline after give-up).
        const status = this.net?.status ?? 'offline';
        this.worldLinkStatus = status === 'connected' ? 'reconnecting' : status;
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
