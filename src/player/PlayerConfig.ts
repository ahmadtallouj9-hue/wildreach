/**
 * Authoritative Player Configuration Constants for VYTHERA.
 * Exact Minecraft Java Edition reference (version 1.20+ / 1.21).
 */

export const MINECRAFT_JAVA_REFERENCE_VERSION = '1.20+ / 1.21';

export const TICK_RATE = 20; // 20 Hz
export const TICK_DT = 1 / TICK_RATE; // 0.05 seconds per tick

export function toBlocksPerTick(blocksPerSec: number): number {
  return blocksPerSec / TICK_RATE;
}

export function toBlocksPerSecond(blocksPerTick: number): number {
  return blocksPerTick * TICK_RATE;
}

export const PlayerConfig = {
  referenceVersion: MINECRAFT_JAVA_REFERENCE_VERSION,
  tickRate: TICK_RATE,
  tickDt: TICK_DT,

  movement: {
    /** Target walking speed: 4.317 blocks/sec (≈ 0.21585 blocks/tick) */
    walkSpeed: 4.317,
    walkSpeedTick: 4.317 / TICK_RATE,

    /** Sprint speed multiplier: 1.30 (≈ 5.612 blocks/sec = 0.2806 blocks/tick) */
    sprintMultiplier: 1.3,
    sprintSpeed: (4.317 * 1.3) / TICK_RATE,

    /** Sneak speed multiplier: 0.30 (≈ 1.295 blocks/sec = 0.06475 blocks/tick) */
    sneakMultiplier: 0.3,
    sneakSpeed: (4.317 * 0.3) / TICK_RATE,

    /** Crawl speed multiplier: 0.30 (≈ 1.295 blocks/sec) */
    crawlMultiplier: 0.3,

    /** Base movement speed attribute in Minecraft Java (generic.movement_speed = 0.10) */
    baseMovementSpeed: 0.10,

    /** Base movement acceleration factor on ground: 0.10 (speed * (0.16277136 / f^3) where f=0.546 -> 1.0) */
    walkAccelerationFactor: 0.10,

    /** Acceleration in air (blocks/tick) */
    airAccelerationWalk: 0.02,
    airAccelerationSprint: 0.02 * 1.3,
    airAccelerationSneak: 0.02 * 0.3,

    /** Ground friction factor on standard block (S=0.6): 0.6 * 0.91 = 0.546 */
    groundFriction: 0.546,

    /** Air friction factor: 0.91 */
    airFriction: 0.91,

    /** Gravity: 0.08 blocks/tick² */
    gravity: 0.08,

    /** Vertical drag multiplier applied each tick: 0.98 */
    verticalDrag: 0.98,

    /** Jump initial vertical velocity: 0.42 blocks/tick */
    jumpVelocity: 0.42,

    /** Sprint jump forward horizontal velocity boost (+0.2 in look direction) */
    sprintJumpForwardBoost: 0.2,

    /** Max vertical step-up obstacle height without jumping: 0.60 blocks */
    maxStepHeight: 0.6,

    /** Auto-Jump configuration */
    autoJumpEnabled: true,
    autoJumpMinObstacle: 0.6,
    autoJumpMaxObstacle: 1.25,

    /** Water movement speed factor */
    waterSpeedMultiplier: 0.52,

    /** Lava movement speed factor */
    lavaSpeedMultiplier: 0.24,
  },

  dimensions: {
    /** Collision box width (X): 0.60 blocks */
    width: 0.6,
    /** Collision box depth (Z): 0.60 blocks */
    depth: 0.6,
    /** Standing collision height: 1.80 blocks */
    standingHeight: 1.8,
    /** Sneaking collision height: 1.50 blocks */
    sneakingHeight: 1.5,
    /** Crawling collision height: 0.625 blocks */
    crawlingHeight: 0.625,
    /** Sitting collision height: 1.15 blocks */
    sittingHeight: 1.15,
    /** Eye height when standing: 1.62 blocks */
    standingEye: 1.62,
    /** Eye height when sneaking: 1.27 blocks (Modern Java 1.20+ is 1.27) */
    sneakingEye: 1.27,
    /** Eye height when crawling: 0.40 blocks */
    crawlingEye: 0.40,
    /** Eye height when sitting: 1.05 blocks */
    sittingEye: 1.05,
  },

  survival: {
    /** Maximum player health: 20 HP (10 hearts) */
    maxHealth: 20,
    /** Maximum player hunger: 20 points (10 food icons) */
    maxHunger: 20,
    /** Maximum saturation: 20 points */
    maxSaturation: 20,
    /** Minimum hunger points required to sprint: 7 (sprint disabled at <= 6) */
    sprintMinHunger: 7,
    /** Minimum hunger points required for natural health regeneration: 18 */
    naturalRegenMinHunger: 18,
    /** Exhaustion points needed to consume 1 saturation/hunger: 4.0 */
    exhaustionThreshold: 4.0,
    /** Natural health regeneration period: 80 ticks (4.0 seconds) */
    regenIntervalTicks: 80,
    /** Starvation damage period: 80 ticks (4.0 seconds) */
    starvationIntervalTicks: 80,

    /** Exhaustion rate per block sprinted: 0.10 */
    exhaustionSprintPerBlock: 0.1,
    /** Exhaustion for normal jump: 0.05 */
    exhaustionJump: 0.05,
    /** Exhaustion for sprint jump: 0.20 */
    exhaustionSprintJump: 0.2,
    /** Exhaustion per block swum: 0.01 */
    exhaustionSwimPerBlock: 0.01,
    /** Exhaustion per attack: 0.10 */
    exhaustionAttack: 0.1,
    /** Exhaustion per damage taken: 0.10 */
    exhaustionHurt: 0.1,
    /** Exhaustion per 1 HP naturally regenerated: 6.0 */
    exhaustionPerHealthRegen: 6.0,
  },

  damage: {
    /** Damage immunity cooldown: 10 ticks (0.50 seconds) */
    immunityTicks: 10,
    /** Safe fall distance without damage: 3.0 blocks */
    safeFallDistance: 3.0,
    /** Red hurt flash visual duration in seconds */
    hurtFlashDuration: 0.15,
  },

  interaction: {
    /** Block reach distance in blocks */
    blockReachDistance: 5.0,
    /** Entity/mob attack reach distance in blocks */
    entityReachDistance: 3.5,
    /** Minimum cooldown between block placements in seconds */
    placeCooldown: 0.15,
  },

  combat: {
    /** Base fist damage (1 HP = 0.5 hearts) */
    baseFistDamage: 1,
    /** Base knockback strength */
    baseFistKnockback: 0.35,
    /** Base fist attack cooldown in seconds */
    baseAttackCooldown: 0.5,
    /** Critical attack damage multiplier (while falling) */
    criticalMultiplier: 1.5,
  },

  camera: {
    /** Pitch limits in degrees to prevent camera inversion */
    pitchMinDeg: -89,
    pitchMaxDeg: 89,
    pitchLimitRad: (89 * Math.PI) / 180,

    /** Jump input buffer window: 0.05 seconds */
    jumpBufferTime: 0.05,
    /** Double tap forward (W) window for sprinting: 0.25 seconds */
    doubleTapSprintWindow: 0.25,

    /** Default mouse sensitivity multiplier */
    mouseSensitivityDefault: 0.04,
    /** Third person camera distance */
    thirdPersonDist: 4.4,
    /** Front person camera distance */
    frontPersonDist: 3.6,
    /** Camera height lift above head in third/front person */
    camHeightLift: 0.35,

    /** Camera rotation smoothing time constant (high value = responsive/crisp without input lag) */
    cameraRotationSmoothness: 55,

    /** Visual eye height transition speed (sneak/stand) */
    eyeHeightSmoothSpeed: 16,

    /** Landing dip spring stiffness and damping */
    landingSpringStiffness: 160,
    landingSpringDamping: 18,

    /** Damage tilt decay speed */
    damageTiltDecaySpeed: 10,

    /** Subtle head bob amplitudes (blocks) */
    bobVerticalAmp: 0.012,
    bobHorizontalAmp: 0.008,

    /** Sprint FOV increase */
    sprintFovBoost: 10,
    /** FOV transition speed */
    fovTransitionSpeed: 10,
  },
};
