import type { SessionRenderFrame } from '../experience/model.ts';
import type { PerceptionModulationFrame } from '../sensing/perception-worker-protocol.ts';
import type { AdaptiveScene } from '../state/adaptive-state.ts';
import { AdaptiveVisualCore } from './adaptive-visual-core.ts';
import type {
  AdaptiveVisualControlFrame,
  RendererMetrics,
  RequestedRendererQuality,
} from './adaptive-visual-state.ts';

const MAX_LEGACY_TOPOLOGY_SEGMENTS = 4_096;
const AUTOMATIC_VARIATION_INTERVAL_MS = 18_000;
const neutralPalette = {
  shadow: [0, 0, 0] as const,
  mid: [0.035, 0.055, 0.11] as const,
  light: [0.58, 0.72, 0.92] as const,
  confidence: 0,
};

function clamp(value: number, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function clamp01(value: number, fallback = 0): number {
  return clamp(value, 0, 1, fallback);
}

function clampSigned(value: number): number {
  return clamp(value, -1, 1, 0);
}

function isAdaptiveVisualFrame(
  frame: AdaptiveVisualControlFrame | SessionRenderFrame,
): frame is AdaptiveVisualControlFrame {
  return 'scene' in frame && 'topologySegments' in frame;
}

function sceneForProgress(progress: number): AdaptiveScene {
  if (progress < 0.18) return 'turbulence';
  if (progress < 0.38) return 'gathering';
  if (progress < 0.6) return 'coherence';
  if (progress < 0.82) return 'release';
  return 'radiance';
}

function sceneStart(scene: AdaptiveScene): number {
  if (scene === 'gathering') return 0.18;
  if (scene === 'coherence') return 0.38;
  if (scene === 'release') return 0.6;
  if (scene === 'radiance') return 0.82;
  return 0;
}

function dprCap(quality: RequestedRendererQuality, reducedMotion: boolean): number {
  if (reducedMotion || quality === 'reduced') return 1;
  if (quality === 'high') return 2;
  return 1.5;
}

export class SoulMirrorRenderer {
  private core: AdaptiveVisualCore | null = null;
  private target: AdaptiveVisualControlFrame | null = null;
  private frameHandle = 0;
  private running = false;
  private contextLost = false;
  private listenersAttached = false;
  private reducedMotionQuery: MediaQueryList | null = null;
  private variationSeed = 0;
  private automaticVariation = true;
  private variationStartedAt = 0;
  private metrics: RendererMetrics = {
    fps: 0,
    frameTimeMs: 0,
    quality: 'balanced',
  };

  constructor(private readonly canvas: HTMLCanvasElement) {}

  start(): void {
    if (this.running) return;

    const core = this.core ?? new AdaptiveVisualCore(this.canvas);
    try {
      core.start();
      this.core = core;
      this.running = true;
      this.contextLost = false;
      this.attachListeners();
      this.resize();
      this.pushTargetToCore();
      this.requestNextFrame();
    } catch (error) {
      core.dispose();
      this.core = null;
      this.running = false;
      this.detachListeners();
      throw error;
    }
  }

  update(frame: AdaptiveVisualControlFrame | SessionRenderFrame): void {
    const previousScene = this.target?.scene;
    this.target = isAdaptiveVisualFrame(frame)
      ? frame
      : this.mapLegacyFrame(frame);
    if (previousScene !== this.target.scene) this.variationStartedAt = performance.now();
    this.pushTargetToCore();
  }

  setVariation(seed: number, automatic: boolean): void {
    this.variationSeed = Number.isFinite(seed) ? Math.trunc(seed) : 0;
    this.automaticVariation = automatic;
    this.variationStartedAt = performance.now();
    this.pushTargetToCore();
  }

  /**
   * Uploads analysis modulation synchronously when the core is live. Neither
   * wrapper nor core retains or closes the bitmap; caller ownership continues
   * after this method and the bitmap may be closed immediately on return.
   */
  setModulation(modulation: ImageBitmap | PerceptionModulationFrame): void {
    if (!this.running || this.contextLost || !this.core) return;
    const bitmap = 'bitmap' in modulation ? modulation.bitmap : modulation;
    this.core.setModulation(bitmap);
  }

  getMetrics(): RendererMetrics {
    return { ...this.metrics };
  }

  dispose(): void {
    this.running = false;
    this.contextLost = false;
    this.cancelScheduledFrame();
    this.detachListeners();
    this.core?.dispose();
    this.core = null;
    this.target = null;
    this.metrics = {
      fps: 0,
      frameTimeMs: 0,
      quality: 'balanced',
    };
  }

  private resize = (): void => {
    const core = this.core;
    if (!this.running || this.contextLost || !core) return;
    const width = Math.max(1, this.canvas.clientWidth || this.canvas.width || 1);
    const height = Math.max(1, this.canvas.clientHeight || this.canvas.height || 1);
    const reducedMotion = this.prefersReducedMotion();
    const quality = this.target?.requestedQuality ?? 'auto';
    const devicePixelRatio = Number.isFinite(window.devicePixelRatio)
      ? Math.max(1, window.devicePixelRatio)
      : 1;
    core.resize(
      width,
      height,
      Math.min(devicePixelRatio, dprCap(quality, reducedMotion)),
    );
  };

  private render = (nowMs: number): void => {
    this.frameHandle = 0;
    if (!this.running || this.contextLost || document.hidden || !this.core) return;
    try {
      this.metrics = this.core.render(nowMs);
    } catch (error) {
      this.fail(error);
      return;
    }
    this.requestNextFrame();
  };

  private pushTargetToCore(): void {
    if (!this.running || this.contextLost || !this.core || !this.target) return;
    const elapsed = Math.max(0, performance.now() - this.variationStartedAt);
    const automaticOffset = this.automaticVariation
      ? Math.floor(elapsed / AUTOMATIC_VARIATION_INTERVAL_MS)
      : 0;
    this.core.update({
      ...this.target,
      variationSeed: this.variationSeed + automaticOffset,
      reducedMotion: this.target.reducedMotion || this.prefersReducedMotion(),
    });
  }

  private prefersReducedMotion(): boolean {
    return this.reducedMotionQuery?.matches ?? false;
  }

  private attachListeners(): void {
    if (this.listenersAttached) return;
    this.reducedMotionQuery ??= window.matchMedia('(prefers-reduced-motion: reduce)');
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.reducedMotionQuery.addEventListener('change', this.onReducedMotionChange);
    this.listenersAttached = true;
  }

  private detachListeners(): void {
    if (!this.listenersAttached) return;
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
    this.reducedMotionQuery?.removeEventListener('change', this.onReducedMotionChange);
    this.listenersAttached = false;
    this.reducedMotionQuery = null;
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      this.cancelScheduledFrame();
      return;
    }
    this.requestNextFrame();
  };

  private onReducedMotionChange = (): void => {
    this.pushTargetToCore();
    this.resize();
  };

  private onContextLost = (event: Event): void => {
    event.preventDefault();
    if (!this.running || this.contextLost) return;
    this.contextLost = true;
    this.cancelScheduledFrame();
    this.core?.dispose();
  };

  private onContextRestored = (): void => {
    if (!this.running || !this.contextLost) return;
    try {
      this.core ??= new AdaptiveVisualCore(this.canvas);
      this.core.start();
      this.contextLost = false;
      this.resize();
      this.pushTargetToCore();
      this.requestNextFrame();
    } catch (error) {
      this.fail(error);
    }
  };

  private requestNextFrame(): void {
    if (
      !this.running
      || this.contextLost
      || document.hidden
      || this.frameHandle !== 0
    ) return;
    this.frameHandle = requestAnimationFrame(this.render);
  }

  private cancelScheduledFrame(): void {
    if (this.frameHandle !== 0) cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
  }

  private fail(error: unknown): void {
    this.running = false;
    this.contextLost = false;
    this.cancelScheduledFrame();
    this.detachListeners();
    this.core?.dispose();
    this.core = null;
    const failure = error instanceof Error ? error : new Error(String(error));
    console.error('Relief visual field stopped after a rendering error.', failure);
  }

  /**
   * Temporary Task 8 compatibility boundary. This is the only path from the
   * legacy SessionRenderFrame into the adaptive renderer, and it never forwards
   * `mirror.sourceVideo` or any other raw camera pixels.
   */
  private mapLegacyFrame(frame: SessionRenderFrame): AdaptiveVisualControlFrame {
    const relief = frame.relief;
    const mirror = frame.mirror;
    const coherence = clamp01(frame.resonance.coherence, 0.5);
    const progress = clamp01(
      clamp01(relief.relief) * 0.46
        + clamp01(relief.readiness) * 0.28
        + clamp01(relief.settling) * 0.16
        + coherence * 0.1
        - clamp01(relief.turbulence) * 0.08,
    );
    const scene = sceneForProgress(progress);
    const sceneMix = scene === 'turbulence'
      ? 1
      : clamp01((progress - sceneStart(scene)) / 0.08);

    const topology = mirror.topology;
    const packed = new Float32Array(
      Math.min(topology?.connections.length ?? 0, MAX_LEGACY_TOPOLOGY_SEGMENTS) * 6,
    );
    let offset = 0;
    if (topology) {
      const connectionCount = Math.min(
        topology.connections.length,
        MAX_LEGACY_TOPOLOGY_SEGMENTS,
      );
      for (let index = 0; index < connectionCount; index += 1) {
        const connection = topology.connections[index];
        if (!connection) continue;
        const start = topology.points[connection.start];
        const end = topology.points[connection.end];
        if (
          !start
          || !end
          || !Number.isFinite(start.x)
          || !Number.isFinite(start.y)
          || !Number.isFinite(start.z)
          || !Number.isFinite(end.x)
          || !Number.isFinite(end.y)
          || !Number.isFinite(end.z)
        ) continue;
        // Legacy topology is clip-space. Convert back to normalized landmark
        // coordinates expected by the adaptive face ribbon shader.
        packed[offset] = clamp01((start.x + 1) * 0.5);
        packed[offset + 1] = clamp01((1 - start.y) * 0.5);
        packed[offset + 2] = clampSigned(start.z);
        packed[offset + 3] = clamp01((end.x + 1) * 0.5);
        packed[offset + 4] = clamp01((1 - end.y) * 0.5);
        packed[offset + 5] = clampSigned(end.z);
        offset += 6;
      }
    }

    const expression = mirror.expression;
    return {
      scene,
      sceneMix,
      progress,
      movementEnergy: clamp01(Math.max(relief.motion, mirror.motion)),
      movementX: 0,
      movementY: 0,
      facialTension: clamp01(expression.browTension),
      facialWarmth: clamp01(
        clamp01(expression.mouthSmile) * 0.65 + clamp01(relief.softness, 0.5) * 0.35,
      ),
      expressiveActivation: clamp01(Math.max(
        relief.expressionActivity,
        mirror.expressionActivity,
        expression.activity,
        expression.mouthOpen,
      )),
      breathPhase: 0,
      breathConfidence: 0,
      coherence,
      palette: neutralPalette,
      topologySegments: offset === packed.length ? packed : packed.slice(0, offset),
      colorInfluence: 0.2,
      visualIntensity: 1,
      transitionSeconds: 4.5,
      requestedQuality: 'auto',
      variationSeed: this.variationSeed,
      reducedMotion: false,
    };
  }
}
