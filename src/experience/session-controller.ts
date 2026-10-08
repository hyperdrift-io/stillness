import type { SoundscapeInput } from '../audio/breath-soundscape.ts';
import { targetResonance, type ResonanceState } from '../resonance/resonance.ts';
import {
  BreathEstimator,
  emptyBreathSignal,
  type BreathSignal,
} from '../sensing/breath-estimator.ts';
import {
  CalibrationController,
  type CalibrationStatus,
} from '../sensing/calibration-controller.ts';
import type { MotionObservation } from '../sensing/motion-sensor.ts';
import {
  initialPerceptionSnapshot,
  type PerceptionSnapshot,
} from '../sensing/perception-signal.ts';
import type { PerceptionModulationFrame } from '../sensing/perception-worker-protocol.ts';
import { AdaptiveStateEngine } from '../state/adaptive-state-engine.ts';
import {
  toVisualControlFrame,
  type AdaptiveScene,
  type AdaptiveSignal,
  type AdaptiveState,
  type SignalContribution,
} from '../state/adaptive-state.ts';
import type { PersonalBaseline } from '../state/baseline-store.ts';
import type { AdaptiveVisualControlFrame } from '../visual/adaptive-visual-state.ts';
import { BreathPacer, type PacerState } from './breath-pacer.ts';
import { clamp01 } from './model.ts';
import { defaultSessionPreferences, type SessionTuning } from './session-preferences.ts';

type RendererPort = {
  start: () => void;
  update: (frame: AdaptiveVisualControlFrame) => void;
  setModulation?: (frame: PerceptionModulationFrame) => void;
  dispose: () => void;
};

type AudioPort = {
  start: () => Promise<void>;
  update: (input: SoundscapeInput) => void;
  setEnabled: (enabled: boolean) => Promise<boolean>;
  suspend: () => Promise<void>;
  resume: () => Promise<void>;
  dispose: () => void;
};

