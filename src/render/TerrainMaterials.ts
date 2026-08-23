import * as THREE from 'three';
import { createTextureAtlas } from './TextureAtlas';
import { SEA_LEVEL } from '../world/blocks';

const terrainVert = /* glsl */ `
  attribute float ao;
  varying vec2 vUv;
  varying float vAo;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vAo = ao;
    vNormal = normalize(normalMatrix * normal);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPos = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

function makeTerrainFrag(cutout: boolean): string {
  const discardLine = cutout ? 'if (tex.a < 0.5) discard;' : '';
  return /* glsl */ `
  uniform sampler2D map;
  uniform vec3 sunDir;
  uniform vec3 sunColor;
  uniform vec3 ambientColor;
  uniform vec3 fogColor;
  uniform float fogDensity;

  varying vec2 vUv;
  varying float vAo;
  varying vec3 vWorldPos;
  varying vec3 vNormal;

  void main() {
    vec4 tex = texture2D(map, vUv);
    ${discardLine}

    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;

    vec3 L = normalize(sunDir);
    float wrap = max(dot(N, L), 0.0) * 0.55 + 0.45;
    float day = clamp(sunDir.y * 1.25, 0.05, 1.0);

    vec3 lighting = ambientColor + sunColor * wrap * day;
    lighting += vec3(0.14, 0.18, 0.22) * (N.y * 0.5 + 0.5);
    vec3 color = tex.rgb * lighting * max(vAo, 0.35);

    float fog = clamp(1.0 - exp(-length(vWorldPos - cameraPosition) * fogDensity), 0.0, 0.72);
    color = mix(color, fogColor, fog);
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
    float wave = sin(pos.x * 0.55 + time * 1.8) * 0.035
               + cos(pos.z * 0.48 + time * 1.35) * 0.028
               + sin((pos.x + pos.z) * 0.22 - time * 0.9) * 0.018;
    pos.y += wave;
    vNormal = normalize(normalMatrix * normal);
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
    vec2 flow = vec2(time * 0.04, time * 0.025);
    vec2 uv = vUv * 1.4 + flow;
    vec4 tex = texture2D(map, uv);

    vec3 N = normalize(vNormal);
    if (!gl_FrontFacing) N = -N;
    N.x += sin(vWorldPos.x * 0.65 + time * 1.4) * 0.04;
    N.z += cos(vWorldPos.z * 0.6 + time * 1.2) * 0.04;
    N = normalize(N);

    vec3 V = normalize(cameraPosition - vWorldPos);
    vec3 L = normalize(sunDir);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), 2.6);
    float spec = pow(max(dot(reflect(-L, N), V), 0.0), 88.0);

    float ripple = noise(vWorldPos.xz * 0.35 + flow * 3.0) * 0.5
                 + noise(vWorldPos.xz * 0.75 - flow * 2.0) * 0.25;
    float caustic = noise(vWorldPos.xz * 0.9 + vec2(time * 0.45, -time * 0.32));
    caustic += noise(vWorldPos.xz * 1.6 - vec2(time * 0.28, time * 0.22)) * 0.55;
    caustic = smoothstep(0.35, 0.92, caustic);

    float columnDepth = clamp(vDepth * 16.0, 1.0, 24.0);
    vec3 shallow = vec3(0.12, 0.52, 0.58) + tex.rgb * 0.12;
    vec3 deep = vec3(0.02, 0.14, 0.32);
    vec3 color = mix(shallow, deep, clamp(columnDepth / 14.0, 0.0, 1.0));
    color += ripple * 0.09;
    color += vec3(0.06, 0.14, 0.12) * caustic * (1.0 - clamp(columnDepth / 18.0, 0.0, 1.0));

    color += sunColor * spec * (0.35 + fresnel * 0.55);
    color += ambientColor * 0.25 * (1.0 - fresnel);
    color = mix(color, color * 1.08 + vec3(0.04, 0.08, 0.1), fresnel * 0.35);

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

export class TerrainMaterials {
  readonly atlas: THREE.CanvasTexture;
  readonly solid: THREE.ShaderMaterial;
  readonly cutout: THREE.ShaderMaterial;
  readonly water: THREE.ShaderMaterial;
  readonly uniforms: {
    sunDir: THREE.IUniform<THREE.Vector3>;
    sunColor: THREE.IUniform<THREE.Color>;
    ambientColor: THREE.IUniform<THREE.Color>;
    fogColor: THREE.IUniform<THREE.Color>;
    fogDensity: THREE.IUniform<number>;
    timeOfDay: THREE.IUniform<number>;
    time: THREE.IUniform<number>;
    seaLevel: THREE.IUniform<number>;
  };

  constructor() {
    this.atlas = createTextureAtlas();
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
    };

    const shared = {
      map: { value: this.atlas },
      sunDir: this.uniforms.sunDir,
      sunColor: this.uniforms.sunColor,
      ambientColor: this.uniforms.ambientColor,
      fogColor: this.uniforms.fogColor,
      fogDensity: this.uniforms.fogDensity,
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
      vertexShader: terrainVert,
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
      },
      vertexShader: waterVert,
      fragmentShader: waterFrag,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      blending: THREE.NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
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

    const day = Math.max(0.08, sunDir.y);
    this.uniforms.sunColor.value.setRGB(1, 0.94 + day * 0.04, 0.82 + day * 0.08);
    const amb = 0.22 + day * 0.12;
    this.uniforms.ambientColor.value.setRGB(
      amb * (1 - u * 0.35),
      (0.26 + day * 0.12) * (1 - u * 0.25),
      (0.32 + day * 0.08) * (1 - u * 0.15),
    );
  }
}
