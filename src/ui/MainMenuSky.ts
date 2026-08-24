/** GPU main-menu sky: static gradient base + parallax cloud layers from artwork. */
export type MainMenuSkySpeeds = readonly [number, number, number];

export interface MainMenuSkyOptions {
  /** Ping-pong drift speed per cloud layer (cycles / sec). */
  cloudSpeed?: MainMenuSkySpeeds;
  /** Max horizontal drift in cover UV space (0–1). */
  cloudDrift?: MainMenuSkySpeeds;
  /** Subtle vertical wobble amplitude in UV space. */
  verticalWobble?: number;
}

const DEFAULT_SPEED: MainMenuSkySpeeds = [0.018, 0.028, 0.04];
const DEFAULT_DRIFT: MainMenuSkySpeeds = [0.035, 0.055, 0.08];
const SKY_URL = '/menu-sky-base.png';
const FULL_URL = '/menu-sky-source.png';
const CLOUD_URLS = ['/menu-sky-clouds-0.png', '/menu-sky-clouds-1.png', '/menu-sky-clouds-2.png'] as const;

const VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uSky;
uniform sampler2D uFull;
uniform sampler2D uCloud0;
uniform sampler2D uCloud1;
uniform sampler2D uCloud2;
uniform vec2 uViewport;
uniform vec2 uTexSize;
uniform float uTime;
uniform vec3 uSpeed;
uniform vec3 uDrift;
uniform float uWobble;

vec2 coverUv(vec2 uv) {
  float va = uViewport.x / max(uViewport.y, 1.0);
  float ta = uTexSize.x / max(uTexSize.y, 1.0);
  if (va > ta) {
    float s = va / ta;
    uv.y = (uv.y - 0.5) / s + 0.5;
  } else {
    float s = ta / va;
    uv.x = (uv.x - 0.5) / s + 0.5;
  }
  return clamp(uv, 0.0, 1.0);
}

float pingPong(float t, float speed) {
  float p = mod(t * speed, 2.0);
  return p < 1.0 ? p : 2.0 - p;
}

vec4 sampleCloudLayer(sampler2D maskTex, vec2 uv, float drift, float speed, float wobblePhase) {
  float shift = (pingPong(uTime, speed) * 2.0 - 1.0) * drift;
  vec4 mask = texture(maskTex, uv);
  if (mask.a < 0.01) return vec4(0.0);
  vec2 cuv = uv;
  cuv.x = clamp(uv.x + shift, 0.0, 1.0);
  cuv.y = clamp(uv.y + sin(uTime * 0.35 + wobblePhase) * uWobble, 0.0, 1.0);
  vec3 shifted = texture(uFull, cuv).rgb;
  return vec4(shifted, mask.a);
}

void main() {
  vec2 uv = coverUv(vUv);
  vec3 color = texture(uSky, uv).rgb;

  vec4 c0 = sampleCloudLayer(uCloud0, uv, uDrift.x, uSpeed.x, 0.0);
  vec4 c1 = sampleCloudLayer(uCloud1, uv, uDrift.y, uSpeed.y, 2.1);
  vec4 c2 = sampleCloudLayer(uCloud2, uv, uDrift.z, uSpeed.z, 4.2);

  color = mix(color, c0.rgb, c0.a);
  color = mix(color, c1.rgb, c1.a);
  color = mix(color, c2.rgb, c2.a);

  outColor = vec4(color, 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error('shader alloc failed');
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? 'unknown';
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function linkProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader): WebGLProgram {
  const prog = gl.createProgram();
  if (!prog) throw new Error('program alloc failed');
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog) ?? 'unknown';
    gl.deleteProgram(prog);
    throw new Error(log);
  }
  return prog;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

/** Animated pixel-art menu sky (WebGL2). */
export class MainMenuSky {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private texSky: WebGLTexture | null = null;
  private texFull: WebGLTexture | null = null;
  private texClouds: WebGLTexture[] = [];
  private uViewport: WebGLUniformLocation | null = null;
  private uTexSize: WebGLUniformLocation | null = null;
  private uTime: WebGLUniformLocation | null = null;
  private uSpeed: WebGLUniformLocation | null = null;
  private uDrift: WebGLUniformLocation | null = null;
  private uCloud: WebGLUniformLocation[] = [];
  private uSky: WebGLUniformLocation | null = null;
  private uFull: WebGLUniformLocation | null = null;
  private uWobble: WebGLUniformLocation | null = null;
  private texW = 1;
  private texH = 1;
  private speeds: MainMenuSkySpeeds;
  private drift: MainMenuSkySpeeds;
  private wobble: number;
  private raf = 0;
  private running = false;
  private t0 = 0;
  private w = 1;
  private h = 1;
  private ready = false;
  private onResize = (): void => this.resize();
  private ro: ResizeObserver | null = null;

  constructor(opts: MainMenuSkyOptions = {}) {
    this.speeds = opts.cloudSpeed ?? DEFAULT_SPEED;
    this.drift = opts.cloudDrift ?? DEFAULT_DRIFT;
    this.wobble = opts.verticalWobble ?? 0.003;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'menu-sky-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
  }

