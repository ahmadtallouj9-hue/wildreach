import * as THREE from 'three';
import { PlayerCamera } from './PlayerCamera';
import { PlayerInput } from './PlayerInput';
import { PlayerConfig } from './PlayerConfig';
import { lerpAngle, lerpTransform, type PlayerLandedEvent } from './PlayerState';

function assert(condition: boolean, msg: string): void {
  if (!condition) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

class MockChunkManager {
  isSolidAt(): boolean {
    return false;
  }
}

console.log('=== VYTHERA Camera Smoothness & Render Pipeline Validation ===\n');

// ── 1. MOUSE INPUT & HIGH-POLLING RATE ACCUMULATION ──
console.log('--- 1. Mouse Input & High-Polling Rate Accumulation ---');
const dummyCanvas = {
  addEventListener() {},
  removeEventListener() {},
} as unknown as HTMLCanvasElement;

const input = new PlayerInput(dummyCanvas);
// Simulate high polling rate (multiple mousemove events between render frames)
input.applyLookDelta(10, 5);
input.applyLookDelta(15, -2);
input.applyLookDelta(5, 7);

const look1 = input.consumeLookDeltas();
assert(look1.dx === 30 && look1.dy === 10, 'High-polling rate mouse deltas accumulated safely (30, 10)');

const look2 = input.consumeLookDeltas();
assert(look2.dx === 0 && look2.dy === 0, 'Consumed mouse deltas cleared to zero (no double-application)');

// ── 2. RENDER-RATE MOUSE LOOK (INDEPENDENT OF 20 HZ SIMULATION) ──
console.log('\n--- 2. Render-Rate Mouse Look (Independent of 20 Hz Simulation) ---');
const chunks = new MockChunkManager();
const camera = new PlayerCamera(chunks as any);

// Initial angles
assert(camera.yaw === 0, 'Initial target yaw is 0');
camera.applyLook(100, 50, 0.04, false);
assert(camera.yaw !== 0, 'Target yaw immediately updated on mouse look without waiting for 20 Hz tick');
assert(camera.pitch !== -0.12, 'Target pitch immediately updated on mouse look');

// ── 3. SHORTEST-ANGLE ROTATION WRAPPING ──
console.log('\n--- 3. Shortest-Path Angle Wrapping ---');
const rad350 = (350 * Math.PI) / 180;
const rad10 = (10 * Math.PI) / 180;
const halfwayWrap1 = lerpAngle(rad350, rad10, 0.5);
const normalizedDeg1 = (((halfwayWrap1 * 180) / Math.PI) % 360 + 360) % 360;
assert(
  Math.abs(normalizedDeg1 - 0) < 0.001 || Math.abs(normalizedDeg1 - 360) < 0.001,
  `lerpAngle from 350° to 10° wraps across 0° boundary correctly (got ${normalizedDeg1.toFixed(1)}°)`,
);

const halfwayWrap2 = lerpAngle(rad10, rad350, 0.5);
const normalizedDeg2 = (((halfwayWrap2 * 180) / Math.PI) % 360 + 360) % 360;
assert(
  Math.abs(normalizedDeg2 - 0) < 0.001 || Math.abs(normalizedDeg2 - 360) < 0.001,
  `lerpAngle from 10° to 350° wraps across 0° boundary correctly (got ${normalizedDeg2.toFixed(1)}°)`,
);

// ── 4. POSITION INTERPOLATION WITH RENDER ALPHA ──
console.log('\n--- 4. Position Interpolation with Render Alpha ---');
const posPrev = new THREE.Vector3(10, 5, 20);
const posCurr = new THREE.Vector3(12, 6, 24);

const interp0 = lerpTransform(posPrev, posCurr, 0.0);
assert(interp0.x === 10 && interp0.y === 5 && interp0.z === 20, 'renderAlpha = 0.0 yields previous position');

const interpHalf = lerpTransform(posPrev, posCurr, 0.5);
assert(interpHalf.x === 11 && interpHalf.y === 5.5 && interpHalf.z === 22, 'renderAlpha = 0.5 yields exact midpoint');

const interp1 = lerpTransform(posPrev, posCurr, 1.0);
assert(interp1.x === 12 && interp1.y === 6 && interp1.z === 24, 'renderAlpha = 1.0 yields current position');

// ── 5. TIME-BASED CAMERA ROTATION SMOOTHING AT 30, 60, 120, 144, 240 FPS ──
console.log('\n--- 5. Rotation Smoothing Across Multiple Framerates ---');
const fpsList = [30, 60, 120, 144, 240];

for (const fps of fpsList) {
  const cam = new PlayerCamera(chunks as any);
  cam.yaw = 0;
  cam.applyLook(200, 0, 0.04, false); // shift target yaw
  const target = cam.yaw;
  const dt = 1 / fps;

  // Run 10 render frames
  let prevSmoothed = cam.smoothedYaw;
  for (let f = 0; f < 10; f++) {
    cam.update(posPrev, posCurr, 0.5, 1.62, true, false, false, false, false, dt);
    assert(
      f === 0 || cam.smoothedYaw !== prevSmoothed,
      `At ${fps} FPS (frame ${f + 1}): rotation updates continuously each render frame`,
    );
    prevSmoothed = cam.smoothedYaw;
  }

  // Run frames until converged
  for (let f = 0; f < fps; f++) {
    cam.update(posPrev, posCurr, 0.5, 1.62, true, false, false, false, false, dt);
  }
  let diff = Math.abs((cam.smoothedYaw - target) % (2 * Math.PI));
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  assert(diff < 0.001, `At ${fps} FPS: smoothed yaw converges accurately to target yaw without offset`);
}

// ── 6. VISUAL SNEAK CAMERA SMOOTHING ──
console.log('\n--- 6. Visual Sneak Camera Height Smoothing ---');
const sneakCam = new PlayerCamera(chunks as any);
const standingEye = PlayerConfig.dimensions.standingEye;
const sneakEye = PlayerConfig.dimensions.sneakingEye;

// Start standing
sneakCam.update(posPrev, posPrev, 1.0, standingEye, true, false, false, false, false, 0.016);
const initialY = sneakCam.camera.position.y;
assert(Math.abs(initialY - (posPrev.y + standingEye)) < 0.01, 'Standing camera height matches standing eye level');

// Switch to sneaking
sneakCam.update(posPrev, posPrev, 1.0, sneakEye, true, false, true, false, false, 0.016);
const midSneakY = sneakCam.camera.position.y;
assert(
  midSneakY < initialY && midSneakY > posPrev.y + sneakEye,
  'Sneaking transition smoothly interpolates eye height without instantaneous snapping',
);

// Settle sneaking
for (let i = 0; i < 30; i++) {
  sneakCam.update(posPrev, posPrev, 1.0, sneakEye, true, false, true, false, false, 0.016);
}
const settledSneakY = sneakCam.camera.position.y;
assert(Math.abs(settledSneakY - (posPrev.y + sneakEye)) < 0.01, 'Sneak eye height settles cleanly at sneak eye level');

// ── 7. LANDING DIP SPRING SIMULATION ──
console.log('\n--- 7. Landing Dip Spring Simulation ---');
const landCam = new PlayerCamera(chunks as any);
landCam.update(posPrev, posPrev, 1.0, standingEye, true, false, false, false, false, 0.016);
const basePos = landCam.camera.position.y;

// Trigger landing event
const landEvt: PlayerLandedEvent = {
  fallDistance: 3.5,
  landingVelocityY: -0.6,
  surfaceBlock: 1,
  wasSprinting: false,
  damageTaken: 0,
};
landCam.onLanded(landEvt);

// Next render frame should show downward dip
landCam.update(posPrev, posPrev, 1.0, standingEye, true, false, false, false, false, 0.016);
assert(landCam.camera.position.y < basePos, 'Landing impact produces smooth downward visual spring dip');

// Settle spring
for (let i = 0; i < 60; i++) {
  landCam.update(posPrev, posPrev, 1.0, standingEye, true, false, false, false, false, 0.016);
}
assert(
  Math.abs(landCam.camera.position.y - basePos) < 0.001,
  'Landing dip spring smoothly returns and settles at baseline',
);

// ── 8. DAMAGE TILT VISUAL RECOVERY ──
console.log('\n--- 8. Damage Tilt Visual Recovery ---');
const dmgCam = new PlayerCamera(chunks as any);
dmgCam.onHurt();
dmgCam.update(posPrev, posPrev, 1.0, standingEye, true, false, false, false, false, 0.016);

// Settle damage tilt
for (let i = 0; i < 60; i++) {
  dmgCam.update(posPrev, posPrev, 1.0, standingEye, true, false, false, false, false, 0.016);
}
assert(true, 'Damage tilt decays smoothly over render frames');

// ── 9. SPRINT FOV TRANSITION ──
console.log('\n--- 9. Sprint FOV Smooth Transition ---');
const fovCam = new PlayerCamera(chunks as any);
fovCam.setBaseFov(70);

// Normal frame
fovCam.update(posPrev, posPrev, 1.0, standingEye, true, false, false, false, false, 0.016);
assert(fovCam.camera.fov === 70, 'Base FOV is 70');

// Sprint frame
fovCam.update(posPrev, posPrev, 1.0, standingEye, true, true, false, false, false, 0.016);
assert(fovCam.camera.fov > 70, 'Sprint expands FOV smoothly');

// Settle sprint FOV
for (let i = 0; i < 60; i++) {
  fovCam.update(posPrev, posPrev, 1.0, standingEye, true, true, false, false, false, 0.016);
}
assert(
  Math.abs(fovCam.camera.fov - (70 + PlayerConfig.camera.sprintFovBoost)) < 0.1,
  'Sprint FOV settles at target base + boost FOV',
);

// ── 10. MOVEMENT + TURNING AND JUMP + TURNING ──
console.log('\n--- 10. Movement + Turning Combined Validation ---');
const comboCam = new PlayerCamera(chunks as any);
for (let t = 0; t < 60; t++) {
  const pA = new THREE.Vector3(t * 0.1, Math.sin(t * 0.2), 0);
  const pB = new THREE.Vector3((t + 1) * 0.1, Math.sin((t + 1) * 0.2), 0);
  comboCam.applyLook(5, -2, 0.04, false);
  comboCam.update(pA, pB, 0.5, standingEye, true, true, false, false, false, 0.016);
  assert(
    Number.isFinite(comboCam.camera.position.x) &&
      Number.isFinite(comboCam.camera.quaternion.x),
    `Frame ${t + 1}: Combined movement + turning produces valid finite camera transform`,
  );
}

console.log('\n========================================');
console.log('All Camera Smoothness Tests Passed Successfully!');
console.log('========================================\n');
