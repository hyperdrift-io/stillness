import { clamp01, clampSigned } from '../experience/model.ts';
import type { CalibrationStatus } from '../sensing/calibration-controller.ts';
import type { BreathSignal } from '../sensing/breath-estimator.ts';
import type {
  CameraPalette,
  PerceptionSnapshot,
} from '../sensing/perception-signal.ts';

export const adaptiveScenes = [
  'turbulence',
  'gathering',
  'coherence',
  'release',
  'radiance',
] as const;

export type AdaptiveScene = (typeof adaptiveScenes)[number];

export type AdaptiveSignal =
  | 'movement'
  | 'breathing'
  | 'facialRelease'
  | 'coherence';

export type SignalContribution = {
  value: number;
  confidence: number;
  configuredWeight: number;
  effectiveWeight: number;
};

export type AdaptiveState = {
  scene: AdaptiveScene;
  sceneMix: number;
  progress: number;
  trend: number;
  facialTension: number;
  facialWarmth: number;
  expressiveActivation: number;
  movementEnergy: number;
  movementX: number;
  movementY: number;
  postureStability: number;
  breathPhase: number;
  breathRegularity: number;
  breathConfidence: number;
  temporalCoherence: number;
  overallConfidence: number;
  contributions: Record<AdaptiveSignal, SignalContribution>;
};

export type AdaptiveTuning = {
  signalSensitivity: number;
  colorInfluence: number;
  transitionSeconds: number;
  visualIntensity: number;
  quality: 'auto' | 'high' | 'balanced' | 'reduced';
};

export type AdaptiveStateInput = {
  perception: PerceptionSnapshot;
  breath: BreathSignal;
  calibration: CalibrationStatus;
  deviceMotion: { energy: number; x: number; y: number; confidence: number };
  tuning: AdaptiveTuning;
  nowMs: number;
};

/**
 * Structural hand-off to the adaptive renderer introduced in Task 6. Keeping
 * the mapping here makes the controller independent of React preference state.
 */
export type AdaptiveVisualControlFrame = {
  scene: AdaptiveScene;
  sceneMix: number;
  progress: number;
  movementEnergy: number;
  movementX: number;
  movementY: number;
  facialTension: number;
  facialWarmth: number;
  expressiveActivation: number;
  breathPhase: number;
  breathConfidence: number;
  coherence: number;
  palette: CameraPalette;
  topologySegments: Float32Array;
  colorInfluence: number;
  visualIntensity: number;
  transitionSeconds: number;
  requestedQuality: AdaptiveTuning['quality'];
  variationSeed: number;
  reducedMotion: boolean;
};

function clampRange(value: number, minimum: number, maximum: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, value));
}

function sanitizeQuality(value: AdaptiveTuning['quality']): AdaptiveTuning['quality'] {
  return value === 'high' || value === 'balanced' || value === 'reduced'
    ? value
    : 'auto';
}

function sanitizeColor(
  color: readonly [number, number, number],
): readonly [number, number, number] {
  return [clamp01(color[0]), clamp01(color[1]), clamp01(color[2])];
}

function sanitizePalette(palette: CameraPalette): CameraPalette {
  return {
    shadow: sanitizeColor(palette.shadow),
    mid: sanitizeColor(palette.mid),
    light: sanitizeColor(palette.light),
    confidence: clamp01(palette.confidence),
  };
}

export function toVisualControlFrame(
  state: AdaptiveState,
  perception: PerceptionSnapshot,
  tuning: AdaptiveTuning,
  variationSeed: number,
): AdaptiveVisualControlFrame {
  return {
    scene: state.scene,
    sceneMix: clamp01(state.sceneMix),
    progress: clamp01(state.progress),
    movementEnergy: clamp01(state.movementEnergy),
    movementX: clampSigned(state.movementX),
    movementY: clampSigned(state.movementY),
    facialTension: clamp01(state.facialTension),
    facialWarmth: clamp01(state.facialWarmth),
    expressiveActivation: clamp01(state.expressiveActivation),
    breathPhase: clamp01(state.breathPhase),
    breathConfidence: clamp01(state.breathConfidence),
    coherence: clamp01(state.temporalCoherence),
    palette: sanitizePalette(perception.palette),
    topologySegments: perception.topologySegments instanceof Float32Array
      ? perception.topologySegments
      : new Float32Array(),
    colorInfluence: clampRange(tuning.colorInfluence, 0.15, 0.25, 0.2),
    visualIntensity: clampRange(tuning.visualIntensity, 0.75, 1.25, 1),
    transitionSeconds: clampRange(tuning.transitionSeconds, 3, 6, 4.5),
    requestedQuality: sanitizeQuality(tuning.quality),
    variationSeed: Number.isFinite(variationSeed) ? Math.trunc(variationSeed) : 0,
    // The renderer owns the browser media-query check; this pure mapper has no
    // ambient browser dependency and therefore supplies the neutral default.
    reducedMotion: false,
  };
}
