import type { SessionRenderFrame } from '../experience/model.ts';
import { smoothValue } from '../resonance/smoothing.ts';
import type { MirrorPoint, MirrorTopology } from '../sensing/mirror-signal.ts';

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
uniform vec2 uResolution;
uniform float uTime;
uniform float uHasVideo;
uniform float uTurbulence;
uniform float uCoherence;
uniform float uSettling;
uniform float uSoftness;
uniform float uRelief;
uniform float uReadiness;

in vec2 vUv;
out vec4 outColor;

float hash(vec2 value) {
  return fract(sin(dot(value, vec2(127.1, 311.7))) * 43758.5453123);
}

float ring(float radius, float target, float width) {
  return smoothstep(width, 0.0, abs(radius - target));
}

vec3 palette(float field) {
  vec3 voidColor = vec3(0.012, 0.016, 0.028);
  vec3 ember = vec3(1.0, 0.66, 0.34);
  vec3 blue = vec3(0.38, 0.49, 0.88);
  vec3 violet = vec3(0.52, 0.34, 0.82);
  return voidColor
    + ember * field * (0.16 + uRelief * 0.34)
    + blue * field * (0.08 + uCoherence * 0.2)
    + violet * field * (0.04 + uReadiness * 0.14);
}

void main() {
  vec2 uv = vUv;
  vec2 centered = (uv - 0.5) * vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  float radius = length(centered);
  float angle = atan(centered.y, centered.x);
  float breath = sin(uTime * (0.42 + uSoftness * 0.18)) * 0.5 + 0.5;
  float progress = clamp(uRelief * 0.68 + uReadiness * 0.32, 0.0, 1.0);
  float agitation = clamp(uTurbulence * (1.0 - uSettling * 0.55), 0.0, 1.0);
  float field = smoothstep(1.0, 0.0, radius);
  float aperture = ring(radius, 0.18 + progress * 0.11 + breath * 0.014, 0.05 - progress * 0.018);
  float outer = ring(radius, 0.36 + uReadiness * 0.12, 0.075);
  float symmetry = cos(angle * (5.0 + floor(uReadiness * 4.0)) + sin(uTime * 0.18) * 0.35);
  float petals = smoothstep(0.16, 1.0, symmetry * 0.5 + 0.5) * smoothstep(0.7, 0.1, radius);
  vec3 color = palette(field * 0.8 + aperture * 0.72 + outer * 0.22 + petals * progress * 0.26);

  if (uHasVideo > 0.5) {
    vec2 videoUv = uv;
    videoUv.x = 1.0 - videoUv.x;

    vec2 fromCenter = videoUv - 0.5;
    float videoRadius = length(fromCenter * vec2(0.78, 1.12));
    float mask = smoothstep(0.72, 0.1, videoRadius) * (0.42 + progress * 0.24);
    float wave = (0.008 + agitation * 0.032) * (1.0 - progress * 0.52);
    float phase = uTime * (0.24 + agitation * 0.52);
    vec2 warp = vec2(
      sin((videoUv.y * 16.0) + phase) * wave,
      cos((videoUv.x * 11.0) - phase * 0.7) * wave * 0.7
    );
    vec2 sampleUv = clamp(videoUv + warp * mask, vec2(0.002), vec2(0.998));
    vec3 video = texture(uVideo, sampleUv).rgb;
    float luma = dot(video, vec3(0.299, 0.587, 0.114));
    float contours = smoothstep(0.015, 0.12, abs(luma - 0.5));
    float sourceEnergy = (luma * 0.55 + contours * 0.45) * mask;
    vec3 signal = palette(sourceEnergy + aperture * 0.2) * (0.32 + uSoftness * 0.2);
    color = mix(color, color + signal, mask * (0.24 + progress * 0.16));
  }

  float grain = hash(floor(uv * uResolution / 2.0) + floor(uTime * 18.0));
  float noise = (grain - 0.5) * (0.018 * (1.0 - progress) + 0.004);
  float rays = pow(max(0.0, cos(angle * 12.0 - uTime * 0.18)), 12.0) * smoothstep(0.15, 0.88, radius) * uReadiness;
  color += noise;
  color += vec3(1.0, 0.68, 0.38) * aperture * (0.16 + uReadiness * 0.2);
  color += vec3(0.52, 0.62, 1.0) * rays * 0.12;
  color *= 1.0 - smoothstep(0.56 + progress * 0.16, 1.12, radius) * 0.68;
  outColor = vec4(color, 1.0);
}
`;

const MESH_VERTEX_SHADER = `#version 300 es
precision highp float;

