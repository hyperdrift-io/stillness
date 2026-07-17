export type MirrorPoint = {
  x: number;
  y: number;
  z: number;
};

export type MirrorConnection = {
  start: number;
  end: number;
};

export type MirrorExpression = {
  activity: number;
  mouthOpen: number;
  mouthSmile: number;
  browLift: number;
  browTension: number;
  eyeClosure: number;
};

export type MirrorTopology = {
  points: MirrorPoint[];
  connections: MirrorConnection[];
  centerX: number;
  centerY: number;
  scale: number;
  yaw: number;
  pitch: number;
  roll: number;
};

export type MirrorSignal = {
  mode: 'mirror' | 'pure';
  sourceVideo: HTMLVideoElement | null;
  motion: number;
  presence: number;
  confidence: number;
  luminance: number;
  expressionActivity: number;
  expression: MirrorExpression;
  softness: number;
  topology: MirrorTopology | null;
};

export const neutralMirrorExpression: MirrorExpression = Object.freeze({
  activity: 0,
  mouthOpen: 0,
  mouthSmile: 0,
  browLift: 0,
  browTension: 0,
  eyeClosure: 0,
});

export const initialMirrorSignal: MirrorSignal = Object.freeze({
  mode: 'pure',
  sourceVideo: null,
  motion: 0,
  presence: 0,
  confidence: 0,
  luminance: 0,
  expressionActivity: 0,
  expression: neutralMirrorExpression,
  softness: 0,
  topology: null,
});
