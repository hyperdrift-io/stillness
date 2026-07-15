import { clamp01, type RegulationPhase, type StateEstimate } from './model.ts';
import { phaseForElapsed } from './phase-policy.ts';
import { targetResonance, type ResonanceState } from '../resonance/resonance.ts';
import { FeatureWindow } from '../sensing/feature-window.ts';
import type { CameraObservation } from '../sensing/camera-sensor.ts';
import type { MotionObservation } from '../sensing/motion-sensor.ts';
import type { PersonalBaseline } from '../state/baseline-store.ts';
import { estimateState } from '../state/state-estimator.ts';

type RendererPort = {
  start: () => void;
  update: (state: ResonanceState) => void;
  dispose: () => void;
};

type AudioPort = {
  start: () => Promise<void>;
  update: (state: ResonanceState, elapsedSeconds: number) => void;
  suspend: () => Promise<void>;
  resume: () => Promise<void>;
  dispose: () => void;
};

type CameraPort = {
  start: () => Promise<boolean>;
  read: () => CameraObservation;
  stop: () => void;
};

type MotionPort = {
  start: () => Promise<boolean>;
  read: () => MotionObservation;
  stop: () => void;
};

type BaselinePort = {
  load: () => Promise<PersonalBaseline | null>;
  saveSession: (summary: {
    activationMean: number;
    stabilityMean: number;
    sampleCount: number;
  }) => Promise<unknown>;
};

export type SessionDependencies = {
  renderer: RendererPort;
  audio: AudioPort;
  camera: CameraPort;
  motion: MotionPort;
  baseline: BaselinePort;
  now: () => number;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
};

export type SessionSnapshot = {
  running: boolean;
  phase: RegulationPhase;
  elapsedMs: number;
  sensorConfidence: number;
};

function interpolate(from: number, to: number, progress: number): number {
  return from + (to - from) * progress;
}

function smoothProgress(elapsedMs: number): number {
  const linear = clamp01(elapsedMs / 180_000);
  return linear * linear * (3 - 2 * linear);
}

export function scriptedStateForElapsed(elapsedMs: number): StateEstimate {
  const progress = smoothProgress(elapsedMs);
  return {
    activation: interpolate(0.95, 0.03, progress),
    stability: interpolate(0.1, 0.97, progress),
    presence: interpolate(0.75, 0.85, progress),
    trend: interpolate(-0.1, 0.05, progress),
    confidence: 1,
  };
}

export class SessionController {
  private readonly dependencies: SessionDependencies;
  private running = false;
  private startTime = 0;
  private frame = 0;
  private elapsedMs = 0;
  private pausedAt: number | null = null;
  private phase: RegulationPhase = 'capture';
  private sensorConfidence = 0;
  private personalBaseline: PersonalBaseline | null = null;
  private audioAvailable = true;
  private activationTotal = 0;
  private stabilityTotal = 0;
  private sampleCount = 0;
  private readonly cameraMotion = new FeatureWindow(24);
  private readonly deviceMotion = new FeatureWindow(24);

  constructor(dependencies: SessionDependencies) {
    this.dependencies = dependencies;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.startTime = this.dependencies.now();
    this.elapsedMs = 0;
    this.pausedAt = null;
    this.phase = 'capture';

    // These calls occur before the first await so browser permission and audio
    // policies see the original Begin gesture.
    const cameraPromise = this.dependencies.camera.start();
    const motionPromise = this.dependencies.motion.start();
    const audioPromise = this.dependencies.audio.start();
    const baselinePromise = this.dependencies.baseline.load();
    this.dependencies.renderer.start();
    this.frame = this.dependencies.requestFrame(this.onFrame);

    void cameraPromise.then(() => {
      if (!this.running) this.dependencies.camera.stop();
    }).catch(() => {});
    void motionPromise.then(() => {
      if (!this.running) this.dependencies.motion.stop();
    }).catch(() => {});
    void baselinePromise.then((baseline) => {
      if (this.running) this.personalBaseline = baseline;
    }).catch(() => {
      // Local calibration is an enhancement, never a condition for beginning.
    });

    try {
      await audioPromise;
    } catch {
      this.audioAvailable = false;
    }
  }

