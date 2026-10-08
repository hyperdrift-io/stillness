import { clamp01 } from '../experience/model.ts';
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

export function targetResonance(state: AdaptiveState): ResonanceState {
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