in vec3 aPoint;

uniform float uTime;
uniform float uTurbulence;
uniform float uSettling;
uniform float uExpression;
uniform float uMouthOpen;
uniform float uMouthSmile;
uniform float uBrowLift;
uniform float uBrowTension;
uniform float uEyeClosure;
uniform float uRelief;
uniform float uReadiness;

out float vDepth;
out float vSpark;
out float vSignal;
out float vSmile;
out float vStillness;

float hash(float value) {
  return fract(sin(value * 91.3458) * 47453.5453);
}

void main() {
  float seed = hash(float(gl_VertexID) + aPoint.z * 137.0);
  float stillness = clamp(uRelief * 0.62 + uReadiness * 0.38, 0.0, 1.0);
  float expressionHeat = clamp(
    uExpression * 0.38
    + uMouthOpen * 0.24
    + uBrowTension * 0.22
    + uBrowLift * 0.1
    + uEyeClosure * 0.06,
    0.0,
    1.0
  );
  float scatter = (uTurbulence * 0.18 + expressionHeat * 0.24) * (1.0 - stillness * 0.7);
  float breath = sin(uTime * 0.52 + seed * 6.2831) * (0.012 + uSettling * 0.012);
  vec2 source = aPoint.xy;
  float upperFace = smoothstep(0.02, 0.44, source.y);
  float lowerFace = smoothstep(0.0, 0.44, -source.y);
  float faceSide = smoothstep(0.08, 0.58, abs(source.x));
  float mouthZone = lowerFace * (1.0 - smoothstep(0.08, 0.78, abs(source.x)));
  float browZone = upperFace * smoothstep(0.04, 0.42, abs(source.x));
  float eyeZone = upperFace * (1.0 - smoothstep(0.12, 0.58, abs(source.x))) * smoothstep(0.08, 0.42, source.y);
  vec2 astral = source * (0.72 + stillness * 0.18);
  astral.y -= uMouthOpen * mouthZone * 0.16;
  astral.x += sign(source.x) * uMouthSmile * mouthZone * (0.04 + abs(source.x) * 0.12);
  astral.y += uMouthSmile * mouthZone * 0.035;
  astral.y += uBrowLift * browZone * 0.09;
  astral.x += sign(source.x) * uBrowTension * browZone * (0.035 + faceSide * 0.07);
  astral.y -= uEyeClosure * eyeZone * 0.035;
  vec2 galaxy = vec2(
    cos(seed * 6.2831 + uTime * 0.04),
    sin(seed * 6.2831 + uTime * 0.04)
  ) * scatter * (0.35 + seed * 0.65);
  vec2 position = astral + galaxy + normalize(source + vec2(0.001)) * breath;
  gl_Position = vec4(position, 0.0, 1.0);
  gl_PointSize = mix(1.15, 5.2, seed) * (1.0 + uReadiness * 0.72 + expressionHeat * 0.55);
  vDepth = clamp(0.5 + aPoint.z * 2.8, 0.0, 1.0);
  vSpark = seed;
  vSignal = clamp(expressionHeat + mouthZone * uMouthOpen * 0.5 + browZone * uBrowTension * 0.5, 0.0, 1.0);
  vSmile = clamp(uMouthSmile * mouthZone + uEyeClosure * eyeZone * 0.2, 0.0, 1.0);
  vStillness = stillness;
}
`;

const MESH_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform float uExpression;
uniform float uMouthOpen;
uniform float uMouthSmile;
uniform float uBrowTension;
uniform float uRelief;
uniform float uReadiness;

in float vDepth;
in float vSpark;
in float vSignal;
in float vSmile;
in float vStillness;
out vec4 outColor;

void main() {
  vec2 local = gl_PointCoord - 0.5;
  float core = smoothstep(0.5, 0.0, length(local));
  vec3 ember = vec3(1.0, 0.62, 0.28);
  vec3 blue = vec3(0.54, 0.68, 1.0);
  vec3 violet = vec3(0.78, 0.48, 1.0);
  vec3 white = vec3(1.0, 0.92, 0.78);
  float progress = clamp(uRelief * 0.62 + uReadiness * 0.38, 0.0, 1.0);
  vec3 color = mix(ember, blue, progress * 0.72 + vDepth * 0.18);
  color = mix(color, violet, clamp(uMouthOpen * 0.3 + uBrowTension * 0.36 + vSignal * 0.22, 0.0, 0.62));
  color = mix(color, white, uReadiness * 0.34 + uMouthSmile * 0.24 + vSpark * 0.08);
  float alpha = core * (0.2 + uExpression * 0.18 + vSignal * 0.22 + progress * 0.42);
  outColor = vec4(color, alpha);
}
`;

