import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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

export class PostFX {
  readonly composer: EffectComposer;
  private underwaterPass: ShaderPass;
  private time = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));
    this.underwaterPass = new ShaderPass(UnderwaterShader);
    this.composer.addPass(this.underwaterPass);
    this.composer.addPass(new OutputPass());
  }

  setSize(w: number, h: number): void {
    this.composer.setSize(w, h);
  }

  setUnderwater(amount: number, dt: number): void {
    this.time += dt;
    this.underwaterPass.uniforms.underwater.value = amount;
    this.underwaterPass.uniforms.time.value = this.time;
    this.underwaterPass.enabled = amount > 0.02;
  }

  render(): void {
    this.composer.render();
  }
}
