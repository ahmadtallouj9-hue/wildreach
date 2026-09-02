import * as THREE from 'three';
import { PlayerConfig } from './PlayerConfig';
import { getBlockMovementProperties } from './BlockMovementProperties';
import type { PlayerCollision } from './PlayerCollision';
import type { PlayerInputSnapshot } from './PlayerInput';
import type { PlayerDamage } from './PlayerDamage';
import type { PlayerHunger } from './PlayerHunger';
import type { MovementState, PlayerLandedEvent } from './PlayerState';
import type { ChunkManager, CollisionAvailability } from '../world/ChunkManager';

export class PlayerPhysics {
  position = new THREE.Vector3(0, 80, 0);
  previousPosition = new THREE.Vector3(0, 80, 0);
  velocity = new THREE.Vector3();

  grounded = false;
  movementState: MovementState = 'idle';
  sprinting = false;
  sneaking = false;
  crawling = false;
  sitting = false;
  inWater = false;
  deepWater = false;
  inLava = false;
  lavaSubmersion = 0;
  blockedByStreaming = false;
  collisionAvailability: CollisionAvailability = 'READY';

  fallDistance = 0;
  private fallStartY: number | null = null;
  private justJumped = false;
  private lastJumpSource: 'input' | 'auto' | null = null;

  private onLandedCallbacks: Array<(evt: PlayerLandedEvent) => void> = [];

  constructor(
    private collision: PlayerCollision,
    private chunks: ChunkManager,
  ) {}

  onLanded(cb: (evt: PlayerLandedEvent) => void): () => void {
    this.onLandedCallbacks.push(cb);
    return () => {
      this.onLandedCallbacks = this.onLandedCallbacks.filter((c) => c !== cb);
    };
  }

  get currentHeight(): number {
    if (this.sitting) return PlayerConfig.dimensions.sittingHeight;
    if (this.crawling) return PlayerConfig.dimensions.crawlingHeight;
    if (this.sneaking) return PlayerConfig.dimensions.sneakingHeight;
    return PlayerConfig.dimensions.standingHeight;
  }

  get currentEyeHeight(): number {
    if (this.sitting) return PlayerConfig.dimensions.sittingEye;
    if (this.crawling) return PlayerConfig.dimensions.crawlingEye;
    if (this.sneaking) return PlayerConfig.dimensions.sneakingEye;
    return PlayerConfig.dimensions.standingEye;
  }

  get wasJustJumped(): boolean {
    return this.justJumped;
  }

  get jumpSource(): 'input' | 'auto' | null {
    return this.lastJumpSource;
  }

  /**
   * Executes a jump matching Minecraft Java Edition impulse physics.
   */
  private executeJump(
    hungerSystem: PlayerHunger,
    source: 'input' | 'auto',
    lookYaw: number,
  ): void {
    this.velocity.y = PlayerConfig.movement.jumpVelocity; // 0.42 blocks/tick
    if (this.sprinting) {
      const sinYaw = Math.sin(lookYaw);
      const cosYaw = Math.cos(lookYaw);
      this.velocity.x += -sinYaw * PlayerConfig.movement.sprintJumpForwardBoost;
      this.velocity.z += -cosYaw * PlayerConfig.movement.sprintJumpForwardBoost;
    }
    this.grounded = false;
    this.justJumped = true;
    this.lastJumpSource = source;
    hungerSystem.recordJump(this.sprinting);
  }