const MESH_LINE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform float uExpression;
uniform float uMouthOpen;
uniform float uMouthSmile;
uniform float uBrowTension;
uniform float uRelief;
uniform float uReadiness;

in float vDepth;
in float vSpark;
in float vSignal;
in float vSmile;
in float vStillness;
out vec4 outColor;

void main() {
  float progress = clamp(uRelief * 0.62 + uReadiness * 0.38, 0.0, 1.0);
  vec3 ember = vec3(1.0, 0.58, 0.25);
  vec3 violet = vec3(0.78, 0.48, 1.0);
  vec3 blue = vec3(0.38, 0.66, 1.0);
  vec3 white = vec3(1.0, 0.95, 0.82);
  float heat = clamp(uExpression * 0.35 + uMouthOpen * 0.25 + uBrowTension * 0.28 + vSignal * 0.3, 0.0, 1.0);
  vec3 color = mix(ember, violet, heat * 0.74 + vSpark * 0.06);
  color = mix(color, blue, progress * 0.62 + vDepth * 0.12);
  color = mix(color, white, uReadiness * 0.28 + uMouthSmile * 0.22 + vSmile * 0.18);
  float alpha = 0.08 + heat * 0.22 + progress * 0.18 + vStillness * 0.08;
  outColor = vec4(color, alpha);
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
  relief: number;
  readiness: number;
};

type Uniforms = {
  resolution: WebGLUniformLocation;
  time: WebGLUniformLocation;
  hasVideo: WebGLUniformLocation;
  turbulence: WebGLUniformLocation;
  coherence: WebGLUniformLocation;
  settling: WebGLUniformLocation;
  softness: WebGLUniformLocation;
  relief: WebGLUniformLocation;
  readiness: WebGLUniformLocation;
};

type MeshUniforms = {
  time: WebGLUniformLocation;
  turbulence: WebGLUniformLocation;
  settling: WebGLUniformLocation;
  expression: WebGLUniformLocation;
  mouthOpen: WebGLUniformLocation;
  mouthSmile: WebGLUniformLocation;
  browLift: WebGLUniformLocation;
  browTension: WebGLUniformLocation;
  eyeClosure: WebGLUniformLocation;
  relief: WebGLUniformLocation;
  readiness: WebGLUniformLocation;
};

