import type { SessionRenderFrame } from '../experience/model.ts';
import { smoothValue } from '../resonance/smoothing.ts';

const JOURNEY_ASSET_URL = '/journey-states.webp';
const VIDEO_FRAME_INTERVAL_MS = 1000 / 30;

const VERTEX_SHADER = `#version 300 es
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

const FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uVideo;
uniform sampler2D uJourney;
uniform vec2 uResolution;
uniform vec2 uFaceCenter;
uniform float uFaceScale;
uniform float uTime;
uniform float uHasVideo;
uniform float uHasJourney;
uniform float uHasFace;
uniform float uTurbulence;
uniform float uCoherence;
uniform float uSettling;
uniform float uSoftness;
uniform float uExpression;
uniform float uMouthOpen;
uniform float uMouthSmile;
uniform float uBrowLift;
uniform float uBrowTension;
uniform float uEyeClosure;
uniform float uReadiness;
uniform float uJourneyProgress;

in vec2 vUv;
out vec4 outColor;

float hash(vec2 value) {
  return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
}

float faceEnergy(vec2 screenUv, float aspect) {
  vec2 local = vec2(
    (screenUv.x - 0.5) * aspect / 0.56,
    (screenUv.y - 0.5) / 0.48
  );
  float mask = 1.0 - smoothstep(0.78, 1.12, length(local * vec2(0.76, 1.0)));
  if (uHasVideo < 0.5 || uHasFace < 0.5) return 0.0;

  vec2 facePoint = uFaceCenter + vec2(-local.x, local.y) * max(uFaceScale, 0.01) * vec2(0.68, 0.72);
  vec2 videoUv = vec2(1.0 - (facePoint.x * 0.5 + 0.5), facePoint.y * 0.5 + 0.5);
  vec3 camera = texture(uVideo, clamp(videoUv, vec2(0.002), vec2(0.998))).rgb;
  float luma = dot(camera, vec3(0.2126, 0.7152, 0.0722));
  return pow(clamp((luma - 0.035) * 1.5, 0.0, 1.0), 1.32) * mask;
}

vec3 journeyPanel(vec2 localUv, float panel) {
  vec2 atlasUv = vec2(
    (panel + clamp(localUv.x, 0.0, 1.0)) * 0.2,
    clamp(localUv.y, 0.0, 1.0)
  );
  return texture(uJourney, atlasUv).rgb;
}

vec3 journeyField(vec2 localUv, float stage) {
  float fromPanel = floor(stage);
  float toPanel = min(4.0, fromPanel + 1.0);
  float transition = smoothstep(0.12, 0.88, fract(stage));
  return mix(
    journeyPanel(localUv, fromPanel),
    journeyPanel(localUv, toPanel),
    transition
  );
}

void main() {
  vec2 uv = vUv;
  float aspect = uResolution.x / max(uResolution.y, 1.0);
  vec2 centered = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  float progress = uJourneyProgress;
  float settled = clamp(uSettling * 0.42 + progress * 0.3 + uCoherence * 0.14 + uSoftness * 0.14, 0.0, 1.0);
  float expressionHeat = clamp(
    uExpression * 0.42
    + uMouthOpen * 0.3
    + uBrowTension * 0.27
    + uBrowLift * 0.14
    + uEyeClosure * 0.1,
    0.0,
    1.0
  );
  float agitation = clamp(max(uTurbulence * (1.0 - settled * 0.46), expressionHeat), 0.0, 1.0);
  float clarity = clamp(settled * 0.46 + progress * 0.42 + (1.0 - agitation) * 0.12, 0.0, 1.0);
  float storm = 1.0 - clarity;
  float fieldSpeed = mix(0.045, 2.35, pow(agitation, 1.2) * (0.38 + storm * 0.62));
  float cloud = sin(centered.x * 3.7 + uTime * fieldSpeed)
    + sin(centered.y * 7.1 - uTime * fieldSpeed * 0.73)
    + sin((centered.x + centered.y) * 9.3 + uTime * fieldSpeed * 0.41);
  cloud = cloud / 3.0 * 0.5 + 0.5;

  vec3 stormDepth = vec3(0.004, 0.003, 0.014);
  vec3 stormHeat = vec3(0.09, 0.01, 0.035);
  vec3 stormSky = mix(stormDepth, stormHeat, cloud * (0.26 + agitation * 0.42));
  vec3 deepBlue = vec3(0.007, 0.025, 0.072);
  vec3 openBlue = vec3(0.025, 0.12, 0.28);
  vec3 clearSky = mix(deepBlue, openBlue, smoothstep(-0.48, 0.5, centered.y) * 0.66 + 0.14);
  float clearingWidth = mix(0.035, 1.1, clarity * clarity);
  float clearingEdge = abs(centered.x) + abs(centered.y) * mix(0.42, 0.08, clarity) + cloud * storm * 0.14;
  float clearing = 1.0 - smoothstep(clearingWidth, clearingWidth + 0.24, clearingEdge);
  float skyReveal = clamp(clarity * 0.18 + clearing * clarity * 0.72, 0.0, 1.0);
  vec3 color = mix(stormSky, clearSky, skyReveal);

  float rows = mix(54.0, 72.0, settled);
  float rowCoordinate = uv.y * rows;
  float rowOrigin = floor(rowCoordinate);
  float lineLight = 0.0;
  float lineGlow = 0.0;

  for (int offset = -1; offset <= 1; offset += 1) {
    float row = rowOrigin + float(offset);
    float baseline = row / rows;
    vec2 sampleUv = vec2(uv.x, baseline);
    float energy = faceEnergy(sampleUv, aspect);

    float horizontal = centered.x;
    float centerWeight = exp(-horizontal * horizontal * 2.5);
    float mouthZone = 1.0 - smoothstep(0.08, 0.2, abs(baseline - 0.34));
    float browZone = 1.0 - smoothstep(0.08, 0.2, abs(baseline - 0.67));
    float eyeZone = 1.0 - smoothstep(0.06, 0.16, abs(baseline - 0.58));
    float slowWave = sin(horizontal * (15.0 + agitation * 10.0) + row * 0.57 + uTime * fieldSpeed);
    float fastWave = sin(horizontal * 69.0 - row * 1.71 + uTime * fieldSpeed * 2.1);
    float expressionShape =
      uMouthOpen * mouthZone * 0.032
      + uBrowLift * browZone * 0.02
      + uEyeClosure * eyeZone * 0.012;
    float signalWave = centerWeight * (
      slowWave * agitation * 0.013
      + fastWave * agitation * agitation * 0.0045
      + expressionShape
    );
    float terrain = energy * (0.018 + agitation * 0.065 + uBrowTension * browZone * 0.025);
    float displaced = baseline + terrain + signalWave;
    float distanceToLine = abs(uv.y - displaced);
    float thickness = mix(0.00135, 0.00072, settled);
    float antialias = max(fwidth(distanceToLine) * 1.35, 0.00045);
    float line = 1.0 - smoothstep(thickness, thickness + antialias, distanceToLine);
    float glow = 1.0 - smoothstep(thickness + antialias, 0.007 + agitation * 0.004, distanceToLine);
    float interruption = hash(vec2(floor(uv.x * 110.0), row + floor(uTime * mix(0.08, 5.0, storm))));
    float continuity = mix(0.58 + step(0.28, interruption) * 0.42, 1.0, settled);
    lineLight = max(lineLight, line * continuity);
    lineGlow = max(lineGlow, glow * continuity);
  }

  vec3 stormSignal = vec3(1.0, 0.08, 0.18);
  vec3 amberSignal = vec3(1.0, 0.42, 0.08);
  vec3 astralViolet = vec3(0.54, 0.38, 1.0);
  vec3 stillLight = vec3(0.78, 0.9, 1.0);
  vec3 earlySignal = mix(stormSignal, amberSignal, smoothstep(0.0, 0.34, progress));
  vec3 lateSignal = mix(astralViolet, stillLight, smoothstep(0.58, 1.0, progress));
  vec3 lineColor = mix(earlySignal, lateSignal, smoothstep(0.3, 0.68, progress));
  lineColor = mix(lineColor, stillLight, uMouthSmile * 0.08);
  float focalDistance = length(centered * vec2(0.86, 1.0));
  float peripheralField = mix(0.04, 1.0, smoothstep(0.24, 0.58, focalDistance));
  float linePresence = mix(0.58, 0.09, pow(clarity, 1.2)) * peripheralField;
  color += lineColor * linePresence * (lineLight * 1.48 + lineGlow * (0.15 + agitation * 0.12));

  if (uHasJourney > 0.5) {
    float guidedProgress = clamp(progress + 0.035 * (1.0 - agitation), 0.0, 1.0);
    float artStage = pow(guidedProgress, 1.16) * 4.0;
    float artRadius = mix(0.41, 0.34, guidedProgress);
    vec2 artUv = centered / (artRadius * 2.0) + 0.5;
    float artWarp = storm * (0.008 + agitation * 0.026);
    float guideSpeed = mix(0.42, 0.045, guidedProgress);
    artUv += vec2(
      sin(artUv.y * 13.0 + uTime * guideSpeed) * artWarp,
      cos(artUv.x * 9.0 - uTime * guideSpeed * 0.68) * artWarp
    );
    vec3 authoredLight = journeyField(artUv, artStage);
    vec2 artLocal = (artUv - 0.5) * 2.0;
    float authoredMask = 1.0 - smoothstep(0.76, 1.02, length(artLocal * vec2(0.86, 1.0)));
    float authoredLuma = dot(authoredLight, vec3(0.2126, 0.7152, 0.0722));
    float authoredPresence = smoothstep(0.008, 0.3, authoredLuma) * authoredMask;
    float authoredPulse = 0.96 + sin(uTime * guideSpeed * 2.0) * mix(0.035, 0.012, guidedProgress);
    vec3 authoredForeground = authoredLight * authoredPulse * mix(1.18, 1.48, guidedProgress);
    float foregroundMix = clamp(authoredPresence * (0.74 + guidedProgress * 0.2), 0.0, 0.94);
    color = mix(color, max(color, authoredForeground), foregroundMix);
    color += authoredForeground * authoredPresence * 0.12;
  }

  float guideCore = exp(-dot(centered, centered) * mix(92.0, 44.0, progress));
  float guideHalo = exp(-dot(centered, centered) * mix(18.0, 8.0, progress));
  color += stillLight * (guideCore * (0.2 + uReadiness * 0.26) + guideHalo * progress * 0.055);
  color *= 1.0 - smoothstep(0.72, 1.22, length(centered * vec2(0.58, 1.0))) * mix(0.4, 0.12, clarity);
  color = 1.0 - exp(-color * mix(1.08, 1.26, clarity));
  outColor = vec4(color, 1.0);
}
`;

