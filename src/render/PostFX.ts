import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/** Soft underwater tint / caustics. */
const UnderwaterShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    underwater: { value: 0 },
    time: { value: 0 },
    waterColor: { value: new THREE.Color(0.05, 0.28, 0.42) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float underwater;
    uniform float time;
    uniform vec3 waterColor;
    varying vec2 vUv;

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
      vec2 uv = vUv;
      float u = clamp(underwater, 0.0, 1.0);
      if (u < 0.001) {
        gl_FragColor = texture2D(tDiffuse, uv);
        return;
      }

      float wobble = (noise(uv * 8.0 + time * 0.15) - 0.5) * 0.003 * u;
      uv += vec2(wobble, wobble * 0.6);

      vec4 col = texture2D(tDiffuse, uv);
      vec3 tint = mix(col.rgb, col.rgb * waterColor * 1.85, u * 0.42);
      tint = mix(tint, waterColor * 0.42, u * 0.22);

      float caustic = noise(uv * 14.0 + vec2(time * 0.35, -time * 0.28));
      caustic += noise(uv * 22.0 - vec2(time * 0.22, time * 0.18)) * 0.5;
      caustic = smoothstep(0.45, 0.95, caustic);
      tint += vec3(0.04, 0.14, 0.16) * caustic * u * 0.18;

      float rays = sin(uv.y * 6.0 - time * 0.8) * 0.5 + 0.5;
      rays *= 1.0 - uv.y;
      tint += vec3(0.03, 0.1, 0.12) * rays * u * 0.12;

      vec2 d = uv - 0.5;
      float vig = 1.0 - dot(d, d) * (1.4 * u);
      tint *= mix(1.0, clamp(vig, 0.5, 1.0), u * 0.65);

      gl_FragColor = vec4(tint, col.a);
    }
  `,
};

/**
 * BSL-inspired look:
 * ACES tonemap, soft vignette, warmth, contrast, and radial sun shafts.
 */
const BslGradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    sunScreen: { value: new THREE.Vector2(0.5, 0.75) },
    sunStrength: { value: 0.55 },
    dayFactor: { value: 1 },
    time: { value: 0 },
    intensity: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 sunScreen;
    uniform float sunStrength;
    uniform float dayFactor;
    uniform float time;
    uniform float intensity;
    varying vec2 vUv;

    vec3 aces(vec3 x) {
      const float a = 2.51;
      const float b = 0.03;
      const float c = 2.43;
      const float d = 0.59;
      const float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    void main() {
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 col = src.rgb;

      // Fake volumetric god rays toward sun
      float strength = sunStrength * intensity * mix(0.25, 1.0, dayFactor);
      if (strength > 0.02 && sunScreen.y > -0.05 && sunScreen.y < 1.2) {
        vec2 sun = sunScreen;
        vec2 delta = (vUv - sun) / 12.0;
        vec3 shaft = vec3(0.0);
        vec2 uv = vUv;
        float decay = 1.0;
        for (int i = 0; i < 12; i++) {
          uv -= delta;
          shaft += texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb * decay;
          decay *= 0.86;
        }
        shaft /= 12.0;
        float lum = dot(shaft, vec3(0.299, 0.587, 0.114));
        float radial = 1.0 - smoothstep(0.0, 0.85, length(vUv - sun));
        col += shaft * lum * radial * strength * 0.55;
        col += vec3(1.0, 0.92, 0.75) * pow(radial, 2.5) * strength * 0.12 * dayFactor;
      }

      // Mild contrast + saturation (BSL-ish)
      col = (col - 0.5) * 1.08 + 0.5;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, 1.12);

      // Warm daylight / cool night
      vec3 warm = vec3(1.04, 1.0, 0.94);
      vec3 cool = vec3(0.92, 0.96, 1.08);
      col *= mix(cool, warm, dayFactor);

      col = aces(col * 1.05);

      // Soft vignette
      vec2 d = vUv - 0.5;
      float vig = 1.0 - dot(d, d) * 0.55;
      col *= mix(1.0, clamp(vig, 0.7, 1.0), 0.65 * intensity);

      // Film grain (very light)
      float grain = fract(sin(dot(vUv + time, vec2(12.9898, 78.233))) * 43758.5453);
      col += (grain - 0.5) * 0.012 * intensity;

      gl_FragColor = vec4(col, src.a);
    }
  `,
};

export class PostFX {
  readonly composer: EffectComposer;
  private underwaterPass: ShaderPass;
  private bloomPass: UnrealBloomPass;
  private gradePass: ShaderPass;
  private camera: THREE.Camera;
  private time = 0;
  private sunWorld = new THREE.Vector3();
  private sunNdc = new THREE.Vector3();

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.camera = camera;
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.45, 0.55, 0.82);
    this.composer.addPass(this.bloomPass);

    this.underwaterPass = new ShaderPass(UnderwaterShader);
    this.composer.addPass(this.underwaterPass);

    this.gradePass = new ShaderPass(BslGradeShader);
    this.composer.addPass(this.gradePass);

    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
    this.bloomPass.resolution.set(w, h);
  }

  setUnderwater(amount: number, dt: number): void {
    this.time += dt;
    this.underwaterPass.uniforms.underwater.value = amount;
    this.underwaterPass.uniforms.time.value = this.time;
    this.underwaterPass.enabled = amount > 0.02;
    this.gradePass.uniforms.time.value = this.time;
  }

  /** Update sun shafts from world-space sun direction. */
  setSun(sunDir: THREE.Vector3, dayFactor: number, playerPos: THREE.Vector3): void {
    this.sunWorld.copy(playerPos).addScaledVector(sunDir, 200);
    this.sunNdc.copy(this.sunWorld).project(this.camera);
    const x = this.sunNdc.x * 0.5 + 0.5;
    const y = this.sunNdc.y * 0.5 + 0.5;
    this.gradePass.uniforms.sunScreen.value.set(x, y);
    const onScreen = this.sunNdc.z < 1 && x > -0.2 && x < 1.2 && y > -0.2 && y < 1.2;
    const strength = onScreen ? Math.max(0, dayFactor) * 0.7 : 0;
    this.gradePass.uniforms.sunStrength.value = strength;
    this.gradePass.uniforms.dayFactor.value = Math.max(0, dayFactor);
    this.bloomPass.strength = 0.28 + dayFactor * 0.28;
    this.bloomPass.threshold = 0.78 - dayFactor * 0.08;
  }

  render(): void {
    this.composer.render();
  }
}
