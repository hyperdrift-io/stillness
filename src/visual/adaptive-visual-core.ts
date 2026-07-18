import type { AdaptiveScene } from '../state/adaptive-state.ts';
import type {
  AdaptiveVisualControlFrame,
  RendererMetrics,
  RendererQuality,
} from './adaptive-visual-state.ts';
import {
  blurFragmentShader,
  compositeFragmentShader,
  faceEmissionFragmentShader,
  faceEmissionVertexShader,
  feedbackWarpFragmentShader,
  fullscreenVertexShader,
  sceneEmissionFragmentShader,
} from './adaptive-visual-shaders.ts';
import {
  createAdaptiveVisualResources,
  createProgram,
  createWebGL2Context,
  type AdaptiveVisualCanvas,
  type AdaptiveVisualResources,
  type RenderTarget,
} from './webgl-resources.ts';

const SCENE_INDEX: Readonly<Record<AdaptiveScene, number>> = {
  turbulence: 0,
  gathering: 1,
  coherence: 2,
  release: 3,
  radiance: 4,
};

const FLOATS_PER_SEGMENT = 6;
const BYTES_PER_SEGMENT = FLOATS_PER_SEGMENT * Float32Array.BYTES_PER_ELEMENT;
const MAX_SEGMENTS: Readonly<Record<RendererQuality, number>> = {
  high: 4_096,
  balanced: 2_560,
  reduced: 1_280,
};

const warpUniformNames = [
  'uFeedback',
  'uModulation',
  'uResolution',
  'uMovementDirection',
  'uMovementEnergy',
  'uTime',
  'uDeltaScale',
  'uPreviousScene',
  'uTargetScene',
  'uSceneMix',
  'uVariationSeed',
  'uBreathScale',
  'uReducedMotion',
] as const;

const sceneUniformNames = [
  'uResolution',
  'uTime',
  'uDeltaScale',
  'uPreviousScene',
  'uTargetScene',
  'uSceneMix',
  'uProgress',
  'uCoherence',
  'uExpressiveActivation',
  'uFacialWarmth',
  'uMovementEnergy',
  'uVisualIntensity',
  'uVariationSeed',
  'uBreathScale',
  'uReducedMotion',
  'uPaletteShadow',
  'uPaletteMid',
  'uPaletteLight',
  'uPaletteConfidence',
  'uColorInfluence',
] as const;

const faceUniformNames = [
  'uResolution',
  'uTime',
  'uFacialTension',
  'uFacialWarmth',
  'uBreathScale',
  'uReducedMotion',
  'uVisualIntensity',
  'uDeltaScale',
  'uPaletteLight',
  'uPaletteConfidence',
  'uColorInfluence',
] as const;

const blurUniformNames = [
  'uTexture',
  'uTexelDirection',
  'uApplyThreshold',
] as const;

const compositeUniformNames = [
  'uFeedback',
  'uBloom',
  'uResolution',
  'uVisualIntensity',
] as const;

type ProgramBinding<UniformName extends string> = {
  program: WebGLProgram;
  uniforms: Readonly<Record<UniformName, WebGLUniformLocation>>;
};

type AdaptiveVisualPrograms = {
  warp: ProgramBinding<(typeof warpUniformNames)[number]>;
  scene: ProgramBinding<(typeof sceneUniformNames)[number]>;
  face: ProgramBinding<(typeof faceUniformNames)[number]>;
  blur: ProgramBinding<(typeof blurUniformNames)[number]>;
  composite: ProgramBinding<(typeof compositeUniformNames)[number]>;
};

const initialControlFrame: AdaptiveVisualControlFrame = {
  scene: 'turbulence',
  sceneMix: 1,
  progress: 0,
  movementEnergy: 0,
  movementX: 0,
  movementY: 0,
  facialTension: 0,
  facialWarmth: 0,
  expressiveActivation: 0,
  breathPhase: 0,
  breathConfidence: 0,
  coherence: 0,
  palette: {
    shadow: [0, 0, 0],
    mid: [0.02, 0.04, 0.08],
    light: [0.08, 0.14, 0.22],
    confidence: 0,
  },
  topologySegments: new Float32Array(),
  colorInfluence: 0.2,
  visualIntensity: 1,
  transitionSeconds: 4.5,
  requestedQuality: 'auto',
  variationSeed: 0,
  reducedMotion: false,
};

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value));
}

