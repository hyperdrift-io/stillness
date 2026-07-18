export type FacialPattern = {
  activity: number;
  tension: number;
  warmth: number;
  mouthOpen: number;
  browLift: number;
  eyeClosure: number;
};

export type SpatialMotion = {
  energy: number;
  x: number;
  y: number;
};

export type ShoulderPose = {
  visible: boolean;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  confidence: number;
};

export type CameraPalette = {
  shadow: readonly [number, number, number];
  mid: readonly [number, number, number];
  light: readonly [number, number, number];
  confidence: number;
};

export type PerceptionConfidence = {
  face: number;
  shoulders: number;
  palette: number;
  overall: number;
};

export type PerceptionSnapshot = {
  timestampMs: number;
  facePresent: boolean;
  faceConfidence: number;
  faceCenterX: number;
  faceCenterY: number;
  faceScale: number;
  yaw: number;
  pitch: number;
  roll: number;
  facial: FacialPattern;
  motion: SpatialMotion;
  shoulders: ShoulderPose;
  luminance: number;
  palette: CameraPalette;
  topologySegments: Float32Array;
  quality: number;
};

export const initialPerceptionSnapshot: PerceptionSnapshot = {
  timestampMs: 0,
  facePresent: false,
  faceConfidence: 0,
  faceCenterX: 0,
  faceCenterY: 0,
  faceScale: 0,
  yaw: 0,
  pitch: 0,
  roll: 0,
  facial: {
    activity: 0,
    tension: 0,
    warmth: 0,
    mouthOpen: 0,
    browLift: 0,
    eyeClosure: 0,
  },
  motion: {
    energy: 0,
    x: 0,
    y: 0,
  },
  shoulders: {
    visible: false,
    leftX: 0,
    leftY: 0,
    rightX: 0,
    rightY: 0,
    confidence: 0,
  },
  luminance: 0,
  palette: {
    shadow: [0, 0, 0],
    mid: [0.02, 0.04, 0.08],
    light: [0.08, 0.14, 0.22],
    confidence: 0,
  },
  topologySegments: new Float32Array(),
  quality: 0,
};
