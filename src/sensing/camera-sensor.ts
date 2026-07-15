import { clamp01 } from '../experience/model.ts';

export type CameraObservation = {
  motion: number;
  presence: number;
  confidence: number;
  luminance: number;
};

const initialObservation: CameraObservation = {
  motion: 0,
  presence: 0,
  confidence: 0,
  luminance: 0,
};

export class CameraSensor {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private animationFrame = 0;
  private analysisCanvas: HTMLCanvasElement | null = null;
  private analysisContext: CanvasRenderingContext2D | null = null;
  private previousLuminance: Uint8Array | null = null;
  private latest = { ...initialObservation };
  private lastSampleTime = 0;

  async start(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15, max: 24 },
        },
      });
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      const analysisCanvas = document.createElement('canvas');
      analysisCanvas.width = 64;
      analysisCanvas.height = 48;
      this.stream = stream;
      this.video = video;
      this.analysisCanvas = analysisCanvas;
      this.analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
      this.animationFrame = requestAnimationFrame(this.sample);
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  read(): CameraObservation {
    return { ...this.latest };
  }

  stop(): void {
    cancelAnimationFrame(this.animationFrame);
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
    this.latest = { ...initialObservation };
  }

  private sample = (timestamp: number): void => {
    const video = this.video;
    if (!video) return;
    if (timestamp - this.lastSampleTime >= 100 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.lastSampleTime = timestamp;
      this.latest = this.analyseFrame(video);
    }
    this.animationFrame = requestAnimationFrame(this.sample);
  };

  private analyseFrame(video: HTMLVideoElement): CameraObservation {
    const canvas = this.analysisCanvas;
    const context = this.analysisContext;
    const width = canvas?.width ?? 64;
    const height = canvas?.height ?? 48;
    if (!context) return { ...initialObservation };
    context.drawImage(video, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const luminance = new Uint8Array(width * height);
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
    const motion = this.previousLuminance
      ? clamp01((difference / luminance.length / 255) * 4.5)
      : 0;
    const exposureConfidence = clamp01(1 - Math.abs(mean - 0.48) * 1.8);
    const detailConfidence = clamp01(variance * 18);
    const confidence = exposureConfidence * (0.35 + detailConfidence * 0.65);
    this.previousLuminance = luminance;

    return {
      motion,
      presence: clamp01(exposureConfidence * 0.45 + detailConfidence * 0.55),
      confidence,
      luminance: mean,
    };
  }
}