function clampSigned(value: number): number {
  return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
}

function resolveQuality(frame: AdaptiveVisualControlFrame): RendererQuality {
  if (frame.reducedMotion || frame.requestedQuality === 'reduced') return 'reduced';
  if (frame.requestedQuality === 'high') return 'high';
  return 'balanced';
}

function maximumDevicePixelRatio(quality: RendererQuality): number {
  if (quality === 'high') return 2;
  if (quality === 'balanced') return 1.5;
  return 1;
}

function createProgramBinding<const UniformNames extends readonly string[]>(
  gl: WebGL2RenderingContext,
  vertexSource: string,
  fragmentSource: string,
  uniformNames: UniformNames,
): ProgramBinding<UniformNames[number]> {
  const program = createProgram(gl, vertexSource, fragmentSource);
  const uniforms = {} as Record<UniformNames[number], WebGLUniformLocation>;
  try {
    for (const name of uniformNames) {
      const uniformName = name as UniformNames[number];
      const location = gl.getUniformLocation(program, uniformName);
      if (location === null) {
        throw new Error(
          `The adaptive visual shader program is missing uniform ${uniformName}.`,
        );
      }
      uniforms[uniformName] = location;
    }
    return { program, uniforms };
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  }
}

function createPrograms(gl: WebGL2RenderingContext): AdaptiveVisualPrograms {
  const allocated: WebGLProgram[] = [];
  try {
    const warp = createProgramBinding(
      gl,
      fullscreenVertexShader,
      feedbackWarpFragmentShader,
      warpUniformNames,
    );
    allocated.push(warp.program);
    const scene = createProgramBinding(
      gl,
      fullscreenVertexShader,
      sceneEmissionFragmentShader,
      sceneUniformNames,
    );
    allocated.push(scene.program);
    const face = createProgramBinding(
      gl,
      faceEmissionVertexShader,
      faceEmissionFragmentShader,
      faceUniformNames,
    );
    allocated.push(face.program);
    const blur = createProgramBinding(
      gl,
      fullscreenVertexShader,
      blurFragmentShader,
      blurUniformNames,
    );
    allocated.push(blur.program);
    const composite = createProgramBinding(
      gl,
      fullscreenVertexShader,
      compositeFragmentShader,
      compositeUniformNames,
    );
    allocated.push(composite.program);
    return { warp, scene, face, blur, composite };
  } catch (error) {
    for (const program of allocated) gl.deleteProgram(program);
    throw error;
  }
}

function deletePrograms(
  gl: WebGL2RenderingContext,
  programs: AdaptiveVisualPrograms,
): void {
  gl.deleteProgram(programs.warp.program);
  gl.deleteProgram(programs.scene.program);
  gl.deleteProgram(programs.face.program);
  gl.deleteProgram(programs.blur.program);
  gl.deleteProgram(programs.composite.program);
}

function validateSize(width: number, height: number, dpr: number): void {
  if (
    !Number.isFinite(width)
    || !Number.isFinite(height)
    || !Number.isFinite(dpr)
    || width <= 0
    || height <= 0
    || dpr <= 0
  ) {
    throw new Error(
      `Adaptive visual dimensions must be positive finite values; received ${width}x${height} at DPR ${dpr}.`,
    );
  }
}

export class AdaptiveVisualCore {
  private gl: WebGL2RenderingContext | null = null;
  private resources: AdaptiveVisualResources | null = null;
  private programs: AdaptiveVisualPrograms | null = null;
  private frame: AdaptiveVisualControlFrame = initialControlFrame;
  private previousScene: AdaptiveScene = initialControlFrame.scene;
  private targetScene: AdaptiveScene = initialControlFrame.scene;
  private readFeedbackIndex: 0 | 1 = 0;
  private writeFeedbackIndex: 0 | 1 = 1;
  private logicalWidth: number;
  private logicalHeight: number;
  private devicePixelRatio = 1;
  private quality: RendererQuality = 'balanced';
  private lastNowMs: number | null = null;
  private timeOriginMs: number | null = null;
  private smoothedFrameTimeMs = 0;
  private metrics: RendererMetrics = {
    fps: 0,
    frameTimeMs: 0,
    quality: 'balanced',
  };

