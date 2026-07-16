export type MirrorPoint = {
  x: number;
  y: number;
  z: number;
};

export type MirrorTopology = {
  points: MirrorPoint[];
  centerX: number;
  centerY: number;
  scale: number;
  yaw: number;
  pitch: number;
  roll: number;
};

export type MirrorSignal = {
  mode: 'mirror' | 'pure';
  motion: number;
  presence: number;
  confidence: number;
  luminance: number;
  expressionActivity: number;
  softness: number;
  topology: MirrorTopology | null;
};

export const initialMirrorSignal: MirrorSignal = Object.freeze({
  mode: 'pure',
  motion: 0,
  presence: 0,
  confidence: 0,
  luminance: 0,
  expressionActivity: 0,
  softness: 0,
  topology: null,
});
