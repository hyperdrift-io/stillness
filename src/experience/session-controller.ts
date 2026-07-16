import { clamp01, type RegulationPhase, type StateEstimate } from './model.ts';
import { phaseForElapsed } from './phase-policy.ts';
import { targetResonance, type ResonanceState } from '../resonance/resonance.ts';
import { FeatureWindow } from '../sensing/feature-window.ts';
import type { CameraObservation } from '../sensing/camera-sensor.ts';
import type { MotionObservation } from '../sensing/motion-sensor.ts';
import type { PersonalBaseline } from '../state/baseline-store.ts';
import { estimateReliefState } from '../state/state-estimator.ts';

type RendererPort = {
  start: () => void;
  update: (state: ResonanceState) => void;
  dispose: () => void;
};

type AudioPort = {
  start: () => Promise<void>;
  update: (state: ResonanceState, elapsedSeconds: number) => void;
  setAudible: (audible: boolean) => Promise<boolean>;
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

export type SessionTelemetry = {
  movement: number;
  steadiness: number;
  presence: number;
  sensingQuality: number;
  expressionActivity: number;
  softness: number;
  turbulence: number;
  settling: number;
  relief: number;
  readiness: number;
  confidence: number;
  direction: 'settling' | 'holding' | 'rising';
  source: 'mirror' | 'pure' | 'scripted';
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
  onTelemetry?: (telemetry: SessionTelemetry) => void;
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
  private cameraEnabled = true;
  private activationTotal = 0;
  private stabilityTotal = 0;
  private sampleCount = 0;
  private lastTelemetryAt = -Infinity;
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
    this.lastTelemetryAt = -Infinity;
    this.cameraMotion.clear();
    this.deviceMotion.clear();

    // These calls occur before the first await so browser permission and audio
    // policies see the original Begin gesture.
    const cameraPromise = this.cameraEnabled
      ? this.startCamera()
      : Promise.resolve(false);
    const motionPromise = this.dependencies.motion.start();
    const audioPromise = this.dependencies.audio.start();
    const baselinePromise = this.dependencies.baseline.load();
    this.dependencies.renderer.start();
    this.frame = this.dependencies.requestFrame(this.onFrame);

    void cameraPromise.catch(() => {});
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
    const elapsedProgress = smoothProgress(this.elapsedMs);

    this.sensorConfidence = clamp01(
      1 - (1 - camera.confidence * 0.75) * (1 - motion.confidence * 0.25),
    );
    const measured = estimateReliefState({
      cameraMotion: cameraWindow.mean,
      cameraPresence: camera.presence,
      deviceMotion: motionWindow.mean,
      variability: clamp01(Math.sqrt(cameraWindow.variance + motionWindow.variance)),
      settlingTrend: Math.max(-1, Math.min(1, -(cameraWindow.slopePerSecond + motionWindow.slopePerSecond) * 4)),
      expressionActivity: 0,
      softness: 0,
      confidence: this.sensorConfidence,
      elapsedProgress,
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
    if (now - this.lastTelemetryAt >= 250 || this.lastTelemetryAt === -Infinity) {
      const telemetry: SessionTelemetry = this.sensorConfidence < 0.15
        ? {
            movement: 0,
            steadiness: scripted.stability,
            presence: scripted.presence,
            sensingQuality: this.sensorConfidence,
            expressionActivity: 0,
            softness: 0,
            turbulence: 1 - scripted.stability,
            settling: scripted.stability,
            relief: elapsedProgress,
            readiness: clamp01(elapsedProgress - 0.25),
            confidence: this.sensorConfidence,
            direction: 'holding',
            source: 'scripted',
          }
        : {
            movement: measured.motion,
            steadiness: clamp01(calibrated.stability),
            presence: clamp01(calibrated.presence),
            sensingQuality: this.sensorConfidence,
            expressionActivity: measured.expressionActivity,
            softness: measured.softness,
            turbulence: measured.turbulence,
            settling: measured.settling,
            relief: measured.relief,
            readiness: measured.readiness,
            confidence: this.sensorConfidence,
            direction: calibrated.trend > 0.08
              ? 'settling'
              : calibrated.trend < -0.08
                ? 'rising'
                : 'holding',
            source: 'pure',
          };
      this.dependencies.onTelemetry?.(telemetry);
      this.lastTelemetryAt = now;
    }
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

  setCameraEnabled(enabled: boolean): Promise<boolean> {
    this.cameraEnabled = enabled;
    if (enabled) return this.startCamera();
    this.dependencies.camera.stop();
    this.cameraMotion.clear();
    return Promise.resolve(true);
  }

  async setSoundEnabled(enabled: boolean): Promise<boolean> {
    if (!this.audioAvailable) return false;
    return this.dependencies.audio.setAudible(enabled).catch(() => false);
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
    if (this.cameraEnabled) void this.startCamera().catch(() => {});
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

  private startCamera(): Promise<boolean> {
    return this.dependencies.camera.start().then((started) => {
      if (!this.running || !this.cameraEnabled || this.pausedAt !== null) {
        this.dependencies.camera.stop();
      }
      return started;
    });
  }

  private onFrame = (timestamp: number): void => {
    if (!this.running) return;
    this.step(timestamp);
    this.frame = this.dependencies.requestFrame(this.onFrame);
  };
}
