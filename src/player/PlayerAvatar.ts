import * as THREE from 'three';
import type {
  AvatarStyle,
  BackpackStyle,
  BeltStyle,
  CapeStyle,
  GlassesStyle,
  HatStyle,
  Profile,
} from '../ui/prefs';
import {
  BOX_FACE_SYNC,
  BOX_FACES,
  PART_UV,
  SKIN_SIZE,
  cloneSkin,
  copyRectToCanvas,
  createDefaultSkin,
  decodeSkin,
  type SkinPart,
} from './SkinAtlas';
import {
  createAvatarOverlayMeshes,
  makeOverlayPartMats,
  syncOverlayTextures,
  type OverlayMeshes,
} from './AvatarOverlayLayer';
import { OVERLAY_SHELL } from './SkinOverlayUV';
import { BLOCK_PALETTE } from './BlockCharacterSkin';

export type AvatarPose = 'stand' | 'sneak' | 'sit' | 'crawl';

const LEG_H = 0.8;
const TORSO_H = 0.68;
const HEAD = 0.42;
const ARM_H = 0.64;
const ARM_W = 0.18;
const LEG_W = 0.22;
const TORSO_W = 0.52;
const TORSO_D = 0.3;

type PartMats = THREE.MeshLambertMaterial[];

export class PlayerAvatar {
  readonly root = new THREE.Group();
  private readonly body = new THREE.Group();

  private head: THREE.Mesh;
  private torso: THREE.Mesh;
  private armL: THREE.Mesh;
  private armR: THREE.Mesh;
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private hatMesh: THREE.Mesh;
  private hatOverlay: THREE.Mesh;
  private capeMesh: THREE.Mesh;
  private glassesMesh: THREE.Mesh;
  private backpackMesh: THREE.Mesh;
  private beltMesh: THREE.Mesh;

  private skinPixels = createDefaultSkin(
    BLOCK_PALETTE.skin,
    BLOCK_PALETTE.outfit,
    BLOCK_PALETTE.pink,
    {
      hair: BLOCK_PALETTE.hair,
      eyes: BLOCK_PALETTE.eye,
      shoes: BLOCK_PALETTE.shoe,
      hairStyle: 'short',
      face: 'neutral',
      sleeves: 'long',
      pants: BLOCK_PALETTE.pants,
      renderMode: 'block',
    },
  );
  private readonly partCanvases = new Map<string, HTMLCanvasElement>();
  private readonly partTextures = new Map<string, THREE.CanvasTexture>();
  private readonly overlayCanvases = new Map<string, HTMLCanvasElement>();
  private readonly overlayTextures = new Map<string, THREE.CanvasTexture>();
  private readonly overlays: OverlayMeshes;
  private readonly headMats: PartMats;
  private readonly bodyMats: PartMats;
  private readonly armRMats: PartMats;
  private readonly armLMats: PartMats;
  private readonly legRMats: PartMats;
  private readonly legLMats: PartMats;
  private readonly hatMats: PartMats;
  private readonly accentMat: THREE.MeshStandardMaterial;
  private readonly capeMat: THREE.MeshLambertMaterial;
  private readonly glassesMat: THREE.MeshLambertMaterial;

  private animPhase = 0;
  private jumpT = 0;
  private tall = 1;
  private wide = 1;
  private armThin = 1;
  private hatStyle: HatStyle = 'none';
  private capeStyle: CapeStyle = 'none';
  private backpackStyle: BackpackStyle = 'none';
  private skinLoadGen = 0;
  private previewPose: AvatarPose = 'stand';
  private previewMove = 0;

