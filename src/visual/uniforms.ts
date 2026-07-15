import { clamp01 } from '../experience/model.ts';
import type { ResonanceState } from '../resonance/resonance.ts';

export type LightFieldUniforms = {
  time: number;
  width: number;
  height: number;
  complexity: number;
  turbulence: number;
  coherence: number;
  focus: number;
  depth: number;
  pulse: number;
  warmth: number;
  space: number;
  reducedMotion: number;
};

function finitePositive(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 1;
}

export function createUniformSnapshot(
  state: ResonanceState,
  time: number,
  width: number,
  height: number,
  reducedMotion: boolean,
): LightFieldUniforms {
  return {
    time: Number.isFinite(time) && time >= 0 ? time : 0,
    width: finitePositive(width),
    height: finitePositive(height),
    complexity: clamp01(state.complexity),
    turbulence: clamp01(state.turbulence),
    coherence: clamp01(state.coherence),
    focus: clamp01(state.focus),
    depth: clamp01(state.depth),
    pulse: clamp01(state.pulse),
    warmth: clamp01(state.warmth),
    space: clamp01(state.space),
    reducedMotion: reducedMotion ? 1 : 0,
  };
}