  constructor(private readonly canvas: AdaptiveVisualCanvas) {
    this.logicalWidth = Math.max(1, canvas.width);
    this.logicalHeight = Math.max(1, canvas.height);
  }

  start(): void {
    if (this.resources && this.programs) return;

    const gl = this.gl ?? createWebGL2Context(this.canvas, {
      premultipliedAlpha: false,
    });
    if (gl.isContextLost()) {
      throw new Error('The adaptive visual WebGL2 context is lost and cannot be started.');
    }
    this.gl = gl;
    const effectiveDpr = Math.min(
      this.devicePixelRatio,
      maximumDevicePixelRatio(this.quality),
    );
    const width = Math.max(1, Math.round(this.logicalWidth * effectiveDpr));
    const height = Math.max(1, Math.round(this.logicalHeight * effectiveDpr));
    this.canvas.width = width;
    this.canvas.height = height;

    let resources: AdaptiveVisualResources | null = null;
    let programs: AdaptiveVisualPrograms | null = null;
    try {
      resources = createAdaptiveVisualResources(gl, width, height);
      programs = createPrograms(gl);
      this.resources = resources;
      this.programs = programs;
      this.configureVertexArray(gl, resources);
      this.initializeModulationTexture(gl, resources);
      this.validateRenderTargets(gl, resources);
      this.clearAllocatedTargets(gl, resources);
      const setupError = gl.getError();
      if (setupError !== gl.NO_ERROR) {
        throw new Error(
          `Initializing the adaptive visual core failed with WebGL error 0x${setupError.toString(16)}.`,
        );
      }
      this.resetGlState(gl);
      this.lastNowMs = null;
      this.timeOriginMs = null;
      this.readFeedbackIndex = 0;
      this.writeFeedbackIndex = 1;
    } catch (error) {
      if (programs) deletePrograms(gl, programs);
      resources?.dispose();
      this.resources = null;
      this.programs = null;
      if (!gl.isContextLost()) this.resetGlState(gl);
      throw error;
    }
  }

  update(frame: AdaptiveVisualControlFrame): void {
    if (frame.scene !== this.targetScene) {
      this.previousScene = this.targetScene;
      this.targetScene = frame.scene;
    }
    this.frame = frame;
    const previousQuality = this.quality;
    this.quality = resolveQuality(frame);
    this.metrics = { ...this.metrics, quality: this.quality };
    if (previousQuality !== this.quality && this.resources) {
      this.resize(this.logicalWidth, this.logicalHeight, this.devicePixelRatio);
    }
  }

