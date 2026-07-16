import {
  clamp01,
  clampSigned,
  safePrior,
  type ReliefState,
  type StateEstimate,
} from '../experience/model.ts';

export type ReliefObservationFeatures = {
  cameraMotion: number;
  cameraPresence: number;
  deviceMotion: number;
  variability: number;
  settlingTrend: number;
  expressionActivity: number;
  softness: number;
  confidence: number;
  elapsedProgress: number;
};

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function estimateState(raw: ReliefObservationFeatures): StateEstimate {
  return estimateReliefState(raw);
}

export function estimateReliefState(raw: ReliefObservationFeatures): ReliefState {
  const confidence = clamp01(raw.confidence);
  const cameraMotion = clamp01(raw.cameraMotion);
  const deviceMotion = clamp01(raw.deviceMotion);
  const variability = clamp01(raw.variability);
  const expressionActivity = clamp01(raw.expressionActivity);
  const softness = clamp01(raw.softness);
  const presenceEvidence = clamp01(raw.cameraPresence);
  const trendEvidence = clampSigned(raw.settlingTrend);
  const elapsedProgress = clamp01(raw.elapsedProgress);

  const measuredMotion = clamp01(cameraMotion * 0.46 + deviceMotion * 0.18 + expressionActivity * 0.36);
  const turbulence = clamp01(measuredMotion * 0.54 + variability * 0.3 + (1 - softness) * 0.16);
  const settling = clamp01((1 - turbulence) * 0.64 + Math.max(0, trendEvidence) * 0.22 + softness * 0.14);
  const measuredActivation = clamp01(turbulence * 0.72 + measuredMotion * 0.28);
  const measuredStability = clamp01(settling * 0.75 + (1 - variability) * 0.25);
  const measuredPresence = clamp01(presenceEvidence * 0.88 + confidence * 0.12);
  const relief = clamp01(settling * 0.72 + softness * 0.18 + elapsedProgress * 0.1);
  const readiness = clamp01(Math.max(0, relief - 0.18) * 0.65 + measuredStability * 0.25 + elapsedProgress * 0.1);

  return {
    activation: mix(safePrior.activation, measuredActivation, confidence),
    stability: mix(safePrior.stability, measuredStability, confidence),
    presence: mix(safePrior.presence, measuredPresence, confidence),
    trend: trendEvidence * confidence,
    confidence,
    motion: measuredMotion,
    expressionActivity,
    softness,
    turbulence,
    settling,
    relief,
    readiness,
  };
}