export class SoulMirrorRenderer {
  private context: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private meshProgram: WebGLProgram | null = null;
  private meshLineProgram: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private meshBuffer: WebGLBuffer | null = null;
  private meshLineBuffer: WebGLBuffer | null = null;
  private uniforms: Uniforms | null = null;
  private meshUniforms: MeshUniforms | null = null;
  private meshLineUniforms: MeshUniforms | null = null;
  private meshPointCount = 0;
  private meshLinePointCount = 0;
  private frameHandle = 0;
  private running = false;
  private lastFrame = 0;
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
    relief: 0,
    readiness: 0,
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
    const meshProgram = this.createMeshProgram(context);
    const meshLineProgram = this.createMeshLineProgram(context);
    const texture = context.createTexture();
    const meshBuffer = context.createBuffer();
    const meshLineBuffer = context.createBuffer();
    if (!texture) throw new Error('This device cannot create the mirror texture.');
    if (!meshBuffer) throw new Error('This device cannot create the mirror mesh.');
    if (!meshLineBuffer) throw new Error('This device cannot create the mirror mesh lines.');
    context.useProgram(program);
    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D, texture);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MIN_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_MAG_FILTER, context.LINEAR);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_S, context.CLAMP_TO_EDGE);
    context.texParameteri(context.TEXTURE_2D, context.TEXTURE_WRAP_T, context.CLAMP_TO_EDGE);
    context.uniform1i(context.getUniformLocation(program, 'uVideo'), 0);

    this.context = context;
    this.program = program;
    this.meshProgram = meshProgram;
    this.meshLineProgram = meshLineProgram;
    this.texture = texture;
    this.meshBuffer = meshBuffer;
    this.meshLineBuffer = meshLineBuffer;
    this.uniforms = this.readUniforms(context, program);
    this.meshUniforms = this.readMeshUniforms(context, meshProgram);
    this.meshLineUniforms = this.readMeshUniforms(context, meshLineProgram);
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
    if (this.context && this.texture) this.context.deleteTexture(this.texture);
    if (this.context && this.program) this.context.deleteProgram(this.program);
    if (this.context && this.meshProgram) this.context.deleteProgram(this.meshProgram);
    if (this.context && this.meshLineProgram) this.context.deleteProgram(this.meshLineProgram);
    if (this.context && this.meshBuffer) this.context.deleteBuffer(this.meshBuffer);
    if (this.context && this.meshLineBuffer) this.context.deleteBuffer(this.meshLineBuffer);
    this.context = null;
    this.program = null;
    this.meshProgram = null;
    this.meshLineProgram = null;
    this.texture = null;
    this.meshBuffer = null;
    this.meshLineBuffer = null;
    this.uniforms = null;
    this.meshUniforms = null;
    this.meshLineUniforms = null;
    this.meshPointCount = 0;
    this.meshLinePointCount = 0;
    this.target = null;
  }

  private resize = (): void => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.reducedMotionQuery.matches ? 1 : 1.5);
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
    const texture = this.texture;
    const uniforms = this.uniforms;
    if (!context || !program || !texture || !uniforms) return;

    const deltaSeconds = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1_000));
    this.lastFrame = now;
    const frame = this.target;
    if (frame) {
      this.values.turbulence = smoothValue(this.values.turbulence, frame.relief.turbulence, deltaSeconds, 1.1);
      this.values.coherence = smoothValue(this.values.coherence, frame.resonance.coherence, deltaSeconds, 1.4);
      this.values.settling = smoothValue(this.values.settling, frame.relief.settling, deltaSeconds, 1.3);
      this.values.softness = smoothValue(this.values.softness, frame.relief.softness, deltaSeconds, 1.5);
      this.values.expression = smoothValue(this.values.expression, frame.relief.expressionActivity, deltaSeconds, 2.8);
      this.values.mouthOpen = smoothValue(this.values.mouthOpen, frame.mirror.expression.mouthOpen, deltaSeconds, 3.8);
      this.values.mouthSmile = smoothValue(this.values.mouthSmile, frame.mirror.expression.mouthSmile, deltaSeconds, 3.2);
      this.values.browLift = smoothValue(this.values.browLift, frame.mirror.expression.browLift, deltaSeconds, 3.4);
      this.values.browTension = smoothValue(this.values.browTension, frame.mirror.expression.browTension, deltaSeconds, 3.8);
      this.values.eyeClosure = smoothValue(this.values.eyeClosure, frame.mirror.expression.eyeClosure, deltaSeconds, 3.1);
      this.values.relief = smoothValue(this.values.relief, frame.relief.relief, deltaSeconds, 1.6);
      this.values.readiness = smoothValue(this.values.readiness, frame.relief.readiness, deltaSeconds, 2);
    }

    const video = frame?.mirror.sourceVideo ?? null;
    const hasVideo = video !== null
      && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
      && video.videoWidth > 0
      && video.videoHeight > 0;

    context.useProgram(program);
    context.activeTexture(context.TEXTURE0);
    context.bindTexture(context.TEXTURE_2D, texture);
    if (hasVideo) {
      context.pixelStorei(context.UNPACK_FLIP_Y_WEBGL, true);
      context.texImage2D(context.TEXTURE_2D, 0, context.RGBA, context.RGBA, context.UNSIGNED_BYTE, video);
    }
    context.uniform2f(uniforms.resolution, this.canvas.width, this.canvas.height);
    context.uniform1f(uniforms.time, this.reducedMotionQuery.matches ? 0 : now / 1_000);
    context.uniform1f(uniforms.hasVideo, hasVideo ? 1 : 0);
    context.uniform1f(uniforms.turbulence, this.values.turbulence);
    context.uniform1f(uniforms.coherence, this.values.coherence);
    context.uniform1f(uniforms.settling, this.values.settling);
    context.uniform1f(uniforms.softness, this.values.softness);
    context.uniform1f(uniforms.relief, this.values.relief);
    context.uniform1f(uniforms.readiness, this.values.readiness);
    context.drawArrays(context.TRIANGLES, 0, 3);
    if (frame?.mirror.topology) this.drawFaceMesh(context, frame.mirror.topology, now);

    this.requestNextFrame();
  };

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

  private createMeshProgram(context: WebGL2RenderingContext): WebGLProgram {
    const vertex = this.createShader(context, context.VERTEX_SHADER, MESH_VERTEX_SHADER);
    const fragment = this.createShader(context, context.FRAGMENT_SHADER, MESH_FRAGMENT_SHADER);
    const program = context.createProgram();
    if (!program) throw new Error('This device cannot create the mesh program.');
    context.attachShader(program, vertex);
    context.attachShader(program, fragment);
    context.linkProgram(program);
    context.deleteShader(vertex);
    context.deleteShader(fragment);
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      const detail = context.getProgramInfoLog(program) ?? 'Unknown mesh program error';
      context.deleteProgram(program);
      throw new Error(detail);
    }
    return program;
  }

  private createMeshLineProgram(context: WebGL2RenderingContext): WebGLProgram {
    const vertex = this.createShader(context, context.VERTEX_SHADER, MESH_VERTEX_SHADER);
    const fragment = this.createShader(context, context.FRAGMENT_SHADER, MESH_LINE_FRAGMENT_SHADER);
    const program = context.createProgram();
    if (!program) throw new Error('This device cannot create the mesh line program.');
    context.attachShader(program, vertex);
    context.attachShader(program, fragment);
    context.linkProgram(program);
    context.deleteShader(vertex);
    context.deleteShader(fragment);
    if (!context.getProgramParameter(program, context.LINK_STATUS)) {
      const detail = context.getProgramInfoLog(program) ?? 'Unknown mesh line program error';
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
      time: required('uTime'),
      hasVideo: required('uHasVideo'),
      turbulence: required('uTurbulence'),
      coherence: required('uCoherence'),
      settling: required('uSettling'),
      softness: required('uSoftness'),
      relief: required('uRelief'),
      readiness: required('uReadiness'),
    };
  }

  private readMeshUniforms(context: WebGL2RenderingContext, program: WebGLProgram): MeshUniforms {
    const required = (name: string): WebGLUniformLocation => {
      const location = context.getUniformLocation(program, name);
      if (!location) throw new Error(`Mirror mesh shader missing ${name}.`);
      return location;
    };
    return {
      time: required('uTime'),
      turbulence: required('uTurbulence'),
      settling: required('uSettling'),
      expression: required('uExpression'),
      mouthOpen: required('uMouthOpen'),
      mouthSmile: required('uMouthSmile'),
      browLift: required('uBrowLift'),
      browTension: required('uBrowTension'),
      eyeClosure: required('uEyeClosure'),
      relief: required('uRelief'),
      readiness: required('uReadiness'),
    };
  }

  private drawFaceMesh(context: WebGL2RenderingContext, topology: MirrorTopology, now: number): void {
    this.drawFaceMeshLines(context, topology, now);
    this.drawFaceConstellation(context, topology, now);
  }

  private drawFaceConstellation(context: WebGL2RenderingContext, topology: MirrorTopology, now: number): void {
    const program = this.meshProgram;
    const buffer = this.meshBuffer;
    const uniforms = this.meshUniforms;
    if (!program || !buffer || !uniforms || topology.points.length === 0) return;

    const points = this.packFacePoints(topology);
    this.meshPointCount = points.length / 3;
    context.useProgram(program);
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(context.ARRAY_BUFFER, points, context.DYNAMIC_DRAW);
    const attribute = context.getAttribLocation(program, 'aPoint');
    context.enableVertexAttribArray(attribute);
    context.vertexAttribPointer(attribute, 3, context.FLOAT, false, 0, 0);
    context.uniform1f(uniforms.time, this.reducedMotionQuery.matches ? 0 : now / 1_000);
    context.uniform1f(uniforms.turbulence, this.values.turbulence);
    context.uniform1f(uniforms.settling, this.values.settling);
    context.uniform1f(uniforms.expression, this.values.expression);
    this.writeExpressionUniforms(context, uniforms);
    context.uniform1f(uniforms.relief, this.values.relief);
    context.uniform1f(uniforms.readiness, this.values.readiness);
    context.enable(context.BLEND);
    context.blendFunc(context.SRC_ALPHA, context.ONE);
    context.drawArrays(context.POINTS, 0, this.meshPointCount);
    context.disable(context.BLEND);
  }

  private drawFaceMeshLines(context: WebGL2RenderingContext, topology: MirrorTopology, now: number): void {
    const program = this.meshLineProgram;
    const buffer = this.meshLineBuffer;
    const uniforms = this.meshLineUniforms;
    if (!program || !buffer || !uniforms || topology.points.length === 0 || topology.connections.length === 0) return;

    const points = this.packFaceConnectionPoints(topology);
    this.meshLinePointCount = points.length / 3;
    if (this.meshLinePointCount === 0) return;
    context.useProgram(program);
    context.bindBuffer(context.ARRAY_BUFFER, buffer);
    context.bufferData(context.ARRAY_BUFFER, points, context.DYNAMIC_DRAW);
    const attribute = context.getAttribLocation(program, 'aPoint');
    context.enableVertexAttribArray(attribute);
    context.vertexAttribPointer(attribute, 3, context.FLOAT, false, 0, 0);
    context.uniform1f(uniforms.time, this.reducedMotionQuery.matches ? 0 : now / 1_000);
    context.uniform1f(uniforms.turbulence, this.values.turbulence);
    context.uniform1f(uniforms.settling, this.values.settling);
    context.uniform1f(uniforms.expression, this.values.expression);
    this.writeExpressionUniforms(context, uniforms);
    context.uniform1f(uniforms.relief, this.values.relief);
    context.uniform1f(uniforms.readiness, this.values.readiness);
    context.enable(context.BLEND);
    context.blendFunc(context.SRC_ALPHA, context.ONE);
    context.lineWidth(1);
    context.drawArrays(context.LINES, 0, this.meshLinePointCount);
    context.disable(context.BLEND);
  }

  private writeExpressionUniforms(context: WebGL2RenderingContext, uniforms: MeshUniforms): void {
    context.uniform1f(uniforms.mouthOpen, this.values.mouthOpen);
    context.uniform1f(uniforms.mouthSmile, this.values.mouthSmile);
    context.uniform1f(uniforms.browLift, this.values.browLift);
    context.uniform1f(uniforms.browTension, this.values.browTension);
    context.uniform1f(uniforms.eyeClosure, this.values.eyeClosure);
  }

  private packFacePoints(topology: MirrorTopology): Float32Array {
    const packed = new Float32Array(topology.points.length * 3);
    const scale = Math.max(0.01, topology.scale);
    let offset = 0;
    for (const point of topology.points) {
      const normalized = this.normalizeFacePoint(point, topology, scale);
      packed[offset] = normalized.x;
      packed[offset + 1] = normalized.y;
      packed[offset + 2] = normalized.z;
      offset += 3;
    }
    return packed;
  }

  private packFaceConnectionPoints(topology: MirrorTopology): Float32Array {
    const scale = Math.max(0.01, topology.scale);
    const packed = new Float32Array(topology.connections.length * 2 * 3);
    let offset = 0;
    for (const connection of topology.connections) {
      const start = topology.points[connection.start];
      const end = topology.points[connection.end];
      if (!start || !end) continue;
      const from = this.normalizeFacePoint(start, topology, scale);
      const to = this.normalizeFacePoint(end, topology, scale);
      packed[offset] = from.x;
      packed[offset + 1] = from.y;
      packed[offset + 2] = from.z;
      packed[offset + 3] = to.x;
      packed[offset + 4] = to.y;
      packed[offset + 5] = to.z;
      offset += 6;
    }
    return packed.slice(0, offset);
  }

  private normalizeFacePoint(point: MirrorPoint, topology: MirrorTopology, scale: number): MirrorPoint {
    return {
      x: ((point.x - topology.centerX) / scale) * 1.35,
      y: ((point.y - topology.centerY) / scale) * 1.35,
      z: point.z,
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
