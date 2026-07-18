import {
  FaceLandmarker,
  FilesetResolver,
  PoseLandmarker,
  type FaceLandmarkerResult,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import {
  FACE_LANDMARKER_MODEL_URL,
  POSE_LANDMARKER_MODEL_URL,
  VISION_WASM_BASE,
  faceLandmarkConnections,
} from './face-landmarker-client.ts';
import type {
  CameraPalette,
  FacialPattern,
  PerceptionSnapshot,
  ShoulderPose,
  SpatialMotion,
} from './perception-signal.ts';
import type {
  PerceptionWorkerRequest,
  PerceptionWorkerResult,
} from './perception-worker-protocol.ts';

const ANALYSIS_WIDTH = 80;
const ANALYSIS_HEIGHT = 60;
const LEFT_SHOULDER_INDEX = 11;
const RIGHT_SHOULDER_INDEX = 12;
const MIN_CONFIDENCE = 0.5;

type Delegate = 'GPU' | 'CPU';
type VisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

type WorkerScope = {
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<PerceptionWorkerRequest>) => void,
  ) => void;
  close: () => void;
  postMessage: (message: PerceptionWorkerResult, transfer?: Transferable[]) => void;
};

type FrameFeatures = {
  luminance: Uint8Array;
  meanLuminance: number;
  motion: SpatialMotion;
  palette: CameraPalette;
};

type FaceFeatures = Pick<
  PerceptionSnapshot,
  | 'facePresent'
  | 'faceConfidence'
  | 'faceCenterX'
  | 'faceCenterY'
  | 'faceScale'
  | 'yaw'
  | 'pitch'
  | 'roll'
  | 'facial'
  | 'topologySegments'
>;

const workerScope = globalThis as unknown as WorkerScope;
const analysisCanvas = new OffscreenCanvas(ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
const analysisContext = analysisCanvas.getContext('2d', { willReadFrequently: true });
const connections = faceLandmarkConnections();

let faceLandmarker: FaceLandmarker | null = null;
let poseLandmarker: PoseLandmarker | null = null;
let previousLuminance: Uint8Array | null = null;
let previousBlendshapes = new Map<string, number>();
let disposed = false;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function closeLandmarkers(): void {
  faceLandmarker?.close();
  poseLandmarker?.close();
  faceLandmarker = null;
  poseLandmarker = null;
}

async function createLandmarkers(vision: VisionFileset, delegate: Delegate): Promise<void> {
  let nextFace: FaceLandmarker | null = null;
  let nextPose: PoseLandmarker | null = null;
  const canvas = delegate === 'GPU' ? new OffscreenCanvas(1, 1) : undefined;

  try {
    nextFace = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: FACE_LANDMARKER_MODEL_URL,
        delegate,
      },
      ...(canvas ? { canvas } : {}),
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: MIN_CONFIDENCE,
      minFacePresenceConfidence: MIN_CONFIDENCE,
      minTrackingConfidence: MIN_CONFIDENCE,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
    nextPose = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: POSE_LANDMARKER_MODEL_URL,
        delegate,
      },
      ...(canvas ? { canvas } : {}),
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: MIN_CONFIDENCE,
      minPosePresenceConfidence: MIN_CONFIDENCE,
      minTrackingConfidence: MIN_CONFIDENCE,
      outputSegmentationMasks: false,
    });
  } catch (error) {
    nextFace?.close();
    nextPose?.close();
    throw error;
  }

  faceLandmarker = nextFace;
  poseLandmarker = nextPose;
}

async function initialize(): Promise<void> {
  closeLandmarkers();
  const vision = await FilesetResolver.forVisionTasks(VISION_WASM_BASE);
  try {
    await createLandmarkers(vision, 'GPU');
  } catch {
    closeLandmarkers();
    await createLandmarkers(vision, 'CPU');
  }
}