  /**
   * Synchronously replaces the modulation texture with the newest analysis
   * bitmap. The core never retains or closes the bitmap: the caller remains
   * its owner and may close it immediately after this method returns or throws.
   */
  setModulation(bitmap: ImageBitmap): void {
    const { gl, resources } = this.requireStarted();
    const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number;
    gl.activeTexture(gl.TEXTURE0);
    const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    const previousFlip = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean;
    const previousPremultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) as boolean;
    const previousColorSpace = gl.getParameter(
      gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,
    ) as number;
    try {
      gl.bindTexture(gl.TEXTURE_2D, resources.modulationTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        bitmap,
      );
      const error = gl.getError();
      if (error !== gl.NO_ERROR) {
        throw new Error(
          `Uploading the adaptive modulation bitmap failed with WebGL error 0x${error.toString(16)}.`,
        );
      }
    } finally {
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, previousFlip);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, previousPremultiply);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, previousColorSpace);
      gl.bindTexture(gl.TEXTURE_2D, previousTexture);
      gl.activeTexture(previousActiveTexture);
    }
  }

  resize(width: number, height: number, dpr: number): void {
    validateSize(width, height, dpr);
    this.logicalWidth = width;
    this.logicalHeight = height;
    this.devicePixelRatio = dpr;
    if (!this.resources || !this.gl) return;

    const effectiveDpr = Math.min(dpr, maximumDevicePixelRatio(this.quality));
    const pixelWidth = Math.max(1, Math.round(width * effectiveDpr));
    const pixelHeight = Math.max(1, Math.round(height * effectiveDpr));
    if (
      this.resources.width === pixelWidth
      && this.resources.height === pixelHeight
      && this.canvas.width === pixelWidth
      && this.canvas.height === pixelHeight
    ) return;

    this.canvas.width = pixelWidth;
    this.canvas.height = pixelHeight;
    this.resources.resize(pixelWidth, pixelHeight);
    this.validateRenderTargets(this.gl, this.resources);
    // Texture storage is undefined after reallocation. Clear only here and at
    // first allocation; scene transitions never clear persistent history.
    this.clearAllocatedTargets(this.gl, this.resources);
    this.readFeedbackIndex = 0;
    this.writeFeedbackIndex = 1;
    this.resetGlState(this.gl);
  }

  render(nowMs: number): RendererMetrics {
    if (!Number.isFinite(nowMs)) {
      throw new Error(`Adaptive visual render time must be finite; received ${nowMs}.`);
    }
    const { gl, resources, programs } = this.requireStarted();
    if (gl.isContextLost()) {
      throw new Error('The adaptive visual WebGL2 context is lost.');
    }

    const rawFrameTimeMs = this.lastNowMs === null
      ? 1_000 / 60
      : clamp(nowMs - this.lastNowMs, 1, 100);
    this.lastNowMs = nowMs;
    this.timeOriginMs ??= nowMs;
    this.smoothedFrameTimeMs = this.smoothedFrameTimeMs === 0
      ? rawFrameTimeMs
      : this.smoothedFrameTimeMs * 0.9 + rawFrameTimeMs * 0.1;

    const deltaScale = rawFrameTimeMs / (1_000 / 60);
    const frame = this.frame;
    const reducedMotion = frame.reducedMotion ? 1 : 0;
    const elapsedSeconds = Math.max(0, nowMs - this.timeOriginMs) / 1_000;
    const shaderTime = elapsedSeconds * (frame.reducedMotion ? 0.16 : 1);
    const sceneMix = this.previousScene === this.targetScene
      ? 1
      : clamp(frame.sceneMix, 0, 1);
    const breathConfidence = clamp(frame.breathConfidence, 0, 1);
    const breathGate = breathConfidence > 0.35
      ? clamp((breathConfidence - 0.35) / 0.3, 0, 1)
      : 0;
    const breathScale = 1
      + Math.sin(clamp(frame.breathPhase, 0, 1) * Math.PI * 2)
        * 0.035
        * breathGate;
    const readTarget = resources.feedback[this.readFeedbackIndex];
    const writeTarget = resources.feedback[this.writeFeedbackIndex];

    try {
      this.renderWarpPass(
        gl,
        resources,
        programs,
        readTarget,
        writeTarget,
        frame,
        shaderTime,
        deltaScale,
        sceneMix,
        breathScale,
        reducedMotion,
      );
      this.renderScenePass(
        gl,
        resources,
        programs,
        writeTarget,
        frame,
        shaderTime,
        deltaScale,
        sceneMix,
        breathScale,
        reducedMotion,
      );
      this.renderFacePass(
        gl,
        resources,
        programs,
        writeTarget,
        frame,
        shaderTime,
        deltaScale,
        breathScale,
        reducedMotion,
      );
      this.renderBlurPasses(gl, resources, programs, writeTarget);
      this.renderCompositePass(gl, resources, programs, writeTarget, frame);
      const renderError = gl.getError();
      if (renderError !== gl.NO_ERROR) {
        throw new Error(
          `Rendering the adaptive visual field failed with WebGL error 0x${renderError.toString(16)}.`,
        );
      }
      const previousReadIndex = this.readFeedbackIndex;
      this.readFeedbackIndex = this.writeFeedbackIndex;
      this.writeFeedbackIndex = previousReadIndex;
    } finally {
      this.resetGlState(gl);
    }

    this.metrics = {
      fps: 1_000 / this.smoothedFrameTimeMs,
      frameTimeMs: this.smoothedFrameTimeMs,
      quality: this.quality,
    };
    return { ...this.metrics };
  }

  dispose(): void {
    const gl = this.gl;
    if (gl && this.programs) deletePrograms(gl, this.programs);
    this.resources?.dispose();
    if (gl && !gl.isContextLost()) this.resetGlState(gl);
    this.programs = null;
    this.resources = null;
    this.lastNowMs = null;
    this.timeOriginMs = null;
    this.smoothedFrameTimeMs = 0;
    this.readFeedbackIndex = 0;
    this.writeFeedbackIndex = 1;
  }

  private requireStarted(): {
    gl: WebGL2RenderingContext;
    resources: AdaptiveVisualResources;
    programs: AdaptiveVisualPrograms;
  } {
    if (!this.gl || !this.resources || !this.programs) {
      throw new Error('Start the adaptive visual core before using it.');
    }
    return { gl: this.gl, resources: this.resources, programs: this.programs };
  }

  private renderWarpPass(
    gl: WebGL2RenderingContext,
    resources: AdaptiveVisualResources,
    programs: AdaptiveVisualPrograms,
    readTarget: RenderTarget,
    writeTarget: RenderTarget,
    frame: AdaptiveVisualControlFrame,
    shaderTime: number,
    deltaScale: number,
    sceneMix: number,
    breathScale: number,
    reducedMotion: number,
  ): void {
    const { program, uniforms } = programs.warp;
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeTarget.framebuffer);
    gl.viewport(0, 0, resources.width, resources.height);
    gl.bindVertexArray(resources.fullscreenVertexArray);
    gl.useProgram(program);
    this.bindTexture(gl, 0, readTarget.texture);
    this.bindTexture(gl, 1, resources.modulationTexture);
    gl.uniform1i(uniforms.uFeedback, 0);
    gl.uniform1i(uniforms.uModulation, 1);
    gl.uniform2f(uniforms.uResolution, resources.width, resources.height);
    gl.uniform2f(
      uniforms.uMovementDirection,
      clampSigned(frame.movementX),
      clampSigned(frame.movementY),
    );
    gl.uniform1f(uniforms.uMovementEnergy, clamp(frame.movementEnergy, 0, 1));
    gl.uniform1f(uniforms.uTime, shaderTime);
    gl.uniform1f(uniforms.uDeltaScale, deltaScale);
    gl.uniform1f(uniforms.uPreviousScene, SCENE_INDEX[this.previousScene]);
    gl.uniform1f(uniforms.uTargetScene, SCENE_INDEX[this.targetScene]);
    gl.uniform1f(uniforms.uSceneMix, sceneMix);
    gl.uniform1f(uniforms.uVariationSeed, this.safeVariationSeed(frame.variationSeed));
    gl.uniform1f(uniforms.uBreathScale, breathScale);
    gl.uniform1f(uniforms.uReducedMotion, reducedMotion);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private renderScenePass(
    gl: WebGL2RenderingContext,
    resources: AdaptiveVisualResources,
    programs: AdaptiveVisualPrograms,
    writeTarget: RenderTarget,
    frame: AdaptiveVisualControlFrame,
    shaderTime: number,
    deltaScale: number,
    sceneMix: number,
    breathScale: number,
    reducedMotion: number,
  ): void {
    const { program, uniforms } = programs.scene;
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeTarget.framebuffer);
    gl.viewport(0, 0, resources.width, resources.height);
    gl.bindVertexArray(resources.fullscreenVertexArray);
    gl.useProgram(program);
    this.enableAdditiveBlending(gl);
    gl.uniform2f(uniforms.uResolution, resources.width, resources.height);
    gl.uniform1f(uniforms.uTime, shaderTime);
    gl.uniform1f(uniforms.uDeltaScale, deltaScale);
    gl.uniform1f(uniforms.uPreviousScene, SCENE_INDEX[this.previousScene]);
    gl.uniform1f(uniforms.uTargetScene, SCENE_INDEX[this.targetScene]);
    gl.uniform1f(uniforms.uSceneMix, sceneMix);
    gl.uniform1f(uniforms.uProgress, clamp(frame.progress, 0, 1));
    gl.uniform1f(uniforms.uCoherence, clamp(frame.coherence, 0, 1));
    gl.uniform1f(
      uniforms.uExpressiveActivation,
      clamp(frame.expressiveActivation, 0, 1),
    );
    gl.uniform1f(uniforms.uFacialWarmth, clamp(frame.facialWarmth, 0, 1));
    gl.uniform1f(uniforms.uMovementEnergy, clamp(frame.movementEnergy, 0, 1));
    gl.uniform1f(uniforms.uVisualIntensity, clamp(frame.visualIntensity, 0.75, 1.25));
    gl.uniform1f(uniforms.uVariationSeed, this.safeVariationSeed(frame.variationSeed));
    gl.uniform1f(uniforms.uBreathScale, breathScale);
    gl.uniform1f(uniforms.uReducedMotion, reducedMotion);
    this.setScenePaletteUniforms(gl, uniforms, frame);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private renderFacePass(
    gl: WebGL2RenderingContext,
    resources: AdaptiveVisualResources,
    programs: AdaptiveVisualPrograms,
    writeTarget: RenderTarget,
    frame: AdaptiveVisualControlFrame,
    shaderTime: number,
    deltaScale: number,
    breathScale: number,
    reducedMotion: number,
  ): void {
    const topology = frame.topologySegments;
    const availableSegments = topology instanceof Float32Array
      ? Math.floor(topology.length / FLOATS_PER_SEGMENT)
      : 0;
    const segmentCount = Math.min(availableSegments, MAX_SEGMENTS[this.quality]);
    if (segmentCount < 1) return;

    const uploadedFloatCount = segmentCount * FLOATS_PER_SEGMENT;
    const segmentData = uploadedFloatCount === topology.length
      ? topology
      : topology.subarray(0, uploadedFloatCount);
    for (const value of segmentData) {
      if (!Number.isFinite(value)) return;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeTarget.framebuffer);
    gl.viewport(0, 0, resources.width, resources.height);
    gl.bindVertexArray(resources.fullscreenVertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.faceSegmentBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, segmentData, gl.DYNAMIC_DRAW);
    const { program, uniforms } = programs.face;
    gl.useProgram(program);
    this.enableAdditiveBlending(gl);
    gl.uniform2f(uniforms.uResolution, resources.width, resources.height);
    gl.uniform1f(uniforms.uTime, shaderTime);
    gl.uniform1f(uniforms.uFacialTension, clamp(frame.facialTension, 0, 1));
    gl.uniform1f(uniforms.uFacialWarmth, clamp(frame.facialWarmth, 0, 1));
    gl.uniform1f(uniforms.uBreathScale, breathScale);
    gl.uniform1f(uniforms.uReducedMotion, reducedMotion);
    gl.uniform1f(uniforms.uVisualIntensity, clamp(frame.visualIntensity, 0.75, 1.25));
    gl.uniform1f(uniforms.uDeltaScale, deltaScale);
    gl.uniform3f(
      uniforms.uPaletteLight,
      clamp(frame.palette.light[0], 0, 1),
      clamp(frame.palette.light[1], 0, 1),
      clamp(frame.palette.light[2], 0, 1),
    );
    gl.uniform1f(uniforms.uPaletteConfidence, clamp(frame.palette.confidence, 0, 1));
    gl.uniform1f(uniforms.uColorInfluence, clamp(frame.colorInfluence, 0.15, 0.25));
    gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, segmentCount);
  }

  private renderBlurPasses(
    gl: WebGL2RenderingContext,
    resources: AdaptiveVisualResources,
    programs: AdaptiveVisualPrograms,
    writeTarget: RenderTarget,
  ): void {
    const bloomWidth = Math.max(1, Math.ceil(resources.width / 2));
    const bloomHeight = Math.max(1, Math.ceil(resources.height / 2));
    const { program, uniforms } = programs.blur;
    gl.disable(gl.BLEND);
    gl.bindVertexArray(resources.fullscreenVertexArray);
    gl.useProgram(program);
    gl.uniform1i(uniforms.uTexture, 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, resources.bloom[0].framebuffer);
    gl.viewport(0, 0, bloomWidth, bloomHeight);
    this.bindTexture(gl, 0, writeTarget.texture);
    gl.uniform2f(uniforms.uTexelDirection, 1 / resources.width, 0);
    gl.uniform1f(uniforms.uApplyThreshold, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    gl.bindFramebuffer(gl.FRAMEBUFFER, resources.bloom[1].framebuffer);
    this.bindTexture(gl, 0, resources.bloom[0].texture);
    gl.uniform2f(uniforms.uTexelDirection, 0, 1 / bloomHeight);
    gl.uniform1f(uniforms.uApplyThreshold, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private renderCompositePass(
    gl: WebGL2RenderingContext,
    resources: AdaptiveVisualResources,
    programs: AdaptiveVisualPrograms,
    writeTarget: RenderTarget,
    frame: AdaptiveVisualControlFrame,
  ): void {
    const { program, uniforms } = programs.composite;
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, resources.width, resources.height);
    gl.bindVertexArray(resources.fullscreenVertexArray);
    gl.useProgram(program);
    this.bindTexture(gl, 0, writeTarget.texture);
    this.bindTexture(gl, 1, resources.bloom[1].texture);
    gl.uniform1i(uniforms.uFeedback, 0);
    gl.uniform1i(uniforms.uBloom, 1);
    gl.uniform2f(uniforms.uResolution, resources.width, resources.height);
    gl.uniform1f(uniforms.uVisualIntensity, clamp(frame.visualIntensity, 0.75, 1.25));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private setScenePaletteUniforms(
    gl: WebGL2RenderingContext,
    uniforms: ProgramBinding<(typeof sceneUniformNames)[number]>['uniforms'],
    frame: AdaptiveVisualControlFrame,
  ): void {
    gl.uniform3f(
      uniforms.uPaletteShadow,
      clamp(frame.palette.shadow[0], 0, 1),
      clamp(frame.palette.shadow[1], 0, 1),
      clamp(frame.palette.shadow[2], 0, 1),
    );
    gl.uniform3f(
      uniforms.uPaletteMid,
      clamp(frame.palette.mid[0], 0, 1),
      clamp(frame.palette.mid[1], 0, 1),
      clamp(frame.palette.mid[2], 0, 1),
    );
    gl.uniform3f(
      uniforms.uPaletteLight,
      clamp(frame.palette.light[0], 0, 1),
      clamp(frame.palette.light[1], 0, 1),
      clamp(frame.palette.light[2], 0, 1),
    );
    gl.uniform1f(uniforms.uPaletteConfidence, clamp(frame.palette.confidence, 0, 1));
    gl.uniform1f(uniforms.uColorInfluence, clamp(frame.colorInfluence, 0.15, 0.25));
  }

  private enableAdditiveBlending(gl: WebGL2RenderingContext): void {
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE);
  }

  private bindTexture(
    gl: WebGL2RenderingContext,
    textureUnit: number,
    texture: WebGLTexture,
  ): void {
    gl.activeTexture(gl.TEXTURE0 + textureUnit);
    gl.bindTexture(gl.TEXTURE_2D, texture);
  }

  private safeVariationSeed(value: number): number {
    return Number.isFinite(value) ? Math.trunc(value) : 0;
  }

  private configureVertexArray(
    gl: WebGL2RenderingContext,
    resources: AdaptiveVisualResources,
  ): void {
    gl.bindVertexArray(resources.fullscreenVertexArray);
    gl.bindBuffer(gl.ARRAY_BUFFER, resources.faceSegmentBuffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, BYTES_PER_SEGMENT, 0);
    gl.vertexAttribDivisor(0, 1);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(
      1,
      3,
      gl.FLOAT,
      false,
      BYTES_PER_SEGMENT,
      3 * Float32Array.BYTES_PER_ELEMENT,
    );
    gl.vertexAttribDivisor(1, 1);
  }

  private initializeModulationTexture(
    gl: WebGL2RenderingContext,
    resources: AdaptiveVisualResources,
  ): void {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, resources.modulationTexture);
    gl.texSubImage2D(
      gl.TEXTURE_2D,
      0,
      0,
      0,
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 255]),
    );
  }

  private validateRenderTargets(
    gl: WebGL2RenderingContext,
    resources: AdaptiveVisualResources,
  ): void {
    const previousFramebuffer = gl.getParameter(
      gl.FRAMEBUFFER_BINDING,
    ) as WebGLFramebuffer | null;
    try {
      const targets: readonly RenderTarget[] = [
        ...resources.feedback,
        ...resources.bloom,
      ];
      for (const target of targets) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
          throw new Error(
            `Adaptive visual framebuffer is incomplete after allocation or resize (0x${status.toString(16)}).`,
          );
        }
      }
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
    }
  }

  private clearAllocatedTargets(
    gl: WebGL2RenderingContext,
    resources: AdaptiveVisualResources,
  ): void {
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.clearColor(0, 0, 0, 1);
    for (const target of resources.feedback) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, resources.width, resources.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    const bloomWidth = Math.max(1, Math.ceil(resources.width / 2));
    const bloomHeight = Math.max(1, Math.ceil(resources.height / 2));
    for (const target of resources.bloom) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
      gl.viewport(0, 0, bloomWidth, bloomHeight);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
  }

  private resetGlState(gl: WebGL2RenderingContext): void {
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.SCISSOR_TEST);
    gl.colorMask(true, true, true, true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.useProgram(null);
  }
}
