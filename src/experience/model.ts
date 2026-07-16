import type { ResonanceState } from '../resonance/resonance.ts';
import type { MirrorSignal } from '../sensing/mirror-signal.ts';

export const regulationPhases = [
  'capture',
  'match',
  'entrain',
  'dissolve',
  'stillness',
] as const;

export type RegulationPhase = (typeof regulationPhases)[number];

export type StateEstimate = {
  activation: number;
  stability: number;
  presence: number;
  trend: number;
  confidence: number;
};

export type ReliefState = StateEstimate & {
  motion: number;
  expressionActivity: number;
  softness: number;
  turbulence: number;
  settling: number;
  relief: number;
  readiness: number;
};

export type SessionRenderFrame = {
  resonance: ResonanceState;
  relief: ReliefState;
  mirror: MirrorSignal;
};

export const safePrior: StateEstimate = {
  activation: 0.65,
  stability: 0.35,
  presence: 0.5,
  trend: 0,
  confidence: 0,
};

export function clamp01(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

export function clampSigned(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(-1, value));
}
