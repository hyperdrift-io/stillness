import {
  initialPerceptionSnapshot,
  type PerceptionSnapshot,
} from './perception-signal.ts';
import type { PerceptionModulationFrame } from './perception-worker-protocol.ts';
import {
  PerceptionFrameAnalysisError,
  PerceptionFrameSupersededError,
  PerceptionWorkerClient,
} from './perception-worker-client.ts';

const INITIAL_ANALYSIS_INTERVAL_MS = 66;
const MIN_ANALYSIS_INTERVAL_MS = 42;
const MAX_ANALYSIS_INTERVAL_MS = 66;
const MAX_CONSECUTIVE_ANALYSIS_FAILURES = 3;
const WORKER_RESTART_BASE_DELAY_MS = 400;
const WORKER_RESTART_MAX_DELAY_MS = 5_000;

function cloneSnapshot(snapshot: PerceptionSnapshot): PerceptionSnapshot {
  return {
    ...snapshot,
    facial: { ...snapshot.facial },
    motion: { ...snapshot.motion },
    shoulders: { ...snapshot.shoulders },
    palette: {
      ...snapshot.palette,
      shadow: [...snapshot.palette.shadow],
      mid: [...snapshot.palette.mid],
      light: [...snapshot.palette.light],
    },
    topologySegments: snapshot.topologySegments.slice(),
  };
}

export class PerceptionAdapter {
  private stream: MediaStream | null = null;
  private activeVideoTrack: MediaStreamTrack | null = null;
  private video: HTMLVideoElement | null = null;
  private pendingStream: MediaStream | null = null;
  private pendingVideo: HTMLVideoElement | null = null;
  private workerClient: PerceptionWorkerClient | null = null;
  private starting: Promise<boolean> | null = null;
  private latest = cloneSnapshot(initialPerceptionSnapshot);
  private latestModulation: PerceptionModulationFrame | null = null;
  private generation = 0;
  private lastCaptureTime = 0;
  private analysisIntervalMs = INITIAL_ANALYSIS_INTERVAL_MS;
  private rollingAnalysisDurationMs = INITIAL_ANALYSIS_INTERVAL_MS;
  private capturePending = false;
  private videoFrameHandle: number | null = null;
  private animationFrameHandle: number | null = null;
  private visibilityListening = false;
  private availabilityListener: ((available: boolean) => void) | null = null;
  private consecutiveAnalysisFailures = 0;
  private workerRestartAttempts = 0;
  private workerRestarting = false;
  private workerRestartTimer: ReturnType<typeof globalThis.setTimeout> | null = null;

  setAvailabilityListener(listener: ((available: boolean) => void) | null): void {
    this.availabilityListener = listener;
  }

  start(): Promise<boolean> {
    if (this.starting) return this.starting;
    if (this.stream && this.video) return Promise.resolve(true);
    if (this.stream || this.video || this.workerClient) this.stop();

    let starting: Promise<boolean>;
    starting = this.startInternal().finally(() => {
      if (this.starting === starting) this.starting = null;
    });
    this.starting = starting;
    return starting;
  }

  read(): PerceptionSnapshot {
    return cloneSnapshot(this.latest);
  }

  takeModulationFrame(): PerceptionModulationFrame | null {
    const frame = this.latestModulation;
    this.latestModulation = null;
    return frame;
  }

  stop(): void {
    this.generation += 1;
    this.starting = null;
    this.cancelScheduledFrame();
    if (this.workerRestartTimer !== null) {
      globalThis.clearTimeout(this.workerRestartTimer);
      this.workerRestartTimer = null;
    }
    if (this.visibilityListening) {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityListening = false;
    }

    this.workerClient?.dispose();
    this.workerClient = null;
    this.activeVideoTrack?.removeEventListener('ended', this.handleVideoTrackEnded);
    this.activeVideoTrack = null;
    this.latestModulation?.bitmap.close();
    this.latestModulation = null;
    const pendingStream = this.pendingStream;
    const pendingVideo = this.pendingVideo;
    this.pendingStream = null;
    this.pendingVideo = null;
    this.clearMedia(pendingStream, pendingVideo);
    this.clearMedia(this.stream, this.video);
    this.stream = null;
    this.video = null;
    this.capturePending = false;
    this.lastCaptureTime = 0;
    this.analysisIntervalMs = INITIAL_ANALYSIS_INTERVAL_MS;
    this.rollingAnalysisDurationMs = INITIAL_ANALYSIS_INTERVAL_MS;
    this.consecutiveAnalysisFailures = 0;
    this.workerRestartAttempts = 0;
    this.workerRestarting = false;
    this.latest = cloneSnapshot(initialPerceptionSnapshot);
  }