  step(now: number): ResonanceState {
    this.elapsedMs = Math.max(0, now - this.startTime);
    this.phase = phaseForElapsed(this.elapsedMs);
    const camera = this.dependencies.camera.read();
    const motion = this.dependencies.motion.read();
    this.cameraMotion.push(camera.motion, now);
    this.deviceMotion.push(motion.motion, now);
    const cameraWindow = this.cameraMotion.snapshot();
    const motionWindow = this.deviceMotion.snapshot();

    this.sensorConfidence = clamp01(
      1 - (1 - camera.confidence * 0.75) * (1 - motion.confidence * 0.25),
    );
    const measured = estimateState({
      cameraMotion: cameraWindow.mean,
      cameraPresence: camera.presence,
      deviceMotion: motionWindow.mean,
      variability: clamp01(Math.sqrt(cameraWindow.variance + motionWindow.variance)),
      settlingTrend: Math.max(-1, Math.min(1, -(cameraWindow.slopePerSecond + motionWindow.slopePerSecond) * 4)),
      confidence: this.sensorConfidence,
    });
    const calibrated = this.personalBaseline
      ? {
          ...measured,
          activation: clamp01(
            measured.activation + (0.65 - this.personalBaseline.activationMean) * 0.35,
          ),
          stability: clamp01(
            measured.stability + (0.35 - this.personalBaseline.stabilityMean) * 0.35,
          ),
        }
      : measured;
    const scripted = scriptedStateForElapsed(this.elapsedMs);
    const adaptation = this.sensorConfidence * 0.65;
    const state: StateEstimate = {
      activation: interpolate(scripted.activation, calibrated.activation, adaptation),
      stability: interpolate(scripted.stability, calibrated.stability, adaptation),
      presence: interpolate(scripted.presence, calibrated.presence, adaptation),
      trend: interpolate(scripted.trend, calibrated.trend, adaptation),
      confidence: 1,
    };
    const resonance = targetResonance(state, this.phase);
    this.dependencies.renderer.update(resonance);
    if (this.audioAvailable) this.dependencies.audio.update(resonance, this.elapsedMs / 1_000);

    this.activationTotal += calibrated.activation;
    this.stabilityTotal += calibrated.stability;
    this.sampleCount += 1;
    return resonance;
  }

  snapshot(): SessionSnapshot {
    return {
      running: this.running,
      phase: this.phase,
      elapsedMs: this.elapsedMs,
      sensorConfidence: this.sensorConfidence,
    };
  }

  async setHidden(hidden: boolean): Promise<void> {
    if (!this.running) return;
    if (hidden) {
      if (this.pausedAt !== null) return;
      this.pausedAt = this.dependencies.now();
      this.dependencies.cancelFrame(this.frame);
      this.dependencies.camera.stop();
      this.dependencies.motion.stop();
      if (this.audioAvailable) await this.dependencies.audio.suspend().catch(() => {});
      return;
    }
    if (this.pausedAt === null) return;
    this.startTime += Math.max(0, this.dependencies.now() - this.pausedAt);
    this.pausedAt = null;
    void this.dependencies.camera.start().catch(() => {});
    void this.dependencies.motion.start().catch(() => {});
    if (this.audioAvailable) await this.dependencies.audio.resume().catch(() => {});
    this.frame = this.dependencies.requestFrame(this.onFrame);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.dependencies.cancelFrame(this.frame);
    this.dependencies.camera.stop();
    this.dependencies.motion.stop();
    this.dependencies.renderer.dispose();
    this.dependencies.audio.dispose();

    if (this.sampleCount >= 10) {
      void this.dependencies.baseline.saveSession({
        activationMean: this.activationTotal / this.sampleCount,
        stabilityMean: this.stabilityTotal / this.sampleCount,
        sampleCount: this.sampleCount,
      }).catch(() => {
        // Resource cleanup and returning control to the user take precedence.
      });
    }
  }

  private onFrame = (timestamp: number): void => {
    if (!this.running) return;
    this.step(timestamp);
    this.frame = this.dependencies.requestFrame(this.onFrame);
  };
}
