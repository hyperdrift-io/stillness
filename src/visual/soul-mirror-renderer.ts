import type { PerceptionModulationFrame } from '../sensing/perception-worker-protocol.ts';
import { AdaptiveVisualCore } from './adaptive-visual-core.ts';
import type {
  AdaptiveVisualControlFrame,
  RendererMetrics,
  RequestedRendererQuality,
} from './adaptive-visual-state.ts';

const AUTOMATIC_VARIATION_INTERVAL_MS = 18_000;

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

  update(frame: AdaptiveVisualControlFrame): void {
    const previousScene = this.target?.scene;
    this.target = frame;
    if (previousScene !== frame.scene) this.variationStartedAt = performance.now();
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
}