function analyseFrame(frame: ImageBitmap): FrameFeatures {
  if (!analysisContext) throw new Error('Relief perception worker could not create a 2D analysis context.');

  analysisContext.drawImage(frame, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
  const pixels = analysisContext.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT).data;
  const luminance = new Uint8Array(ANALYSIS_WIDTH * ANALYSIS_HEIGHT);
  const paletteSums = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];
  let luminanceSum = 0;
  let luminanceSquares = 0;
  let differenceSum = 0;
  let differenceX = 0;
  let differenceY = 0;

  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4;
    const red = pixels[offset] ?? 0;
    const green = pixels[offset + 1] ?? 0;
    const blue = pixels[offset + 2] ?? 0;
    const value = Math.round(red * 0.2126 + green * 0.7152 + blue * 0.0722);
    const normalized = value / 255;
    const bucket = normalized < 0.33 ? 0 : normalized < 0.67 ? 1 : 2;
    const sums = paletteSums[bucket];
    if (sums) {
      sums[0] = (sums[0] ?? 0) + red;
      sums[1] = (sums[1] ?? 0) + green;
      sums[2] = (sums[2] ?? 0) + blue;
      sums[3] = (sums[3] ?? 0) + 1;
    }

    luminance[index] = value;
    luminanceSum += value;
    luminanceSquares += value * value;

    if (previousLuminance) {
      const difference = Math.abs(value - (previousLuminance[index] ?? value));
      differenceSum += difference;
      const x = index % ANALYSIS_WIDTH;
      const y = Math.floor(index / ANALYSIS_WIDTH);
      differenceX += difference * (x / (ANALYSIS_WIDTH - 1) * 2 - 1);
      differenceY += difference * (1 - y / (ANALYSIS_HEIGHT - 1) * 2);
    }
  }

  const sampleCount = luminance.length;
  const meanLuminance = luminanceSum / sampleCount / 255;
  const variance = Math.max(
    0,
    luminanceSquares / sampleCount / (255 * 255) - meanLuminance * meanLuminance,
  );
  const motionEnergy = previousLuminance
    ? clamp01(differenceSum / sampleCount / 255 * 4.5)
    : 0;
  const paletteFallbacks: CameraPalette = {
    shadow: [0, 0, 0],
    mid: [0.02, 0.04, 0.08],
    light: [0.08, 0.14, 0.22],
    confidence: 0,
  };
  const paletteColor = (
    bucket: number,
    fallback: readonly [number, number, number],
  ): readonly [number, number, number] => {
    const sums = paletteSums[bucket];
    const count = sums?.[3] ?? 0;
    if (!sums || count === 0) return fallback;
    return [
      (sums[0] ?? 0) / count / 255,
      (sums[1] ?? 0) / count / 255,
      (sums[2] ?? 0) / count / 255,
    ];
  };
  const exposureConfidence = clamp01(1 - Math.abs(meanLuminance - 0.48) * 1.8);
  const detailConfidence = clamp01(variance * 18);

  return {
    luminance,
    meanLuminance,
    motion: {
      energy: motionEnergy,
      x: differenceSum > 0 ? clamp01(Math.abs(differenceX / differenceSum)) * Math.sign(differenceX) : 0,
      y: differenceSum > 0 ? clamp01(Math.abs(differenceY / differenceSum)) * Math.sign(differenceY) : 0,
    },
    palette: {
      shadow: paletteColor(0, paletteFallbacks.shadow),
      mid: paletteColor(1, paletteFallbacks.mid),
      light: paletteColor(2, paletteFallbacks.light),
      confidence: exposureConfidence * (0.35 + detailConfidence * 0.65),
    },
  };
}

function averageBlendshapes(scores: Map<string, number>, names: readonly string[]): number {
  let sum = 0;
  let matches = 0;
  for (const [name, score] of scores) {
    if (!names.some((candidate) => name.includes(candidate))) continue;
    sum += score;
    matches += 1;
  }
  return clamp01(sum / Math.max(1, matches));
}

function analyseFacialPattern(result: FaceLandmarkerResult): FacialPattern {
  const categories = result.faceBlendshapes[0]?.categories ?? [];
  const scores = new Map<string, number>();
  let activity = 0;

  for (const category of categories) {
    const name = category.categoryName.toLowerCase();
    const score = clamp01(category.score);
    activity += Math.abs(score - (previousBlendshapes.get(name) ?? score));
    previousBlendshapes.set(name, score);
    scores.set(name, score);
  }

  return {
    activity: clamp01(activity / Math.max(1, categories.length) * 12),
    tension: averageBlendshapes(scores, ['browdown', 'eyesquint', 'mouthpress', 'mouthfrown']),
    warmth: averageBlendshapes(scores, ['mouthsmile', 'cheeksquint']),
    mouthOpen: averageBlendshapes(scores, ['jawopen', 'mouthfunnel', 'mouthpucker']),
    browLift: averageBlendshapes(scores, ['browinnerup', 'browouterup']),
    eyeClosure: averageBlendshapes(scores, ['eyeblink', 'eyesquint']),
  };
}

