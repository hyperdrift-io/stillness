import { smoothValue } from '../resonance/smoothing.ts';
import type { SessionRenderFrame } from '../experience/model.ts';
import type { ResonanceState } from '../resonance/resonance.ts';
import { fragmentShaderSource, vertexShaderSource } from './shaders.ts';
import { createUniformSnapshot } from './uniforms.ts';

const initialState: ResonanceState = {
  complexity: 0.78,
  turbulence: 0.68,
  coherence: 0.32,
  focus: 0.72,
  depth: 0.7,
  pulse: 0.66,
  audioEnergy: 0.56,
  warmth: 0.8,
  space: 0.18,
};

type UniformLocations = Record<
  'resolution' | 'time' | 'complexity' | 'turbulence' | 'coherence' | 'focus' |
  'depth' | 'pulse' | 'warmth' | 'space' | 'reducedMotion',
  WebGLUniformLocation
>;

export class LightFieldRenderer {
  private gl: WebGL2RenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uniforms: UniformLocations | null = null;
  private animationFrame = 0;
  private startTime = 0;
  private lastFrame = 0;
  private running = false;
  private contextLost = false;
  private target = { ...initialState };
  private current = { ...initialState };
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly canvas: HTMLCanvasElement) {}

  start(): void {
    if (this.running) return;
    this.initializeContext();
    this.running = true;
    this.startTime = performance.now();
    this.lastFrame = this.startTime;
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('resize', this.resize);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.resize();
    this.animationFrame = requestAnimationFrame(this.render);
  }

  update(frame: SessionRenderFrame): void {
    this.target = { ...frame.resonance };
  }

  resize = (): void => {
    const gl = this.gl;
    if (!gl) return;
    const reducedMotion = this.reducedMotionQuery.matches;
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, reducedMotion ? 1 : lowPower ? 1.25 : 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
  };

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.animationFrame);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    if (this.gl && this.program) this.gl.deleteProgram(this.program);
    if (this.gl && this.vao) this.gl.deleteVertexArray(this.vao);
    this.program = null;
    this.vao = null;
    this.gl = null;
  }

  private initializeContext(): void {
    const gl = this.canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('This device cannot create the light field.');

    const vertex = this.compileShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragment = this.compileShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = gl.createProgram();
    if (!program) throw new Error('The light field could not be prepared.');
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const detail = gl.getProgramInfoLog(program) ?? 'Unknown program error';
      gl.deleteProgram(program);
      throw new Error(`The light field could not be linked: ${detail}`);
    }

    const vao = gl.createVertexArray();
    if (!vao) throw new Error('The light field could not allocate its geometry.');
    gl.bindVertexArray(vao);
    gl.useProgram(program);

    this.gl = gl;
    this.program = program;
    this.vao = vao;
    this.uniforms = {
      resolution: this.requireUniform(gl, program, 'u_resolution'),
      time: this.requireUniform(gl, program, 'u_time'),
      complexity: this.requireUniform(gl, program, 'u_complexity'),
      turbulence: this.requireUniform(gl, program, 'u_turbulence'),
      coherence: this.requireUniform(gl, program, 'u_coherence'),
      focus: this.requireUniform(gl, program, 'u_focus'),
      depth: this.requireUniform(gl, program, 'u_depth'),
      pulse: this.requireUniform(gl, program, 'u_pulse'),
      warmth: this.requireUniform(gl, program, 'u_warmth'),
      space: this.requireUniform(gl, program, 'u_space'),
      reducedMotion: this.requireUniform(gl, program, 'u_reducedMotion'),
    };
  }

  private compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('The light field could not allocate a shader.');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const detail = gl.getShaderInfoLog(shader) ?? 'Unknown shader error';
      gl.deleteShader(shader);
      throw new Error(`The light field could not be compiled: ${detail}`);
    }
    return shader;
  }

  private requireUniform(
    gl: WebGL2RenderingContext,
    program: WebGLProgram,
    name: string,
  ): WebGLUniformLocation {
    const location = gl.getUniformLocation(program, name);
    if (!location) throw new Error(`The light field is missing ${name}.`);
    return location;
  }

  private render = (now: number): void => {
    if (!this.running || this.contextLost) return;
    const gl = this.gl;
    const uniforms = this.uniforms;
    if (!gl || !uniforms) return;

    const reducedMotion = this.reducedMotionQuery.matches;
    const lowPower = (navigator.hardwareConcurrency || 8) <= 4;
    const frameInterval = reducedMotion ? 250 : lowPower ? 1000 / 30 : 0;
    if (now - this.lastFrame < frameInterval) {
      this.animationFrame = requestAnimationFrame(this.render);
      return;
    }

    const deltaSeconds = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1_000));
    this.lastFrame = now;
    for (const key of Object.keys(this.current) as (keyof ResonanceState)[]) {
      this.current[key] = smoothValue(this.current[key], this.target[key], deltaSeconds, 1.8);
    }

    const snapshot = createUniformSnapshot(
      this.current,
      (now - this.startTime) / 1_000,
      this.canvas.width,
      this.canvas.height,
      reducedMotion,
    );

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(uniforms.resolution, snapshot.width, snapshot.height);
    gl.uniform1f(uniforms.time, snapshot.time);
    gl.uniform1f(uniforms.complexity, snapshot.complexity);
    gl.uniform1f(uniforms.turbulence, snapshot.turbulence);
    gl.uniform1f(uniforms.coherence, snapshot.coherence);
    gl.uniform1f(uniforms.focus, snapshot.focus);
    gl.uniform1f(uniforms.depth, snapshot.depth);
    gl.uniform1f(uniforms.pulse, snapshot.pulse);
    gl.uniform1f(uniforms.warmth, snapshot.warmth);
    gl.uniform1f(uniforms.space, snapshot.space);
    gl.uniform1f(uniforms.reducedMotion, snapshot.reducedMotion);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.animationFrame = requestAnimationFrame(this.render);
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.animationFrame);
      return;
    }
    this.lastFrame = performance.now();
    this.animationFrame = requestAnimationFrame(this.render);
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    this.contextLost = true;
    cancelAnimationFrame(this.animationFrame);
  };

  private onContextRestored = (): void => {
    this.contextLost = false;
    this.initializeContext();
    this.resize();
    this.lastFrame = performance.now();
    if (!document.hidden) this.animationFrame = requestAnimationFrame(this.render);
  };
}
