/**
 * Sky, lighting and weather for the Custom World preview.
 *
 * Every value here is derived from the style's atmosphere block, so moving a
 * cloud or time-of-day slider changes what is on screen rather than only what
 * is stored. Nothing in this module is expensive to update: changing the sky
 * never rebuilds terrain or vegetation, it only rewrites uniforms and light
 * parameters.
 */
import * as THREE from 'three';
import { SKY_FRAG, SKY_VERT } from '../../render/skyShader';
import {
  WEATHER_LOOKS,
  cloudCover,
  fogDistance,
  sunFor,
  type WeatherLook,
} from './atmosphere';
import type { VytheraWorldStyle } from '../style/WorldStyle';

export class PreviewSky {
  readonly sun: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private hemi: THREE.HemisphereLight;
  private dome: THREE.Mesh;
  private material: THREE.ShaderMaterial;
  private precipitation: THREE.Points | null = null;
  private precipVelocity = 0;
  private precipHeight = 120;
  private cloudSpeed = 1;
  private fogColor = new THREE.Color(0.55, 0.72, 0.78);

  constructor(private scene: THREE.Scene) {
    this.material = new THREE.ShaderMaterial({
      name: 'VytheraPreviewSky',
      uniforms: {
        uSunDir: { value: new THREE.Vector3(0.4, 1, 0.25) },
        uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
        uTime: { value: 0 },
        uDay: { value: 1 },
        uCloud: { value: 1 },
        uCloudScale: { value: 1 },
        uCloudSpeed: { value: 1 },
        uHaze: { value: 0 },
        uFog: { value: this.fogColor.clone() },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });

    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.material);
    this.dome.scale.setScalar(50);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10000;
    scene.add(this.dome);

    this.hemi = new THREE.HemisphereLight(0xc5e8ef, 0x3a4a42, 0.55);
    this.ambient = new THREE.AmbientLight(0x8a99a4, 0.6);
    this.sun = new THREE.DirectionalLight(0xfff0d4, 1.2);
    scene.add(this.hemi, this.ambient, this.sun);

    scene.fog = new THREE.Fog(this.fogColor.clone(), 200, 900);
    scene.background = null;
  }

  /**
   * Bind a style's atmosphere to the scene. Cheap enough to call on every
   * atmosphere edit.
   */
  apply(style: VytheraWorldStyle): void {
    const a = style.atmosphere;
    const weather = WEATHER_LOOKS[a.weather] ?? WEATHER_LOOKS.clear;

    const sun = sunFor(style);
    const sunDir = new THREE.Vector3(sun.x, sun.y, sun.z);
    const day = sun.day;
    const night = 1 - day;
    const cover = cloudCover(style);

    const sunColor = new THREE.Color(1, 0.93 - night * 0.15, 0.8 - night * 0.25);
    this.sun.color.copy(sunColor);
    this.sun.intensity = (0.32 + day * 1.25) * weather.lightScale * Math.max(0.15, 1 - cover * 0.22);
    this.sun.position.copy(sunDir).multiplyScalar(400);

    const ambientScale = a.ambientIntensity ?? 1;
    this.ambient.intensity = (0.5 + day * 0.24) * ambientScale;
    this.hemi.intensity = (0.42 + day * 0.3) * ambientScale;

    // Fog colour tracks the sky so the horizon dissolves instead of banding.
    const skyDay = new THREE.Color(0.55, 0.72, 0.85);
    const skyDusk = new THREE.Color(0.78, 0.5, 0.42);
    const skyNight = new THREE.Color(0.06, 0.08, 0.14);
    const dusk = Math.max(0, 1 - Math.abs(sunDir.y) * 3.2) * day;
    this.fogColor.copy(day > 0.2 ? skyDay : skyNight).lerp(skyDusk, dusk * 0.7);
    if (day <= 0.2) this.fogColor.lerp(skyNight, night * 0.8);

    const fogFar = fogDistance(style);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.near = fogFar * 0.12;
      this.scene.fog.far = fogFar;
    }

    const u = this.material.uniforms;
    (u.uSunDir!.value as THREE.Vector3).copy(sunDir);
    (u.uSunColor!.value as THREE.Color).copy(sunColor);
    u.uDay!.value = day;
    u.uCloud!.value = Math.max(0, cover);
    u.uCloudScale!.value = a.cloudSize ?? 1;
    u.uCloudSpeed!.value = a.cloudSpeed ?? 1;
    u.uHaze!.value = weather.haze;
    (u.uFog!.value as THREE.Color).copy(this.fogColor);

    this.cloudSpeed = a.cloudSpeed ?? 1;
    this.setPrecipitation(weather, style);
  }

  /** Falling particles for rain and snow, recreated only when the look changes. */
  private setPrecipitation(look: WeatherLook, style: VytheraWorldStyle): void {
    if (this.precipitation) {
      this.scene.remove(this.precipitation);
      this.precipitation.geometry.dispose();
      (this.precipitation.material as THREE.Material).dispose();
      this.precipitation = null;
    }
    if (look.particles <= 0) return;

    const count = look.particles;
    const spread = 200;
    const positions = new Float32Array(count * 3);
    // Seeded from the style so a given style always has the same pattern.
    let s = 1;
    for (let i = 0; i < style.seed.length; i++) s = (s * 31 + style.seed.charCodeAt(i)) >>> 0;
    const rand = (): number => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * spread;
      positions[i * 3 + 1] = rand() * this.precipHeight;
      positions[i * 3 + 2] = (rand() - 0.5) * spread;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const isSnow = style.atmosphere.weather === 'snow';
    const mat = new THREE.PointsMaterial({
      color: look.particleColor,
      size: isSnow ? 0.5 : 0.22,
      transparent: true,
      opacity: isSnow ? 0.9 : 0.55,
      depthWrite: false,
      fog: true,
    });
    this.precipitation = new THREE.Points(geo, mat);
    this.precipitation.frustumCulled = false;
    this.precipVelocity = isSnow ? 6 : 42;
    this.scene.add(this.precipitation);
  }

  /** Advance cloud drift and precipitation. Called once per frame. */
  update(dt: number, eye: THREE.Vector3): void {
    this.material.uniforms.uTime!.value += dt;

    this.sun.position.copy(eye).add(
      (this.material.uniforms.uSunDir!.value as THREE.Vector3).clone().multiplyScalar(400),
    );
    this.sun.target.position.copy(eye);
    this.sun.target.updateMatrixWorld();

    const p = this.precipitation;
    if (!p) return;
    // Particles follow the eye so a small field looks like continuous weather.
    p.position.set(eye.x, eye.y - this.precipHeight * 0.5, eye.z);
    const arr = p.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = arr.array as Float32Array;
    const drift = this.precipVelocity * dt;
    for (let i = 1; i < a.length; i += 3) {
      a[i]! -= drift;
      if (a[i]! < 0) a[i] = this.precipHeight;
    }
    arr.needsUpdate = true;
    if (this.cloudSpeed <= 0) return;
  }

  dispose(): void {
    this.scene.remove(this.dome);
    this.dome.geometry.dispose();
    this.material.dispose();
    if (this.precipitation) {
      this.scene.remove(this.precipitation);
      this.precipitation.geometry.dispose();
      (this.precipitation.material as THREE.Material).dispose();
    }
  }
}
