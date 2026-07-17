import type { SessionRenderFrame } from '../experience/model.ts';
import { smoothValue } from '../resonance/smoothing.ts';

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

type RenderValues = {
  turbulence: number;
  coherence: number;
  settling: number;
  softness: number;
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

export class SoulMirrorRenderer {
  private context: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private uniforms: Uniforms | null = null;
  private frameHandle = 0;
  private running = false;
  private lastFrame = 0;
  private target: SessionRenderFrame | null = null;
  private values: RenderValues = {
    turbulence: 0.7,
    coherence: 0.3,
    settling: 0.25,
    softness: 0.5,
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
    const texture = context.createTexture();
    if (!texture) throw new Error('This device cannot create the mirror texture.');
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
    this.texture = texture;
    this.uniforms = this.readUniforms(context, program);
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
    this.context = null;
    this.program = null;
    this.texture = null;
    this.uniforms = null;
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