  constructor() {
    this.headMats = this.makePartMats('head', false);
    this.bodyMats = this.makePartMats('body', false);
    this.armRMats = this.makePartMats('armR', false);
    this.armLMats = this.makePartMats('armL', false);
    this.legRMats = this.makePartMats('legR', false);
    this.legLMats = this.makePartMats('legL', false);
    this.hatMats = this.makePartMats('hat', true);
    this.overlays = createAvatarOverlayMeshes(
      (part) => makeOverlayPartMats(part, this.overlayCanvases, this.overlayTextures),
    );

    this.accentMat = new THREE.MeshStandardMaterial({
      color: '#e8c56a',
      roughness: 0.72,
      metalness: 0.04,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    this.capeMat = new THREE.MeshLambertMaterial({
      color: '#5ec4b0',
      emissive: 0x1a3030,
      emissiveIntensity: 0.3,
      side: THREE.DoubleSide,
    });
    this.glassesMat = new THREE.MeshLambertMaterial({
      color: '#1a1a1a',
      transparent: true,
      opacity: 0.85,
    });

    this.head = makeBox(HEAD, HEAD, HEAD, this.headMats);
    this.torso = makeBox(TORSO_W, TORSO_H, TORSO_D, this.bodyMats);
    this.armL = makeBox(ARM_W, ARM_H, ARM_W, this.armLMats, true);
    this.armR = makeBox(ARM_W, ARM_H, ARM_W, this.armRMats, true);
    this.legL = makeBox(LEG_W, LEG_H, LEG_W, this.legLMats, true);
    this.legR = makeBox(LEG_W, LEG_H, LEG_W, this.legRMats, true);
    this.hatOverlay = makeBox(HEAD, HEAD, HEAD, this.hatMats);
    const hatShell = 1 + (2 * OVERLAY_SHELL) / HEAD;
    this.hatOverlay.scale.setScalar(hatShell);
    this.hatOverlay.renderOrder = 2;
    this.hatOverlay.visible = false;
    this.hatMesh = makeBox(HEAD * 1.12, 0.12, HEAD * 1.12, this.accentMat);
    this.hatMesh.visible = false;
    this.capeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.82, 0.07), this.capeMat);
    this.capeMesh.visible = false;
    this.glassesMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.12, 0.09), this.glassesMat);
    this.glassesMesh.visible = false;
    this.backpackMesh = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.42, 0.18), this.accentMat);
    this.backpackMesh.visible = false;
    this.beltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.08, 0.34), this.accentMat);
    this.beltMesh.visible = false;

    this.head.userData.skinPart = 'head';
    this.torso.userData.skinPart = 'body';
    this.armR.userData.skinPart = 'armR';
    this.armL.userData.skinPart = 'armL';
    this.legR.userData.skinPart = 'legR';
    this.legL.userData.skinPart = 'legL';
    this.hatOverlay.userData.skinPart = 'hat';

    this.torso.add(this.overlays.bodyOL);
    this.armR.add(this.overlays.armROL);
    this.armL.add(this.overlays.armLOL);
    this.legR.add(this.overlays.legROL);
    this.legL.add(this.overlays.legLOL);

    this.body.add(
      this.head,
      this.torso,
      this.armL,
      this.armR,
      this.legL,
      this.legR,
      this.hatOverlay,
      this.hatMesh,
      this.capeMesh,
      this.glassesMesh,
      this.backpackMesh,
      this.beltMesh,
    );
    this.root.add(this.body);
    this.layout('classic');
    this.syncTextures();
    this.root.visible = false;
  }

  applyProfile(profile: Profile): void {
    this.accentMat.color.set(profile.accent);
    this.capeMat.color.set(profile.accent);
    this.layout(profile.style);
    this.setHat(profile.hat);
    this.setCape(profile.cape);
    this.setGlasses(profile.glasses);
    this.setBackpack(profile.backpack ?? 'none');
    this.setBelt(profile.belt ?? 'none');

    const cosmetics = {
      hair: profile.hair,
      eyes: profile.eyes,
      shoes: profile.shoes,
      hairStyle: profile.hairStyle,
      face: profile.face,
      facial: profile.facial,
      sleeves: profile.sleeves,
      pants: profile.pants,
      outfit: profile.outfit,
      skin: profile.skin,
      accent: profile.accent,
      renderMode: 'block' as const,
    };

    if (profile.skinData) {
      const gen = ++this.skinLoadGen;
      void decodeSkin(profile.skinData)
        .then((pixels) => {
          if (gen !== this.skinLoadGen) return;
          this.skinPixels = pixels;
          this.syncTextures();
        })
        .catch(() => {
          if (gen !== this.skinLoadGen) return;
          this.skinPixels = createDefaultSkin(
            profile.skin,
            profile.outfit,
            profile.accent,
            cosmetics,
          );
          this.syncTextures();
        });
    } else {
      this.skinLoadGen++;
      this.skinPixels = createDefaultSkin(profile.skin, profile.outfit, profile.accent, cosmetics);
      this.syncTextures();
    }
  }

  applySkinPixels(pixels: Uint8ClampedArray): void {
    this.skinLoadGen++;
    this.skinPixels = cloneSkin(pixels);
    this.syncTextures();
  }

  /** Meshes that can be painted in the 3D skin editor. */
  getPaintTargets(): { mesh: THREE.Mesh; part: SkinPart }[] {
    return [
      { mesh: this.head, part: 'head' },
      { mesh: this.torso, part: 'body' },
      { mesh: this.armR, part: 'armR' },
      { mesh: this.armL, part: 'armL' },
      { mesh: this.legR, part: 'legR' },
      { mesh: this.legL, part: 'legL' },
      { mesh: this.hatOverlay, part: 'hat' },
    ];
  }

  private makePartMats(part: SkinPart, transparent: boolean): PartMats {
    return BOX_FACES.map((face) => {
      const key = `${part}:${face}`;
      const canvas = document.createElement('canvas');
      const rect = PART_UV[part][face];
      canvas.width = rect.w;
      canvas.height = rect.h;
      this.partCanvases.set(key, canvas);
      const tex = new THREE.CanvasTexture(canvas);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      this.partTextures.set(key, tex);
      return new THREE.MeshLambertMaterial({
        map: tex,
        color: 0xffffff,
        emissive: 0x000000,
        emissiveIntensity: 0,
        transparent,
        alphaTest: transparent ? 0.15 : 0,
        side: transparent ? THREE.DoubleSide : THREE.FrontSide,
      });
    });
  }

  private syncTextures(): void {
    for (const part of Object.keys(PART_UV) as SkinPart[]) {
      for (const face of BOX_FACES) {
        const key = `${part}:${face}`;
        const canvas = this.partCanvases.get(key);
        const tex = this.partTextures.get(key);
        if (!canvas || !tex) continue;
        copyRectToCanvas(this.skinPixels, PART_UV[part][face], canvas, BOX_FACE_SYNC[face]);
        tex.needsUpdate = true;
      }
    }
    let hatPixels = 0;
    for (const face of BOX_FACES) {
      const r = PART_UV.hat[face];
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          const i = (y * SKIN_SIZE + x) * 4;
          const a = this.skinPixels[i + 3]!;
          if (
            a > 16 &&
            this.skinPixels[i]! + this.skinPixels[i + 1]! + this.skinPixels[i + 2]! > 0
          ) {
            hatPixels++;
          }
        }
      }
    }
    this.hatOverlay.visible = hatPixels > 4;
    syncOverlayTextures(
      this.skinPixels,
      this.overlayCanvases,
      this.overlayTextures,
      (part, visible) => {
        this.overlays[part].visible = visible;
      },
    );
  }

  private layout(style: AvatarStyle): void {
    if (style === 'tall') {
      this.tall = 1.14;
      this.wide = 0.9;
      this.armThin = 0.92;
    } else if (style === 'stocky') {
      this.tall = 0.9;
      this.wide = 1.22;
      this.armThin = 1.08;
    } else if (style === 'slim') {
      this.tall = 1.08;
      this.wide = 0.82;
      this.armThin = 0.68;
    } else {
      this.tall = 1;
      this.wide = 1;
      this.armThin = 1;
    }
    this.applyRestPose();
  }

  private setHat(hat: HatStyle): void {
    this.hatStyle = hat;
    this.hatMesh.visible = hat !== 'none';
    switch (hat) {
      case 'cap':
        this.hatMesh.scale.set(1, 0.75, 1.25);
        break;
      case 'band':
        this.hatMesh.scale.set(1.05, 0.35, 1.05);
        break;
      case 'hood':
        this.hatMesh.scale.set(1.18, 1.15, 1.12);
        break;
      case 'beanie':
        this.hatMesh.scale.set(1.1, 0.55, 1.1);
        break;
      case 'visor':
        this.hatMesh.scale.set(1.22, 0.28, 1.38);
        break;
      case 'crown':
        this.hatMesh.scale.set(1.15, 0.9, 1.15);
        break;
      case 'helm':
        this.hatMesh.scale.set(1.2, 1.05, 1.2);
        break;
      default:
        this.hatMesh.scale.set(1, 1, 1);
    }
  }

  private setCape(cape: CapeStyle): void {
    this.capeStyle = cape;
    this.capeMesh.visible = cape !== 'none';
    if (cape === 'short') this.capeMesh.scale.set(1, 0.65, 1);
    else if (cape === 'long') this.capeMesh.scale.set(1.05, 1.15, 1);
    else this.capeMesh.scale.set(1, 1, 1);
  }

  private setGlasses(glasses: GlassesStyle): void {
    this.glassesMesh.visible = glasses !== 'none';
    if (glasses === 'round') {
      this.glassesMesh.scale.set(0.95, 0.85, 1);
      this.glassesMat.color.set('#2a2a2a');
      this.glassesMat.opacity = 0.55;
    } else if (glasses === 'square') {
      this.glassesMesh.scale.set(1.05, 0.9, 1);
      this.glassesMat.color.set('#1a1a1a');
      this.glassesMat.opacity = 0.7;
    } else if (glasses === 'shades') {
      this.glassesMesh.scale.set(1.08, 0.75, 1.1);
      this.glassesMat.color.set('#111111');
      this.glassesMat.opacity = 0.92;
    } else {
      this.glassesMesh.scale.set(1, 1, 1);
    }
  }

  private setBackpack(style: BackpackStyle): void {
    this.backpackStyle = style;
    this.backpackMesh.visible = style !== 'none';
    if (style === 'satchel') this.backpackMesh.scale.set(0.85, 0.7, 0.9);
    else if (style === 'pack') this.backpackMesh.scale.set(1, 1, 1);
    else this.backpackMesh.scale.set(1, 1, 1);
  }

  private setBelt(style: BeltStyle): void {
    this.beltMesh.visible = style !== 'none';
    if (style === 'utility') this.beltMesh.scale.set(1.05, 1.25, 1.1);
    else if (style === 'leather') this.beltMesh.scale.set(1, 1, 1);
    else this.beltMesh.scale.set(1, 1, 1);
  }

  /** Menu preview: idle / walk / sneak / sit. */
  setPreviewMotion(pose: AvatarPose, moveAmt = 0): void {
    this.previewPose = pose;
    this.previewMove = moveAmt;
  }

  getPreviewMotion(): { pose: AvatarPose; move: number } {
    return { pose: this.previewPose, move: this.previewMove };
  }

  private applyRestPose(): void {
    const t = this.tall;
    const w = this.wide;

    const legH = LEG_H * t;
    const torsoH = TORSO_H * t;
    const headH = HEAD * t;
    const hipY = legH;
    const torsoCenterY = hipY + torsoH * 0.5;
    const shoulderY = hipY + torsoH - 0.04 * t;
    const headCenterY = hipY + torsoH + headH * 0.5;
    const hatY = hipY + torsoH + headH + 0.02 * t;
    const hatShell = 1 + (2 * OVERLAY_SHELL) / HEAD;

    this.head.scale.set(w, t, w);
    this.torso.scale.set(w, t, 1);
    this.armL.scale.set(this.armThin, t, this.armThin);
    this.armR.scale.set(this.armThin, t, this.armThin);
    this.legL.scale.set(w, t, 1);
    this.legR.scale.set(w, t, 1);
    this.hatOverlay.scale.set(w * hatShell, t * hatShell, w * hatShell);

    this.body.position.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.torso.rotation.set(0, 0, 0);
    this.armL.rotation.set(0, 0, 0.08);
    this.armR.rotation.set(0, 0, -0.08);
    this.legL.rotation.set(0, 0, 0);
    this.legR.rotation.set(0, 0, 0);

    this.legR.position.set(-0.13 * w, hipY, 0);
    this.legL.position.set(0.13 * w, hipY, 0);
    this.torso.position.set(0, torsoCenterY, 0);
    // Face = +Z: character right = −X, character left = +X.
    this.armR.position.set(-(TORSO_W * 0.5 * w + ARM_W * 0.32 * this.armThin), shoulderY, 0);
    this.armL.position.set(TORSO_W * 0.5 * w + ARM_W * 0.32 * this.armThin, shoulderY, 0);
    this.head.position.set(0, headCenterY, 0);
    this.hatOverlay.position.set(0, headCenterY, 0);
    this.hatMesh.position.set(
      0,
      hatY,
      this.hatStyle === 'cap' || this.hatStyle === 'visor'
        ? 0.05
        : this.hatStyle === 'hood' || this.hatStyle === 'helm'
          ? -0.03
          : 0,
    );
    // +Z is face-forward (glasses); cape hangs on the back (−Z).
    this.capeMesh.position.set(0, torsoCenterY + 0.05 * t, -(TORSO_D * 0.55 * w + 0.04));
    this.capeMesh.rotation.x = this.capeStyle === 'long' ? -0.12 : -0.06;
    this.glassesMesh.position.set(0, headCenterY + 0.02 * t, HEAD * 0.48 * w);
    this.backpackMesh.position.set(
      0,
      torsoCenterY + (this.backpackStyle === 'satchel' ? -0.06 : 0.02) * t,
      -(TORSO_D * 0.55 * w + 0.12),
    );
    this.beltMesh.position.set(0, hipY + 0.06 * t, 0);
  }

  update(
    dt: number,
    moveAmt: number,
    grounded: boolean,
    verticalVel: number,
    pose: AvatarPose = 'stand',
    justJumped = false,
  ): void {
    if (justJumped) this.jumpT = 0.35;
    if (this.jumpT > 0) this.jumpT = Math.max(0, this.jumpT - dt);

    const speed = Math.min(1.5, Math.max(0, moveAmt));
    if (grounded && speed > 0.05 && pose === 'stand') this.animPhase += dt * (8 + speed * 7);
    else if (pose === 'sneak' && speed > 0.05) this.animPhase += dt * (5 + speed * 4);
    else this.animPhase += dt * 1.4;

    if (pose === 'sit') {
      this.poseSit();
      return;
    }
    if (pose === 'crawl' && grounded) {
      this.poseCrawl(speed);
      return;
    }
    if (pose === 'sneak' && grounded) {
      this.poseSneak(speed);
      return;
    }
    if (!grounded || this.jumpT > 0) {
      this.poseJump(verticalVel, grounded);
      return;
    }

    const swing = Math.sin(this.animPhase) * Math.min(1, speed) * 0.7;
    const breathe = speed < 0.05 ? Math.sin(this.animPhase) * 0.035 : 0;

    this.applyRestPose();
    if (speed > 0.05) {
      this.armL.rotation.x = swing;
      this.armR.rotation.x = -swing;
      this.legL.rotation.x = -swing * 1.1;
      this.legR.rotation.x = swing * 1.1;
      this.torso.rotation.x = -0.04 * speed;
      this.head.rotation.x = 0.025 * speed;
      this.hatOverlay.rotation.x = this.head.rotation.x;
      this.body.position.y = Math.abs(Math.sin(this.animPhase * 2)) * 0.04 * speed;
    } else {
      this.armL.rotation.x = breathe;
      this.armR.rotation.x = -breathe;
      this.torso.rotation.x = breathe * 0.35;
      this.head.rotation.x = breathe * 0.2;
      this.hatOverlay.rotation.x = this.head.rotation.x;
      this.body.position.y = breathe * 0.3;
    }
  }

  private poseJump(verticalVel: number, grounded: boolean): void {
    this.applyRestPose();
    const rising = verticalVel > 0.4 || this.jumpT > 0.18;
    const tuck = THREE.MathUtils.clamp(-verticalVel * 0.08, -0.25, 0.7);
    const launch = Math.min(1, this.jumpT / 0.35);

    if (rising) {
      this.armL.rotation.x = -0.95 - launch * 0.3;
      this.armR.rotation.x = -0.95 - launch * 0.3;
      this.armL.rotation.z = 0.32;
      this.armR.rotation.z = -0.32;
      this.legL.rotation.x = -0.12;
      this.legR.rotation.x = 0.22;
      this.torso.rotation.x = -0.16;
      this.head.rotation.x = 0.1;
      this.body.position.y = 0.035 * launch;
    } else {
      this.armL.rotation.x = -0.3;
      this.armR.rotation.x = -0.3;
      this.armL.rotation.z = 0.18;
      this.armR.rotation.z = -0.18;
      this.legL.rotation.x = 0.5 + tuck * 0.45;
      this.legR.rotation.x = 0.32 + tuck * 0.3;
      this.torso.rotation.x = 0.06;
      this.head.rotation.x = -0.06;
      this.body.position.y = grounded ? 0 : -0.02;
    }
    this.hatOverlay.rotation.x = this.head.rotation.x;
  }

  private poseCrawl(speed: number): void {
    this.applyRestPose();
    const swing = Math.sin(this.animPhase) * Math.min(1, speed) * 0.4;
    this.body.position.y = -0.68 * this.tall;
    this.torso.rotation.x = 1.35;
    this.head.rotation.x = -1.25;
    this.hatOverlay.rotation.x = this.head.rotation.x;
    this.armL.rotation.x = -1.2 + swing;
    this.armR.rotation.x = -1.2 - swing;
    this.legL.rotation.x = 1.4 - swing;
    this.legR.rotation.x = 1.4 + swing;
  }

  private poseSneak(speed: number): void {
    this.applyRestPose();
    const swing = Math.sin(this.animPhase) * Math.min(1, speed) * 0.32;
    this.body.position.y = -0.22 * this.tall;
    this.torso.rotation.x = 0.32;
    this.head.rotation.x = -0.1;
    this.hatOverlay.rotation.x = this.head.rotation.x;
    this.armL.rotation.x = 0.5 + swing;
    this.armR.rotation.x = 0.5 - swing;
    this.armL.rotation.z = 0.12;
    this.armR.rotation.z = -0.12;
    this.legL.rotation.x = 0.5 - swing * 0.75;
    this.legR.rotation.x = 0.5 + swing * 0.75;
  }

  private poseSit(): void {
    this.applyRestPose();
    this.body.position.y = -0.48 * this.tall;
    this.torso.rotation.x = 0.1;
    this.armL.rotation.x = 0.8;
    this.armR.rotation.x = 0.8;
    this.armL.rotation.z = 0.18;
    this.armR.rotation.z = -0.18;
    this.legL.rotation.x = 1.4;
    this.legR.rotation.x = 1.4;
    this.legL.position.z = 0.1;
    this.legR.position.z = 0.1;
  }
}

function makeBox(
  w: number,
  h: number,
  d: number,
  mats: THREE.Material | THREE.Material[],
  pivotTop = false,
): THREE.Mesh {
  const g = new THREE.BoxGeometry(w, h, d);
  if (pivotTop) g.translate(0, -h * 0.5, 0);
  const m = new THREE.Mesh(g, mats);
  m.castShadow = true;
  m.receiveShadow = false;
  return m;
}