  private async startInternal(): Promise<boolean> {
    if (!navigator.mediaDevices?.getUserMedia) return false;

    const generation = this.generation + 1;
    this.generation = generation;
    const workerClient = this.createWorkerClient(generation);
    this.workerClient = workerClient;
    let startupStream: MediaStream | null = null;
    let startupVideo: HTMLVideoElement | null = null;

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
      startupStream = stream;
      if (this.generation !== generation || this.workerClient !== workerClient) {
        this.releaseStartupMedia(startupStream, startupVideo);
        return false;
      }
      this.pendingStream = stream;

      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      startupVideo = video;
      this.pendingVideo = video;
      await video.play();
      if (
        this.generation !== generation ||
        this.workerClient !== workerClient ||
        this.pendingStream !== stream ||
        this.pendingVideo !== video
      ) {
        this.releaseStartupMedia(startupStream, startupVideo);
        return false;
      }

      this.pendingStream = null;
      this.pendingVideo = null;
      this.stream = stream;
      this.video = video;
      this.activeVideoTrack = stream.getVideoTracks()[0] ?? null;
      this.activeVideoTrack?.addEventListener('ended', this.handleVideoTrackEnded);
      this.lastCaptureTime = 0;
      this.consecutiveAnalysisFailures = 0;
      this.workerRestartAttempts = 0;
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityListening = true;
      this.availabilityListener?.(true);
      this.startWorkerClient(generation, workerClient);
      return true;
    } catch {
      this.releaseStartupMedia(startupStream, startupVideo);
      if (this.generation === generation && this.workerClient === workerClient) this.stop();
      else workerClient.dispose();
      return false;
    }
  }

  private clearMedia(stream: MediaStream | null, video: HTMLVideoElement | null): void {
    for (const track of stream?.getTracks() ?? []) track.stop();
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }

  private releaseStartupMedia(
    stream: MediaStream | null,
    video: HTMLVideoElement | null,
  ): void {
    if (this.pendingStream === stream) this.pendingStream = null;
    if (this.pendingVideo === video) this.pendingVideo = null;
    this.clearMedia(stream, video);
  }

  private scheduleFrame(generation: number): void {
    const video = this.video;
    if (
      !video
      || !this.workerClient?.isLive()
      || document.hidden
      || this.generation !== generation
    ) return;
    if (typeof video.requestVideoFrameCallback === 'function') {
      this.videoFrameHandle = video.requestVideoFrameCallback((now) => {
        this.videoFrameHandle = null;
        this.handleFrame(now, generation);
      });
      return;
    }

    this.animationFrameHandle = requestAnimationFrame((now) => {
      this.animationFrameHandle = null;
      this.handleFrame(now, generation);
    });
  }

  private handleFrame(now: number, generation: number): void {
    if (this.generation !== generation || document.hidden) return;
    this.scheduleFrame(generation);

    const video = this.video;
    if (
      !video ||
      this.capturePending ||
      this.workerRestarting ||
      now - this.lastCaptureTime < this.analysisIntervalMs ||
      video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA
    ) {
      return;
    }

    this.lastCaptureTime = now;
    this.capturePending = true;
    void createImageBitmap(video)
      .then((frame) => {
        if (this.generation === generation) this.capturePending = false;
        const workerClient = this.workerClient;
        if (
          this.generation !== generation
          || !workerClient?.isLive()
          || document.hidden
        ) {
          frame.close();
          return;
        }

        const analysisStartedAt = performance.now();
        void workerClient.analyse(frame, now)
          .then(({ snapshot, modulation }) => {
            if (this.generation !== generation || this.workerClient !== workerClient) {
              modulation.close();
              return;
            }

            const duration = performance.now() - analysisStartedAt;
            this.rollingAnalysisDurationMs =
              this.rollingAnalysisDurationMs * 0.8 + duration * 0.2;
            this.analysisIntervalMs = Math.min(
              MAX_ANALYSIS_INTERVAL_MS,
              Math.max(MIN_ANALYSIS_INTERVAL_MS, this.rollingAnalysisDurationMs * 1.2),
            );
            this.consecutiveAnalysisFailures = 0;
            this.workerRestartAttempts = 0;
            this.latest = snapshot;
            this.latestModulation?.bitmap.close();
            this.latestModulation = {
              timestampMs: snapshot.timestampMs,
              bitmap: modulation,
            };
          })
          .catch((error: unknown) => {
            if (error instanceof PerceptionFrameSupersededError) return;
            if (this.generation !== generation || this.workerClient !== workerClient) return;
            if (error instanceof PerceptionFrameAnalysisError) {
              this.consecutiveAnalysisFailures += 1;
              if (this.consecutiveAnalysisFailures < MAX_CONSECUTIVE_ANALYSIS_FAILURES) return;
              console.error('Relief face sensing skipped three consecutive frames; restarting.', error);
            }
            this.restartWorker(generation, workerClient);
          });
      })
      .catch(() => {
        if (this.generation === generation) this.capturePending = false;
      });
  }

  private cancelScheduledFrame(): void {
    const video = this.video;
    if (video && this.videoFrameHandle !== null) {
      video.cancelVideoFrameCallback(this.videoFrameHandle);
    }
    if (this.animationFrameHandle !== null) cancelAnimationFrame(this.animationFrameHandle);
    this.videoFrameHandle = null;
    this.animationFrameHandle = null;
  }

  private createWorkerClient(generation: number): PerceptionWorkerClient {
    let workerClient!: PerceptionWorkerClient;
    workerClient = new PerceptionWorkerClient((error) => {
      if (this.generation !== generation || this.workerClient !== workerClient) return;
      if (!this.stream || !this.video) return;
      console.error('Relief face sensing worker stopped; retrying.', error);
      this.restartWorker(generation, workerClient);
    });
    return workerClient;
  }

  private startWorkerClient(
    generation: number,
    workerClient: PerceptionWorkerClient,
  ): void {
    this.workerRestarting = true;
    void workerClient.start()
      .then(() => {
        if (
          this.generation !== generation
          || this.workerClient !== workerClient
          || !this.stream
          || !this.video
        ) {
          workerClient.dispose();
          return;
        }
        this.workerRestarting = false;
        this.workerRestartAttempts = 0;
        this.consecutiveAnalysisFailures = 0;
        this.lastCaptureTime = 0;
        if (!document.hidden) this.scheduleFrame(generation);
        this.availabilityListener?.(true);
      })
      .catch(() => {
        if (this.generation !== generation || this.workerClient !== workerClient) return;
        this.workerRestarting = false;
        this.restartWorker(generation, workerClient);
      });
  }

  private restartWorker(generation: number, failedWorker: PerceptionWorkerClient): void {
    if (
      this.generation !== generation
      || this.workerClient !== failedWorker
      || this.workerRestarting
    ) return;
    this.workerRestartAttempts += 1;
    this.workerRestarting = true;
    this.capturePending = false;
    this.cancelScheduledFrame();
    failedWorker.dispose();
    const delayMs = Math.min(
      WORKER_RESTART_MAX_DELAY_MS,
      WORKER_RESTART_BASE_DELAY_MS * (2 ** Math.min(4, this.workerRestartAttempts - 1)),
    );
    this.workerRestartTimer = globalThis.setTimeout(() => {
      this.workerRestartTimer = null;
      if (
        this.generation !== generation
        || this.workerClient !== failedWorker
        || !this.stream
        || !this.video
      ) return;

      const replacement = this.createWorkerClient(generation);
      this.workerClient = replacement;
      this.workerRestarting = false;
      this.startWorkerClient(generation, replacement);
    }, delayMs);
  }

  private handleVisibilityChange = (): void => {
    this.cancelScheduledFrame();
    if (document.hidden) return;
    this.lastCaptureTime = 0;
    if (this.workerClient?.isLive()) this.scheduleFrame(this.generation);
  };

  private handleVideoTrackEnded = (): void => {
    const wasAvailable = this.stream !== null;
    this.stop();
    if (wasAvailable) this.availabilityListener?.(false);
  };
}
