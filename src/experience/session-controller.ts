import { targetResonance, type ResonanceState } from '../resonance/resonance.ts';
import { BreathEstimator, type BreathSignal } from '../sensing/breath-estimator.ts';
import {
  CalibrationController,
  type CalibrationStatus,
} from '../sensing/calibration-controller.ts';
import {
  initialMirrorSignal,
  neutralMirrorExpression,
  type MirrorSignal,
} from '../sensing/mirror-signal.ts';
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
import {
  clamp01,
  type RegulationPhase,
  type ReliefState,
  type SessionRenderFrame,
  type StateEstimate,
} from './model.ts';
import {
  defaultSessionPreferences,
  type SessionTuning,
} from './session-preferences.ts';

type RendererPort = {
  start: () => void;
  update: (frame: SessionRenderFrame) => void;
  setModulation?: (frame: PerceptionModulationFrame) => void;
  dispose: () => void;
};

type AudioPort = {
  start: () => Promise<void>;
  update: (state: ResonanceState, elapsedSeconds: number) => void;
  setAudible: (audible: boolean) => Promise<boolean>;
  setVocalEnabled?: (enabled: boolean) => void;
  suspend: () => Promise<void>;
  resume: () => Promise<void>;
  dispose: () => void;
};

type CameraPort = {
  start: () => Promise<boolean>;
  read: () => PerceptionSnapshot | MirrorSignal;
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

const CALIBRATION_WAIT_TIMEOUT_MS = 12_500;
const TELEMETRY_INTERVAL_MS = 120;
const MAX_LEGACY_TOPOLOGY_SEGMENTS = 4_096;

const initialCalibration: CalibrationStatus = {
  phase: 'framing',
  progress: 0,
  faceConfidence: 0,
  shoulderConfidence: 0,
  lightingConfidence: 0,
  baselineMotion: 0,
  baselineTension: 0,
};

const emptyContribution = (): SignalContribution => ({
  value: 0,
  confidence: 0,
  configuredWeight: 0,
  effectiveWeight: 0,
});

export type SessionTelemetry = {
  movement: number;
  steadiness: number;
  presence: number;
  sensingQuality: number;
  expressionActivity: number;
  headTurn?: number;
  expression: MirrorSignal['expression'];
  softness: number;
  turbulence: number;
  settling: number;
  relief: number;
  readiness: number;
  confidence: number;
  breathRegularity?: number;
  breathConfidence?: number;
  temporalCoherence?: number;
  facialTension?: number;
  calibrationPhase?: CalibrationStatus['phase'];
  calibrationProgress?: number;
  scene?: AdaptiveScene;
  contributions?: Record<AdaptiveSignal, SignalContribution>;
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
  onCameraAvailabilityChange?: (available: boolean) => void;
};

export type SessionSnapshot = {
  running: boolean;
  phase: RegulationPhase;
  elapsedMs: number;
  sensorConfidence: number;
};

export type SessionStartResult = {
  cameraStarted: boolean;
};

type CalibrationWaiter = {
  resolve: (status: CalibrationStatus) => void;
  timeout: ReturnType<typeof globalThis.setTimeout>;
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

function sceneForProgress(progress: number): AdaptiveScene {
  if (progress < 0.18) return 'turbulence';
  if (progress < 0.38) return 'gathering';
  if (progress < 0.6) return 'coherence';
  if (progress < 0.82) return 'release';
  return 'radiance';
}

function regulationPhaseForScene(scene: AdaptiveScene): RegulationPhase {
  if (scene === 'gathering') return 'match';
  if (scene === 'coherence') return 'entrain';
  if (scene === 'release') return 'dissolve';
  if (scene === 'radiance') return 'stillness';
  return 'capture';
}

function fallbackAdaptiveState(elapsedMs: number): AdaptiveState {
  const progress = smoothProgress(elapsedMs);
  const scene = sceneForProgress(progress);
  return {
    scene,
    sceneMix: 1,
    progress,
    trend: 0,
    facialTension: 0,
    facialWarmth: 0.35,
    expressiveActivation: 0,
    movementEnergy: 0,
    movementX: 0,
    movementY: 0,
    postureStability: 0.5,
    breathPhase: (elapsedMs % 7_000) / 7_000,
    breathRegularity: 0,
    breathConfidence: 0,
    temporalCoherence: 0.5,
    overallConfidence: 0,
    contributions: {
      movement: emptyContribution(),
      breathing: emptyContribution(),
      facialRelease: emptyContribution(),
      coherence: emptyContribution(),
    },
  };
}

function isPerceptionSnapshot(
  observation: PerceptionSnapshot | MirrorSignal,
): observation is PerceptionSnapshot {
  return 'facePresent' in observation && 'topologySegments' in observation;
}

function packLegacyTopology(mirror: MirrorSignal): Float32Array {
  const topology = mirror.topology;
  if (!topology) return new Float32Array();
  const packed = new Float32Array(
    Math.min(topology.connections.length, MAX_LEGACY_TOPOLOGY_SEGMENTS) * 6,
  );
  let offset = 0;
  for (
    let index = 0;
    index < Math.min(topology.connections.length, MAX_LEGACY_TOPOLOGY_SEGMENTS);
    index += 1
  ) {
    const connection = topology.connections[index];
    if (!connection) continue;
    const start = topology.points[connection.start];
    const end = topology.points[connection.end];
    if (!start || !end) continue;
    packed[offset] = clamp01((start.x + 1) * 0.5);
    packed[offset + 1] = clamp01((1 - start.y) * 0.5);
    packed[offset + 2] = Math.max(-1, Math.min(1, start.z));
    packed[offset + 3] = clamp01((end.x + 1) * 0.5);
    packed[offset + 4] = clamp01((1 - end.y) * 0.5);
    packed[offset + 5] = Math.max(-1, Math.min(1, end.z));
    offset += 6;
  }
  return offset === packed.length ? packed : packed.slice(0, offset);
}

function perceptionFromLegacyMirror(mirror: MirrorSignal, timestampMs: number): PerceptionSnapshot {
  return {
    ...initialPerceptionSnapshot,
    timestampMs,
    facePresent: mirror.topology !== null,
    faceConfidence: clamp01(mirror.confidence),
    faceCenterX: mirror.topology?.centerX ?? 0.5,
    faceCenterY: mirror.topology?.centerY ?? 0.5,
    faceScale: mirror.topology?.scale ?? 0,
    yaw: mirror.topology?.yaw ?? 0,
    pitch: mirror.topology?.pitch ?? 0,
    roll: mirror.topology?.roll ?? 0,
    facial: {
      activity: clamp01(mirror.expressionActivity),
      tension: clamp01(mirror.expression.browTension),
      warmth: clamp01(mirror.expression.mouthSmile),
      mouthOpen: clamp01(mirror.expression.mouthOpen),
      browLift: clamp01(mirror.expression.browLift),
      eyeClosure: clamp01(mirror.expression.eyeClosure),
    },
    motion: {
      energy: clamp01(mirror.motion),
      x: 0,
      y: 0,
    },
    luminance: clamp01(mirror.luminance),
    topologySegments: packLegacyTopology(mirror),
    quality: clamp01(mirror.confidence),
  };
}

function mirrorFromPerception(perception: PerceptionSnapshot): MirrorSignal {
  return {
    ...initialMirrorSignal,
    mode: perception.facePresent ? 'mirror' : 'pure',
    motion: clamp01(perception.motion.energy),
    presence: perception.facePresent ? clamp01(perception.faceConfidence) : 0,
    confidence: clamp01(perception.quality),
    luminance: clamp01(perception.luminance),
    expressionActivity: clamp01(perception.facial.activity),
    expression: {
      activity: clamp01(perception.facial.activity),
      mouthOpen: clamp01(perception.facial.mouthOpen),
      mouthSmile: clamp01(perception.facial.warmth),
      browLift: clamp01(perception.facial.browLift),
      browTension: clamp01(perception.facial.tension),
      eyeClosure: clamp01(perception.facial.eyeClosure),
    },
    softness: clamp01(1 - perception.facial.tension),
    topology: null,
    sourceVideo: null,
  };
}

function limitedCalibration(status: CalibrationStatus = initialCalibration): CalibrationStatus {
  return { ...status, phase: 'limited' };
}

export class SessionController {
  private running = false;
  private startTime = 0;
  private frame = 0;
  private elapsedMs = 0;
  private pausedAt: number | null = null;
  private phase: RegulationPhase = 'capture';
  private sensorConfidence = 0;
  private audioAvailable = true;
  private cameraEnabled = true;
  private cameraOperation = 0;
  private lastTelemetryAt = -Infinity;
  private progressTotal = 0;
  private stabilityTotal = 0;
  private sampleCount = 0;
  private consecutiveFrameErrors = 0;
  private tuning: SessionTuning = { ...defaultSessionPreferences.tuning };
  private calibration: CalibrationStatus = { ...initialCalibration };
  private readonly calibrationController = new CalibrationController();
  private readonly breathEstimator = new BreathEstimator();
  private readonly adaptiveStateEngine = new AdaptiveStateEngine();
  private readonly calibrationWaiters = new Set<CalibrationWaiter>();

  constructor(private readonly dependencies: SessionDependencies) {
    this.dependencies.camera.setAvailabilityListener?.(this.handleCameraAvailabilityChange);
  }

  async start(): Promise<SessionStartResult> {
    if (this.running) return { cameraStarted: this.cameraEnabled };
    this.running = true;
    this.startTime = this.dependencies.now();
    this.elapsedMs = 0;
    this.pausedAt = null;
    this.phase = 'capture';
    this.sensorConfidence = 0;
    this.audioAvailable = true;
    this.lastTelemetryAt = -Infinity;
    this.progressTotal = 0;
    this.stabilityTotal = 0;
    this.sampleCount = 0;
    this.consecutiveFrameErrors = 0;
    this.calibration = { ...initialCalibration };
    this.calibrationController.reset();
    this.breathEstimator.reset();
    this.adaptiveStateEngine.reset();

    const cameraOperation = ++this.cameraOperation;
    const cameraPromise = this.cameraEnabled
      ? this.startCamera(cameraOperation)
      : Promise.resolve(false);
    const motionPromise = this.dependencies.motion.start();
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
      this.resolveCalibrationWaiters(this.calibration);
    }
    return { cameraStarted };
  }

  step(now: number): ResonanceState {
    this.elapsedMs = Math.max(0, now - this.startTime);
    const observation = this.cameraEnabled
      ? this.dependencies.camera.read()
      : initialPerceptionSnapshot;
    const perception = isPerceptionSnapshot(observation)
      ? observation
      : perceptionFromLegacyMirror(observation, now);
    const motion = this.dependencies.motion.read();
    const deviceMotion = {
      energy: clamp01(motion.motion),
      x: 0,
      y: 0,
      confidence: clamp01(motion.confidence),
    };

    if (this.cameraEnabled) {
      this.calibration = this.calibrationController.update(perception, now);
      if (this.calibration.phase === 'ready' || this.calibration.phase === 'limited') {
        this.resolveCalibrationWaiters(this.calibration);
      }
    } else {
      this.calibration = limitedCalibration(this.calibration);
    }

    const breath: BreathSignal = this.cameraEnabled
      ? this.breathEstimator.update(perception)
      : { phase: 0, regularity: 0, amplitude: 0, confidence: 0, cycles: 0 };
    let adaptive = this.adaptiveStateEngine.update({
      perception,
      breath,
      calibration: this.calibration,
      deviceMotion,
      tuning: this.tuning,
      nowMs: now,
    });
    if (
      adaptive.overallConfidence < 0.01
      && !this.cameraEnabled
      && deviceMotion.confidence < 0.01
    ) {
      adaptive = fallbackAdaptiveState(this.elapsedMs);
    }

    this.phase = regulationPhaseForScene(adaptive.scene);
    this.sensorConfidence = clamp01(adaptive.overallConfidence);
    const resonance = targetResonance(adaptive);
    const adaptiveFrame: AdaptiveVisualControlFrame = toVisualControlFrame(
      adaptive,
      perception,
      this.tuning,
      defaultSessionPreferences.variationSeed,
    );
    const mirror = mirrorFromPerception(perception);
    const relief = {
      activation: clamp01(resonance.complexity),
      stability: clamp01(adaptive.postureStability),
      presence: perception.facePresent ? clamp01(perception.faceConfidence) : 0,
      trend: adaptive.trend,
      confidence: clamp01(adaptive.overallConfidence),
      motion: clamp01(adaptive.movementEnergy),
      expressionActivity: clamp01(adaptive.expressiveActivation),
      softness: clamp01(1 - adaptive.facialTension),
      turbulence: clamp01(resonance.turbulence),
      settling: clamp01(adaptive.progress),
      relief: clamp01(adaptive.progress),
      readiness: clamp01((adaptive.progress - 0.55) / 0.45),
    } satisfies ReliefState;
    const frame: SessionRenderFrame = {
      resonance,
      relief,
      mirror,
      adaptive: adaptiveFrame,
    };

    const modulation = this.dependencies.camera.takeModulationFrame?.() ?? null;
    if (modulation) {
      try {
        this.dependencies.renderer.setModulation?.(modulation);
      } catch (error) {
        console.warn('Relief skipped one visual modulation frame.', error);
      } finally {
        modulation.bitmap.close();
      }
    }
    this.dependencies.renderer.update(frame);
    if (this.audioAvailable) this.dependencies.audio.update(resonance, this.elapsedMs / 1_000);

    if (now - this.lastTelemetryAt >= TELEMETRY_INTERVAL_MS || this.lastTelemetryAt === -Infinity) {
      this.dependencies.onTelemetry?.(this.telemetryFor(
        adaptive,
        perception,
        motion,
        resonance,
      ));
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
      phase: this.phase,
      elapsedMs: this.elapsedMs,
      sensorConfidence: this.sensorConfidence,
    };
  }

  isCameraEnabled(): boolean {
    return this.cameraEnabled;
  }

  waitForCalibration(): Promise<CalibrationStatus> {
    if (!this.cameraEnabled || this.calibration.phase === 'ready' || this.calibration.phase === 'limited') {
      return Promise.resolve({ ...this.calibration });
    }
    return new Promise((resolve) => {
      const waiter: CalibrationWaiter = {
        resolve,
        timeout: globalThis.setTimeout(() => {
          this.calibration = limitedCalibration(this.calibration);
          this.resolveCalibrationWaiters(this.calibration);
        }, CALIBRATION_WAIT_TIMEOUT_MS),
      };
      this.calibrationWaiters.add(waiter);
    });
  }

  setTuning(tuning: SessionTuning): void {
    this.tuning = { ...tuning };
  }

  setVocalEnabled(enabled: boolean): void {
    this.dependencies.audio.setVocalEnabled?.(enabled);
  }

  setCameraEnabled(enabled: boolean): Promise<boolean> {
    const cameraOperation = ++this.cameraOperation;
    this.cameraEnabled = enabled;
    if (enabled) {
      this.calibrationController.reset();
      this.breathEstimator.reset();
      this.adaptiveStateEngine.reset();
      this.calibration = { ...initialCalibration };
      return this.startCamera(cameraOperation).then((started) => {
        if (cameraOperation !== this.cameraOperation) return false;
        if (!started) {
          this.cameraEnabled = false;
          this.calibration = limitedCalibration();
          this.resolveCalibrationWaiters(this.calibration);
        }
        return started;
      });
    }
    this.dependencies.camera.stop();
    this.breathEstimator.reset();
    this.calibration = limitedCalibration(this.calibration);
    this.resolveCalibrationWaiters(this.calibration);
    return Promise.resolve(true);
  }

  async setVocalAudible(enabled: boolean): Promise<boolean> {
    if (!this.audioAvailable) return false;
    return this.dependencies.audio.setAudible(enabled).catch(() => false);
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
        this.resolveCalibrationWaiters(this.calibration);
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
    this.resolveCalibrationWaiters(limitedCalibration(this.calibration));

    if (this.sampleCount >= 10) {
      void this.dependencies.baseline.saveSession({
        activationMean: 1 - this.progressTotal / this.sampleCount,
        stabilityMean: this.stabilityTotal / this.sampleCount,
        sampleCount: this.sampleCount,
      }).catch(() => {});
    }
  }

  private telemetryFor(
    state: AdaptiveState,
    perception: PerceptionSnapshot,
    motion: MotionObservation,
    resonance: ResonanceState,
  ): SessionTelemetry {
    const source: SessionTelemetry['source'] = perception.facePresent
      ? 'mirror'
      : motion.confidence > 0
        ? 'pure'
        : 'scripted';
    return {
      movement: clamp01(state.movementEnergy),
      steadiness: clamp01(state.postureStability),
      presence: perception.facePresent ? clamp01(perception.faceConfidence) : 0,
      sensingQuality: clamp01(state.overallConfidence),
      expressionActivity: clamp01(state.expressiveActivation),
      headTurn: clamp01(
        (Math.abs(perception.yaw) + Math.abs(perception.pitch) + Math.abs(perception.roll)) * 0.8,
      ),
      expression: {
        ...neutralMirrorExpression,
        activity: clamp01(perception.facial.activity),
        mouthOpen: clamp01(perception.facial.mouthOpen),
        mouthSmile: clamp01(perception.facial.warmth),
        browLift: clamp01(perception.facial.browLift),
        browTension: clamp01(perception.facial.tension),
        eyeClosure: clamp01(perception.facial.eyeClosure),
      },
      softness: clamp01(1 - state.facialTension),
      turbulence: clamp01(resonance.turbulence),
      settling: clamp01(state.progress),
      relief: clamp01(state.progress),
      readiness: clamp01((state.progress - 0.55) / 0.45),
      confidence: clamp01(state.overallConfidence),
      breathRegularity: clamp01(state.breathRegularity),
      breathConfidence: clamp01(state.breathConfidence),
      temporalCoherence: clamp01(state.temporalCoherence),
      facialTension: clamp01(state.facialTension),
      calibrationPhase: this.calibration.phase,
      calibrationProgress: clamp01(this.calibration.progress),
      scene: state.scene,
      contributions: state.contributions,
      direction: state.trend > 0.08
        ? 'settling'
        : state.trend < -0.08
          ? 'rising'
          : 'holding',
      source,
    };
  }

  private resolveCalibrationWaiters(status: CalibrationStatus): void {
    for (const waiter of this.calibrationWaiters) {
      globalThis.clearTimeout(waiter.timeout);
      waiter.resolve({ ...status });
    }
    this.calibrationWaiters.clear();
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
    this.resolveCalibrationWaiters(this.calibration);
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
        console.error('Relief skipped an adaptive-state frame.', error);
      }
    }
    this.frame = this.dependencies.requestFrame(this.onFrame);
  };
}