type CameraPort = {
  start: () => Promise<boolean>;
  read: () => PerceptionSnapshot;
  takeModulationFrame?: () => PerceptionModulationFrame | null;
  setAvailabilityListener?: (listener: ((available: boolean) => void) | null) => void;
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

const TELEMETRY_INTERVAL_MS = 120;
const SUMMARY_SAMPLE_INTERVAL_MS = 500;
const SUMMARY_WINDOW_MS = 30_000;
const MIN_SUMMARY_SAMPLES = 8;
const MIN_BREATH_SUMMARY_SAMPLES = 6;
const FOLLOW_EMA_SECONDS = 12;
const BREATH_TRUST = 0.35;

const initialCalibration: CalibrationStatus = {
  phase: 'framing',
  progress: 0,
  faceConfidence: 0,
  shoulderConfidence: 0,
  lightingConfidence: 0,
  baselineMotion: 0,
  baselineTension: 0,
};

export type SessionTelemetry = {
  movement: number;
  steadiness: number;
  presence: number;
  sensingQuality: number;
  expressionActivity: number;
  softness: number;
  settling: number;
  confidence: number;
  breathRegularity: number;
  breathConfidence: number;
  sensedBreathsPerMinute: number | null;
  follow: number | null;
  facialTension: number;
  calibrationPhase: CalibrationStatus['phase'];
  scene: AdaptiveScene;
  contributions: Record<AdaptiveSignal, SignalContribution>;
  direction: 'settling' | 'holding' | 'rising';
  source: 'mirror' | 'motion' | 'light';
  pacer: PacerState;
};

type Observation = { start: number | null; end: number | null };

export type SessionSummary = {
  elapsedSeconds: number;
  stage: PacerState['stage'];
  lightBreathsPerMinute: number;
  sensed: boolean;
  breathsPerMinute: Observation;
  movement: Observation;
  tension: Observation;
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
  onCameraAvailabilityChange?: (available: boolean) => void;
};

export type SessionSnapshot = {
  running: boolean;
  elapsedMs: number;
  stage: PacerState['stage'];
  sensorConfidence: number;
};

export type SessionStartResult = {
  cameraStarted: boolean;
};

type SummarySample = { atMs: number; value: number };

function limitedCalibration(status: CalibrationStatus = initialCalibration): CalibrationStatus {
  return { ...status, phase: 'limited' };
}

function windowMean(
  samples: readonly SummarySample[],
  elapsedMs: number,
  minimum: number,
): Observation {
  if (samples.length < minimum * 2) return { start: null, end: null };
  const firstWindow = samples.filter((sample) => sample.atMs <= SUMMARY_WINDOW_MS);
  const lastWindow = samples.filter((sample) => sample.atMs >= elapsedMs - SUMMARY_WINDOW_MS);
  const mean = (window: readonly SummarySample[]): number | null => (
    window.length >= minimum
      ? window.reduce((sum, sample) => sum + sample.value, 0) / window.length
      : null
  );
  return { start: mean(firstWindow), end: mean(lastWindow) };
}

export class SessionController {
  private running = false;
  private startTime = 0;
  private frame = 0;
  private elapsedMs = 0;
  private pausedAt: number | null = null;
  private sensorConfidence = 0;
  private audioAvailable = true;
  private cameraEnabled = true;
  private cameraOperation = 0;
  private lastTelemetryAt = -Infinity;
  private lastSummarySampleAt = -Infinity;
  private progressTotal = 0;
  private stabilityTotal = 0;
  private sampleCount = 0;
  private consecutiveFrameErrors = 0;
  private follow: number | null = null;
  private lastPacer: PacerState | null = null;
  private tuning: SessionTuning = { ...defaultSessionPreferences.tuning };
  private calibration: CalibrationStatus = { ...initialCalibration };
  private readonly breathSamples: SummarySample[] = [];
  private readonly movementSamples: SummarySample[] = [];
  private readonly tensionSamples: SummarySample[] = [];
  private readonly calibrationController = new CalibrationController();
  private readonly breathEstimator = new BreathEstimator();
  private readonly adaptiveStateEngine = new AdaptiveStateEngine();
  private readonly pacer = new BreathPacer();

  constructor(private readonly dependencies: SessionDependencies) {
    this.dependencies.camera.setAvailabilityListener?.(this.handleCameraAvailabilityChange);
  }

  async start(): Promise<SessionStartResult> {
    if (this.running) return { cameraStarted: this.cameraEnabled };
    this.running = true;
    this.startTime = this.dependencies.now();
    this.elapsedMs = 0;
    this.pausedAt = null;
    this.sensorConfidence = 0;
    this.audioAvailable = true;
    this.lastTelemetryAt = -Infinity;
    this.lastSummarySampleAt = -Infinity;
    this.progressTotal = 0;
    this.stabilityTotal = 0;
    this.sampleCount = 0;
    this.consecutiveFrameErrors = 0;
    this.follow = null;
    this.lastPacer = null;
    this.breathSamples.length = 0;
    this.movementSamples.length = 0;
    this.tensionSamples.length = 0;
    this.calibration = { ...initialCalibration };
    this.calibrationController.reset();
    this.breathEstimator.reset();
    this.adaptiveStateEngine.reset();
    this.pacer.reset();

    const cameraOperation = ++this.cameraOperation;
    const cameraPromise = this.cameraEnabled
      ? this.startCamera(cameraOperation)
      : Promise.resolve(false);
    const motionPromise = this.dependencies.motion.start();
    // Audio starts first and synchronously inside the Begin gesture.
    const audioPromise = this.dependencies.audio.start();
    void this.dependencies.baseline.load().catch(() => null);
    this.dependencies.renderer.start();
    this.frame = this.dependencies.requestFrame(this.onFrame);

    void motionPromise.then(() => {
      if (!this.running) this.dependencies.motion.stop();
    }).catch(() => {});
    try {
      await audioPromise;
    } catch {
      this.audioAvailable = false;
    }

    const cameraStarted = await cameraPromise.catch(() => false);
    if (!cameraStarted && cameraOperation === this.cameraOperation) {
      this.cameraEnabled = false;
      this.calibration = limitedCalibration();
    }
    return { cameraStarted };
  }

  step(now: number): ResonanceState {
    this.elapsedMs = Math.max(0, now - this.startTime);
    const perception = this.cameraEnabled
      ? this.dependencies.camera.read()
      : initialPerceptionSnapshot;
    const motion = this.dependencies.motion.read();
    const deviceMotion = {
      energy: clamp01(motion.motion),
      x: 0,
      y: 0,
      confidence: clamp01(motion.confidence),
    };

    this.calibration = this.cameraEnabled
      ? this.calibrationController.update(perception, now)
      : limitedCalibration(this.calibration);

    const breath: BreathSignal = this.cameraEnabled
      ? this.breathEstimator.update(perception)
      : { ...emptyBreathSignal };
    const pacer = this.pacer.update(this.elapsedMs, this.updateFollow(breath, now));
    this.lastPacer = pacer;

    const adaptive = this.adaptiveStateEngine.update({
      perception,
      breath,
      calibration: this.calibration,
      deviceMotion,
      tuning: this.tuning,
      nowMs: now,
      lead: pacer.arc,
    });
    this.sensorConfidence = clamp01(adaptive.overallConfidence);
    const resonance = targetResonance(adaptive);
    const frame: AdaptiveVisualControlFrame = toVisualControlFrame(
      adaptive,
      perception,
      this.tuning,
      0,
    );
    frame.breathFullness = pacer.fullness;
    frame.breathAmplitude = pacer.amplitude;
    frame.stillness = pacer.stillness;

    if (this.audioAvailable) {
      this.dependencies.audio.update({
        fullness: pacer.fullness,
        cue: pacer.cue,
        stage: pacer.stage,
        amplitude: pacer.amplitude,
        stillness: pacer.stillness,
      });
    }

    const modulation = this.dependencies.camera.takeModulationFrame?.() ?? null;
    if (modulation) {
      try {
        this.dependencies.renderer.setModulation?.(modulation);
      } catch (error) {
        console.warn('Stillness skipped one visual modulation frame.', error);
      } finally {
        modulation.bitmap.close();
      }
    }
    this.dependencies.renderer.update(frame);

    this.sampleSummary(perception, breath, adaptive);
    if (now - this.lastTelemetryAt >= TELEMETRY_INTERVAL_MS || this.lastTelemetryAt === -Infinity) {
      this.dependencies.onTelemetry?.(this.telemetryFor(adaptive, perception, motion, breath, pacer));
      this.lastTelemetryAt = now;
    }

    this.progressTotal += adaptive.progress;
    this.stabilityTotal += adaptive.postureStability;
    this.sampleCount += 1;
    return resonance;
  }

  snapshot(): SessionSnapshot {
    return {
      running: this.running,
      elapsedMs: this.elapsedMs,
      stage: this.lastPacer?.stage ?? 'arrive',
      sensorConfidence: this.sensorConfidence,
    };
  }

  /** What the session observed, as plain measurements; null where nothing trustworthy was sensed. */
  summary(): SessionSummary {
    const elapsedMs = this.elapsedMs;
    const breathsPerMinute = windowMean(this.breathSamples, elapsedMs, MIN_BREATH_SUMMARY_SAMPLES);
    const movement = windowMean(this.movementSamples, elapsedMs, MIN_SUMMARY_SAMPLES);
    const tension = windowMean(this.tensionSamples, elapsedMs, MIN_SUMMARY_SAMPLES);
    return {
      elapsedSeconds: Math.round(elapsedMs / 1_000),
      stage: this.lastPacer?.stage ?? 'arrive',
      lightBreathsPerMinute: this.lastPacer?.breathsPerMinute ?? 0,
      sensed: breathsPerMinute.end !== null || movement.end !== null || tension.end !== null,
      breathsPerMinute,
      movement,
      tension,
    };
  }

  isCameraEnabled(): boolean {
    return this.cameraEnabled;
  }

  setTuning(tuning: SessionTuning): void {
    this.tuning = { ...tuning };
  }

  setCameraEnabled(enabled: boolean): Promise<boolean> {
    const cameraOperation = ++this.cameraOperation;
    this.cameraEnabled = enabled;
    if (enabled) {
      this.calibrationController.reset();
      this.breathEstimator.reset();
      this.calibration = { ...initialCalibration };
      return this.startCamera(cameraOperation).then((started) => {
        if (cameraOperation !== this.cameraOperation) return false;
        if (!started) {
          this.cameraEnabled = false;
          this.calibration = limitedCalibration();
        }
        return started;
      });
    }
    this.dependencies.camera.stop();
    this.breathEstimator.reset();
    this.calibration = limitedCalibration(this.calibration);
    return Promise.resolve(true);
  }

  async setSoundEnabled(enabled: boolean): Promise<boolean> {
    if (!this.audioAvailable) return false;
    return this.dependencies.audio.setEnabled(enabled).catch(() => false);
  }

  isAudioAvailable(): boolean {
    return this.audioAvailable;
  }

  async setHidden(hidden: boolean): Promise<void> {
    if (!this.running) return;
    if (hidden) {
      if (this.pausedAt !== null) return;
      this.pausedAt = this.dependencies.now();
      this.cameraOperation += 1;
      this.dependencies.cancelFrame(this.frame);
      this.dependencies.camera.stop();
      this.dependencies.motion.stop();
      if (this.audioAvailable) await this.dependencies.audio.suspend().catch(() => {});
      return;
    }
    if (this.pausedAt === null) return;
    this.startTime += Math.max(0, this.dependencies.now() - this.pausedAt);
    this.pausedAt = null;
    if (this.cameraEnabled) {
      this.calibrationController.reset();
      this.breathEstimator.reset();
      this.calibration = { ...initialCalibration };
      const cameraOperation = ++this.cameraOperation;
      void this.startCamera(cameraOperation).then((started) => {
        if (cameraOperation !== this.cameraOperation || started) return;
        this.cameraEnabled = false;
        this.calibration = limitedCalibration();
        this.dependencies.onCameraAvailabilityChange?.(false);
      }).catch(() => {});
    }
    void this.dependencies.motion.start().catch(() => {});
    if (this.audioAvailable) await this.dependencies.audio.resume().catch(() => {});
    this.frame = this.dependencies.requestFrame(this.onFrame);
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.cameraOperation += 1;
    this.dependencies.cancelFrame(this.frame);
    this.dependencies.camera.stop();
    this.dependencies.motion.stop();
    this.dependencies.renderer.dispose();
    this.dependencies.audio.dispose();

    if (this.sampleCount >= 10) {
      void this.dependencies.baseline.saveSession({
        activationMean: 1 - this.progressTotal / this.sampleCount,
        stabilityMean: this.stabilityTotal / this.sampleCount,
        sampleCount: this.sampleCount,
      }).catch(() => {});
    }
  }

  /**
   * How closely the sensed breath matches the light's pace, 0..1, smoothed
   * over a few cycles; null while the breath signal is not trustworthy. It
   * only speeds or slows the glide; it never becomes a verdict.
   */
  private updateFollow(breath: BreathSignal, now: number): number | null {
    const pacer = this.lastPacer;
    if (!pacer || breath.confidence < BREATH_TRUST || breath.intervalMs <= 0) {
      return this.follow;
    }
    const sensedRate = 60_000 / breath.intervalMs;
    const closeness = clamp01(1 - Math.abs(sensedRate - pacer.breathsPerMinute) / (pacer.breathsPerMinute * 0.5));
    const deltaSeconds = this.lastTelemetryAt === -Infinity ? 0.1 : Math.max(0, now - this.lastTelemetryAt) / 1_000;
    const alpha = 1 - Math.exp(-deltaSeconds / FOLLOW_EMA_SECONDS);
    this.follow = this.follow === null ? closeness : this.follow + (closeness - this.follow) * alpha;
    return this.follow;
  }

  private sampleSummary(perception: PerceptionSnapshot, breath: BreathSignal, state: AdaptiveState): void {
    if (this.elapsedMs - this.lastSummarySampleAt < SUMMARY_SAMPLE_INTERVAL_MS) return;
    this.lastSummarySampleAt = this.elapsedMs;
    const atMs = this.elapsedMs;
    if (breath.confidence >= BREATH_TRUST && breath.intervalMs > 0) {
      this.breathSamples.push({ atMs, value: 60_000 / breath.intervalMs });
    }
    if (state.overallConfidence > 0.2) {
      this.movementSamples.push({ atMs, value: clamp01(state.movementEnergy) });
    }
    if (perception.facePresent && perception.faceConfidence > 0.5) {
      this.tensionSamples.push({ atMs, value: clamp01(perception.facial.tension) });
    }
  }

  private telemetryFor(
    state: AdaptiveState,
    perception: PerceptionSnapshot,
    motion: MotionObservation,
    breath: BreathSignal,
    pacer: PacerState,
  ): SessionTelemetry {
    const source: SessionTelemetry['source'] = perception.facePresent
      ? 'mirror'
      : motion.confidence > 0
        ? 'motion'
        : 'light';
    return {
      movement: clamp01(state.movementEnergy),
      steadiness: clamp01(state.postureStability),
      presence: perception.facePresent ? clamp01(perception.faceConfidence) : 0,
      sensingQuality: clamp01(state.overallConfidence),
      expressionActivity: clamp01(state.expressiveActivation),
      softness: clamp01(1 - state.facialTension),
      settling: clamp01(state.progress),
      confidence: clamp01(state.overallConfidence),
      breathRegularity: clamp01(state.breathRegularity),
      breathConfidence: clamp01(state.breathConfidence),
      sensedBreathsPerMinute: breath.confidence >= BREATH_TRUST && breath.intervalMs > 0
        ? 60_000 / breath.intervalMs
        : null,
      follow: this.follow,
      facialTension: clamp01(state.facialTension),
      calibrationPhase: this.calibration.phase,
      scene: state.scene,
      contributions: state.contributions,
      direction: state.trend > 0.08
        ? 'settling'
        : state.trend < -0.08
          ? 'rising'
          : 'holding',
      source,
      pacer,
    };
  }

  private startCamera(cameraOperation: number): Promise<boolean> {
    return this.dependencies.camera.start().then((started) => {
      if (
        cameraOperation !== this.cameraOperation
        || !this.running
        || !this.cameraEnabled
        || this.pausedAt !== null
      ) {
        this.dependencies.camera.stop();
        return false;
      }
      if (!started) this.dependencies.camera.stop();
      return started;
    });
  }

  private handleCameraAvailabilityChange = (available: boolean): void => {
    if (available) {
      if (this.running && this.cameraEnabled) {
        this.dependencies.onCameraAvailabilityChange?.(true);
      }
      return;
    }
    if (!this.running || !this.cameraEnabled) return;
    this.cameraOperation += 1;
    this.cameraEnabled = false;
    this.calibration = limitedCalibration(this.calibration);
    this.dependencies.onCameraAvailabilityChange?.(false);
  };

  private onFrame = (timestamp: number): void => {
    if (!this.running) return;
    try {
      this.step(timestamp);
      this.consecutiveFrameErrors = 0;
    } catch (error) {
      this.consecutiveFrameErrors += 1;
      if (this.consecutiveFrameErrors === 1 || this.consecutiveFrameErrors % 120 === 0) {
        console.error('Stillness skipped a frame.', error);
      }
    }
    this.frame = this.dependencies.requestFrame(this.onFrame);
  };
}
