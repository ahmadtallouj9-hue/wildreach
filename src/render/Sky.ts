import * as THREE from 'three';
import { BIOMES, type BiomeId } from '../world/Biomes';

export class Sky {
  readonly sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  private sunHelperTarget: THREE.Object3D;
  timeOfDay = 0.28;
  readonly sunDir = new THREE.Vector3(0.4, 1, 0.25);
  fogColor = new THREE.Color('#7aadb0');
  fogDensity = 0.004;

  constructor(private scene: THREE.Scene) {
    this.scene.background = new THREE.Color('#6a9eaa');
    this.scene.fog = new THREE.FogExp2('#7aadb0', 0.004);

    this.hemi = new THREE.HemisphereLight(0xc5e8ef, 0x2a4038, 0.45);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0d4, 1.35);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.shadow.bias = -0.00025;
    this.sun.shadow.normalBias = 0.04;
    this.sunHelperTarget = new THREE.Object3D();
    this.scene.add(this.sunHelperTarget);
    this.sun.target = this.sunHelperTarget;
    this.scene.add(this.sun);

    this.ambient = new THREE.AmbientLight(0x4a6070, 0.28);
    this.scene.add(this.ambient);
  }

  /** Set initial time (0–1 day cycle). */
  setTimeOfDay(t: number): void {
    this.timeOfDay = ((t % 1) + 1) % 1;
  }

  /** Keep shadow camera centered on the player. */
  follow(px: number, pz: number): void {
    this.sunHelperTarget.position.set(px, 40, pz);
    this.sun.position.set(
      px + this.sunDir.x * 80,
      40 + this.sunDir.y * 90,
      pz + this.sunDir.z * 80,
    );
    this.sun.target.updateMatrixWorld();
  }

  update(dt: number, biome: BiomeId, submersion = 0): void {
    this.timeOfDay = (this.timeOfDay + dt * 0.006) % 1;
    const t = this.timeOfDay;
    const sunAngle = t * Math.PI * 2;
    this.sunDir.set(Math.cos(sunAngle), Math.sin(sunAngle), Math.sin(sunAngle) * 0.35).normalize();

    const day = Math.max(0, this.sunDir.y);
    const night = 1 - day;
    this.sun.intensity = 0.2 + day * 1.35;
    this.sun.castShadow = day > 0.08;
    this.ambient.intensity = 0.12 + day * 0.28;
    this.hemi.intensity = 0.2 + day * 0.4;

    const fogBase = BIOMES[biome].fogRgb;
    const skyDay = new THREE.Color().setRGB(0.42, 0.68, 0.8);
    const skyDusk = new THREE.Color().setRGB(0.72, 0.42, 0.38);
    const skyNight = new THREE.Color().setRGB(0.05, 0.07, 0.12);

    let sky: THREE.Color;
    if (day > 0.2) {
      sky = skyDay.clone().lerp(skyDusk, Math.max(0, 1 - day * 1.4));
    } else {
      sky = skyDusk.clone().lerp(skyNight, night);
    }

    this.fogColor.copy(sky).lerp(new THREE.Color().setRGB(...fogBase), 0.25);
    this.fogDensity = 0.0035 + night * 0.003;

    const u = Math.min(1, Math.max(0, submersion));
    if (u > 0.001) {
      const underSky = new THREE.Color(0.02, 0.18, 0.36);
      const underFog = new THREE.Color(0.03, 0.3, 0.48);
      sky.lerp(underSky, u * 0.78);
      this.fogColor.lerp(underFog, u * 0.72);
      this.fogDensity += u * 0.007;
      this.sun.intensity *= 1 - u * 0.55;
      this.ambient.intensity *= 1 - u * 0.3;
      this.hemi.intensity *= 1 - u * 0.38;
    }

    this.scene.background = sky;
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.density = this.fogDensity;
    }

    this.sun.color.setRGB(1, 0.93 - night * 0.15, 0.8 - night * 0.25);
  }
}