function analyseFace(result: FaceLandmarkerResult): FaceFeatures {
  const landmarks = result.faceLandmarks[0] ?? [];
  if (landmarks.length === 0) {
    previousBlendshapes.clear();
    return {
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
      topologySegments: new Float32Array(),
    };
  }

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const landmark of landmarks) {
    minX = Math.min(minX, landmark.x);
    minY = Math.min(minY, landmark.y);
    maxX = Math.max(maxX, landmark.x);
    maxY = Math.max(maxY, landmark.y);
  }

  const topologySegments = new Float32Array(connections.length * 6);
  let topologyOffset = 0;
  for (const connection of connections) {
    const start = landmarks[connection.start];
    const end = landmarks[connection.end];
    if (!start || !end) continue;
    topologySegments[topologyOffset] = start.x;
    topologySegments[topologyOffset + 1] = start.y;
    topologySegments[topologyOffset + 2] = start.z;
    topologySegments[topologyOffset + 3] = end.x;
    topologySegments[topologyOffset + 4] = end.y;
    topologySegments[topologyOffset + 5] = end.z;
    topologyOffset += 6;
  }

  const matrix = result.facialTransformationMatrixes[0]?.data ?? [];
  return {
    facePresent: true,
    faceConfidence: 1,
    faceCenterX: (minX + maxX) * 0.5,
    faceCenterY: (minY + maxY) * 0.5,
    faceScale: Math.max(maxX - minX, maxY - minY),
    yaw: Number(matrix[8] ?? 0),
    pitch: Number(matrix[9] ?? 0),
    roll: Number(matrix[1] ?? 0),
    facial: analyseFacialPattern(result),
    topologySegments:
      topologyOffset === topologySegments.length
        ? topologySegments
        : topologySegments.slice(0, topologyOffset),
  };
}

function analyseShoulders(result: PoseLandmarkerResult): ShoulderPose {
  const landmarks = result.landmarks[0];
  const left = landmarks?.[LEFT_SHOULDER_INDEX];
  const right = landmarks?.[RIGHT_SHOULDER_INDEX];
  if (!left || !right) {
    return {
      visible: false,
      leftX: 0,
      leftY: 0,
      rightX: 0,
      rightY: 0,
      confidence: 0,
    };
  }

  const confidence = clamp01(Math.min(left.visibility ?? 0, right.visibility ?? 0));
  return {
    visible: confidence >= MIN_CONFIDENCE,
    leftX: left.x,
    leftY: left.y,
    rightX: right.x,
    rightY: right.y,
    confidence,
  };
}

function distanceToSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(x - x1, y - y1);
  const amount = clamp01(((x - x1) * dx + (y - y1) * dy) / lengthSquared);
  return Math.hypot(x - (x1 + dx * amount), y - (y1 + dy * amount));
}

