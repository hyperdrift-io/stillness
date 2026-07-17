import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';

const VISION_WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export type { FaceLandmarkerResult };

export type FaceLandmarkConnection = {
  start: number;
  end: number;
};

export type FaceLandmarkerClient = {
  detect: (video: HTMLVideoElement, timestampMs: number) => FaceLandmarkerResult;
  dispose: () => void;
};

export function faceLandmarkConnections(): FaceLandmarkConnection[] {
  const connectionSets = [
    FaceLandmarker.FACE_LANDMARKS_TESSELATION,
    FaceLandmarker.FACE_LANDMARKS_CONTOURS,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYE,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYE,
    FaceLandmarker.FACE_LANDMARKS_LEFT_EYEBROW,
    FaceLandmarker.FACE_LANDMARKS_RIGHT_EYEBROW,
    FaceLandmarker.FACE_LANDMARKS_LIPS,
  ];
  const seen = new Set<string>();
  const connections: FaceLandmarkConnection[] = [];
  for (const set of connectionSets) {
    for (const connection of set) {
      const key = `${connection.start}:${connection.end}`;
      if (seen.has(key)) continue;
      seen.add(key);
      connections.push({ start: connection.start, end: connection.end });
    }
  }
  return connections;
}


export async function createFaceLandmarkerClient(): Promise<FaceLandmarkerClient> {
  const vision = await FilesetResolver.forVisionTasks(VISION_WASM_BASE);
  const landmarker = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: FACE_LANDMARKER_MODEL_URL,
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });

  return {
    detect(video, timestampMs) {
      return landmarker.detectForVideo(video, timestampMs);
    },
    dispose() {
      landmarker.close();
    },
  };
}