  /**
   * Deterministic 20 Hz simulation tick matching Minecraft Java Edition.
   */
  simulateTick(
    input: PlayerInputSnapshot,
    lookYaw: number,
    damageSystem: PlayerDamage,
    hungerSystem: PlayerHunger,
  ): void {
    this.justJumped = false;
    this.previousPosition.copy(this.position);

    if (damageSystem.isDead) {
      this.movementState = 'dead';
      this.velocity.set(0, 0, 0);
      return;
    }

    this.blockedByStreaming = false;
    this.collisionAvailability = 'READY';

    // A restored/player position must itself be backed by authoritative voxel
    // data before pose or physics logic interprets missing space as Air.
    const currentBox = this.collision.getPlayerAABB(
      this.position,
      PlayerConfig.dimensions.width,
      PlayerConfig.dimensions.standingHeight,
    );
    const currentAvailability = this.collision.getCollisionAvailabilityForRegion(
      currentBox.minX,
      currentBox.minY,
      currentBox.minZ,
      currentBox.maxX,
      currentBox.maxY,
      currentBox.maxZ,
    );
    if (currentAvailability !== 'READY') {
      this.blockedByStreaming = true;
      this.collisionAvailability = currentAvailability;
      this.velocity.set(0, 0, 0);
      this.sprinting = false;
      this.grounded = false;
      this.movementState = 'idle';
      return;
    }

    // 1. Stand up from sitting on movement key
    if (this.sitting && (input.forward || input.backward || input.left || input.right || input.jumpHeld)) {
      this.sitting = false;
    }

    // 2. Pose & Ceiling Clearance Verification (Crawl / Sneak / Stand)
    const canStand = this.collision.canStandUp(this.position);
    const canSneak = this.collision.canSneakUp(this.position);

    if (!canStand) {
      // Under low ceiling: force appropriate low space pose
      if (!canSneak) {
        this.crawling = true;
        this.sneaking = false;
      } else {
        this.sneaking = true;
        this.crawling = false;
      }
    } else {
      // Sufficient standing headroom available
      this.crawling = false;
      if (input.sneakHeld && !this.sitting) {
        this.sneaking = true;
      } else {
        this.sneaking = false;
      }
    }

    // 3. Sprint state verification with hunger requirement
    const wantsSprint = input.sprintHeld || input.sprintPressed;
    if (
      wantsSprint &&
      input.forward &&
      !this.sneaking &&
      !this.crawling &&
      !this.sitting &&
      hungerSystem.canSprint
    ) {
      this.sprinting = true;
    } else if (!input.forward || this.sneaking || this.crawling || this.sitting || !hungerSystem.canSprint) {
      this.sprinting = false;
    }

    // 4. Fluid state determination
    const height = this.currentHeight;
    this.inLava = this.chunks.isBodyInLava(this.position.x, this.position.y, this.position.z, height);
    this.inWater = !this.inLava && this.chunks.isBodyInWater(this.position.x, this.position.y, this.position.z, height);

    const waistY = this.position.y + height * 0.42;
    this.deepWater =
      this.inWater &&
      this.chunks.isWaterAt(Math.floor(this.position.x), Math.floor(waistY), Math.floor(this.position.z));

    if (this.inLava) {
      this.lavaSubmersion = Math.min(1, this.lavaSubmersion + 0.05 * 2.2);
    } else {
      this.lavaSubmersion = Math.max(0, this.lavaSubmersion - 0.05 * 3.5);
    }

    // 5. Horizontal wish direction
    const sinYaw = Math.sin(lookYaw);
    const cosYaw = Math.cos(lookYaw);
    const forward = new THREE.Vector3(-sinYaw, 0, -cosYaw);
    const right = new THREE.Vector3(cosYaw, 0, -sinYaw);

    const wishDir = new THREE.Vector3();
    if (!this.sitting) {
      if (input.forward) wishDir.add(forward);
      if (input.backward) wishDir.sub(forward);
      if (input.right) wishDir.add(right);
      if (input.left) wishDir.sub(right);

      if (input.analogX !== 0 || input.analogZ !== 0) {
        wishDir.addScaledVector(right, input.analogX);
        wishDir.addScaledVector(forward, -input.analogZ);
      }

      if (wishDir.lengthSq() > 1.0) {
        wishDir.normalize();
      }
    }

    // 6. Minecraft Java Acceleration & Friction parameters
    const groundBlock = this.collision.getGroundBlock(this.position);
    const blockProps = getBlockMovementProperties(groundBlock);
    const groundFriction = blockProps.friction; // 0.546 for standard block (S=0.6)
    const airFriction = PlayerConfig.movement.airFriction; // 0.91

    let accel = 0;
    if (this.grounded) {
      // Exact Java formula: f1 = 0.16277136 / (groundFriction^3)
      const q = 0.16277136 / Math.pow(groundFriction, 3);
      let factor: number = PlayerConfig.movement.walkAccelerationFactor; // 0.10
      if (this.sitting) {
        factor = 0;
      } else if (this.crawling) {
        factor *= PlayerConfig.movement.crawlMultiplier; // 0.3
      } else if (this.sneaking) {
        factor *= PlayerConfig.movement.sneakMultiplier; // 0.3
      } else if (this.sprinting) {
        factor *= PlayerConfig.movement.sprintMultiplier; // 1.3
      }
      accel = factor * q * blockProps.accelerationMultiplier;
    } else {
      if (this.sprinting) {
        accel = PlayerConfig.movement.airAccelerationSprint; // 0.026
      } else if (this.sneaking || this.crawling) {
        accel = PlayerConfig.movement.airAccelerationSneak; // 0.006
      } else {
        accel = PlayerConfig.movement.airAccelerationWalk; // 0.020
      }
    }

    if (this.deepWater) {
      accel *= PlayerConfig.movement.waterSpeedMultiplier;
    } else if (this.inLava) {
      accel *= PlayerConfig.movement.lavaSpeedMultiplier;
    }

    // Add acceleration to horizontal velocity
    if (wishDir.lengthSq() > 0) {
      this.velocity.x += wishDir.x * accel;
      this.velocity.z += wishDir.z * accel;
    }

    // 7. Jump Logic (Manual Jump + Holding Space + Auto-Jump)
    const canJump = this.grounded && !this.sitting && !this.deepWater && !this.inLava;
    if (canJump && (input.jumpPressed || input.jumpHeld)) {
      this.executeJump(hungerSystem, 'input', lookYaw);
    } else if (
      canJump &&
      !this.justJumped &&
      PlayerConfig.movement.autoJumpEnabled &&
      !this.sneaking &&
      !this.crawling &&
      wishDir.lengthSq() > 0.01
    ) {
      // Auto-jump candidate detection
      const autoJumpCheck = this.collision.checkAutoJumpCandidate(
        this.position,
        wishDir,
        PlayerConfig.dimensions.width,
        PlayerConfig.dimensions.standingHeight,
      );
      if (autoJumpCheck.canAutoJump) {
        this.executeJump(hungerSystem, 'auto', lookYaw);
      }
    }

    // 8. Vertical Motion & Fluid Mechanics
    if (this.inLava) {
      if (input.jumpHeld && !this.sitting) this.velocity.y += 0.08;
      if (this.sneaking || this.crawling) this.velocity.y -= 0.08;
      this.grounded = false;
    } else if (this.deepWater) {
      if (input.jumpHeld && !this.sitting) this.velocity.y += 0.09;
      if (this.sneaking || this.crawling) this.velocity.y -= 0.08;
      this.grounded = false;
    }

    // 9. Fall Tracking
    if (!this.grounded) {
      if (this.fallStartY === null) {
        this.fallStartY = this.position.y;
      }
    }

    // 10. Collision Resolution with swept AABB + step-up + sneak edge protection
    const collisionResult = this.collision.resolveMovement(
      this.position,
      this.velocity,
      height,
      PlayerConfig.dimensions.width,
      (this.sneaking || this.crawling) && this.grounded,
    );

    const prevGrounded = this.grounded;
    if (collisionResult.blockedByStreaming) {
      this.blockedByStreaming = true;
      this.collisionAvailability = collisionResult.collisionAvailability;
      this.velocity.set(0, 0, 0);
      // Preserve a previously verified grounded state because the position did
      // not move. Never manufacture grounded=true from an unresolved region.
      this.grounded = prevGrounded;
      this.sprinting = false;
      this.movementState = 'idle';
      return;
    }
    this.collisionAvailability = collisionResult.collisionAvailability;
    this.grounded = collisionResult.onGround;

    // 11. Post-Movement Vertical Gravity & Horizontal Friction Damping
    if (this.inLava) {
      this.velocity.y -= 0.02;
      this.velocity.y *= 0.85;
    } else if (this.deepWater) {
      this.velocity.y -= 0.02;
      this.velocity.y *= 0.88;
    } else if (!this.grounded) {
      this.velocity.y -= PlayerConfig.movement.gravity;
      this.velocity.y *= PlayerConfig.movement.verticalDrag;
    } else {
      this.velocity.y = 0;
    }

    const friction = this.grounded ? groundFriction : airFriction;
    this.velocity.x *= friction;
    this.velocity.z *= friction;

    // 12. Landing Logic & Fall Damage
    if (!prevGrounded && this.grounded) {
      let fallDist = 0;
      if (this.fallStartY !== null) {
        fallDist = Math.max(0, this.fallStartY - this.position.y);
      }
      this.fallStartY = null;
      this.fallDistance = fallDist;

      let damageTaken = 0;
      if (fallDist > PlayerConfig.damage.safeFallDistance && !this.inWater && !this.inLava) {
        damageTaken = Math.floor(fallDist - PlayerConfig.damage.safeFallDistance);
        if (damageTaken > 0) {
          damageSystem.processDamage(
            {
              amount: damageTaken,
              source: 'fall',
              bypassCooldown: true,
            },
            this.position,
            this.velocity,
          );
        }
      }

      if (fallDist > 0.5) {
        const landEvent: PlayerLandedEvent = {
          fallDistance: fallDist,
          landingVelocityY: this.velocity.y,
          surfaceBlock: collisionResult.groundBlock,
          wasSprinting: this.sprinting,
          damageTaken,
        };

        for (const cb of this.onLandedCallbacks) {
          cb(landEvent);
        }
      }
    }

    // 13. Distance-based Hunger Exhaustion
    const movedHoriz = Math.hypot(
      this.position.x - this.previousPosition.x,
      this.position.z - this.previousPosition.z,
    );

    if (this.sprinting && movedHoriz > 0) {
      hungerSystem.recordSprintDistance(movedHoriz);
    } else if (this.deepWater && movedHoriz > 0) {
      hungerSystem.recordSwimDistance(movedHoriz);
    }

    // 14. Determine Movement State
    const isMovingHoriz = movedHoriz > 0.001;
    if (this.inWater && this.deepWater) {
      this.movementState = 'swimming';
    } else if (this.crawling) {
      this.movementState = 'crawling';
    } else if (this.sneaking) {
      this.movementState = 'sneaking';
    } else if (this.justJumped) {
      this.movementState = 'jumping';
    } else if (!this.grounded && this.velocity.y < -0.1) {
      this.movementState = 'falling';
    } else if (this.sprinting && isMovingHoriz) {
      this.movementState = 'sprinting';
    } else if (isMovingHoriz) {
      this.movementState = 'walking';
    } else {
      this.movementState = 'idle';
    }
  }

  teleport(x: number, y: number, z: number): void {
    this.position.set(x, y, z);
    this.previousPosition.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.fallStartY = null;
    this.fallDistance = 0;
  }
}
