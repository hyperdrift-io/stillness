import { clamp01 } from '../experience/model.ts';
import {
  createFaceLandmarkerClient,
  type FaceLandmarkerClient,
  type FaceLandmarkerResult,
} from './face-landmarker-client.ts';
import {
  initialMirrorSignal,
  type MirrorPoint,
  type MirrorSignal,
  type MirrorTopology,
} from './mirror-signal.ts';

const SAMPLE_INTERVAL_MS = 66;
const ANALYSIS_WIDTH = 80;
const ANALYSIS_HEIGHT = 60;

export class MirrorSignalAdapter {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private frame = 0;
  private analysisCanvas: HTMLCanvasElement | null = null;
  private analysisContext: CanvasRenderingContext2D | null = null;
  private previousLuminance: Uint8Array | null = null;
  private previousBlendshapes = new Map<string, number>();
  private previousCenter: { x: number; y: number; scale: number } | null = null;
  private landmarker: FaceLandmarkerClient | null = null;
  private latest: MirrorSignal = { ...initialMirrorSignal, mode: 'mirror' };
  private lastSampleTime = 0;
  private loading: Promise<FaceLandmarkerClient> | null = null;

  async start(): Promise<boolean> {
    if (this.stream) return true;
    if (!navigator.mediaDevices?.getUserMedia) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
      });
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      this.stream = stream;
      this.video = video;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = ANALYSIS_WIDTH;
      canvas.height = ANALYSIS_HEIGHT;
      this.analysisCanvas = canvas;
      this.analysisContext = canvas.getContext('2d', { willReadFrequently: true });
      const loading = createFaceLandmarkerClient();
      this.loading = loading;
      loading
        .then((client) => {
          if (this.loading === loading && this.stream) {
            this.landmarker = client;
            return;
          }
          client.dispose();
        })
        .catch(() => {
          this.landmarker = null;
        });
      this.frame = requestAnimationFrame(this.sample);
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  read(): MirrorSignal {
    return {
      ...this.latest,
      topology: this.latest.topology
        ? { ...this.latest.topology, points: [...this.latest.topology.points] }
        : null,
    };
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.landmarker?.dispose();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
    this.stream = null;
    this.video = null;
    this.analysisCanvas = null;
    this.analysisContext = null;
    this.previousLuminance = null;
    this.previousBlendshapes.clear();
    this.previousCenter = null;
    this.landmarker = null;
    this.loading = null;
    this.latest = { ...initialMirrorSignal, mode: 'mirror' };
  }

  private sample = (timestamp: number): void => {
    const video = this.video;
    if (!video) return;
    if (
      timestamp - this.lastSampleTime >= SAMPLE_INTERVAL_MS &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      this.lastSampleTime = timestamp;
      this.latest = this.analyse(video, timestamp);
    }
    this.frame = requestAnimationFrame(this.sample);
  };

  private analyse(video: HTMLVideoElement, timestamp: number): MirrorSignal {
    const frameFeatures = this.analyseFrameMotion(video);
    const result = this.landmarker?.detect(video, timestamp);
    if (!result || result.faceLandmarks.length === 0) {
      return {
        mode: 'mirror',
        motion: frameFeatures.motion,
        presence: frameFeatures.presence,
        confidence: frameFeatures.confidence,
        luminance: frameFeatures.luminance,
        expressionActivity: 0,
        softness: 0,
        topology: null,
      };
    }

    const topology = this.createTopology(result);
    const expressionActivity = this.measureExpressionActivity(result);
    const headMotion = this.measureHeadMotion(topology);
    const motion = clamp01(frameFeatures.motion * 0.42 + headMotion * 0.38 + expressionActivity * 0.2);
    const confidence = clamp01(frameFeatures.confidence * 0.35 + 0.65);

    return {
      mode: 'mirror',
      motion,
      presence: 1,
      confidence,
      luminance: frameFeatures.luminance,
      expressionActivity,
      softness: clamp01(1 - expressionActivity * 1.4 - headMotion * 0.8),
      topology,
    };
  }

  private analyseFrameMotion(
    video: HTMLVideoElement,
  ): Pick<MirrorSignal, 'motion' | 'presence' | 'confidence' | 'luminance'> {
    const canvas = this.analysisCanvas;
    const context = this.analysisContext;
    if (!canvas || !context) {
      return { motion: 0, presence: 0, confidence: 0, luminance: 0 };
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const luminance = new Uint8Array(canvas.width * canvas.height);
    let sum = 0;
    let sumSquares = 0;
    let difference = 0;

    for (let pixel = 0; pixel < luminance.length; pixel += 1) {
      const offset = pixel * 4;
      const value = Math.round(
        (pixels[offset] ?? 0) * 0.2126 +
          (pixels[offset + 1] ?? 0) * 0.7152 +
          (pixels[offset + 2] ?? 0) * 0.0722,
      );
      luminance[pixel] = value;
      sum += value;
      sumSquares += value * value;
      if (this.previousLuminance) difference += Math.abs(value - (this.previousLuminance[pixel] ?? value));
    }

    const mean = sum / luminance.length / 255;
    const variance = Math.max(0, sumSquares / luminance.length / (255 * 255) - mean * mean);
    const motion = this.previousLuminance ? clamp01((difference / luminance.length / 255) * 4.5) : 0;
    const exposureConfidence = clamp01(1 - Math.abs(mean - 0.48) * 1.8);
    const detailConfidence = clamp01(variance * 18);
    this.previousLuminance = luminance;

    return {
      motion,
      presence: clamp01(exposureConfidence * 0.45 + detailConfidence * 0.55),
      confidence: exposureConfidence * (0.35 + detailConfidence * 0.65),
      luminance: mean,
    };
  }

  private createTopology(result: FaceLandmarkerResult): MirrorTopology {
    const landmarks = result.faceLandmarks[0] ?? [];
    const points: MirrorPoint[] = landmarks.map((point) => ({
      x: point.x * 2 - 1,
      y: 1 - point.y * 2,
      z: point.z ?? 0,
    }));
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const scale = Math.max(0.01, Math.max(maxX - minX, maxY - minY));
    const matrix = result.facialTransformationMatrixes[0]?.data ?? [];

    return {
      points,
      centerX,
      centerY,
      scale,
      yaw: Number(matrix[8] ?? 0),
      pitch: Number(matrix[9] ?? 0),
      roll: Number(matrix[1] ?? 0),
    };
  }

  private measureExpressionActivity(result: FaceLandmarkerResult): number {
    const categories = result.faceBlendshapes[0]?.categories ?? [];
    if (categories.length === 0) return 0;
    let total = 0;
    let count = 0;
    for (const category of categories) {
      const name = category.categoryName;
      const score = clamp01(category.score);
      const previous = this.previousBlendshapes.get(name) ?? score;
      total += Math.abs(score - previous);
      count += 1;
      this.previousBlendshapes.set(name, score);
    }
    return clamp01((total / Math.max(1, count)) * 12);
  }

  private measureHeadMotion(topology: MirrorTopology): number {
    const previous = this.previousCenter;
    this.previousCenter = {
      x: topology.centerX,
      y: topology.centerY,
      scale: topology.scale,
    };
    if (!previous) return 0;
    const translation = Math.hypot(topology.centerX - previous.x, topology.centerY - previous.y);
    const scaleChange = Math.abs(topology.scale - previous.scale);
    return clamp01(translation * 5 + scaleChange * 2);
  }
}
