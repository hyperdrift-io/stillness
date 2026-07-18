import {
  clamp01,
  clampSigned,
  safePrior,
  type RegulationPhase,
  type StateEstimate,
} from '../experience/model.ts';
import type { AdaptiveState } from '../state/adaptive-state.ts';

export type ResonanceState = {
  complexity: number;
  turbulence: number;
  coherence: number;
  focus: number;
  depth: number;
  pulse: number;
  audioEnergy: number;
  warmth: number;
  space: number;
};

const phaseProgress: Record<RegulationPhase, number> = {
  capture: 0,
  match: 0.18,
  entrain: 0.42,
  dissolve: 0.75,
  stillness: 1,
};

function sanitizeEstimate(estimate: StateEstimate): StateEstimate {
  return {
    activation: clamp01(estimate.activation, safePrior.activation),
    stability: clamp01(estimate.stability, safePrior.stability),
    presence: clamp01(estimate.presence, safePrior.presence),
    trend: clampSigned(estimate.trend),
    confidence: clamp01(estimate.confidence),
  };
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

/** Remove with the legacy SessionRenderFrame controller path in Task 8. */
export function legacyTargetResonance(
  rawEstimate: StateEstimate,
  phase: RegulationPhase,
): ResonanceState {
  const estimate = sanitizeEstimate(rawEstimate);
  const confidence = estimate.confidence;
  const activation = mix(safePrior.activation, estimate.activation, confidence);
  const stability = mix(safePrior.stability, estimate.stability, confidence);
  const presence = mix(safePrior.presence, estimate.presence, confidence);
  const trend = estimate.trend * confidence;
  const progress = phaseProgress[phase];
  const progressInfluence = progress * 0.42;

  // Meet the observed velocity, then guide it by a small confidence-scaled amount.
  const guidedActivation = clamp01(activation * (1 - 0.1 * confidence));
  const guidedStability = clamp01(stability + (1 - stability) * 0.1 * confidence);
  const settling = clamp01(guidedStability + Math.max(0, trend) * 0.15);

  return {
    complexity: clamp01(0.04 + guidedActivation * 0.7 + (1 - progressInfluence) * 0.24),
    turbulence: clamp01(0.02 + guidedActivation * 0.72 + (1 - settling) * 0.16 - progressInfluence * 0.08),
    coherence: clamp01(0.22 + settling * 0.52 + progressInfluence * 0.25),
    focus: clamp01(0.42 + presence * 0.38 + (1 - progressInfluence) * 0.16),
    depth: clamp01(0.32 + guidedActivation * 0.2 + presence * 0.18 + (1 - progressInfluence) * 0.22),
    pulse: clamp01(0.12 + guidedActivation * 0.62 + (1 - progressInfluence) * 0.16),
    audioEnergy: clamp01(0.035 + guidedActivation * 0.62 + (1 - progressInfluence) * 0.18),
    warmth: clamp01(0.28 + (1 - progress) * 0.46 + guidedActivation * 0.18),
    space: clamp01(0.18 + settling * 0.34 + progressInfluence * 0.48),
  };
}

function adaptiveTargetResonance(state: AdaptiveState): ResonanceState {
  const expressiveActivation = clamp01(state.expressiveActivation);
  const movementEnergy = clamp01(state.movementEnergy);
  const facialTension = clamp01(state.facialTension);
  const facialWarmth = clamp01(state.facialWarmth);
  const temporalCoherence = clamp01(state.temporalCoherence);
  const progress = clamp01(state.progress);
  const overallConfidence = clamp01(state.overallConfidence);
  const breathRegularity = clamp01(state.breathRegularity);
  const breathConfidence = clamp01(state.breathConfidence);
  const breathPhase = clamp01(state.breathPhase, 0.5);

  return {
    complexity: clamp01(0.18 + expressiveActivation * 0.52 + movementEnergy * 0.3),
    turbulence: clamp01(
      movementEnergy * 0.52 + facialTension * 0.3 + (1 - temporalCoherence) * 0.18,
    ),
    coherence: clamp01(temporalCoherence * 0.55 + progress * 0.45),
    focus: clamp01(0.35 + overallConfidence * 0.3 + progress * 0.35),
    depth: clamp01(0.28 + progress * 0.5 + breathRegularity * 0.22),
    pulse: breathConfidence > 0.35 ? breathPhase : 0.5,
    audioEnergy: clamp01(0.12 + movementEnergy * 0.34 + (1 - progress) * 0.18),
    warmth: clamp01(0.18 + facialWarmth * 0.36 + progress * 0.24),
    space: clamp01(0.12 + progress * 0.68 + temporalCoherence * 0.2),
  };
}

export function targetResonance(state: AdaptiveState): ResonanceState;
/**
 * @deprecated Prototype type-check still includes the pre-cutover resonance
 * suite. Runtime compatibility callers must use legacyTargetResonance directly.
 */
export function targetResonance(
  state: StateEstimate,
  phase: RegulationPhase,
): ResonanceState;
export function targetResonance(
  state: AdaptiveState | StateEstimate,
  phase?: RegulationPhase,
): ResonanceState {
  if (phase !== undefined) return legacyTargetResonance(state as StateEstimate, phase);
  return adaptiveTargetResonance(state as AdaptiveState);
}
