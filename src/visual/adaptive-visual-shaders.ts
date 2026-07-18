/**
 * WebGL2 shader contract for the persistent Relief field.
 *
 * Scene indices are stable and ordered as follows:
 * 0 Turbulence, 1 Gathering, 2 Coherence, 3 Release, 4 Radiance.
 * `uSceneMix` crossfades `uPreviousScene` into `uTargetScene` without clearing
 * feedback history.
 *
 * The modulation texture is analysis data, not camera imagery:
 * R = luminance-gradient magnitude, G = temporal frame difference,
 * B = face-and-shoulder influence, A = 1. The host uploads it without colour
 * conversion and supplies `uBreathScale`; that value must remain 1 unless the
 * breath-confidence gate has already passed 0.35.
 */

export const fullscreenVertexShader = `#version 300 es
precision highp float;

const vec2 POSITIONS[3] = vec2[3](
  vec2(-1.0, -1.0),
  vec2(3.0, -1.0),
  vec2(-1.0, 3.0)
);

out vec2 vUv;

void main() {
  vec2 position = POSITIONS[gl_VertexID];
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

export const feedbackWarpFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D uFeedback;
uniform sampler2D uModulation;
uniform vec2 uResolution;
uniform vec2 uMovementDirection;
uniform float uMovementEnergy;
uniform float uTime;
uniform float uDeltaScale;
uniform float uPreviousScene;
uniform float uTargetScene;
uniform float uSceneMix;
uniform float uVariationSeed;
uniform float uBreathScale;
uniform float uReducedMotion;

in vec2 vUv;
out vec4 outColor;

float hash21(vec2 value) {
  value = fract(value * vec2(123.34, 456.21));
  value += dot(value, value + 45.32);
  return fract(value.x * value.y);
}

float valueNoise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  float a = hash21(cell);
  float b = hash21(cell + vec2(1.0, 0.0));
  float c = hash21(cell + vec2(0.0, 1.0));
  float d = hash21(cell + vec2(1.0, 1.0));
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}

vec2 curlNoise(vec2 point, float scene) {
  float epsilon = 0.035;
  float frequency = mix(2.2, 5.8, 1.0 - scene * 0.25);
  vec2 samplePoint = point * frequency + uVariationSeed * vec2(0.013, 0.021);
  float left = valueNoise(samplePoint - vec2(epsilon, 0.0));
  float right = valueNoise(samplePoint + vec2(epsilon, 0.0));
  float down = valueNoise(samplePoint - vec2(0.0, epsilon));
  float up = valueNoise(samplePoint + vec2(0.0, epsilon));
  return vec2(up - down, left - right) / (2.0 * epsilon);
}

float sceneDecay(float scene) {
  if (scene < 0.5) return 0.935;
  if (scene < 1.5) return 0.955;
  if (scene < 2.5) return 0.970;
  if (scene < 3.5) return 0.978;
  return 0.985;
}

float sceneWarp(float scene) {
  if (scene < 0.5) return 0.032;
  if (scene < 1.5) return 0.018;
  if (scene < 2.5) return 0.010;
  if (scene < 3.5) return 0.006;
  return 0.003;
}

void main() {
  float mixAmount = smoothstep(0.0, 1.0, clamp(uSceneMix, 0.0, 1.0));
  float decay = mix(
    sceneDecay(uPreviousScene),
    sceneDecay(uTargetScene),
    mixAmount
  );
  float warp = mix(
    sceneWarp(uPreviousScene),
    sceneWarp(uTargetScene),
    mixAmount
  );
  float scene = mix(uPreviousScene, uTargetScene, mixAmount);

  ivec2 modulationSize = max(textureSize(uModulation, 0), ivec2(1));
  vec2 modulationTexel = 1.0 / vec2(modulationSize);
  vec4 modulation = texture(uModulation, vUv);
  vec4 modulationLeft = texture(uModulation, vUv - vec2(modulationTexel.x, 0.0));
  vec4 modulationRight = texture(uModulation, vUv + vec2(modulationTexel.x, 0.0));
  vec4 modulationDown = texture(uModulation, vUv - vec2(0.0, modulationTexel.y));
  vec4 modulationUp = texture(uModulation, vUv + vec2(0.0, modulationTexel.y));

  // R, G, and B retain their analysis meanings; only their spatial gradient
  // is combined here to steer the field around locally observed structure.
  vec3 channelWeight = vec3(0.52, 0.30, 0.18);
  float signalLeft = dot(modulationLeft.rgb, channelWeight);
  float signalRight = dot(modulationRight.rgb, channelWeight);
  float signalDown = dot(modulationDown.rgb, channelWeight);
  float signalUp = dot(modulationUp.rgb, channelWeight);
  vec2 modulationGradient = vec2(
    signalRight - signalLeft,
    signalUp - signalDown
  );

  vec2 centered = (vUv - 0.5) / max(uBreathScale, 0.94);
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 aspectPoint = vec2(centered.x * aspect, centered.y);
  float motionAllowance = mix(1.0, 0.24, clamp(uReducedMotion, 0.0, 1.0));
  vec2 curl = curlNoise(
    aspectPoint + uTime * vec2(0.017, -0.013) * motionAllowance,
    scene
  );
  float influence = 0.28 + modulation.b * 0.72;
  vec2 movement = uMovementDirection
    * clamp(uMovementEnergy, 0.0, 1.0)
    * (0.0015 + warp * 0.17);
  vec2 displacement = (
    curl * warp * (0.16 + modulation.r * 0.34 + modulation.g * 0.48)
    + modulationGradient * warp * influence * 1.8
    + movement
  ) * motionAllowance;

  vec2 sampleUv = clamp(centered + 0.5 - displacement, vec2(0.001), vec2(0.999));
  vec3 history = texture(uFeedback, sampleUv).rgb;
  float frameDecay = pow(decay, max(uDeltaScale, 0.0));
  outColor = vec4(history * frameDecay, 1.0);
}
`;