type RenderValues = {
  turbulence: number;
  coherence: number;
  settling: number;
  softness: number;
  expression: number;
  mouthOpen: number;
  mouthSmile: number;
  browLift: number;
  browTension: number;
  eyeClosure: number;
  readiness: number;
  journeyProgress: number;
};

type Uniforms = {
  resolution: WebGLUniformLocation;
  faceCenter: WebGLUniformLocation;
  faceScale: WebGLUniformLocation;
  time: WebGLUniformLocation;
  hasVideo: WebGLUniformLocation;
  hasJourney: WebGLUniformLocation;
  hasFace: WebGLUniformLocation;
  turbulence: WebGLUniformLocation;
  coherence: WebGLUniformLocation;
  settling: WebGLUniformLocation;
  softness: WebGLUniformLocation;
  expression: WebGLUniformLocation;
  mouthOpen: WebGLUniformLocation;
  mouthSmile: WebGLUniformLocation;
  browLift: WebGLUniformLocation;
  browTension: WebGLUniformLocation;
  eyeClosure: WebGLUniformLocation;
  readiness: WebGLUniformLocation;
  journeyProgress: WebGLUniformLocation;
};

export class SoulMirrorRenderer {
  private context: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private videoTexture: WebGLTexture | null = null;
  private journeyTexture: WebGLTexture | null = null;
  private uniforms: Uniforms | null = null;
  private journeyReady = false;
  private frameHandle = 0;
  private running = false;
  private lastFrame = 0;
  private lastVideoUpload = -Infinity;
  private target: SessionRenderFrame | null = null;
  private values: RenderValues = {
    turbulence: 0.7,
    coherence: 0.3,
    settling: 0.25,
    softness: 0.5,
    expression: 0,
    mouthOpen: 0,
    mouthSmile: 0,
    browLift: 0,
    browTension: 0,
    eyeClosure: 0,
    readiness: 0,
    journeyProgress: 0,
  };
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly canvas: HTMLCanvasElement) {}

  start(): void {
    if (this.running) return;
    const context = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'high-performance',
      premultipliedAlpha: false,
      stencil: false,
    });
    if (!context) throw new Error('This device cannot create the soul mirror.');

    const program = this.createProgram(context);
    const videoTexture = this.createTexture(context, context.TEXTURE0);
    const journeyTexture = this.createTexture(context, context.TEXTURE1);
    context.useProgram(program);
    context.uniform1i(context.getUniformLocation(program, 'uVideo'), 0);
    context.uniform1i(context.getUniformLocation(program, 'uJourney'), 1);

    this.context = context;
    this.program = program;
    this.videoTexture = videoTexture;
    this.journeyTexture = journeyTexture;
    this.uniforms = this.readUniforms(context, program);
    this.loadJourneyTexture(context, journeyTexture);
    this.running = true;
    this.lastFrame = performance.now();
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.resize();
    this.requestNextFrame();
  }

  update(frame: SessionRenderFrame): void {
    this.target = frame;
  }

  dispose(): void {
    this.running = false;
    if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    if (this.context && this.videoTexture) this.context.deleteTexture(this.videoTexture);
    if (this.context && this.journeyTexture) this.context.deleteTexture(this.journeyTexture);
    if (this.context && this.program) this.context.deleteProgram(this.program);
    this.context = null;
    this.program = null;
    this.videoTexture = null;
    this.journeyTexture = null;
    this.uniforms = null;
    this.journeyReady = false;
    this.lastVideoUpload = -Infinity;
    this.target = null;
  }

  private resize = (): void => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.reducedMotionQuery.matches ? 1 : 1.15);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      this.context?.viewport(0, 0, width, height);
    }
  };

  private render = (now: number): void => {
    this.frameHandle = 0;
    if (!this.running) return;
    const context = this.context;
    const program = this.program;
    const videoTexture = this.videoTexture;
    const journeyTexture = this.journeyTexture;
    const uniforms = this.uniforms;
    if (!context || !program || !videoTexture || !journeyTexture || !uniforms) return;

    const deltaSeconds = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1_000));
    this.lastFrame = now;
    const frame = this.target;
    if (frame) this.followFrame(frame, deltaSeconds);

    const video = frame?.mirror.sourceVideo ?? null;
    const hasVideo = video !== null
      && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && video.videoWidth > 0
      && video.videoHeight > 0;
    if (hasVideo && now - this.lastVideoUpload >= VIDEO_FRAME_INTERVAL_MS) {
      context.activeTexture(context.TEXTURE0);
      context.bindTexture(context.TEXTURE_2D, videoTexture);
      context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, true);
      context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, video);
      this.lastVideoUpload = now;
    }

    const topology = frame?.mirror.topology ?? null;
    context.useProgram(program);
    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D, videoTexture);
    context.activeTexture(context.TEXTURE1);
    context.bindTexture(context.TEXTURE_2D, journeyTexture);
    context.uniform2f(uniforms.resolution, this.canvas.width, this.canvas.height);
    context.uniform2f(uniforms.faceCenter, topology?.centerX ?? 0, topology?.centerY ?? 0);
    context.uniform1f(uniforms.faceScale, topology?.scale ?? 0.7);
    context.uniform1f(uniforms.time, this.reducedMotionQuery.matches ? 0 : now / 1_000);
    context.uniform1f(uniforms.hasVideo, hasVideo ? 1 : 0);
    context.uniform1f(uniforms.hasJourney, this.journeyReady ? 1 : 0);
    context.uniform1f(uniforms.hasFace, topology ? 1 : 0);
    context.uniform1f(uniforms.turbulence, this.values.turbulence);
    context.uniform1f(uniforms.coherence, this.values.coherence);
    context.uniform1f(uniforms.settling, this.values.settling);
    context.uniform1f(uniforms.softness, this.values.softness);
    context.uniform1f(uniforms.expression, this.values.expression);
    context.uniform1f(uniforms.mouthOpen, this.values.mouthOpen);
    context.uniform1f(uniforms.mouthSmile, this.values.mouthSmile);
    context.uniform1f(uniforms.browLift, this.values.browLift);
    context.uniform1f(uniforms.browTension, this.values.browTension);
    context.uniform1f(uniforms.eyeClosure, this.values.eyeClosure);
    context.uniform1f(uniforms.readiness, this.values.readiness);
    context.uniform1f(uniforms.journeyProgress, this.values.journeyProgress);
    context.drawArrays(context.TRIANGLES, 0, 3);
    this.requestNextFrame();
  };

  private followFrame(frame: SessionRenderFrame, deltaSeconds: number): void {
    this.values.turbulence = smoothValue(this.values.turbulence, frame.relief.turbulence, deltaSeconds, 0.34);
    this.values.coherence = smoothValue(this.values.coherence, frame.resonance.coherence, deltaSeconds, 0.52);
    this.values.settling = smoothValue(this.values.settling, frame.relief.settling, deltaSeconds, 0.58);
    this.values.softness = smoothValue(this.values.softness, frame.relief.softness, deltaSeconds, 0.48);
    this.values.expression = this.followExpression(this.values.expression, frame.relief.expressionActivity, deltaSeconds);
    this.values.mouthOpen = this.followExpression(this.values.mouthOpen, frame.mirror.expression.mouthOpen, deltaSeconds);
    this.values.mouthSmile = this.followExpression(this.values.mouthSmile, frame.mirror.expression.mouthSmile, deltaSeconds);
    this.values.browLift = this.followExpression(this.values.browLift, frame.mirror.expression.browLift, deltaSeconds);
    this.values.browTension = this.followExpression(this.values.browTension, frame.mirror.expression.browTension, deltaSeconds);
    this.values.eyeClosure = this.followExpression(this.values.eyeClosure, frame.mirror.expression.eyeClosure, deltaSeconds);
    this.values.readiness = smoothValue(this.values.readiness, frame.relief.readiness, deltaSeconds, 1.1);
    const journeyTarget = Math.max(
      0,
      Math.min(
        1,
        frame.relief.relief * 0.5
          + frame.relief.readiness * 0.24
          + frame.relief.settling * 0.16
          + frame.resonance.coherence * 0.1
          - frame.relief.turbulence * 0.18,
      ),
    );
    this.values.journeyProgress = smoothValue(
      this.values.journeyProgress,
      journeyTarget,
      deltaSeconds,
      journeyTarget > this.values.journeyProgress ? 16 : 3.2,
    );
  }

  private followExpression(current: number, target: number, deltaSeconds: number): number {
    return smoothValue(current, target, deltaSeconds, target > current ? 0.06 : 0.28);
  }

  private createTexture(context: WebGL2RenderingContext, unit: number): WebGLTexture {
    const texture = context.createTexture();
    if (!texture) throw new Error('This device cannot create the mirror texture.');
    context.activeTexture(unit);
    context.bindTexture(context.TEXTURE_2D, texture);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
    context.texImage2D(
      context.TEXTURE_2D,
      0,
      context.RGBA,
      1,
      1,
      0,
      context.RGBA,
      context.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );
    return texture;
  }

  private loadJourneyTexture(context: WebGL2RenderingContext, texture: WebGLTexture): void {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      if (this.context !== context || this.journeyTexture !== texture) return;
      context.activeTexture(context.TEXTURE1);
      context.bindTexture(context.TEXTURE_2D, texture);
      context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, true);
      context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, image);
      this.journeyReady = true;
    };
    image.src = JOURNEY_ASSET_URL;
  }

  private createProgram(context: WebGL2RenderingContext): WebGLProgram {
    const vertex = this.createShader(context, context.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = this.createShader(context, context.FRAGMENT_SHADER, FRAGMENT_SHADER);
    const program = context.createProgram();
    if (!program) throw new Error('This device cannot create the mirror program.');
    context.attachShader(program, vertex);
    context.attachShader(program, fragment);
    context.linkProgram(program);
    context.deleteShader(vertex);
    context.deleteShader(fragment);
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      const detail = context.getProgramInfoLog(program) ?? 'Unknown mirror program error';
      context.deleteProgram(program);
      throw new Error(detail);
    }
    return program;
  }

  private createShader(context: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = context.createShader(type);
    if (!shader) throw new Error('This device cannot create the mirror shader.');
    context.shaderSource(shader, source);
    context.compileShader(shader);
    if (!context.getShaderParameter(shader, context.COMPILE_STATUS)) {
      const detail = context.getShaderInfoLog(shader) ?? 'Unknown mirror shader error';
      context.deleteShader(shader);
      throw new Error(detail);
    }
    return shader;
  }

  private readUniforms(context: WebGL2RenderingContext, program: WebGLProgram): Uniforms {
    const required = (name: string): WebGLUniformLocation => {
      const location = context.getUniformLocation(program, name);
      if (!location) throw new Error(`Mirror shader missing ${name}.`);
      return location;
    };
    return {
      resolution: required('uResolution'),
      faceCenter: required('uFaceCenter'),
      faceScale: required('uFaceScale'),
      time: required('uTime'),
      hasVideo: required('uHasVideo'),
      hasJourney: required('uHasJourney'),
      hasFace: required('uHasFace'),
      turbulence: required('uTurbulence'),
      coherence: required('uCoherence'),
      settling: required('uSettling'),
      softness: required('uSoftness'),
      expression: required('uExpression'),
      mouthOpen: required('uMouthOpen'),
      mouthSmile: required('uMouthSmile'),
      browLift: required('uBrowLift'),
      browTension: required('uBrowTension'),
      eyeClosure: required('uEyeClosure'),
      readiness: required('uReadiness'),
      journeyProgress: required('uJourneyProgress'),
    };
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      if (this.frameHandle) cancelAnimationFrame(this.frameHandle);
      this.frameHandle = 0;
      return;
    }
    this.lastFrame = performance.now();
    this.requestNextFrame();
  };

  private requestNextFrame(): void {
    if (!this.running || document.hidden || this.frameHandle) return;
    this.frameHandle = requestAnimationFrame(this.render);
  }
}
