import { clamp01, clampSigned, safePrior, type StateEstimate } from '../experience/model.ts';

export type ObservationFeatures = {
  cameraMotion: number;
  cameraPresence: number;
  deviceMotion: number;
  variability: number;
  settlingTrend: number;
  confidence: number;
};

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function estimateState(raw: ObservationFeatures): StateEstimate {
  const confidence = clamp01(raw.confidence);
  const cameraMotion = clamp01(raw.cameraMotion);
  const deviceMotion = clamp01(raw.deviceMotion);
  const variability = clamp01(raw.variability);
  const presenceEvidence = clamp01(raw.cameraPresence);
  const trendEvidence = clampSigned(raw.settlingTrend);

  const measuredActivation = clamp01(
    cameraMotion * 0.48 + deviceMotion * 0.28 + variability * 0.24,
  );
  const measuredStability = clamp01(
    1 - (cameraMotion * 0.38 + deviceMotion * 0.24 + variability * 0.38),
  );
  const measuredPresence = clamp01(presenceEvidence * 0.82 + (1 - deviceMotion) * 0.18);

  return {
    activation: mix(safePrior.activation, measuredActivation, confidence),
    stability: mix(safePrior.stability, measuredStability, confidence),
    presence: mix(safePrior.presence, measuredPresence, confidence),
    trend: trendEvidence * confidence,
    confidence,
  };
}