export const sceneEmissionFragmentShader = `#version 300 es
precision highp float;

const float PI = 3.141592653589793;
const float TAU = 6.283185307179586;

uniform vec2 uResolution;
uniform float uTime;
uniform float uDeltaScale;
uniform float uPreviousScene;
uniform float uTargetScene;
uniform float uSceneMix;
uniform float uProgress;
uniform float uCoherence;
uniform float uExpressiveActivation;
uniform float uFacialWarmth;
uniform float uMovementEnergy;
uniform float uVisualIntensity;
uniform float uVariationSeed;
uniform float uBreathScale;
uniform float uReducedMotion;
uniform vec3 uPaletteShadow;
uniform vec3 uPaletteMid;
uniform vec3 uPaletteLight;
uniform float uPaletteConfidence;
uniform float uColorInfluence;

in vec2 vUv;
out vec4 outColor;

float hash21(vec2 value) {
  value = fract(value * vec2(123.34, 456.21));
  value += dot(value, value + 45.32);
  return fract(value.x * value.y);
}

float noise21(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  local = local * local * (3.0 - 2.0 * local);
  return mix(
    mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), local.x),
    mix(hash21(cell + vec2(0.0, 1.0)), hash21(cell + vec2(1.0)), local.x),
    local.y
  );
}

float lineBand(float value, float width) {
  return 1.0 - smoothstep(width, width + fwidth(value), abs(value));
}

float ringBand(float radius, float target, float width) {
  return lineBand(radius - target, width);
}

vec2 safeNormalize(vec2 value) {
  float magnitude = length(value);
  return magnitude > 0.000001 ? value / magnitude : vec2(0.0, 1.0);
}

vec3 paletteBias(vec3 authored) {
  float luminance = dot(authored, vec3(0.2126, 0.7152, 0.0722));
  vec3 camera = luminance < 0.36
    ? mix(uPaletteShadow, uPaletteMid, clamp(luminance / 0.36, 0.0, 1.0))
    : mix(uPaletteMid, uPaletteLight, clamp((luminance - 0.36) / 0.64, 0.0, 1.0));
  float influence = clamp(uColorInfluence, 0.15, 0.25)
    * clamp(uPaletteConfidence, 0.0, 1.0);
  return mix(authored, camera, influence);
}

vec3 turbulenceGrammar(vec2 point, float time) {
  float radius = length(point);
  float angle = atan(point.y, point.x);
  float cells = floor((angle + PI) * 5.5 + radius * 19.0);
  float fractureNoise = noise21(vec2(cells, floor(radius * 23.0)) + uVariationSeed);
  float reaction = sin(angle * 11.0 + radius * 34.0 - time * 2.2);
  float broken = step(0.34, fractureNoise)
    * lineBand(reaction, 0.065 + uExpressiveActivation * 0.025);
  float slash = lineBand(
    point.y + sin(point.x * 17.0 + time * 1.7) * 0.055,
    0.006
  ) * step(0.46, noise21(point * 18.0 + floor(time * 1.4)));
  float embers = smoothstep(0.82, 1.0, noise21(point * 31.0 - time * 0.7))
    * (1.0 - smoothstep(0.1, 0.78, radius));
  float core = exp(-radius * radius * 52.0) * 0.44;
  float halo = exp(-radius * radius * 9.0) * 0.055;
  vec3 red = mix(vec3(0.62, 0.018, 0.038), vec3(1.0, 0.12, 0.08), fractureNoise);
  return red * (broken * 0.16 + slash * 0.12 + embers * 0.035)
    + vec3(1.0, 0.52, 0.30) * core
    + vec3(0.44, 0.035, 0.07) * halo;
}

vec3 gatheringGrammar(vec2 point, float time) {
  float radius = length(point);
  float angle = atan(point.y, point.x);
  float orbitOne = ringBand(
    radius,
    0.22 + sin(angle * 3.0 - time * 0.72) * 0.018,
    0.0045
  );
  float orbitTwo = ringBand(
    radius,
    0.39 + sin(angle * 5.0 + time * 0.48) * 0.024,
    0.0035
  );
  float spiral = lineBand(
    sin(angle * 4.0 + radius * 27.0 - time * 0.8),
    0.050
  ) * (1.0 - smoothstep(0.13, 0.68, radius));
  float convergence = pow(max(0.0, dot(safeNormalize(point), vec2(0.0, 1.0))), 7.0)
    * exp(-radius * 2.8);
  float core = exp(-radius * radius * 43.0) * 0.55;
  float halo = exp(-radius * radius * 7.4) * 0.078;
  return vec3(1.0, 0.34, 0.035) * (orbitOne * 0.15 + spiral * 0.055)
    + vec3(1.0, 0.63, 0.12) * (orbitTwo * 0.12 + convergence * 0.05)
    + vec3(1.0, 0.79, 0.40) * core
    + vec3(0.58, 0.18, 0.025) * halo;
}

vec3 coherenceGrammar(vec2 point, float time) {
  float radius = length(point);
  float angle = atan(point.y, point.x);
  vec2 rotated = mat2(cos(PI * 0.25), -sin(PI * 0.25), sin(PI * 0.25), cos(PI * 0.25)) * point;
  float gridA = lineBand(sin(point.x * 41.0 + sin(point.y * 9.0) * 0.8), 0.035);
  float gridB = lineBand(sin(rotated.y * 37.0), 0.032);
  float lattice = max(gridA * 0.7, gridB * 0.58)
    * (1.0 - smoothstep(0.1, 0.64, radius));
  float petals = ringBand(
    radius,
    0.23 + 0.075 * cos(angle * 8.0 + time * 0.18),
    0.004
  );
  float filaments = lineBand(sin(angle * 8.0) * 0.12 + radius - 0.31, 0.0035);
  float symmetry = mix(0.55, 1.0, clamp(uCoherence, 0.0, 1.0));
  float core = exp(-radius * radius * 38.0) * 0.66;
  float halo = exp(-radius * radius * 6.2) * 0.085;
  return vec3(1.0, 0.62, 0.12) * (lattice * 0.052 + petals * 0.17) * symmetry
    + vec3(0.48, 0.22, 1.0) * (filaments * 0.085 + lattice * 0.032)
    + vec3(1.0, 0.88, 0.62) * core
    + vec3(0.31, 0.16, 0.66) * halo;
}

vec3 releaseGrammar(vec2 point, float time) {
  float radius = length(point);
  float sky = smoothstep(-0.48, 0.42, point.y);
  float auroraOne = lineBand(
    point.y - 0.16 - sin(point.x * 5.8 + time * 0.34) * 0.085,
    0.012
  );
  float auroraTwo = lineBand(
    point.y + 0.03 - sin(point.x * 8.2 - time * 0.23) * 0.052,
    0.009
  );
  float rippleOne = ringBand(radius, 0.27 + sin(time * 0.29) * 0.012, 0.0045);
  float rippleTwo = ringBand(radius, 0.45 + sin(time * 0.21 + 1.6) * 0.016, 0.0035);
  float liquid = noise21(vec2(point.x * 3.2, point.y * 7.0 - time * 0.12));
  float core = exp(-radius * radius * 31.0) * 0.72;
  float halo = exp(-radius * radius * 5.0) * 0.105;
  return vec3(0.025, 0.20, 0.56) * (auroraOne * 0.13 + sky * liquid * 0.012)
    + vec3(0.08, 0.58, 0.88) * (auroraTwo * 0.09 + rippleOne * 0.10)
    + vec3(0.43, 0.78, 1.0) * rippleTwo * 0.075
    + vec3(0.84, 0.94, 1.0) * core
    + vec3(0.04, 0.24, 0.62) * halo;
}

vec3 radianceGrammar(vec2 point, float time) {
  float radius = length(point);
  float angle = atan(point.y, point.x);
  float stellarGas = noise21(point * 5.0 + vec2(time * 0.035, -time * 0.02));
  stellarGas *= noise21(point * 11.0 - vec2(time * 0.024, time * 0.018));
  float rays = pow(max(0.0, cos(angle * 12.0 + sin(radius * 8.0) * 0.28)), 18.0)
    * exp(-radius * 4.8);
  float shell = ringBand(radius, 0.34, 0.003) * 0.72
    + ringBand(radius, 0.51, 0.0025) * 0.34;
  float presence = exp(-radius * radius * 24.0) * 0.92;
  float core = exp(-radius * radius * 92.0) * 1.25;
  float halo = exp(-radius * radius * 3.8) * 0.13;
  float gasMask = (1.0 - smoothstep(0.18, 0.76, radius))
    * smoothstep(0.28, 0.76, stellarGas);
  return vec3(0.68, 0.84, 1.0) * (gasMask * 0.055 + shell * 0.055)
    + vec3(0.92, 0.90, 1.0) * rays * 0.06
    + vec3(0.94, 0.98, 1.0) * presence
    + vec3(1.0) * core
    + vec3(0.28, 0.48, 0.76) * halo;
}

vec3 sceneGrammar(float scene, vec2 point, float time) {
  if (scene < 0.5) return turbulenceGrammar(point, time);
  if (scene < 1.5) return gatheringGrammar(point, time);
  if (scene < 2.5) return coherenceGrammar(point, time);
  if (scene < 3.5) return releaseGrammar(point, time);
  return radianceGrammar(point, time);
}

void main() {
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 point = (vUv - 0.5) / max(uBreathScale, 0.94);
  point.x *= aspect;
  float motionAllowance = mix(1.0, 0.16, clamp(uReducedMotion, 0.0, 1.0));
  float time = uTime * motionAllowance;
  point += vec2(
    sin(point.y * 4.0 + time * 0.31),
    cos(point.x * 3.0 - time * 0.27)
  ) * clamp(uMovementEnergy, 0.0, 1.0) * 0.012 * motionAllowance;

  vec3 previous = sceneGrammar(uPreviousScene, point, time);
  vec3 target = sceneGrammar(uTargetScene, point, time);
  float mixAmount = smoothstep(0.0, 1.0, clamp(uSceneMix, 0.0, 1.0));
  vec3 emission = mix(previous, target, mixAmount);

  // Compatible variation changes fine texture only, never palette or meaning.
  float variation = 0.96 + 0.08 * noise21(
    point * 7.0 + vec2(uVariationSeed * 0.017, uVariationSeed * 0.031)
  );
  emission *= variation;
  emission = paletteBias(emission);
  float activation = 0.86 + clamp(uExpressiveActivation, 0.0, 1.0) * 0.20;
  float warmth = 0.94 + clamp(uFacialWarmth, 0.0, 1.0) * 0.12;
  float progressLift = mix(0.94, 1.06, clamp(uProgress, 0.0, 1.0));
  float frameScale = max(uDeltaScale, 0.0) * 0.52;
  outColor = vec4(
    emission * activation * warmth * progressLift
      * clamp(uVisualIntensity, 0.75, 1.25) * frameScale,
    1.0
  );
}
`;

