/**
 * Parameterized sky dome shader.
 *
 * This is the game's sky technique — gradient atmosphere, sun and moon discs,
 * stars, and two scrolling fbm cloud layers — exposed with uniforms for cloud
 * cover, cloud scale and cloud speed so a world style can drive it. With
 * uCloudScale and uCloudSpeed at 1 it reproduces the shipped look.
 */
export const SKY_VERT = /* glsl */ `
  varying vec3 vWorldDir;
  void main() {
    // Ignore camera translation so the dome is always around the viewer
    mat4 mv = modelViewMatrix;
    mv[3][0] = 0.0;
    mv[3][1] = 0.0;
    mv[3][2] = 0.0;
    vec4 clip = projectionMatrix * mv * vec4(position, 1.0);
    gl_Position = clip.xyww;
    vWorldDir = normalize(position);
  }
`;

export const SKY_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorldDir;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform float uTime;
  uniform float uDay;
  uniform float uCloud;
  uniform float uCloudScale;
  uniform float uCloudSpeed;
  uniform float uHaze;
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

    vec3 zenith = mix(vec3(0.03, 0.04, 0.12), vec3(0.18, 0.42, 0.88), uDay);
    zenith = mix(zenith, vec3(0.2, 0.1, 0.28), dusk);
    vec3 horiz = mix(vec3(0.06, 0.08, 0.16), vec3(0.55, 0.72, 0.92), uDay);
    horiz = mix(horiz, vec3(0.95, 0.45, 0.25), dusk * 0.9);

    float elev = pow(clamp(h * 0.5 + 0.5, 0.0, 1.0), 0.7);
    vec3 col = mix(horiz, zenith, elev);
    col = mix(col, uFog, pow(1.0 - abs(h), 4.0) * 0.4);

    float sunDot = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSunColor * smoothstep(0.9992, 0.9999, sunDot) * 4.0;
    col += uSunColor * pow(sunDot, 60.0) * uDay * 1.6;
    col += uSunColor * pow(sunDot, 8.0) * uDay * 0.4;
    col += vec3(1.0, 0.5, 0.25) * pow(sunDot, 3.0) * dusk * 0.6;

    vec3 moonDir = normalize(-uSunDir);
    float moonDot = max(dot(dir, moonDir), 0.0);
    float moon = smoothstep(0.9985, 0.9997, moonDot) * night;
    col += vec3(0.75, 0.8, 0.95) * moon * 2.2;
    col += vec3(0.35, 0.4, 0.55) * pow(moonDot, 40.0) * night * 0.5;

    if (night > 0.2 && h > 0.0) {
      vec2 sp = dir.xz / (abs(h) + 0.12);
      float s = hash21(floor(sp * 220.0));
      float star = smoothstep(0.992, 1.0, s);
      star *= smoothstep(0.0, 0.25, h);
      float twinkle = 0.7 + 0.3 * sin(uTime * 2.0 + s * 40.0);
      col += vec3(0.8, 0.85, 1.0) * star * night * twinkle * 1.3;
    }

    if (h > -0.08 && uCloud > 0.001) {
      float ph = max(h, 0.035);
      // Larger uCloudScale means larger, broader clouds, so the sampling
      // frequency is divided by it.
      float f = 1.0 / max(0.2, uCloudScale);
      float t = uTime * uCloudSpeed;
      vec2 uv1 = dir.xz / ph * 0.48 * f + vec2(t * 0.012, t * 0.007);
      vec2 uv2 = dir.xz / ph * 0.95 * f + vec2(-t * 0.008, t * 0.01);

      float n = fbm(uv1);
      n = n * 0.62 + fbm(uv2 + 13.0) * 0.38;

      float cover = mix(0.62, 0.16, clamp(uCloud, 0.0, 1.4) / 1.4);
      float dens = smoothstep(cover, cover + 0.22, n);
      dens *= smoothstep(-0.05, 0.12, h);
      dens *= mix(1.0, 0.75, smoothstep(0.75, 1.0, h));

      float lining = pow(max(sunDot, moonDot * night), 5.0) * 0.45;

      vec3 dayCloud = vec3(0.95, 0.96, 0.98);
      vec3 duskCloud = vec3(0.95, 0.58, 0.4);
      vec3 nightCloud = vec3(0.22, 0.26, 0.38);
      vec3 cLit = mix(nightCloud, dayCloud, uDay);
      cLit = mix(cLit, duskCloud, dusk * 0.75);
      cLit *= 0.65 + lining + uDay * 0.35;
      cLit += vec3(0.08, 0.1, 0.16) * night;

      float alpha = dens * clamp(0.55 + uCloud * 0.3, 0.0, 0.95);
      alpha *= mix(0.72, 1.0, uDay);
      col = mix(col, cLit, clamp(alpha, 0.0, 0.95));
    }

    // Weather haze pulls the whole dome towards the fog colour.
    col = mix(col, uFog, clamp(uHaze, 0.0, 0.9));

    gl_FragColor = vec4(col, 1.0);
  }
`;
