import { smoothValue } from '../resonance/smoothing.ts';
import type { SessionRenderFrame } from '../experience/model.ts';
import type { MirrorPoint } from '../sensing/mirror-signal.ts';

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const TOPOLOGY_STRIDE = 7;

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
    this.frameHandle = 0;
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

    const visualNow = this.reducedMotionQuery.matches ? 0 : now;
    this.drawBackground(context, visualNow);
    if (frame?.mirror.topology) {
      this.drawTopology(context, frame.mirror.topology.points, visualNow);
    } else {
      this.drawPurePresence(context, visualNow);
    }

    this.requestNextFrame();
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
    const scale = Math.min(width, height) * (0.58 + this.values.relief * 0.08);
    const reducedMotion = this.reducedMotionQuery.matches;
    const glow = 14 + this.values.relief * 30;
    const aggregate = this.readTopologyField(points);
    context.save();
    context.translate(width / 2, height / 2);
    context.globalCompositeOperation = 'lighter';

    context.strokeStyle = `rgba(255, 224, 180, ${0.045 + this.values.coherence * 0.13})`;
    context.lineWidth = Math.max(1, width * 0.0008);
    context.shadowColor = 'rgba(255, 196, 126, 0.32)';
    context.shadowBlur = glow;
    for (let ring = 0; ring < 5; ring += 1) {
      const radius = scale * (0.14 + ring * 0.075 + aggregate.spread * 0.11 + this.values.relief * 0.035);
      const sweep = Math.PI * (0.52 + aggregate.symmetry * 0.5 + ring * 0.035);
      const drift = reducedMotion ? 0 : now * 0.000055 * (ring + 1);
      const start = aggregate.tilt + ring * 1.73 + drift;
      context.beginPath();
      context.arc(0, 0, radius, start, start + sweep);
      context.stroke();
    }

    context.shadowBlur = glow * 0.6;
    for (let index = 0; index < points.length; index += TOPOLOGY_STRIDE) {
      const point = points[index];
      if (!point) continue;
      const sample = this.toConstellationPoint(point, index, scale, now, aggregate);
      const size = 1.1 + this.values.readiness * 2.1 + sample.brightness * 0.9;
      context.fillStyle = `rgba(167, 199, 255, ${0.035 + this.values.relief * 0.07 + sample.brightness * 0.05})`;
      context.beginPath();
      context.arc(sample.x, sample.y, size, 0, Math.PI * 2);
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

  private readTopologyField(points: MirrorPoint[]): { spread: number; symmetry: number; tilt: number } {
    if (points.length === 0) {
      return { spread: 0.4, symmetry: 0.5, tilt: 0 };
    }

    let spread = 0;
    let symmetry = 0;
    let tilt = 0;
    for (let index = 0; index < points.length; index += TOPOLOGY_STRIDE) {
      const point = points[index];
      if (!point) continue;
      spread += Math.hypot(point.x, point.y);
      symmetry += 1 - Math.min(1, Math.abs(point.x) * 2);
      tilt += Math.atan2(point.y, point.x) * 0.01;
    }

    const sampleCount = Math.max(1, Math.ceil(points.length / TOPOLOGY_STRIDE));
    return {
      spread: Math.min(1, Math.max(0, spread / sampleCount)),
      symmetry: Math.min(1, Math.max(0, symmetry / sampleCount)),
      tilt,
    };
  }

  private toConstellationPoint(
    point: MirrorPoint,
    index: number,
    scale: number,
    now: number,
    aggregate: { spread: number; symmetry: number; tilt: number },
  ): { x: number; y: number; brightness: number } {
    const sourceRadius = Math.min(1, Math.hypot(point.x, point.y));
    const sourceAngle = Math.atan2(point.y, point.x);
    const seed = Math.sin((index + 1) * 12.9898 + point.z * 78.233) * 43_758.5453;
    const variance = seed - Math.floor(seed);
    const ring = (index % 37) / 37;
    const motion = this.reducedMotionQuery.matches ? 0 : now * 0.000045 * (0.5 + variance);
    const angle = index * GOLDEN_ANGLE + sourceAngle * 0.13 + aggregate.tilt + motion;
    const radius = scale * (0.08 + ring * 0.42 + sourceRadius * 0.12 + aggregate.spread * 0.08);
    const warp = scale * (variance - 0.5) * (0.08 + this.values.turbulence * 0.04);
    return {
      x: Math.cos(angle) * radius + Math.sin(angle * 2.1) * warp,
      y: Math.sin(angle) * radius + Math.cos(angle * 1.7) * warp * (0.7 + aggregate.symmetry * 0.4),
      brightness: variance,
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
