import * as THREE from 'three';
import type { ChunkManager } from '../world/ChunkManager';
import { Item } from '../player/items';

export type MobType = 'zombie' | 'pig' | 'cow';

export interface MobDrop {
  itemId: number;
  count: number;
}

export class Mob {
  readonly group: THREE.Group;
  readonly type: MobType;
  readonly id: string;

  position = new THREE.Vector3();
  velocity = new THREE.Vector3();
  yaw = 0;

  health: number;
  maxHealth: number;
  isDead = false;
  deathTimer = 0;

  private onGround = false;
  private hitFlashTimer = 0;
  private attackCooldown = 0;
  private walkPhase = 0;
  private wanderTimer = 0;
  private wanderDir = new THREE.Vector3();

  // Mesh parts for limb animation
  private headMesh!: THREE.Mesh;
  private bodyMesh!: THREE.Mesh;
  private limbMeshes: THREE.Mesh[] = [];
  private baseMaterials: THREE.Material[] = [];
  private hitMaterial = new THREE.MeshBasicMaterial({ color: 0xff3333 });

  constructor(
    type: MobType,
    pos: THREE.Vector3,
    private chunks: ChunkManager,
  ) {
    this.type = type;
    this.id = `${type}_${Math.random().toString(36).slice(2, 9)}`;
    this.position.copy(pos);
    this.group = new THREE.Group();
    this.group.position.copy(pos);

    if (type === 'zombie') {
      this.health = 20;
      this.maxHealth = 20;
      this.buildZombieModel();
    } else if (type === 'pig') {
      this.health = 10;
      this.maxHealth = 10;
      this.buildPigModel();
    } else {
      this.health = 12;
      this.maxHealth = 12;
      this.buildCowModel();
    }

    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (Array.isArray(obj.material)) {
          this.baseMaterials.push(...obj.material);
        } else {
          this.baseMaterials.push(obj.material);
        }
      }
    });
  }

  private buildZombieModel(): void {
    const texLoader = new THREE.TextureLoader();
    const skinTex = texLoader.load('/textures/goodvibes/entity/zombie/zombie.png');
    skinTex.magFilter = THREE.NearestFilter;
    skinTex.minFilter = THREE.NearestFilter;

    const mat = new THREE.MeshLambertMaterial({
      map: skinTex,
      color: 0x55aa66,
    });

    // Head
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    this.headMesh = new THREE.Mesh(headGeo, mat);
    this.headMesh.position.set(0, 1.6, 0);
    this.group.add(this.headMesh);

    // Torso (Cyan/Blue shirt)
    const torsoMat = new THREE.MeshLambertMaterial({ color: 0x3388aa });
    const torsoGeo = new THREE.BoxGeometry(0.5, 0.7, 0.28);
    this.bodyMesh = new THREE.Mesh(torsoGeo, torsoMat);
    this.bodyMesh.position.set(0, 1.0, 0);
    this.group.add(this.bodyMesh);

    // Arms outstretched forward
    const armGeo = new THREE.BoxGeometry(0.2, 0.65, 0.2);
    const leftArm = new THREE.Mesh(armGeo, mat);
    leftArm.position.set(-0.35, 1.0, 0.3);
    leftArm.rotation.x = -Math.PI / 2; // Arms pointing forward
    this.group.add(leftArm);
    this.limbMeshes.push(leftArm);

    const rightArm = new THREE.Mesh(armGeo, mat);
    rightArm.position.set(0.35, 1.0, 0.3);
    rightArm.rotation.x = -Math.PI / 2;
    this.group.add(rightArm);
    this.limbMeshes.push(rightArm);

    // Legs (Purple/Dark blue pants)
    const legMat = new THREE.MeshLambertMaterial({ color: 0x2b3366 });
    const legGeo = new THREE.BoxGeometry(0.22, 0.65, 0.22);
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.14, 0.33, 0);
    this.group.add(leftLeg);
    this.limbMeshes.push(leftLeg);

    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.14, 0.33, 0);
    this.group.add(rightLeg);
    this.limbMeshes.push(rightLeg);
  }

  private buildPigModel(): void {
    const texLoader = new THREE.TextureLoader();
    const skinTex = texLoader.load('/textures/goodvibes/entity/pig/pig.png');
    skinTex.magFilter = THREE.NearestFilter;
    skinTex.minFilter = THREE.NearestFilter;

    const pigMat = new THREE.MeshLambertMaterial({
      map: skinTex,
      color: 0xf5a4b8,
    });

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.5, 0.8);
    this.bodyMesh = new THREE.Mesh(bodyGeo, pigMat);
    this.bodyMesh.position.set(0, 0.55, 0);
    this.group.add(this.bodyMesh);

    // Head + Snout
    const headGeo = new THREE.BoxGeometry(0.44, 0.44, 0.44);
    this.headMesh = new THREE.Mesh(headGeo, pigMat);
    this.headMesh.position.set(0, 0.7, 0.45);
    this.group.add(this.headMesh);

    const snoutGeo = new THREE.BoxGeometry(0.22, 0.14, 0.1);
    const snoutMesh = new THREE.Mesh(snoutGeo, new THREE.MeshLambertMaterial({ color: 0xe08498 }));
    snoutMesh.position.set(0, -0.08, 0.24);
    this.headMesh.add(snoutMesh);

    // 4 Legs
    const legGeo = new THREE.BoxGeometry(0.18, 0.35, 0.18);
    const legPositions: [number, number, number][] = [
      [-0.2, 0.18, -0.25],
      [0.2, 0.18, -0.25],
      [-0.2, 0.18, 0.25],
      [0.2, 0.18, 0.25],
    ];
    for (const [lx, ly, lz] of legPositions) {
      const leg = new THREE.Mesh(legGeo, pigMat);
      leg.position.set(lx, ly, lz);
      this.group.add(leg);
      this.limbMeshes.push(leg);
    }
  }

  private buildCowModel(): void {
    const texLoader = new THREE.TextureLoader();
    const skinTex = texLoader.load('/textures/goodvibes/entity/cow/cow.png');
    skinTex.magFilter = THREE.NearestFilter;
    skinTex.minFilter = THREE.NearestFilter;

    const cowMat = new THREE.MeshLambertMaterial({
      map: skinTex,
      color: 0x6e5241,
    });

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.7, 0.65, 0.95);
    this.bodyMesh = new THREE.Mesh(bodyGeo, cowMat);
    this.bodyMesh.position.set(0, 0.75, 0);
    this.group.add(this.bodyMesh);

    // Head
    const headGeo = new THREE.BoxGeometry(0.48, 0.48, 0.48);
    this.headMesh = new THREE.Mesh(headGeo, cowMat);
    this.headMesh.position.set(0, 0.95, 0.55);
    this.group.add(this.headMesh);

    // Horns
    const hornGeo = new THREE.BoxGeometry(0.08, 0.16, 0.08);
    const hornMat = new THREE.MeshLambertMaterial({ color: 0xd4cfc9 });
    const leftHorn = new THREE.Mesh(hornGeo, hornMat);
    leftHorn.position.set(-0.25, 0.24, 0);
    this.headMesh.add(leftHorn);
    const rightHorn = new THREE.Mesh(hornGeo, hornMat);
    rightHorn.position.set(0.25, 0.24, 0);
    this.headMesh.add(rightHorn);

    // 4 Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.45, 0.2);
    const legPositions: [number, number, number][] = [
      [-0.24, 0.23, -0.32],
      [0.24, 0.23, -0.32],
      [-0.24, 0.23, 0.32],
      [0.24, 0.23, 0.32],
    ];
    for (const [lx, ly, lz] of legPositions) {
      const leg = new THREE.Mesh(legGeo, cowMat);
      leg.position.set(lx, ly, lz);
      this.group.add(leg);
      this.limbMeshes.push(leg);
    }
  }

  takeDamage(amount: number, knockbackDir?: THREE.Vector3): boolean {
    if (this.isDead || amount <= 0) return false;
    this.health = Math.max(0, this.health - amount);
    this.hitFlashTimer = 0.25;

    if (knockbackDir) {
      this.velocity.x += knockbackDir.x * 4.5;
      this.velocity.y = Math.max(this.velocity.y, 4.0);
      this.velocity.z += knockbackDir.z * 4.5;
    }

    if (this.health <= 0) {
      this.isDead = true;
      this.deathTimer = 0.6;
    }
    return true;
  }

  getDrops(): MobDrop[] {
    if (this.type === 'zombie') {
      const isApple = Math.random() < 0.4;
      return isApple
        ? [{ itemId: Item.Apple, count: 1 }]
        : [{ itemId: Item.Stick, count: 1 + Math.floor(Math.random() * 2) }];
    }
    if (this.type === 'pig') {
      return [{ itemId: Item.Porkchop, count: 1 + Math.floor(Math.random() * 2) }];
    }
    // Cow
    return [{ itemId: Item.Beef, count: 1 + Math.floor(Math.random() * 2) }];
  }

  update(
    dt: number,
    playerPos: THREE.Vector3,
    isNight: boolean,
    onAttackPlayer?: (dmg: number) => void,
  ): void {
    if (this.isDead) {
      this.deathTimer -= dt;
      this.group.rotation.z = Math.min(Math.PI / 2, this.group.rotation.z + dt * 4);
      this.group.position.y -= dt * 0.5;
      return;
    }

    // Hit flash material toggle
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= dt;
      this.setFlash(true);
    } else {
      this.setFlash(false);
    }

    if (this.attackCooldown > 0) {
      this.attackCooldown -= dt;
    }

    // AI logic
    const distToPlayer = this.position.distanceTo(playerPos);
    const wish = new THREE.Vector3();

    if (this.type === 'zombie') {
      // Hostile: pursue player if close or night
      const detectRange = isNight ? 22 : 14;
      if (distToPlayer < detectRange) {
        const toPlayer = new THREE.Vector3(
          playerPos.x - this.position.x,
          0,
          playerPos.z - this.position.z,
        ).normalize();
        this.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);
        wish.copy(toPlayer).multiplyScalar(3.2);

        // Melee attack player if within 1.5 blocks
        if (distToPlayer < 1.55 && this.attackCooldown <= 0) {
          this.attackCooldown = 1.0;
          onAttackPlayer?.(3);
        }
      } else {
        this.updateWandering(dt, wish, 1.4);
      }
    } else {
      // Passive: wander
      this.updateWandering(dt, wish, 1.2);
    }

    // Movement physics & collision
    this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, wish.x, dt * 8);
    this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, wish.z, dt * 8);
    this.velocity.y -= 26 * dt; // Gravity

    // Voxel collision step
    this.moveAndCollide(dt);

    // Leg animation
    const speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed > 0.2 && this.onGround) {
      this.walkPhase += dt * speed * 6;
      this.animateLimbs(this.walkPhase);
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.yaw;
  }

  private updateWandering(dt: number, wish: THREE.Vector3, speed: number): void {
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 2 + Math.random() * 4;
      if (Math.random() < 0.6) {
        const ang = Math.random() * Math.PI * 2;
        this.wanderDir.set(Math.sin(ang), 0, Math.cos(ang));
        this.yaw = ang;
      } else {
        this.wanderDir.set(0, 0, 0);
      }
    }
    wish.copy(this.wanderDir).multiplyScalar(speed);
  }

  private animateLimbs(phase: number): void {
    const swing = Math.sin(phase) * 0.45;
    if (this.type === 'zombie') {
      if (this.limbMeshes[2]) this.limbMeshes[2].rotation.x = swing;
      if (this.limbMeshes[3]) this.limbMeshes[3].rotation.x = -swing;
    } else {
      // 4 legged animals
      if (this.limbMeshes[0]) this.limbMeshes[0].rotation.x = swing;
      if (this.limbMeshes[1]) this.limbMeshes[1].rotation.x = -swing;
      if (this.limbMeshes[2]) this.limbMeshes[2].rotation.x = -swing;
      if (this.limbMeshes[3]) this.limbMeshes[3].rotation.x = swing;
    }
  }

  private moveAndCollide(dt: number): void {
    const nextX = this.position.x + this.velocity.x * dt;
    const nextY = this.position.y + this.velocity.y * dt;
    const nextZ = this.position.z + this.velocity.z * dt;

    // Y movement
    if (this.velocity.y < 0) {
      const groundBlockY = Math.floor(nextY);
      const isSolidBelow = this.chunks.isSolidAt(
        Math.floor(this.position.x),
        groundBlockY,
        Math.floor(this.position.z),
      );
      if (isSolidBelow && nextY <= groundBlockY + 1.0) {
        this.position.y = groundBlockY + 1.0;
        this.velocity.y = 0;
        this.onGround = true;
      } else {
        this.position.y = nextY;
        this.onGround = false;
      }
    } else {
      this.position.y = nextY;
      this.onGround = false;
    }

    // X / Z collision + auto step jump
    const checkSolid = (x: number, y: number, z: number) =>
      this.chunks.isSolidAt(Math.floor(x), Math.floor(y), Math.floor(z));

    const waistY = this.position.y + 0.6;
    const feetY = this.position.y + 0.1;

    // Check X
    if (checkSolid(nextX, feetY, this.position.z)) {
      if (this.onGround && !checkSolid(nextX, waistY + 0.5, this.position.z)) {
        this.velocity.y = 6.2; // Jump over 1 block
      }
      this.velocity.x = 0;
    } else {
      this.position.x = nextX;
    }

    // Check Z
    if (checkSolid(this.position.x, feetY, nextZ)) {
      if (this.onGround && !checkSolid(this.position.x, waistY + 0.5, nextZ)) {
        this.velocity.y = 6.2;
      }
      this.velocity.z = 0;
    } else {
      this.position.z = nextZ;
    }
  }

  private setFlash(flash: boolean): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.material = flash ? this.hitMaterial : (obj.userData.origMat || obj.material);
        if (!obj.userData.origMat) obj.userData.origMat = obj.material;
      }
    });
  }

  dispose(): void {
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
    this.group.removeFromParent();
  }
}
