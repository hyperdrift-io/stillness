import type { CameraPalette } from '../sensing/perception-signal.ts';
import type { AdaptiveScene } from '../state/adaptive-state.ts';

export type RequestedRendererQuality =
  | 'auto'
  | 'high'
  | 'balanced'
  | 'reduced';

export type RendererQuality = Exclude<RequestedRendererQuality, 'auto'>;

export type AdaptiveSceneConfiguration = {
  decay: number;
  warp: number;
};

export const adaptiveSceneConfigurations = {
  turbulence: { decay: 0.935, warp: 0.032 },
  gathering: { decay: 0.955, warp: 0.018 },
  coherence: { decay: 0.97, warp: 0.01 },
  release: { decay: 0.965, warp: 0.006 },
  radiance: { decay: 0.955, warp: 0.003 },
} as const satisfies Record<AdaptiveScene, AdaptiveSceneConfiguration>;

export type AdaptiveVisualControlFrame = {
  scene: AdaptiveScene;
  sceneMix: number;
  progress: number;
  movementEnergy: number;
  movementX: number;
  movementY: number;
  faceConfidence: number;
  faceCenterX: number;
  faceCenterY: number;
  faceScale: number;
  headYaw: number;
  headPitch: number;
  headRoll: number;
  facialTension: number;
  facialWarmth: number;
  expressiveActivation: number;
  mouthOpen: number;
  browLift: number;
  eyeClosure: number;
  breathPhase: number;
  breathConfidence: number;
  coherence: number;
  /** Lung fullness the light follows, 0 empty to 1 full, from the pacer. */
  breathFullness: number;
  /** How strongly the light follows the breath, 0..1; thins toward stillness. */
  breathAmplitude: number;
  /** 0 while the session is active, rising to 1 as pacing fades into stillness. */
  stillness: number;
  palette: CameraPalette;
  topologySegments: Float32Array;
  colorInfluence: number;
  visualIntensity: number;
  transitionSeconds: number;
  requestedQuality: RequestedRendererQuality;
  variationSeed: number;
  reducedMotion: boolean;
};

export type RendererMetrics = {
  fps: number;
  frameTimeMs: number;
  quality: RendererQuality;
};