  /** Adjust cloud drift speed (ping-pong cycles per second). */
  setCloudSpeed(speed: MainMenuSkySpeeds): void {
    this.speeds = speed;
  }

  /** Adjust max horizontal drift per layer (cover UV units). */
  setCloudDrift(drift: MainMenuSkySpeeds): void {
    this.drift = drift;
  }

  mount(host: HTMLElement): void {
    host.replaceChildren(this.canvas);
    this.ro?.disconnect();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    window.addEventListener('resize', this.onResize);
    requestAnimationFrame(() => this.resize());
    void this.initGl();
  }

  start(): void {
    this.resize();
    this.running = true;
    if (!this.ready || this.raf) return;
    this.t0 = performance.now();
    const tick = (now: number): void => {
      if (!this.running) return;
      this.draw((now - this.t0) / 1000);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  dispose(): void {
    this.stop();
    this.ro?.disconnect();
    this.ro = null;
    window.removeEventListener('resize', this.onResize);
    const gl = this.gl;
    if (gl) {
      if (this.texSky) gl.deleteTexture(this.texSky);
      if (this.texFull) gl.deleteTexture(this.texFull);
      for (const t of this.texClouds) gl.deleteTexture(t);
      if (this.prog) gl.deleteProgram(this.prog);
    }
    this.gl = null;
    this.canvas.remove();
  }

  private async initGl(): Promise<void> {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      console.warn('WebGL2 unavailable for menu sky');
      return;
    }
    this.gl = gl;

    const vs = compileShader(gl, gl.VERTEX_SHADER, VS);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FS);
    this.prog = linkProgram(gl, vs, fs);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(this.prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.uViewport = gl.getUniformLocation(this.prog, 'uViewport');
    this.uTexSize = gl.getUniformLocation(this.prog, 'uTexSize');
    this.uTime = gl.getUniformLocation(this.prog, 'uTime');
    this.uSpeed = gl.getUniformLocation(this.prog, 'uSpeed');
    this.uDrift = gl.getUniformLocation(this.prog, 'uDrift');
    this.uWobble = gl.getUniformLocation(this.prog, 'uWobble');
    this.uSky = gl.getUniformLocation(this.prog, 'uSky');
    this.uFull = gl.getUniformLocation(this.prog, 'uFull');
    for (let i = 0; i < 3; i++) {
      this.uCloud[i] = gl.getUniformLocation(this.prog, `uCloud${i}`)!;
    }

    try {
      const skyImg = await loadImage(SKY_URL);
      this.texW = skyImg.naturalWidth;
      this.texH = skyImg.naturalHeight;
      this.texSky = this.uploadTex(gl, skyImg, gl.NEAREST);
      const fullImg = await loadImage(FULL_URL);
      this.texFull = this.uploadTex(gl, fullImg, gl.NEAREST);
      this.texClouds = [];
      for (const url of CLOUD_URLS) {
        const img = await loadImage(url);
        this.texClouds.push(this.uploadTex(gl, img, gl.NEAREST));
      }
      this.ready = true;
      this.draw(0);
      if (this.running) this.start();
    } catch (e) {
      console.warn('Menu sky assets failed to load', e);
    }
  }

  private uploadTex(
    gl: WebGL2RenderingContext,
    img: HTMLImageElement,
    filter: number,
  ): WebGLTexture {
    const tex = gl.createTexture();
    if (!tex) throw new Error('texture alloc failed');
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    return tex;
  }

  private resize(): void {
    const parent = this.canvas.parentElement;
    let w = parent?.clientWidth ?? 0;
    let h = parent?.clientHeight ?? 0;
    if (w < 2 || h < 2) {
      w = window.innerWidth;
      h = window.innerHeight;
    }
    w = Math.max(2, Math.floor(w));
    h = Math.max(2, Math.floor(h));
    if (w === this.w && h === this.h && this.canvas.width > 1) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.gl?.viewport(0, 0, w, h);
  }

  private draw(t: number): void {
    const gl = this.gl;
    const prog = this.prog;
    if (!gl || !prog || !this.ready || !this.texSky || !this.texFull || this.texClouds.length < 3) return;

    gl.useProgram(prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texSky);
    gl.uniform1i(this.uSky, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texFull);
    gl.uniform1i(this.uFull, 1);

    for (let i = 0; i < 3; i++) {
      gl.activeTexture(gl.TEXTURE2 + i);
      gl.bindTexture(gl.TEXTURE_2D, this.texClouds[i]!);
      gl.uniform1i(this.uCloud[i]!, 2 + i);
    }

    gl.uniform2f(this.uViewport, this.w, this.h);
    gl.uniform2f(this.uTexSize, this.texW, this.texH);
    gl.uniform1f(this.uTime, t);
    gl.uniform3f(this.uSpeed, this.speeds[0], this.speeds[1], this.speeds[2]);
    gl.uniform3f(this.uDrift, this.drift[0], this.drift[1], this.drift[2]);
    gl.uniform1f(this.uWobble, this.wobble);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

/** @deprecated Use MainMenuSky */
export { MainMenuSky as TitleSky };
