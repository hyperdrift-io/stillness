import { clamp01, clampSigned } from '../experience/model.ts';
import {
  adaptiveScenes,
  type AdaptiveScene,
  type AdaptiveSignal,
  type AdaptiveState,
  type AdaptiveStateInput,
  type SignalContribution,
} from './adaptive-state.ts';

const CONFIGURED_WEIGHTS: Record<AdaptiveSignal, number> = {
  movement: 0.3,
  breathing: 0.25,
  facialRelease: 0.25,
  coherence: 0.2,
};

const SCENE_BANDS = [0, 0.22, 0.42, 0.62, 0.82] as const;
const HIGHER_SCENE_SUPPORT_MS = 4_000;
const LOWER_SCENE_SUPPORT_MS = 6_000;
const MAX_CONTINUOUS_STEP_MS = 250;
const MAX_TEMPORAL_SAMPLE_GAP_MS = 1_000;
const TEMPORAL_CONFIDENCE_MS = 3_000;
const TEMPORAL_EMA_SECONDS = 1.5;
const TREND_FULL_SCALE_PER_SECOND = 0.25;
const BREATH_CONFIDENCE_THRESHOLD = 0.35;
const RELATIVE_MOVEMENT_FLOOR = 0.04;
const RELATIVE_TENSION_FLOOR = 0.08;
const WEIGHT_EPSILON = 1e-6;

type WeightedChannel = {
  value: number;
  confidence: number;
};

type TemporalSample = {
  timestampMs: number;
  movementEnergy: number;
  facialTension: number;
  expressiveActivation: number;
  breathRegularity: number;
  movementConfidence: number;
  facialConfidence: number;
  breathConfidence: number;
};

