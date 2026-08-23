import * as THREE from 'three';
import { BIOMES, type BiomeId } from '../world/Biomes';

const skyVert = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    // Ignore camera translation so the dome is always around the viewer
    mat4 mv = modelViewMatrix;
    mv[3][0] = 0.0;
    mv[3][1] = 0.0;
    mv[3][2] = 0.0;
    vec4 clip = projectionMatrix * mv * vec4(position, 1.0);
    // Push to far plane so nothing clips the sky
    gl_Position = clip.xyww;
    vWorldDir = normalize(position);
  }
`;

const skyFrag = /* glsl */ `
  precision highp float;
  varying vec3 vWorldDir;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uTime;
  uniform float uDay;
  uniform float uCloud;
  uniform float uUnder;
  uniform vec3 uFog;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash21(i);
    float b = hash21(i + vec2(1.0, 0.0));
    float c = hash21(i + vec2(0.0, 1.0));
    float d = hash21(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
    for (int i = 0; i < 6; i++) {
      v += a * noise(p);
      p = m * p + vec2(1.7, 9.2);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float h = dir.y;
    float dusk = smoothstep(0.32, 0.02, uSunDir.y) * smoothstep(-0.2, 0.18, uSunDir.y);
    float night = 1.0 - uDay;

    // --- Atmosphere ---
    vec3 zenith = mix(vec3(0.03, 0.04, 0.12), vec3(0.18, 0.42, 0.88), uDay);
    zenith = mix(zenith, vec3(0.2, 0.1, 0.28), dusk);
    vec3 horiz = mix(vec3(0.06, 0.08, 0.16), vec3(0.55, 0.72, 0.92), uDay);
    horiz = mix(horiz, vec3(0.95, 0.45, 0.25), dusk * 0.9);

    float elev = pow(clamp(h * 0.5 + 0.5, 0.0, 1.0), 0.7);
    vec3 col = mix(horiz, zenith, elev);
    col = mix(col, uFog, pow(1.0 - abs(h), 4.0) * 0.4);

    // --- Sun ---
    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSunColor * smoothstep(0.9992, 0.9999, sunDot) * 4.0;
    col += uSunColor * pow(sunDot, 60.0) * uDay * 1.6;
    col += uSunColor * pow(sunDot, 8.0) * uDay * 0.4;
    col += vec3(1.0, 0.5, 0.25) * pow(sunDot, 3.0) * dusk * 0.6;

    // --- Moon (opposite sun) ---
    vec3 moonDir = normalize(-uSunDir);
    float moonDot = max(dot(dir, moonDir), 0.0);
    float moon = smoothstep(0.9985, 0.9997, moonDot) * night;
    col += vec3(0.75, 0.8, 0.95) * moon * 2.2;
    col += vec3(0.35, 0.4, 0.55) * pow(moonDot, 40.0) * night * 0.5;

    // --- Stars (soft points, not blocky) ---
    if (night > 0.2 && h > 0.0) {
      vec2 sp = dir.xz / (abs(h) + 0.12);
      float s = hash21(floor(sp * 220.0));
      float star = smoothstep(0.992, 1.0, s);
      star *= smoothstep(0.0, 0.25, h);
      float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + s * 40.0);
      col += vec3(0.8, 0.85, 1.0) * star * night * twinkle * 1.3;
    }

    // --- Clouds (visible day AND night) ---
    if (h > -0.08) {
      float ph = max(h, 0.035);
      // Two scrolling layers for depth
      vec2 uv1 = dir.xz / ph * 0.48 + vec2(uTime * 0.012, uTime * 0.007);
      vec2 uv2 = dir.xz / ph * 0.95 + vec2(-uTime * 0.008, uTime * 0.01);

      float n = fbm(uv1);
      n = n * 0.62 + fbm(uv2 + 13.0) * 0.38;

      // Lower cover = more clouds. Keep plenty at night.
      float cover = mix(0.46, 0.28, uCloud);
      float dens = smoothstep(cover, cover + 0.22, n);
      dens *= smoothstep(-0.05, 0.12, h);
      // Soften near zenith stretch
      dens *= mix(1.0, 0.75, smoothstep(0.75, 1.0, h));

      float lining = pow(max(sunDot, moonDot * night), 5.0) * 0.45;

      vec3 dayCloud = vec3(0.95, 0.96, 0.98);
      vec3 duskCloud = vec3(0.95, 0.58, 0.4);
      vec3 nightCloud = vec3(0.22, 0.26, 0.38);
      vec3 cLit = mix(nightCloud, dayCloud, uDay);
      cLit = mix(cLit, duskCloud, dusk * 0.75);
      cLit *= 0.65 + lining + uDay * 0.35;
      // Moonlight fill so night clouds stay readable
      cLit += vec3(0.08, 0.1, 0.16) * night;

      float alpha = dens * mix(0.55, 0.88, uCloud);
      // Night clouds stay opaque enough to see
      alpha *= mix(0.72, 1.0, uDay);
      col = mix(col, cLit, clamp(alpha, 0.0, 0.95));
    }

    if (uUnder > 0.001) {
      col = mix(col, vec3(0.02, 0.15, 0.3), uUnder * 0.85);
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

export class Sky {
  readonly sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private ambient: THREE.AmbientLight;
  private sunTarget: THREE.Object3D;
  private dome: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  timeOfDay = 0.28;
  readonly sunDir = new THREE.Vector3(0.4, 1, 0.25);
  fogColor = new THREE.Color('#7aadb0');
  fogDensity = 0.004;
  cloudiness = 0.7;

  constructor(private scene: THREE.Scene) {
    // Dome owns the background — never use a flat clear color
    this.scene.background = null;
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
    this.sunTarget = new THREE.Object3D();
    this.scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    this.scene.add(this.sun);

    this.ambient = new THREE.AmbientLight(0x4a6070, 0.28);
    this.scene.add(this.ambient);

    this.skyMat = new THREE.ShaderMaterial({
      name: 'WildreachSky',
      uniforms: {
        uSunDir: { value: this.sunDir.clone() },
        uSunColor: { value: new THREE.Color(1.0, 0.95, 0.85) },
        uTime: { value: 0 },
        uDay: { value: 1 },
        uCloud: { value: this.cloudiness },
        uUnder: { value: 0 },
        uFog: { value: new THREE.Color(0.55, 0.72, 0.78) },
      },
      vertexShader: skyVert,
      fragmentShader: skyFrag,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });

    // Unit sphere scaled in shader via clip.xyww — size only needs to pass near plane
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.skyMat);
    this.dome.scale.setScalar(50);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10000;
    this.scene.add(this.dome);
  }

  setTimeOfDay(t: number): void {
    this.timeOfDay = ((t % 1) + 1) % 1;
  }

  follow(px: number, pz: number, _py = 40): void {
    // Vertex shader nulls camera translation; still park sun for shadows
    this.sunTarget.position.set(px, 40, pz);
    this.sun.position.set(
      px + this.sunDir.x * 80,
      40 + this.sunDir.y * 90,
      pz + this.sunDir.z * 80,
    );
    this.sun.target.updateMatrixWorld();
  }

  getSunDirection(out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.sunDir);
  }

  update(dt: number, biome: BiomeId, submersion = 0): void {
    this.timeOfDay = (this.timeOfDay + dt * 0.006) % 1;
    const sunAngle = this.timeOfDay * Math.PI * 2;
    this.sunDir.set(Math.cos(sunAngle), Math.sin(sunAngle), Math.sin(sunAngle) * 0.35).normalize();

    const day = Math.max(0, this.sunDir.y);
    const night = 1 - day;
    this.sun.intensity = 0.15 + day * 1.55;
    this.sun.castShadow = day > 0.08;
    this.ambient.intensity = 0.1 + day * 0.26;
    this.hemi.intensity = 0.18 + day * 0.42;

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
    this.fogDensity = 0.0028 + night * 0.0025;
    this.cloudiness = 0.62 + (fogBase[0] + fogBase[2]) * 0.1;

    const u = Math.min(1, Math.max(0, submersion));
    if (u > 0.001) {
      this.fogColor.lerp(new THREE.Color(0.03, 0.3, 0.48), u * 0.72);
      this.fogDensity += u * 0.007;
      this.sun.intensity *= 1 - u * 0.55;
      this.ambient.intensity *= 1 - u * 0.3;
      this.hemi.intensity *= 1 - u * 0.38;
    }

    this.scene.background = null;
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.copy(this.fogColor);
      this.scene.fog.density = this.fogDensity;
    }

    this.sun.color.setRGB(1, 0.93 - night * 0.15, 0.8 - night * 0.25);

    const um = this.skyMat.uniforms;
    um.uSunDir.value.copy(this.sunDir);
    um.uSunColor.value.copy(this.sun.color);
    um.uTime.value += dt;
    um.uDay.value = day;
    um.uCloud.value = this.cloudiness;
    um.uUnder.value = u;
    um.uFog.value.copy(this.fogColor);
  }
}