function createModulation(
  frameFeatures: FrameFeatures,
  face: FaceFeatures,
  shoulders: ShoulderPose,
): ImageBitmap {
  if (!analysisContext) throw new Error('Relief perception worker lost its 2D analysis context.');

  const output = analysisContext.createImageData(ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
  const faceRadius = Math.max(0.08, face.faceScale * 0.72);
  const shoulderWidth = shoulders.visible
    ? Math.max(0.02, Math.hypot(shoulders.rightX - shoulders.leftX, shoulders.rightY - shoulders.leftY) * 0.14)
    : 0;

  for (let y = 0; y < ANALYSIS_HEIGHT; y += 1) {
    for (let x = 0; x < ANALYSIS_WIDTH; x += 1) {
      const index = y * ANALYSIS_WIDTH + x;
      const offset = index * 4;
      const value = frameFeatures.luminance[index] ?? 0;
      const left = x > 0 ? (frameFeatures.luminance[index - 1] ?? value) : value;
      const up = y > 0 ? (frameFeatures.luminance[index - ANALYSIS_WIDTH] ?? value) : value;
      const gradient = clamp01(Math.hypot(value - left, value - up) / (255 * Math.SQRT2));
      const difference = previousLuminance
        ? Math.abs(value - (previousLuminance[index] ?? value)) / 255
        : 0;
      const normalizedX = x / (ANALYSIS_WIDTH - 1);
      const normalizedY = y / (ANALYSIS_HEIGHT - 1);
      const faceDistance = face.facePresent
        ? Math.hypot(
          (normalizedX - face.faceCenterX) / faceRadius,
          (normalizedY - face.faceCenterY) / (faceRadius * 1.2),
        )
        : Number.POSITIVE_INFINITY;
      const faceInfluence = face.facePresent ? Math.exp(-faceDistance * faceDistance * 1.8) : 0;
      const shoulderDistance = shoulders.visible
        ? distanceToSegment(
          normalizedX,
          normalizedY,
          shoulders.leftX,
          shoulders.leftY,
          shoulders.rightX,
          shoulders.rightY,
        )
        : Number.POSITIVE_INFINITY;
      const shoulderInfluence = shoulders.visible
        ? Math.exp(-(shoulderDistance * shoulderDistance) / (shoulderWidth * shoulderWidth))
        : 0;

      output.data[offset] = Math.round(gradient * 255);
      output.data[offset + 1] = Math.round(clamp01(difference) * 255);
      output.data[offset + 2] = Math.round(clamp01(Math.max(faceInfluence, shoulderInfluence)) * 255);
      output.data[offset + 3] = 255;
    }
  }

  analysisContext.putImageData(output, 0, 0);
  return analysisCanvas.transferToImageBitmap();
}

function analyse(frame: ImageBitmap, timestampMs: number): {
  snapshot: PerceptionSnapshot;
  modulation: ImageBitmap;
} {
  if (!faceLandmarker || !poseLandmarker) {
    throw new Error('Relief perception worker is not initialized.');
  }

  const frameFeatures = analyseFrame(frame);
  const faceResult = faceLandmarker.detectForVideo(frame, timestampMs);
  const poseResult = poseLandmarker.detectForVideo(frame, timestampMs);

  try {
    const face = analyseFace(faceResult);
    const shoulders = analyseShoulders(poseResult);
    const modulation = createModulation(frameFeatures, face, shoulders);
    previousLuminance = frameFeatures.luminance;
    const quality = clamp01(
      face.faceConfidence * 0.5 + shoulders.confidence * 0.2 + frameFeatures.palette.confidence * 0.3,
    );

    return {
      snapshot: {
        timestampMs,
        ...face,
        motion: frameFeatures.motion,
        shoulders,
        luminance: frameFeatures.meanLuminance,
        palette: frameFeatures.palette,
        quality,
      },
      modulation,
    };
  } finally {
    poseResult.close();
  }
}

function dispose(): void {
  disposed = true;
  closeLandmarkers();
  previousLuminance = null;
  previousBlendshapes.clear();
}

workerScope.addEventListener('message', (event) => {
  const request = event.data;
  if (request.type === 'initialize') {
    void initialize()
      .then(() => {
        if (!disposed) workerScope.postMessage({ type: 'ready' });
      })
      .catch((error: unknown) => {
        closeLandmarkers();
        workerScope.postMessage({ type: 'error', message: messageFromError(error) });
      });
    return;
  }

  if (request.type === 'dispose') {
    dispose();
    workerScope.close();
    return;
  }

  let modulation: ImageBitmap | null = null;
  try {
    const analysis = analyse(request.frame, request.timestampMs);
    modulation = analysis.modulation;
    workerScope.postMessage(
      {
        type: 'result',
        requestId: request.requestId,
        snapshot: analysis.snapshot,
        modulation,
      },
      [analysis.snapshot.topologySegments.buffer as ArrayBuffer, modulation],
    );
    modulation = null;
  } catch (error) {
    modulation?.close();
    workerScope.postMessage({
      type: 'error',
      requestId: request.requestId,
      message: messageFromError(error),
    });
  } finally {
    request.frame.close();
  }
});