function clampRange(value: number, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function combineConfidence(channels: readonly WeightedChannel[]): number {
  return clamp01(1 - channels.reduce(
    (unavailable, channel) => unavailable * (1 - clamp01(channel.confidence)),
    1,
  ));
}

function weightedValue(channels: readonly WeightedChannel[], fallback = 0): number {
  let weightedTotal = 0;
  let confidenceTotal = 0;
  for (const channel of channels) {
    const confidence = clamp01(channel.confidence);
    weightedTotal += clamp01(channel.value) * confidence;
    confidenceTotal += confidence;
  }
  return confidenceTotal > WEIGHT_EPSILON
    ? clamp01(weightedTotal / confidenceTotal)
    : clamp01(fallback);
}

function weightedSignedValue(channels: readonly WeightedChannel[]): number {
  let weightedTotal = 0;
  let confidenceTotal = 0;
  for (const channel of channels) {
    const confidence = clamp01(channel.confidence);
    weightedTotal += clampSigned(channel.value) * confidence;
    confidenceTotal += confidence;
  }
  return confidenceTotal > WEIGHT_EPSILON
    ? clampSigned(weightedTotal / confidenceTotal)
    : 0;
}

function calibrationRelativeLevel(
  value: number,
  baseline: number,
  zeroBaselineFloor: number,
  sensitivity: number,
): number {
  const boundedValue = clamp01(value);
  const boundedBaseline = clamp01(baseline);
  const denominator = boundedBaseline > WEIGHT_EPSILON
    ? boundedBaseline * 2
    : zeroBaselineFloor;
  return clamp01((boundedValue * sensitivity) / denominator);
}

function sceneForProgress(progress: number): AdaptiveScene {
  const boundedProgress = clamp01(progress);
  for (let index = SCENE_BANDS.length - 1; index > 0; index -= 1) {
    if (boundedProgress >= (SCENE_BANDS[index] ?? 0)) {
      return adaptiveScenes[index] ?? 'turbulence';
    }
  }
  return 'turbulence';
}

function sceneIndex(scene: AdaptiveScene): number {
  return adaptiveScenes.indexOf(scene);
}

function contribution(
  value: number,
  confidence: number,
  configuredWeight: number,
): SignalContribution {
  return {
    value: clamp01(value),
    confidence: clamp01(confidence),
    configuredWeight,
    effectiveWeight: 0,
  };
}

export class AdaptiveStateEngine {
  private scene: AdaptiveScene = 'turbulence';
  private sceneMix = 1;
  private candidateScene: AdaptiveScene | null = null;
  private candidateSupportedMs = 0;
  private lastNowMs: number | null = null;
  private previousProgress: number | null = null;
  private trend = 0;
  private temporalCoherence = 0.5;
  private temporalEvidenceMs = 0;
  private previousTemporalSample: TemporalSample | null = null;

  update(input: AdaptiveStateInput): AdaptiveState {
    const sensitivity = clampRange(input.tuning.signalSensitivity, 0.75, 1.25, 1);
    const faceConfidence = input.perception.facePresent
      ? clamp01(input.perception.faceConfidence)
      : 0;
    const cameraMotionConfidence = clamp01(input.perception.quality);
    const deviceMotionConfidence = clamp01(input.deviceMotion.confidence);

    const normalizedCameraMovement = calibrationRelativeLevel(
      input.perception.motion.energy,
      input.calibration.baselineMotion,
      RELATIVE_MOVEMENT_FLOOR,
      sensitivity,
    );
    const normalizedDeviceMovement = clamp01(input.deviceMotion.energy * sensitivity);
    const movementChannels = [
      { value: normalizedCameraMovement, confidence: cameraMotionConfidence },
      { value: normalizedDeviceMovement, confidence: deviceMotionConfidence },
    ];
    const normalizedMovement = weightedValue(movementChannels);
    const movementX = weightedSignedValue([
      { value: input.perception.motion.x, confidence: cameraMotionConfidence },
      { value: input.deviceMotion.x, confidence: deviceMotionConfidence },
    ]);
    const movementY = weightedSignedValue([
      { value: input.perception.motion.y, confidence: cameraMotionConfidence },
      { value: input.deviceMotion.y, confidence: deviceMotionConfidence },
    ]);

    const normalizedTension = calibrationRelativeLevel(
      input.perception.facial.tension,
      input.calibration.baselineTension,
      RELATIVE_TENSION_FLOOR,
      sensitivity,
    );
    const facialWarmth = clamp01(input.perception.facial.warmth * sensitivity);
    const expressiveActivation = clamp01(input.perception.facial.activity * sensitivity);
    const breathPhase = clamp01(input.breath.phase);
    const breathRegularity = clamp01(input.breath.regularity);
    const rawBreathConfidence = clamp01(input.breath.confidence);

    const calibrationTerminal = input.calibration.phase === 'ready'
      || input.calibration.phase === 'limited';
    const calibratedFaceConfidence = calibrationTerminal
      ? faceConfidence * clamp01(input.calibration.faceConfidence)
      : 0;
    const calibratedCameraMotionConfidence = calibrationTerminal
      ? cameraMotionConfidence * clamp01(input.calibration.shoulderConfidence)
      : 0;
    const progressMovement = weightedValue([
      { value: normalizedCameraMovement, confidence: calibratedCameraMotionConfidence },
      { value: normalizedDeviceMovement, confidence: deviceMotionConfidence },
    ]);
    const movementConfidence = combineConfidence([
      { value: 0, confidence: calibratedCameraMotionConfidence },
      { value: 0, confidence: deviceMotionConfidence },
    ]);
    const calibratedBreathConfidence = calibrationTerminal
      ? rawBreathConfidence
        * Math.min(
          clamp01(input.calibration.faceConfidence),
          clamp01(input.calibration.shoulderConfidence),
        )
      : 0;
    const breathingConfidence = calibratedBreathConfidence > BREATH_CONFIDENCE_THRESHOLD
      ? calibratedBreathConfidence
      : 0;

    const frameDeltaMs = this.frameDelta(input.nowMs);
    const temporalConfidence = this.updateTemporalCoherence({
      timestampMs: this.temporalTimestamp(input, deviceMotionConfidence),
      movementEnergy: progressMovement,
      facialTension: normalizedTension,
      expressiveActivation,
      breathRegularity,
      movementConfidence,
      facialConfidence: calibratedFaceConfidence,
      breathConfidence: breathingConfidence,
    });

    const movementStability = clamp01(1 - progressMovement);
    const facialRelease = clamp01(1 - normalizedTension);
    const breathing = rawBreathConfidence > BREATH_CONFIDENCE_THRESHOLD
      ? breathRegularity
      : 0;
    const coherence = this.temporalCoherence;
    const contributions: AdaptiveState['contributions'] = {
      movement: contribution(
        movementStability,
        movementConfidence,
        CONFIGURED_WEIGHTS.movement,
      ),
      breathing: contribution(
        breathing,
        breathingConfidence,
        CONFIGURED_WEIGHTS.breathing,
      ),
      facialRelease: contribution(
        facialRelease,
        calibratedFaceConfidence,
        CONFIGURED_WEIGHTS.facialRelease,
      ),
      coherence: contribution(
        coherence,
        temporalConfidence,
        CONFIGURED_WEIGHTS.coherence,
      ),
    };

    const rawEffectiveWeight = Object.values(contributions).reduce(
      (sum, item) => sum + item.configuredWeight * item.confidence,
      0,
    );
    let progress = this.previousProgress ?? 0;
    if (rawEffectiveWeight > WEIGHT_EPSILON) {
      progress = 0;
      for (const item of Object.values(contributions)) {
        item.effectiveWeight = (item.configuredWeight * item.confidence) / rawEffectiveWeight;
        progress += item.value * item.effectiveWeight;
      }
      progress = clamp01(progress);
    }

    this.updateTrend(progress, frameDeltaMs, rawEffectiveWeight > WEIGHT_EPSILON);
    this.updateScene(
      progress,
      frameDeltaMs,
      rawEffectiveWeight > WEIGHT_EPSILON,
      input.tuning.transitionSeconds,
    );
    this.previousProgress = progress;

    return {
      scene: this.scene,
      sceneMix: clamp01(this.sceneMix),
      progress,
      trend: clampSigned(this.trend),
      facialTension: normalizedTension,
      facialWarmth,
      expressiveActivation,
      movementEnergy: normalizedMovement,
      movementX,
      movementY,
      postureStability: clamp01(1 - normalizedMovement),
      breathPhase,
      breathRegularity,
      breathConfidence: rawBreathConfidence,
      temporalCoherence: clamp01(this.temporalCoherence),
      overallConfidence: clamp01(rawEffectiveWeight),
      contributions,
    };
  }

  reset(): void {
    this.scene = 'turbulence';
    this.sceneMix = 1;
    this.candidateScene = null;
    this.candidateSupportedMs = 0;
    this.lastNowMs = null;
    this.previousProgress = null;
    this.trend = 0;
    this.temporalCoherence = 0.5;
    this.temporalEvidenceMs = 0;
    this.previousTemporalSample = null;
  }

  private frameDelta(nowMs: number): number {
    if (!Number.isFinite(nowMs)) return 0;
    if (this.lastNowMs === null) {
      this.lastNowMs = nowMs;
      return 0;
    }
    const elapsedMs = nowMs - this.lastNowMs;
    this.lastNowMs = nowMs;
    if (elapsedMs <= 0) {
      this.candidateScene = null;
      this.candidateSupportedMs = 0;
      return 0;
    }
    return Math.min(elapsedMs, MAX_CONTINUOUS_STEP_MS);
  }

  private temporalTimestamp(input: AdaptiveStateInput, deviceConfidence: number): number {
    const perceptionTimestamp = input.perception.timestampMs;
    const hasCameraEvidence = input.perception.facePresent
      || input.perception.shoulders.visible
      || input.perception.quality > 0
      || input.breath.confidence > 0;
    if (hasCameraEvidence && Number.isFinite(perceptionTimestamp) && perceptionTimestamp > 0) {
      return perceptionTimestamp;
    }
    return deviceConfidence > 0 && Number.isFinite(input.nowMs) ? input.nowMs : Number.NaN;
  }

  private updateTemporalCoherence(sample: TemporalSample): number {
    if (!Number.isFinite(sample.timestampMs)) {
      this.previousTemporalSample = null;
      this.temporalEvidenceMs = 0;
      return 0;
    }
    const previous = this.previousTemporalSample;
    if (!previous) {
      this.previousTemporalSample = sample;
      this.temporalEvidenceMs = 0;
      return 0;
    }
    const elapsedMs = sample.timestampMs - previous.timestampMs;
    if (elapsedMs === 0) return this.temporalConfidence(sample);
    if (elapsedMs < 0) {
      this.previousTemporalSample = sample;
      this.temporalEvidenceMs = 0;
      return 0;
    }
    if (elapsedMs > MAX_TEMPORAL_SAMPLE_GAP_MS) {
      this.previousTemporalSample = sample;
      this.temporalEvidenceMs = 0;
      return 0;
    }

    const movementPairConfidence = Math.min(
      sample.movementConfidence,
      previous.movementConfidence,
    );
    const facialPairConfidence = Math.min(
      sample.facialConfidence,
      previous.facialConfidence,
    );
    const breathPairConfidence = Math.min(
      sample.breathConfidence,
      previous.breathConfidence,
    );
    const deltaChannels = [
      {
        value: Math.abs(sample.movementEnergy - previous.movementEnergy),
        confidence: movementPairConfidence,
      },
      {
        value: Math.abs(sample.facialTension - previous.facialTension),
        confidence: facialPairConfidence,
      },
      {
        value: Math.abs(sample.expressiveActivation - previous.expressiveActivation),
        confidence: facialPairConfidence,
      },
      {
        value: Math.abs(sample.breathRegularity - previous.breathRegularity),
        confidence: breathPairConfidence,
      },
    ];
    const pairConfidence = combineConfidence(deltaChannels);
    const observedDelta = weightedValue(deltaChannels, 0);
    const instantaneousCoherence = clamp01(1 - observedDelta * 2);
    const alpha = 1 - Math.exp(-(elapsedMs / 1_000) / TEMPORAL_EMA_SECONDS);
    this.temporalCoherence += (instantaneousCoherence - this.temporalCoherence) * alpha;
    if (pairConfidence > 0) {
      this.temporalEvidenceMs = Math.min(
        TEMPORAL_CONFIDENCE_MS,
        this.temporalEvidenceMs + elapsedMs * pairConfidence,
      );
    }
    this.previousTemporalSample = sample;
    return this.temporalConfidence(sample);
  }

  private temporalConfidence(sample: TemporalSample): number {
    const observationConfidence = combineConfidence([
      { value: 0, confidence: sample.movementConfidence },
      { value: 0, confidence: sample.facialConfidence },
      { value: 0, confidence: sample.breathConfidence },
    ]);
    return clamp01(
      observationConfidence * (this.temporalEvidenceMs / TEMPORAL_CONFIDENCE_MS),
    );
  }

  private updateTrend(progress: number, elapsedMs: number, hasEvidence: boolean): void {
    if (elapsedMs <= 0) return;
    const elapsedSeconds = elapsedMs / 1_000;
    if (!hasEvidence) {
      this.trend *= Math.exp(-elapsedSeconds / TEMPORAL_EMA_SECONDS);
      return;
    }
    if (this.previousProgress === null) return;
    const rate = (progress - this.previousProgress) / elapsedSeconds;
    const instantaneousTrend = clampSigned(rate / TREND_FULL_SCALE_PER_SECOND);
    const alpha = 1 - Math.exp(-elapsedSeconds / TEMPORAL_EMA_SECONDS);
    this.trend += (instantaneousTrend - this.trend) * alpha;
  }

  private updateScene(
    progress: number,
    elapsedMs: number,
    hasEvidence: boolean,
    transitionSeconds: number,
  ): void {
    const transitionMs = clampRange(transitionSeconds, 3, 6, 4.5) * 1_000;
    if (this.sceneMix < 1 && elapsedMs > 0) {
      this.sceneMix = clamp01(this.sceneMix + elapsedMs / transitionMs);
    }
    if (this.sceneMix < 1) return;
    if (!hasEvidence) {
      this.candidateScene = null;
      this.candidateSupportedMs = 0;
      return;
    }

    const desiredScene = sceneForProgress(progress);
    if (desiredScene === this.scene) {
      this.candidateScene = null;
      this.candidateSupportedMs = 0;
      return;
    }
    if (desiredScene !== this.candidateScene) {
      this.candidateScene = desiredScene;
      this.candidateSupportedMs = 0;
    } else {
      this.candidateSupportedMs += elapsedMs;
    }

    const isHigher = sceneIndex(desiredScene) > sceneIndex(this.scene);
    const requiredSupportMs = isHigher
      ? HIGHER_SCENE_SUPPORT_MS
      : LOWER_SCENE_SUPPORT_MS;
    if (this.candidateSupportedMs < requiredSupportMs) return;

    this.scene = desiredScene;
    this.sceneMix = 0;
    this.candidateScene = null;
    this.candidateSupportedMs = 0;
  }
}
