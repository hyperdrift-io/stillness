import { smoothValue } from '../resonance/smoothing.ts';
import type { SessionRenderFrame } from '../experience/model.ts';
import type { MirrorPoint } from '../sensing/mirror-signal.ts';

const FEATURE_PATHS = [
  [33, 7, 163, 144, 145, 153, 154, 155, 133],
  [263, 249, 390, 373, 374, 380, 381, 382, 362],
  [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
  [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
] as const;

type RenderValues = {
  turbulence: number;
  coherence: number;
  relief: number;
  readiness: number;
};

export class SoulMirrorRenderer {
  private context: CanvasRenderingContext2D | null = null;
  private frameHandle = 0;
  private running = false;
  private lastFrame = 0;
  private target: SessionRenderFrame | null = null;
  private values: RenderValues = {
    turbulence: 0.7,
    coherence: 0.3,
    relief: 0,
    readiness: 0,
  };
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly canvas: HTMLCanvasElement) {}

  start(): void {
    if (this.running) return;
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This device cannot create the soul mirror.');
    this.context = context;
    this.running = true;
    this.lastFrame = performance.now();
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.resize();
    this.frameHandle = requestAnimationFrame(this.render);
  }

  update(frame: SessionRenderFrame): void {
    this.target = frame;
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.context = null;
    this.target = null;
  }

  private resize = (): void => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.reducedMotionQuery.matches ? 1 : 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  };

  private render = (now: number): void => {
    if (!this.running) return;
    const context = this.context;
    if (!context) return;

    const deltaSeconds = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1_000));
    this.lastFrame = now;
    const frame = this.target;
    if (frame) {
      this.values.turbulence = smoothValue(this.values.turbulence, frame.relief.turbulence, deltaSeconds, 1.1);
      this.values.coherence = smoothValue(this.values.coherence, frame.resonance.coherence, deltaSeconds, 1.4);
      this.values.relief = smoothValue(this.values.relief, frame.relief.relief, deltaSeconds, 1.6);
      this.values.readiness = smoothValue(this.values.readiness, frame.relief.readiness, deltaSeconds, 2);
    }

    this.drawBackground(context, now);
    if (frame?.mirror.topology) {
      this.drawTopology(context, frame.mirror.topology.points, now);
    } else {
      this.drawPurePresence(context, now);
    }

    this.frameHandle = requestAnimationFrame(this.render);
  };

  private drawBackground(context: CanvasRenderingContext2D, now: number): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(width, height) * 0.72;
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, `rgba(255, 221, 166, ${0.05 + this.values.relief * 0.08})`);
    gradient.addColorStop(0.34, `rgba(70, 82, 150, ${0.08 + this.values.coherence * 0.1})`);
    gradient.addColorStop(1, 'rgb(3, 4, 7)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    const breath = Math.sin(now * 0.00055) * 0.5 + 0.5;
    context.globalAlpha = 0.08 + this.values.readiness * 0.14;
    context.strokeStyle = 'rgb(255, 211, 152)';
    context.lineWidth = Math.max(1, width * 0.001);
    context.beginPath();
    context.arc(centerX, centerY, radius * (0.12 + breath * 0.03 + this.values.relief * 0.05), 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
  }

  private drawTopology(context: CanvasRenderingContext2D, points: MirrorPoint[], now: number): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const scale = Math.min(width, height) * (0.78 + this.values.relief * 0.08);
    const jitter = this.reducedMotionQuery.matches ? 0 : this.values.turbulence * 5;
    context.save();
    context.translate(width / 2, height / 2);
    context.globalCompositeOperation = 'lighter';

    for (const path of FEATURE_PATHS) {
      context.beginPath();
      path.forEach((index, pathIndex) => {
        const point = points[index];
        if (!point) return;
        const phase = now * 0.0012 + index * 0.37;
        const x = point.x * scale + Math.sin(phase) * jitter;
        const y = point.y * scale + Math.cos(phase * 0.8) * jitter;
        if (pathIndex === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = `rgba(255, 224, 180, ${0.08 + this.values.coherence * 0.34})`;
      context.lineWidth = Math.max(1, width * (0.0009 + this.values.readiness * 0.0007));
      context.shadowColor = 'rgba(255, 196, 126, 0.42)';
      context.shadowBlur = 18 + this.values.relief * 28;
      context.stroke();
    }

    context.fillStyle = `rgba(167, 199, 255, ${0.04 + this.values.relief * 0.08})`;
    const stride = this.values.coherence > 0.68 ? 12 : 8;
    for (let index = 0; index < points.length; index += stride) {
      const point = points[index];
      if (!point) continue;
      const size = 1.2 + this.values.readiness * 2.2;
      context.beginPath();
      context.arc(point.x * scale, point.y * scale, size, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }

  private drawPurePresence(context: CanvasRenderingContext2D, now: number): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const count = this.reducedMotionQuery.matches ? 18 : 42;
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399 + now * 0.00008;
      const radius = Math.min(width, height) * (0.08 + index / count * 0.34);
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      context.fillStyle = `rgba(255, 211, 132, ${0.025 + this.values.relief * 0.045})`;
      context.beginPath();
      context.arc(x, y, 1.5 + this.values.readiness * 2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.frameHandle);
      return;
    }
    this.lastFrame = performance.now();
    this.frameHandle = requestAnimationFrame(this.render);
  };
}
