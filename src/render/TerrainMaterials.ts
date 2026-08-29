import * as THREE from 'three';
import { applyTexturePackToAtlas, createTextureAtlas, type TexturePack } from './TextureAtlas';
import { SEA_LEVEL } from '../world/blocks';
import type { GfxPrefs } from './gfxPrefs';

const terrainVert = /* glsl */ `
  attribute float ao;
  attribute float light;
  varying vec2 vUv;
  varying float vAo;
  varying float vLight;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vWind;

  void main() {
    vUv = uv;
    vAo = ao;
    vLight = light;
    vWind = 0.0;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const cutoutVert = /* glsl */ `
  attribute float ao;
  attribute float light;
  uniform float time;
  varying vec2 vUv;
  varying float vAo;
  varying float vLight;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vWind;

  void main() {
    vUv = uv;
    vAo = ao;
    vLight = light;
    vWind = 0.0;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec3 pos = position;
    // Light leaf sway — one sin only.
    if (uv.y > 0.74 && uv.y < 0.88 && uv.x < 0.13) {
      vWind = 1.0;
      float gust = sin(time * 1.1 + pos.x * 0.4 + pos.z * 0.35);
      pos.x += gust * 0.06;
      pos.z += cos(time * 0.9 + pos.x * 0.3) * 0.04;
    }
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

function makeTerrainFrag(cutout: boolean): string {
  const discardLine = cutout ? 'if (tex.a < 0.5) discard;' : '';
  const rustle = cutout
    ? `
    float rustle = sin(time * 2.35 + vWorldPos.x * 1.6 + vWorldPos.z * 1.25) * 0.05 * vWind;
    color *= 1.0 + rustle;`
    : '';
  // Flat colours removed the per-block detail the old textures used to carry,
  // so neighbouring faces read as one featureless slab. Rebuild that legibility
  // from geometry instead: a hairline along every block boundary plus a faint
  // per-block shade offset. Both come from world position, so they stay correct
  // however faces are batched. Skipped on the cutout pass, whose foliage sways
  // — a grid derived from a moving position would swim.
  const voxelGrid = cutout
    ? ''
    : `
    vec3 inside = vWorldPos - N * 0.5;
    vec3 aN = abs(N);
    vec2 cell = (aN.y > aN.x && aN.y > aN.z)
      ? inside.xz
      : (aN.x > aN.z ? inside.zy : inside.xy);
    vec2 toEdge = min(fract(cell), 1.0 - fract(cell));
    vec2 texel = max(fwidth(cell), vec2(1e-5));
    // Two widths, whichever reads better: a screen-space hairline so distant
    // blocks stay separated, and a world-space seam so a block filling the
    // screen still shows its own borders rather than a blank plane.
    float nearEdge = min(toEdge.x, toEdge.y);
    float hairline = 1.0 - smoothstep(0.5, 1.5, min(toEdge.x / texel.x, toEdge.y / texel.y));
    float seam = 1.0 - smoothstep(0.012, 0.032, nearEdge);
    float line = max(hairline, seam);
    // Let it go before far terrain collapses into a dark wire mesh.
    line *= 1.0 - smoothstep(40.0, 110.0, dist);
    color *= 1.0 - line * 0.28;

    vec3 cellId = floor(inside);
    float jitter = fract(sin(dot(cellId, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    color *= 0.94 + jitter * 0.12;`;
  return /* glsl */ `
  uniform sampler2D map;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform vec3 ambientColor;
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform float time;
  uniform float cheapShading;

  varying vec2 vUv;
  varying float vAo;
  varying float vLight;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vWind;

  void main() {
    vec4 tex = texture2D(map, vUv);
    ${discardLine}

    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;

    vec3 L = normalize(sunDir);
    float day = smoothstep(-0.12, 0.38, sunDir.y);
    float wrapSun = max(dot(N, L), 0.0) * 0.55 + 0.45;
    float vl = clamp(vLight, 0.0, 1.0);

    if (cheapShading > 0.5) {
      // Cheap unlit / MeshLambert style for Very Low & Low mobile
      vec3 lighting = ambientColor * (0.6 + vl * 0.4) + sunColor * wrapSun * mix(0.4, 1.0, vl);
      vec3 color = tex.rgb * lighting;
      ${rustle}
      float dist = length(vWorldPos - cameraPosition);
      float fog = clamp(1.0 - exp(-dist * fogDensity), 0.0, 0.72);
      gl_FragColor = vec4(mix(color, fogColor, fog), 1.0);
      return;
    }

    float wrapMoon = max(dot(N, -L), 0.0) * 0.3 + 0.5;
    float skyFill = N.y * 0.42 + 0.58;
    float groundBounce = max(-N.y, 0.0) * 0.12;

    float blockGlow = smoothstep(0.15, 0.55, vl);
    // Keep a readable base fill so caves aren't pure black.
    vec3 lighting = ambientColor * (0.42 + vl * 0.58);
    lighting += sunColor * wrapSun * (0.08 + day * 0.88) * mix(0.28, 1.0, vl);
    lighting += vec3(0.22, 0.26, 0.42) * wrapMoon * (1.0 - day) * mix(0.45, 1.0, vl);
    lighting += vec3(0.16, 0.18, 0.16) * skyFill * mix(0.5, 1.0, vl);
    lighting += vec3(0.1, 0.09, 0.07) * groundBounce * mix(0.55, 1.0, vl);
    lighting += vec3(1.0, 0.74, 0.38) * blockGlow * 0.4;
    vec3 color = tex.rgb * lighting * max(vAo, 0.68);
    ${rustle}

    float dist = length(vWorldPos - cameraPosition);
    ${voxelGrid}
    float fog = clamp(1.0 - exp(-dist * fogDensity), 0.0, 0.72);
    float atmo = smoothstep(48.0, 220.0, dist);
    color = mix(color, fogColor, clamp(fog + atmo * 0.22, 0.0, 0.78));

    // Ridge emphasis — slopes catch light differently
    float slope = 1.0 - abs(N.y);
    color *= 1.0 + slope * max(dot(N, L), 0.0) * 0.08 * mix(0.4, 1.0, vl);
    gl_FragColor = vec4(color, 1.0);
  }
`;
}

const waterVert = /* glsl */ `
  attribute float ao;
  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDepth;
  uniform float time;

  void main() {
    vUv = uv;
    vDepth = ao;
    vec3 pos = position;
    float topMask = step(0.85, normal.y);
    float wave = sin(pos.x * 0.55 + time * 1.8) * 0.028
               + cos(pos.z * 0.48 + time * 1.35) * 0.022
               + sin((pos.x + pos.z) * 0.22 - time * 0.9) * 0.014;
    pos.y += wave * topMask;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const waterFrag = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform vec3 ambientColor;
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform float time;
  uniform float seaLevel;
  uniform float waterShading;

  varying vec2 vUv;
  varying vec3 vWorldPos;
  varying vec3 vNormal;
  varying float vDepth;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  void main() {
    if (waterShading < 0.5) {
      // Very Low & Low: Flat transparent color without reflections or noise
      vec4 tex = texture2D(map, vUv);
      vec3 flatCol = mix(vec3(0.06, 0.36, 0.54), tex.rgb, 0.15);
      float dist = length(vWorldPos - cameraPosition);
      float fog = clamp(1.0 - exp(-dist * fogDensity), 0.0, 0.6);
      gl_FragColor = vec4(mix(flatCol, fogColor, fog), 0.55);
      return;
    }

    if (waterShading < 1.5) {
      // Medium: Simple water tint with basic wave scroll
      vec2 scroll = vec2(0.12, 0.08) * time * 0.03;
      vec4 tex = texture2D(map, vUv + scroll);
      float columnDepth = clamp(vDepth * 16.0, 1.0, 24.0);
      vec3 shallow = vec3(0.08, 0.38, 0.5) + tex.rgb * 0.1;
      vec3 deep = vec3(0.02, 0.12, 0.28);
      vec3 color = mix(shallow, deep, clamp(columnDepth / 14.0, 0.0, 1.0));
      float dist = length(vWorldPos - cameraPosition);
      float fog = clamp(1.0 - exp(-dist * fogDensity), 0.0, 0.62);
      gl_FragColor = vec4(mix(color, fogColor, fog), 0.62);
      return;
    }

    // High & Max: BSL-like look with waves, ripples, caustics, fresnel, sparkle
    vec2 scroll = vec2(0.15, 0.1) * time * 0.03;
    vec2 uv = vUv * 1.4 + scroll;
    vec4 tex = texture2D(map, uv);

    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    N.x += sin(vWorldPos.x * 0.65 + time * 1.4) * 0.04;
    N.z += cos(vWorldPos.z * 0.6 + time * 1.2) * 0.04;
    N = normalize(N);

    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(sunDir);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float specRaw = pow(max(dot(reflect(-L, N), V), 0.0), 160.0);
    float spec = specRaw * (0.4 + 0.35 * max(L.y, 0.0));
    spec = min(spec, 0.35);

    float ripple = noise(vWorldPos.xz * 0.35 + scroll * 3.0) * 0.5
                 + noise(vWorldPos.xz * 0.75 - scroll * 2.0) * 0.25;
    float caustic = noise(vWorldPos.xz * 0.9 + vec2(time * 0.45, -time * 0.32));
    caustic += noise(vWorldPos.xz * 1.6 - vec2(time * 0.28, time * 0.22)) * 0.55;
    caustic = smoothstep(0.35, 0.92, caustic);

    float columnDepth = clamp(vDepth * 16.0, 1.0, 24.0);
    vec3 shallow = vec3(0.1, 0.42, 0.5) + tex.rgb * 0.1;
    vec3 deep = vec3(0.02, 0.12, 0.28);
    vec3 color = mix(shallow, deep, clamp(columnDepth / 14.0, 0.0, 1.0));
    color += ripple * 0.07;
    color += vec3(0.05, 0.12, 0.1) * caustic * (1.0 - clamp(columnDepth / 18.0, 0.0, 1.0)) * 0.45;

    vec3 sparkle = mix(sunColor, vec3(0.45, 0.62, 0.78), 0.55);
    color += sparkle * spec * (0.08 + fresnel * 0.12);
    color += ambientColor * 0.22 * (1.0 - fresnel);
    color = mix(color, color * 1.03 + vec3(0.02, 0.05, 0.07), fresnel * 0.22);
    color = min(color, vec3(0.78));

    float dist = length(vWorldPos - cameraPosition);
    float fog = clamp(1.0 - exp(-dist * fogDensity), 0.0, 0.62);
    color = mix(color, fogColor, fog);

    float viewAngle = max(dot(N, V), 0.0);
    float alpha = mix(0.14, 0.62, fresnel);
    alpha *= mix(0.55, 1.0, viewAngle);
    alpha *= mix(1.0, 0.72, clamp(columnDepth / 20.0, 0.0, 1.0));
    alpha = clamp(alpha, 0.1, 0.72);

    gl_FragColor = vec4(color, alpha);
  }
`;

const lavaVert = /* glsl */ `
  attribute float ao;
  varying vec2 vUv;
  varying float vAo;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vAo = ao;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const lavaFrag = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform float time;

  varying vec2 vUv;
  varying float vAo;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec2 uv = vUv + vec2(0.08, 0.05) * time * 0.02;
    vec4 tex = texture2D(map, uv);
    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;

    float pulse = 0.9 + 0.1 * sin(time * 2.4 + vWorldPos.x * 0.55 + vWorldPos.z * 0.45);
    vec3 hot = tex.rgb * 1.25 * pulse;
    hot += vec3(1.0, 0.42, 0.06) * 0.35;
    hot += vec3(1.0, 0.72, 0.12) * max(N.y, 0.0) * 0.15;

    vec3 color = hot * max(vAo, 0.8);
    float fog = clamp(1.0 - exp(-length(vWorldPos - cameraPosition) * fogDensity), 0.0, 0.65);
    color = mix(color, fogColor, fog);
    // Slight translucency so sloping seams don't draw hard walls.
    gl_FragColor = vec4(color, 0.92);
  }
`;

export class TerrainMaterials {
  readonly atlas: THREE.CanvasTexture;
  readonly solid: THREE.ShaderMaterial;
  readonly cutout: THREE.ShaderMaterial;
  readonly water: THREE.ShaderMaterial;
  readonly lava: THREE.ShaderMaterial;
  private pack: TexturePack = 'default';
  readonly uniforms: {
    sunDir: THREE.IUniform<THREE.Vector3>;
    sunColor: THREE.IUniform<THREE.Color>;
    ambientColor: THREE.IUniform<THREE.Color>;
    fogColor: THREE.IUniform<THREE.Color>;
    fogDensity: THREE.IUniform<number>;
    timeOfDay: THREE.IUniform<number>;
    time: THREE.IUniform<number>;
    seaLevel: THREE.IUniform<number>;
    cheapShading: THREE.IUniform<number>;
    waterShading: THREE.IUniform<number>;
  };

  constructor(pack: TexturePack = 'default') {
    this.pack = pack;
    this.atlas = createTextureAtlas(pack);
    this.atlas.premultiplyAlpha = false;

    this.uniforms = {
      sunDir: { value: new THREE.Vector3(0.35, 1, 0.25).normalize() },
      sunColor: { value: new THREE.Color(1.0, 0.96, 0.88) },
      ambientColor: { value: new THREE.Color(0.32, 0.36, 0.4) },
      fogColor: { value: new THREE.Color(0.6, 0.72, 0.76) },
      fogDensity: { value: 0.004 },
      timeOfDay: { value: 0.28 },
      time: { value: 0 },
      seaLevel: { value: SEA_LEVEL },
      cheapShading: { value: 0.0 },
      waterShading: { value: 1.0 },
    };

    const shared = {
      map: { value: this.atlas },
      sunDir: this.uniforms.sunDir,
      sunColor: this.uniforms.sunColor,
      ambientColor: this.uniforms.ambientColor,
      fogColor: this.uniforms.fogColor,
      fogDensity: this.uniforms.fogDensity,
      time: this.uniforms.time,
      cheapShading: this.uniforms.cheapShading,
    };

    this.solid = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: terrainVert,
      fragmentShader: makeTerrainFrag(false),
      transparent: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.FrontSide,
    });

    this.cutout = new THREE.ShaderMaterial({
      uniforms: { ...shared },
      vertexShader: cutoutVert,
      fragmentShader: makeTerrainFrag(true),
      transparent: false,
      alphaTest: 0.5,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
    });

    this.water = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.atlas },
        sunDir: this.uniforms.sunDir,
        sunColor: this.uniforms.sunColor,
        ambientColor: this.uniforms.ambientColor,
        fogColor: this.uniforms.fogColor,
        fogDensity: this.uniforms.fogDensity,
        time: this.uniforms.time,
        seaLevel: this.uniforms.seaLevel,
        waterShading: this.uniforms.waterShading,
      },
      vertexShader: waterVert,
      fragmentShader: waterFrag,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
    });

    this.lava = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: this.atlas },
        fogColor: this.uniforms.fogColor,
        fogDensity: this.uniforms.fogDensity,
        time: this.uniforms.time,
      },
      vertexShader: lavaVert,
      fragmentShader: lavaFrag,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.FrontSide,
      blending: THREE.NormalBlending,
    });
  }

  setGfx(gfx: GfxPrefs): void {
    const isCheap = gfx.preset === 'very-low' || gfx.preset === 'low';
    this.uniforms.cheapShading.value = isCheap ? 1.0 : 0.0;
    this.uniforms.waterShading.value =
      gfx.waterShading === 'flat' ? 0.0 : gfx.waterShading === 'simple' ? 1.0 : 2.0;
    if (gfx.warmSun) {
      this.uniforms.sunColor.value.setRGB(1.05, 0.94, 0.82);
    } else {
      this.uniforms.sunColor.value.setRGB(1.0, 0.96, 0.88);
    }
  }

  update(
    dt: number,
    sunDir: THREE.Vector3,
    timeOfDay: number,
    fogColor: THREE.Color,
    fogDensity: number,
    submersion = 0,
  ): void {
    this.uniforms.time.value += dt;
    this.uniforms.sunDir.value.copy(sunDir).normalize();
    this.uniforms.timeOfDay.value = timeOfDay;
    this.uniforms.fogColor.value.copy(fogColor);
    this.uniforms.fogDensity.value = fogDensity;

    const u = Math.min(1, Math.max(0, submersion));
    if (u > 0.001) {
      this.uniforms.fogDensity.value += u * 0.006;
      const under = new THREE.Color(0.04, 0.28, 0.46);
      this.uniforms.fogColor.value.lerp(under, u * 0.55);
    }

    const day = THREE.MathUtils.smoothstep(-0.1, 0.4, sunDir.y);
    this.uniforms.sunColor.value.setRGB(1, 0.9 + day * 0.08, 0.78 + day * 0.14);
    const amb = 0.52 + day * 0.18;
    this.uniforms.ambientColor.value.setRGB(
      amb * (1 - u * 0.3),
      (0.54 + day * 0.14) * (1 - u * 0.22),
      (0.6 + day * 0.1) * (1 - u * 0.12),
    );
  }

  get texturePack(): TexturePack {
    return this.pack;
  }

  setTexturePack(pack: TexturePack, onComplete?: () => void): void {
    if (this.pack === pack) {
      onComplete?.();
      return;
    }
    this.pack = pack;
    applyTexturePackToAtlas(this.atlas, pack, onComplete);
  }
}
