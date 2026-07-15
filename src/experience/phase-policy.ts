import type { RegulationPhase } from './model.ts';

export const phaseBoundaries = {
  match: 5_000,
  entrain: 20_000,
  dissolve: 60_000,
  stillness: 180_000,
} as const;

export function phaseForElapsed(elapsedMs: number): RegulationPhase {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'capture';
  if (elapsedMs < phaseBoundaries.match) return 'capture';
  if (elapsedMs < phaseBoundaries.entrain) return 'match';
  if (elapsedMs < phaseBoundaries.dissolve) return 'entrain';
  if (elapsedMs < phaseBoundaries.stillness) return 'dissolve';
  return 'stillness';
}