export const faceEmissionVertexShader = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aStart;
layout(location = 1) in vec3 aEnd;

uniform vec2 uResolution;
uniform float uTime;
uniform float uFacialTension;
uniform float uFacialWarmth;
uniform float uBreathScale;
uniform float uReducedMotion;

out float vAcross;
out float vAlong;
out float vDepth;

const vec2 CORNERS[6] = vec2[6](
  vec2(0.0, -1.0),
  vec2(1.0, -1.0),
  vec2(1.0, 1.0),
  vec2(0.0, -1.0),
  vec2(1.0, 1.0),
  vec2(0.0, 1.0)
);

void main() {
  vec2 corner = CORNERS[gl_VertexID];
  vec2 start = vec2(aStart.x, 1.0 - aStart.y);
  vec2 end = vec2(aEnd.x, 1.0 - aEnd.y);
  vec2 delta = end - start;
  float segmentLength = length(delta);
  vec2 tangent = segmentLength > 0.000001 ? delta / segmentLength : vec2(1.0, 0.0);
  vec2 normal = vec2(-tangent.y, tangent.x);
  float tension = clamp(uFacialTension, 0.0, 1.0);
  float warmth = clamp(uFacialWarmth, 0.0, 1.0);
  float motionAllowance = mix(1.0, 0.18, clamp(uReducedMotion, 0.0, 1.0));
  float instancePhase = float(gl_InstanceID) * 0.754877666;
  float along = corner.x;
  float curve = sin(along * 3.141592653589793) * sin(instancePhase + uTime * 0.8)
    * tension * 0.006;
  float highFrequency = sin(along * mix(8.0, 22.0, tension) + instancePhase * 3.1 + uTime * 2.2)
    * tension * tension * 0.0018;
  vec2 center = mix(start, end, along)
    + normal * (curve + highFrequency) * motionAllowance;
  center = (center - 0.5) * max(uBreathScale, 0.94) + 0.5;

  float depth = mix(aStart.z, aEnd.z, along);
  float depthPresence = 1.0 / (1.0 + abs(depth) * 7.0);
  float widthPixels = mix(0.65, 1.7, warmth) * mix(0.78, 1.0, depthPresence);
  vec2 position = center + normal * corner.y * widthPixels / max(uResolution, vec2(1.0));
  vAcross = corner.y;
  vAlong = along;
  vDepth = depthPresence;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const faceEmissionFragmentShader = `#version 300 es
precision highp float;

uniform float uFacialTension;
uniform float uFacialWarmth;
uniform float uVisualIntensity;
uniform float uDeltaScale;
uniform vec3 uPaletteLight;
uniform float uPaletteConfidence;
uniform float uColorInfluence;

in float vAcross;
in float vAlong;
in float vDepth;
out vec4 outColor;

void main() {
  float edge = 1.0 - smoothstep(0.34, 1.0, abs(vAcross));
  float cap = smoothstep(0.0, 0.045, vAlong)
    * smoothstep(0.0, 0.045, 1.0 - vAlong);
  float tension = clamp(uFacialTension, 0.0, 1.0);
  float warmth = clamp(uFacialWarmth, 0.0, 1.0);
  vec3 cool = vec3(0.30, 0.50, 1.0);
  vec3 warm = vec3(1.0, 0.43, 0.12);
  vec3 authored = mix(cool, warm, warmth);
  float paletteAmount = clamp(uColorInfluence, 0.15, 0.25)
    * clamp(uPaletteConfidence, 0.0, 1.0);
  vec3 color = mix(authored, uPaletteLight, paletteAmount);
  float frequencySpark = mix(0.86, 1.18, tension);
  float intensity = edge * cap * vDepth * frequencySpark
    * clamp(uVisualIntensity, 0.75, 1.25)
    * max(uDeltaScale, 0.0) * 0.095;
  outColor = vec4(color * intensity, 1.0);
}
`;

export const blurFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D uTexture;
uniform vec2 uTexelDirection;
uniform float uApplyThreshold;

in vec2 vUv;
out vec4 outColor;

vec3 brightPass(vec3 color) {
  float luminance = max(max(color.r, color.g), color.b);
  float contribution = smoothstep(0.16, 0.72, luminance);
  return color * contribution;
}

void main() {
  vec3 color = texture(uTexture, vUv).rgb * 0.2270270270;
  color += texture(uTexture, vUv + uTexelDirection * 1.3846153846).rgb * 0.3162162162;
  color += texture(uTexture, vUv - uTexelDirection * 1.3846153846).rgb * 0.3162162162;
  color += texture(uTexture, vUv + uTexelDirection * 3.2307692308).rgb * 0.0702702703;
  color += texture(uTexture, vUv - uTexelDirection * 3.2307692308).rgb * 0.0702702703;
  vec3 filtered = brightPass(color);
  color = mix(color, filtered, clamp(uApplyThreshold, 0.0, 1.0));
  outColor = vec4(color, 1.0);
}
`;

export const compositeFragmentShader = `#version 300 es
precision highp float;

uniform sampler2D uFeedback;
uniform sampler2D uBloom;
uniform vec2 uResolution;
uniform float uVisualIntensity;

in vec2 vUv;
out vec4 outColor;

vec3 acesApproximation(vec3 color) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((color * (a * color + b)) / (color * (c * color + d) + e), 0.0, 1.0);
}

void main() {
  vec3 feedback = texture(uFeedback, vUv).rgb;
  vec3 bloom = texture(uBloom, vUv).rgb;
  vec3 color = feedback + bloom * 0.42;
  float maximum = max(max(color.r, color.g), color.b);
  float minimum = min(min(color.r, color.g), color.b);
  float chroma = maximum - minimum;
  float restraint = 1.0 - smoothstep(0.72, 1.75, chroma) * 0.16;
  float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = mix(vec3(luminance), color, restraint);
  color = acesApproximation(color * clamp(uVisualIntensity, 0.75, 1.25));

  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 point = vec2((vUv.x - 0.5) * aspect, vUv.y - 0.5);
  float vignette = 1.0 - smoothstep(0.44, 0.92, length(point)) * 0.34;
  color *= vignette;
  color = pow(color, vec3(1.0 / 2.2));
  outColor = vec4(color, 1.0);
}
`;
