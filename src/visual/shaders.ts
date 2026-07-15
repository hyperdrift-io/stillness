export const vertexShaderSource = `#version 300 es
precision highp float;

const vec2 POSITIONS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

void main() {
  gl_Position = vec4(POSITIONS[gl_VertexID], 0.0, 1.0);
}
`;

export const fragmentShaderSource = `#version 300 es
precision highp float;

out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform float u_complexity;
uniform float u_turbulence;
uniform float u_coherence;
uniform float u_focus;
uniform float u_depth;
uniform float u_pulse;
uniform float u_warmth;
uniform float u_space;
uniform float u_reducedMotion;

#define PI 3.14159265359

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 turn = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 5; i++) {
    value += amplitude * noise(p);
    p = turn * p * 2.03 + 13.17;
    amplitude *= 0.5;
  }
  return value;
}

float glow(float distanceToShape, float intensity) {
  return intensity / max(distanceToShape, 0.002);
}

void main() {
  vec2 p = (2.0 * gl_FragCoord.xy - u_resolution.xy) / min(u_resolution.x, u_resolution.y);
  float timeScale = mix(1.0, 0.0, u_reducedMotion);
  float t = u_time * timeScale;
  float radius = length(p);
  float angle = atan(p.y, p.x);

  float breathing = sin(t * mix(0.32, 0.10, u_space) * 2.0 * PI) * 0.5 + 0.5;
  float pulseEnvelope = mix(0.94, 1.035, breathing * u_pulse);
  vec2 q = p / pulseEnvelope;
  float qRadius = length(q);
  float qAngle = atan(q.y, q.x);

  float warpStrength = mix(0.015, 0.32, u_turbulence) * (1.0 - 0.55 * u_coherence);
  vec2 warp = vec2(
    fbm(q * 1.45 + vec2(t * 0.025, 4.2)),
    fbm(q * 1.45 + vec2(-3.1, -t * 0.021))
  ) - 0.5;
  vec2 w = q + warp * warpStrength;
  float wRadius = length(w);
  float wAngle = atan(w.y, w.x);

  float branchLevel = mix(3.0, 12.0, u_complexity);
  float lowerBranches = floor(branchLevel);
  float branchBlend = smoothstep(0.2, 0.8, fract(branchLevel));
  float radialPhase = wRadius * mix(5.0, 20.0, u_complexity);
  float timePhase = t * mix(0.06, 0.26, u_turbulence);
  float noisePhase = fbm(w * 3.0) * 3.0 * u_turbulence;
  float lowerFilaments = abs(sin(wAngle * lowerBranches + radialPhase - timePhase + noisePhase));
  float upperFilaments = abs(sin(wAngle * (lowerBranches + 1.0) + radialPhase - timePhase + noisePhase));
  float filamentShape = mix(lowerFilaments, upperFilaments, branchBlend);
  float filaments = pow(1.0 - filamentShape, mix(14.0, 4.0, u_complexity));
  filaments *= smoothstep(1.48, 0.05, wRadius) * smoothstep(0.02, 0.16, wRadius);

  float secondary = 0.0;
  for (int i = 0; i < 7; i++) {
    float fi = float(i);
    float seed = fi * 7.13 + 1.0;
    float orbit = 0.18 + fract(seed * 0.37) * 0.72;
    float speed = mix(0.03, 0.13, u_turbulence);
    vec2 point = vec2(cos(seed + t * speed), sin(seed * 1.7 - t * speed * 0.8)) * orbit;
    float activeWeight = smoothstep(fi / 7.0, fi / 7.0 + 0.22, u_complexity);
    secondary += glow(length(w - point), 0.0014) * activeWeight * (1.0 - u_space * 0.72);
  }

  float inner = glow(wRadius, mix(0.008, 0.022, u_focus));
  float core = exp(-wRadius * mix(30.0, 11.0, u_depth));
  float halo = exp(-wRadius * mix(4.8, 2.1, u_depth)) * 0.16;
  float quietRingRadius = mix(0.26, 0.58, u_space);
  float quietRing = exp(-abs(wRadius - quietRingRadius) * mix(120.0, 42.0, u_space));
  quietRing *= u_coherence * u_space * 0.12;

  vec3 ember = vec3(1.0, 0.24, 0.07);
  vec3 gold = vec3(1.0, 0.72, 0.30);
  vec3 violet = vec3(0.34, 0.29, 0.78);
  vec3 blue = vec3(0.38, 0.62, 1.0);
  vec3 activeColor = mix(violet, ember, u_warmth);
  vec3 quietColor = mix(blue, gold, u_warmth * 0.48);
  vec3 color = vec3(0.0025, 0.0035, 0.007);

  color += activeColor * filaments * mix(0.13, 0.72, u_complexity);
  color += quietColor * secondary;
  color += mix(activeColor, quietColor, u_coherence) * halo;
  color += quietColor * quietRing;
  color += mix(gold, vec3(0.82, 0.91, 1.0), u_space) * (inner + core * 0.55);

  float grain = hash21(gl_FragCoord.xy + floor(t * 8.0)) - 0.5;
  color += grain * 0.018 * u_complexity * (1.0 - u_reducedMotion);
  color *= smoothstep(1.72, 0.28, radius);
  color = 1.0 - exp(-color * mix(1.0, 1.65, u_focus));
  color = pow(color, vec3(0.92));

  fragColor = vec4(color, 1.0);
}
`;
