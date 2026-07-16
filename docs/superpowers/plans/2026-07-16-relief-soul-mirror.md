# Relief Soul Mirror Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Relief as a mirror-first PWA where a local, face-structured soul mirror produces immediate relief first and renewed readiness second, while Pure remains the no-camera fallback.

**Architecture:** Keep one session engine and one state model. Add a `MirrorSignalAdapter` that owns camera and MediaPipe, a `ReliefStateEstimator` extension that turns landmarks/blendshapes into shared state, and a `SoulMirrorRenderer` behind the existing renderer port. Keep the existing light field as Pure mode and fallback.

**Tech Stack:** Waku, React 19, TypeScript, semantic CSS, browser `getUserMedia`, MediaPipe Tasks Vision `@mediapipe/tasks-vision@0.10.35`, Canvas 2D for the soul mirror, existing WebGL2 light field for Pure mode, Web Audio.

## Global Constraints

- Use pnpm everywhere.
- New UI remains own-stack/Waku; no Next.js migration.
- Semantic CSS only: no Tailwind, no utility chains, no presentation inline styles, no CSS-in-JS.
- Camera frames, landmarks, blendshapes, audio, and motion samples stay on device.
- No normal webcam feed, realistic avatar, skin tone reconstruction, identity cues, age/gender/beauty cues, or face-recognition behavior.
- User-facing copy may describe movement, steadiness, presence, signal quality, expression signals, relief, and readiness.
- User-facing copy must not claim stress, anxiety, mood, emotion recognition, diagnosis, or biological battery measurement.
- Mirror is default. Pure is the no-camera fallback. Guidance is a setting layered onto either mode.
- Prototype validation must not add, expand, or run automated test suites. Validate through production deploy-safety checks and user feedback after significant changes.
- Significant product changes should be deployed to `https://stillness.hyperdrift.io` before further steering.

---

## File Structure

- Modify `package.json` and `pnpm-lock.yaml`: add `@mediapipe/tasks-vision@0.10.35`.
- Create `src/sensing/face-landmarker-client.ts`: lazy MediaPipe loader and `detectForVideo` wrapper.
- Create `src/sensing/mirror-signal.ts`: shared signal and topology types used by sensing, state, renderer, metrics.
- Create `src/sensing/mirror-signal-adapter.ts`: camera ownership, video frame sampling, MediaPipe landmark/blendshape extraction, whole-frame fallback.
- Modify `src/sensing/camera-sensor.ts`: keep as lightweight camera-motion fallback for Pure/no-MediaPipe paths.
- Modify `src/experience/model.ts`: add Relief session state types and rendering frame type.
- Modify `src/state/state-estimator.ts`: replace the current stillness-only estimate with Relief-aware state derivation while preserving existing activation/stability inputs.
- Modify `src/experience/session-controller.ts`: consume mirror signals, emit richer telemetry, and pass a render frame to renderers.
- Create `src/visual/soul-mirror-renderer.ts`: Canvas 2D abstract face topology renderer.
- Modify `src/visual/light-field-renderer.ts`: adapt to the new renderer port and ignore mirror topology for Pure/fallback.
- Modify `src/experience/session-preferences.ts`: add explicit `mode: 'mirror' | 'pure'` while preserving guidance/sound/signals/camera toggles.
- Modify `src/experience/stillness-experience.tsx`: update Relief landing copy, mode controls, renderer/adapter selection, fallback messaging.
- Modify `src/experience/session-menu.tsx`: expose Mirror/Pure, expression activity, turbulence, relief, readiness, confidence.
- Modify `src/experience/guidance-policy.ts`: map the richer state to sparse Relief guidance.
- Modify `src/audio/stillness-audio.ts`: make Restore phase feel supported by audio without abrupt changes.
- Modify `src/styles.css`: update naming/copy surfaces and soul mirror/menu/start screen styling.
- Update `AGENTS.md`: record the Relief/Mirror direction and MediaPipe dependency boundary.

---

### Task 1: Add MediaPipe Face Landmarker Loader

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/sensing/face-landmarker-client.ts`

**Interfaces:**
- Consumes: browser `HTMLVideoElement`, `performance.now()`, MediaPipe Tasks Vision.
- Produces:
  - `createFaceLandmarkerClient(): Promise<FaceLandmarkerClient>`
  - `FaceLandmarkerClient.detect(video: HTMLVideoElement, timestampMs: number): FaceLandmarkerResult`
  - `FaceLandmarkerClient.dispose(): void`

- [ ] **Step 1: Add the dependency**

Run:

```bash
pnpm add @mediapipe/tasks-vision@0.10.35
```

Expected: `package.json` contains `@mediapipe/tasks-vision` and `pnpm-lock.yaml` changes.

- [ ] **Step 2: Create the lazy client wrapper**

Create `src/sensing/face-landmarker-client.ts`:

```ts
import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
} from '@mediapipe/tasks-vision';

const VISION_WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm';
const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export type { FaceLandmarkerResult };

export type FaceLandmarkerClient = {
  detect: (video: HTMLVideoElement, timestampMs: number) => FaceLandmarkerResult;
  dispose: () => void;
};

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
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml src/sensing/face-landmarker-client.ts
git commit -m "feat: add face landmarker client"
```

---

### Task 2: Define Mirror Signal Types

**Files:**
- Create: `src/sensing/mirror-signal.ts`
- Modify: `src/experience/model.ts`

**Interfaces:**
- Produces:
  - `MirrorPoint`
  - `MirrorTopology`
  - `MirrorSignal`
  - `initialMirrorSignal`
  - `ReliefState`
  - `SessionRenderFrame`

- [ ] **Step 1: Create normalized mirror signal types**

Create `src/sensing/mirror-signal.ts`:

```ts
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
```

- [ ] **Step 2: Add Relief state and render frame types**

Modify `src/experience/model.ts` by adding these imports at the top of the file:

```ts
import type { ResonanceState } from '../resonance/resonance.ts';
import type { MirrorSignal } from '../sensing/mirror-signal.ts';
```

Then add these types after `StateEstimate`:

```ts
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
```

Keep the existing `StateEstimate`, `safePrior`, `clamp01`, and `clampSigned` exports unchanged.

- [ ] **Step 3: Commit**

```bash
git add src/sensing/mirror-signal.ts src/experience/model.ts
git commit -m "feat: define Relief mirror signal types"
```

---

### Task 3: Build Mirror Signal Adapter

**Files:**
- Create: `src/sensing/mirror-signal-adapter.ts`

**Interfaces:**
- Consumes:
  - `createFaceLandmarkerClient()`
  - `MirrorSignal`
- Produces:
  - `MirrorSignalAdapter.start(): Promise<boolean>`
  - `MirrorSignalAdapter.read(): MirrorSignal`
  - `MirrorSignalAdapter.stop(): void`

- [ ] **Step 1: Create adapter skeleton with camera ownership**

Create `src/sensing/mirror-signal-adapter.ts`:

```ts
import { clamp01 } from '../experience/model.ts';
import {
  createFaceLandmarkerClient,
  type FaceLandmarkerClient,
  type FaceLandmarkerResult,
} from './face-landmarker-client.ts';
import {
  initialMirrorSignal,
  type MirrorPoint,
  type MirrorSignal,
  type MirrorTopology,
} from './mirror-signal.ts';

const SAMPLE_INTERVAL_MS = 66;
const ANALYSIS_WIDTH = 80;
const ANALYSIS_HEIGHT = 60;

export class MirrorSignalAdapter {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private frame = 0;
  private analysisCanvas: HTMLCanvasElement | null = null;
  private analysisContext: CanvasRenderingContext2D | null = null;
  private previousLuminance: Uint8Array | null = null;
  private previousBlendshapes = new Map<string, number>();
  private previousCenter: { x: number; y: number; scale: number } | null = null;
  private landmarker: FaceLandmarkerClient | null = null;
  private latest: MirrorSignal = { ...initialMirrorSignal, mode: 'mirror' };
  private lastSampleTime = 0;
  private loading: Promise<FaceLandmarkerClient> | null = null;

  async start(): Promise<boolean> {
    if (this.stream) return true;
    if (!navigator.mediaDevices?.getUserMedia) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
        },
      });
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;

      this.stream = stream;
      this.video = video;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = ANALYSIS_WIDTH;
      canvas.height = ANALYSIS_HEIGHT;
      this.analysisCanvas = canvas;
      this.analysisContext = canvas.getContext('2d', { willReadFrequently: true });
      this.loading = createFaceLandmarkerClient();
      this.loading.then((client) => {
        this.landmarker = client;
      }).catch(() => {
        this.landmarker = null;
      });
      this.frame = requestAnimationFrame(this.sample);
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  read(): MirrorSignal {
    return {
      ...this.latest,
      topology: this.latest.topology
        ? { ...this.latest.topology, points: [...this.latest.topology.points] }
        : null,
    };
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
    this.landmarker?.dispose();
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
    }
    this.stream = null;
    this.video = null;
    this.analysisCanvas = null;
    this.analysisContext = null;
    this.previousLuminance = null;
    this.previousBlendshapes.clear();
    this.previousCenter = null;
    this.landmarker = null;
    this.loading = null;
    this.latest = { ...initialMirrorSignal, mode: 'mirror' };
  }

  private sample = (timestamp: number): void => {
    const video = this.video;
    if (!video) return;
    if (timestamp - this.lastSampleTime >= SAMPLE_INTERVAL_MS && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.lastSampleTime = timestamp;
      this.latest = this.analyse(video, timestamp);
    }
    this.frame = requestAnimationFrame(this.sample);
  };
```

- [ ] **Step 2: Add frame and landmark analysis**

Append these methods inside `MirrorSignalAdapter`:

```ts
  private analyse(video: HTMLVideoElement, timestamp: number): MirrorSignal {
    const frameFeatures = this.analyseFrameMotion(video);
    const result = this.landmarker?.detect(video, timestamp);
    if (!result || result.faceLandmarks.length === 0) {
      return {
        mode: 'mirror',
        motion: frameFeatures.motion,
        presence: frameFeatures.presence,
        confidence: frameFeatures.confidence,
        luminance: frameFeatures.luminance,
        expressionActivity: 0,
        softness: 0,
        topology: null,
      };
    }

    const topology = this.createTopology(result);
    const expressionActivity = this.measureExpressionActivity(result);
    const headMotion = this.measureHeadMotion(topology);
    const motion = clamp01(frameFeatures.motion * 0.42 + headMotion * 0.38 + expressionActivity * 0.2);
    const confidence = clamp01(frameFeatures.confidence * 0.35 + 0.65);

    return {
      mode: 'mirror',
      motion,
      presence: 1,
      confidence,
      luminance: frameFeatures.luminance,
      expressionActivity,
      softness: clamp01(1 - expressionActivity * 1.4 - headMotion * 0.8),
      topology,
    };
  }

  private analyseFrameMotion(video: HTMLVideoElement): Pick<MirrorSignal, 'motion' | 'presence' | 'confidence' | 'luminance'> {
    const canvas = this.analysisCanvas;
    const context = this.analysisContext;
    if (!canvas || !context) {
      return { motion: 0, presence: 0, confidence: 0, luminance: 0 };
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const luminance = new Uint8Array(canvas.width * canvas.height);
    let sum = 0;
    let sumSquares = 0;
    let difference = 0;

    for (let pixel = 0; pixel < luminance.length; pixel += 1) {
      const offset = pixel * 4;
      const value = Math.round(
        (pixels[offset] ?? 0) * 0.2126 +
        (pixels[offset + 1] ?? 0) * 0.7152 +
        (pixels[offset + 2] ?? 0) * 0.0722,
      );
      luminance[pixel] = value;
      sum += value;
      sumSquares += value * value;
      if (this.previousLuminance) difference += Math.abs(value - (this.previousLuminance[pixel] ?? value));
    }

    const mean = sum / luminance.length / 255;
    const variance = Math.max(0, sumSquares / luminance.length / (255 * 255) - mean * mean);
    const motion = this.previousLuminance
      ? clamp01((difference / luminance.length / 255) * 4.5)
      : 0;
    const exposureConfidence = clamp01(1 - Math.abs(mean - 0.48) * 1.8);
    const detailConfidence = clamp01(variance * 18);
    this.previousLuminance = luminance;

    return {
      motion,
      presence: clamp01(exposureConfidence * 0.45 + detailConfidence * 0.55),
      confidence: exposureConfidence * (0.35 + detailConfidence * 0.65),
      luminance: mean,
    };
  }
```

- [ ] **Step 3: Add topology and expression helpers**

Append these methods inside `MirrorSignalAdapter`, then close the class:

```ts
  private createTopology(result: FaceLandmarkerResult): MirrorTopology {
    const landmarks = result.faceLandmarks[0] ?? [];
    const points: MirrorPoint[] = landmarks.map((point) => ({
      x: point.x * 2 - 1,
      y: 1 - point.y * 2,
      z: point.z ?? 0,
    }));
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const scale = Math.max(0.01, Math.max(maxX - minX, maxY - minY));
    const matrix = result.facialTransformationMatrixes[0]?.data ?? [];

    return {
      points,
      centerX,
      centerY,
      scale,
      yaw: Number(matrix[8] ?? 0),
      pitch: Number(matrix[9] ?? 0),
      roll: Number(matrix[1] ?? 0),
    };
  }

  private measureExpressionActivity(result: FaceLandmarkerResult): number {
    const categories = result.faceBlendshapes[0]?.categories ?? [];
    if (categories.length === 0) return 0;
    let total = 0;
    let count = 0;
    for (const category of categories) {
      const name = category.categoryName;
      const score = clamp01(category.score);
      const previous = this.previousBlendshapes.get(name) ?? score;
      total += Math.abs(score - previous);
      count += 1;
      this.previousBlendshapes.set(name, score);
    }
    return clamp01((total / Math.max(1, count)) * 12);
  }

  private measureHeadMotion(topology: MirrorTopology): number {
    const previous = this.previousCenter;
    this.previousCenter = {
      x: topology.centerX,
      y: topology.centerY,
      scale: topology.scale,
    };
    if (!previous) return 0;
    const translation = Math.hypot(topology.centerX - previous.x, topology.centerY - previous.y);
    const scaleChange = Math.abs(topology.scale - previous.scale);
    return clamp01(translation * 5 + scaleChange * 2);
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/sensing/mirror-signal-adapter.ts
git commit -m "feat: add mirror signal adapter"
```

---

### Task 4: Extend Relief State And Telemetry

**Files:**
- Modify: `src/state/state-estimator.ts`
- Modify: `src/experience/session-controller.ts`

**Interfaces:**
- Consumes:
  - `MirrorSignal`
  - `MotionObservation`
  - `FeatureWindow`
- Produces:
  - `estimateReliefState(raw: ReliefObservationFeatures): ReliefState`
  - `SessionTelemetry` fields: `expressionActivity`, `softness`, `turbulence`, `settling`, `relief`, `readiness`, `confidence`

- [ ] **Step 1: Replace estimator inputs with Relief-aware features**

Modify `src/state/state-estimator.ts` so it exports:

```ts
import {
  clamp01,
  clampSigned,
  safePrior,
  type ReliefState,
  type StateEstimate,
} from '../experience/model.ts';

export type ReliefObservationFeatures = {
  cameraMotion: number;
  cameraPresence: number;
  deviceMotion: number;
  variability: number;
  settlingTrend: number;
  expressionActivity: number;
  softness: number;
  confidence: number;
  elapsedProgress: number;
};

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function estimateState(raw: ReliefObservationFeatures): StateEstimate {
  return estimateReliefState(raw);
}

export function estimateReliefState(raw: ReliefObservationFeatures): ReliefState {
  const confidence = clamp01(raw.confidence);
  const cameraMotion = clamp01(raw.cameraMotion);
  const deviceMotion = clamp01(raw.deviceMotion);
  const variability = clamp01(raw.variability);
  const expressionActivity = clamp01(raw.expressionActivity);
  const softness = clamp01(raw.softness);
  const presenceEvidence = clamp01(raw.cameraPresence);
  const trendEvidence = clampSigned(raw.settlingTrend);
  const elapsedProgress = clamp01(raw.elapsedProgress);

  const measuredMotion = clamp01(cameraMotion * 0.46 + deviceMotion * 0.18 + expressionActivity * 0.36);
  const turbulence = clamp01(measuredMotion * 0.54 + variability * 0.3 + (1 - softness) * 0.16);
  const settling = clamp01((1 - turbulence) * 0.64 + Math.max(0, trendEvidence) * 0.22 + softness * 0.14);
  const measuredActivation = clamp01(turbulence * 0.72 + measuredMotion * 0.28);
  const measuredStability = clamp01(settling * 0.75 + (1 - variability) * 0.25);
  const measuredPresence = clamp01(presenceEvidence * 0.88 + confidence * 0.12);
  const relief = clamp01(settling * 0.72 + softness * 0.18 + elapsedProgress * 0.1);
  const readiness = clamp01(Math.max(0, relief - 0.18) * 0.65 + measuredStability * 0.25 + elapsedProgress * 0.1);

  return {
    activation: mix(safePrior.activation, measuredActivation, confidence),
    stability: mix(safePrior.stability, measuredStability, confidence),
    presence: mix(safePrior.presence, measuredPresence, confidence),
    trend: trendEvidence * confidence,
    confidence,
    motion: measuredMotion,
    expressionActivity,
    softness,
    turbulence,
    settling,
    relief,
    readiness,
  };
}
```

- [ ] **Step 2: Extend `SessionTelemetry`**

Modify `src/experience/session-controller.ts`:

```ts
export type SessionTelemetry = {
  movement: number;
  steadiness: number;
  presence: number;
  sensingQuality: number;
  expressionActivity: number;
  softness: number;
  turbulence: number;
  settling: number;
  relief: number;
  readiness: number;
  confidence: number;
  direction: 'settling' | 'holding' | 'rising';
  source: 'mirror' | 'pure' | 'scripted';
};
```

- [ ] **Step 3: Commit**

```bash
git add src/state/state-estimator.ts src/experience/session-controller.ts
git commit -m "feat: derive Relief state telemetry"
```

---

### Task 5: Wire Session Controller To Render Frames

**Files:**
- Modify: `src/experience/session-controller.ts`
- Modify: `src/visual/light-field-renderer.ts`

**Interfaces:**
- Consumes: `MirrorSignal` from camera port.
- Produces: renderer `update(frame: SessionRenderFrame): void`.

- [ ] **Step 1: Update controller ports**

In `src/experience/session-controller.ts`, change imports:

```ts
import {
  clamp01,
  type RegulationPhase,
  type ReliefState,
  type SessionRenderFrame,
  type StateEstimate,
} from './model.ts';
import { initialMirrorSignal, type MirrorSignal } from '../sensing/mirror-signal.ts';
import { estimateReliefState } from '../state/state-estimator.ts';
```

Change `RendererPort` and `CameraPort`:

```ts
type RendererPort = {
  start: () => void;
  update: (frame: SessionRenderFrame) => void;
  dispose: () => void;
};

type CameraPort = {
  start: () => Promise<boolean>;
  read: () => MirrorSignal;
  stop: () => void;
};
```

- [ ] **Step 2: Build render frames in `step()`**

Inside `step()`, replace the `estimateState` call with `estimateReliefState` using the mirror signal:

```ts
const mirror = this.cameraEnabled ? this.dependencies.camera.read() : initialMirrorSignal;
const motion = this.dependencies.motion.read();
this.cameraMotion.push(mirror.motion, now);
this.deviceMotion.push(motion.motion, now);
const cameraWindow = this.cameraMotion.snapshot();
const motionWindow = this.deviceMotion.snapshot();
const elapsedProgress = smoothProgress(this.elapsedMs);

this.sensorConfidence = clamp01(
  1 - (1 - mirror.confidence * 0.82) * (1 - motion.confidence * 0.18),
);

const measured = estimateReliefState({
  cameraMotion: cameraWindow.mean,
  cameraPresence: mirror.presence,
  deviceMotion: motionWindow.mean,
  variability: clamp01(Math.sqrt(cameraWindow.variance + motionWindow.variance)),
  settlingTrend: Math.max(-1, Math.min(1, -(cameraWindow.slopePerSecond + motionWindow.slopePerSecond) * 4)),
  expressionActivity: mirror.expressionActivity,
  softness: mirror.softness,
  confidence: this.sensorConfidence,
  elapsedProgress,
});
```

Keep the existing personal baseline adjustment for `activation` and `stability`, and preserve the scripted fallback for low confidence.

After `const resonance = targetResonance(state, this.phase);`, create the frame and update the renderer:

```ts
const relief = {
  ...calibrated,
  motion: measured.motion,
  expressionActivity: measured.expressionActivity,
  softness: measured.softness,
  turbulence: measured.turbulence,
  settling: measured.settling,
  relief: measured.relief,
  readiness: measured.readiness,
} satisfies ReliefState;
const frame: SessionRenderFrame = { resonance, relief, mirror };
this.dependencies.renderer.update(frame);
```

- [ ] **Step 3: Emit richer telemetry**

Replace telemetry construction with:

```ts
const telemetry: SessionTelemetry = this.sensorConfidence < 0.15
  ? {
      movement: 0,
      steadiness: scripted.stability,
      presence: scripted.presence,
      sensingQuality: this.sensorConfidence,
      expressionActivity: 0,
      softness: 0,
      turbulence: 1 - scripted.stability,
      settling: scripted.stability,
      relief: elapsedProgress,
      readiness: clamp01(elapsedProgress - 0.25),
      confidence: this.sensorConfidence,
      direction: 'holding',
      source: 'scripted',
    }
  : {
      movement: measured.motion,
      steadiness: calibrated.stability,
      presence: calibrated.presence,
      sensingQuality: this.sensorConfidence,
      expressionActivity: measured.expressionActivity,
      softness: measured.softness,
      turbulence: measured.turbulence,
      settling: measured.settling,
      relief: measured.relief,
      readiness: measured.readiness,
      confidence: this.sensorConfidence,
      direction: calibrated.trend > 0.08 ? 'settling' : calibrated.trend < -0.08 ? 'rising' : 'holding',
      source: mirror.mode === 'mirror' && mirror.topology ? 'mirror' : 'pure',
    };
```

- [ ] **Step 4: Adapt `LightFieldRenderer` to the new port**

In `src/visual/light-field-renderer.ts`, import `SessionRenderFrame`:

```ts
import type { SessionRenderFrame } from '../experience/model.ts';
```

Change:

```ts
update(state: ResonanceState): void {
  this.target = { ...state };
}
```

to:

```ts
update(frame: SessionRenderFrame): void {
  this.target = { ...frame.resonance };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/experience/session-controller.ts src/visual/light-field-renderer.ts
git commit -m "feat: pass Relief render frames through session"
```

---

### Task 6: Implement Soul Mirror Renderer

**Files:**
- Create: `src/visual/soul-mirror-renderer.ts`

**Interfaces:**
- Consumes: `SessionRenderFrame`.
- Produces:
  - `SoulMirrorRenderer.start(): void`
  - `SoulMirrorRenderer.update(frame: SessionRenderFrame): void`
  - `SoulMirrorRenderer.dispose(): void`

- [ ] **Step 1: Create Canvas 2D renderer**

Create `src/visual/soul-mirror-renderer.ts`:

```ts
import { smoothValue } from '../resonance/smoothing.ts';
import type { SessionRenderFrame } from '../experience/model.ts';
import type { MirrorPoint } from '../sensing/mirror-signal.ts';

const FEATURE_PATHS = [
  [33, 7, 163, 144, 145, 153, 154, 155, 133],
  [263, 249, 390, 373, 374, 380, 381, 382, 362],
  [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291],
  [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109],
] as const;

type RenderValues = {
  turbulence: number;
  coherence: number;
  relief: number;
  readiness: number;
};

export class SoulMirrorRenderer {
  private context: CanvasRenderingContext2D | null = null;
  private frameHandle = 0;
  private running = false;
  private lastFrame = 0;
  private target: SessionRenderFrame | null = null;
  private values: RenderValues = {
    turbulence: 0.7,
    coherence: 0.3,
    relief: 0,
    readiness: 0,
  };
  private readonly reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(private readonly canvas: HTMLCanvasElement) {}

  start(): void {
    if (this.running) return;
    const context = this.canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This device cannot create the soul mirror.');
    this.context = context;
    this.running = true;
    this.lastFrame = performance.now();
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.resize();
    this.frameHandle = requestAnimationFrame(this.render);
  }

  update(frame: SessionRenderFrame): void {
    this.target = frame;
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frameHandle);
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.context = null;
    this.target = null;
  }
```

- [ ] **Step 2: Add rendering loop**

Append inside `SoulMirrorRenderer`:

```ts
  private resize = (): void => {
    const pixelRatio = Math.min(window.devicePixelRatio || 1, this.reducedMotionQuery.matches ? 1 : 2);
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * pixelRatio));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  };

  private render = (now: number): void => {
    if (!this.running) return;
    const context = this.context;
    if (!context) return;

    const deltaSeconds = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1_000));
    this.lastFrame = now;
    const frame = this.target;
    if (frame) {
      this.values.turbulence = smoothValue(this.values.turbulence, frame.relief.turbulence, deltaSeconds, 1.1);
      this.values.coherence = smoothValue(this.values.coherence, frame.resonance.coherence, deltaSeconds, 1.4);
      this.values.relief = smoothValue(this.values.relief, frame.relief.relief, deltaSeconds, 1.6);
      this.values.readiness = smoothValue(this.values.readiness, frame.relief.readiness, deltaSeconds, 2);
    }

    this.drawBackground(context, now);
    if (frame?.mirror.topology) {
      this.drawTopology(context, frame.mirror.topology.points, now);
    } else {
      this.drawPurePresence(context, now);
    }

    this.frameHandle = requestAnimationFrame(this.render);
  };

  private drawBackground(context: CanvasRenderingContext2D, now: number): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.max(width, height) * 0.72;
    const gradient = context.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
    gradient.addColorStop(0, `rgba(255, 221, 166, ${0.05 + this.values.relief * 0.08})`);
    gradient.addColorStop(0.34, `rgba(70, 82, 150, ${0.08 + this.values.coherence * 0.1})`);
    gradient.addColorStop(1, 'rgb(3, 4, 7)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    const breath = Math.sin(now * 0.00055) * 0.5 + 0.5;
    context.globalAlpha = 0.08 + this.values.readiness * 0.14;
    context.strokeStyle = 'rgb(255, 211, 152)';
    context.lineWidth = Math.max(1, width * 0.001);
    context.beginPath();
    context.arc(centerX, centerY, radius * (0.12 + breath * 0.03 + this.values.relief * 0.05), 0, Math.PI * 2);
    context.stroke();
    context.globalAlpha = 1;
  }
```

- [ ] **Step 3: Add topology drawing helpers**

Append inside `SoulMirrorRenderer`, then close the class:

```ts
  private drawTopology(context: CanvasRenderingContext2D, points: MirrorPoint[], now: number): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const scale = Math.min(width, height) * (0.78 + this.values.relief * 0.08);
    const jitter = this.reducedMotionQuery.matches ? 0 : this.values.turbulence * 5;
    context.save();
    context.translate(width / 2, height / 2);
    context.globalCompositeOperation = 'lighter';

    for (const path of FEATURE_PATHS) {
      context.beginPath();
      path.forEach((index, pathIndex) => {
        const point = points[index];
        if (!point) return;
        const phase = now * 0.0012 + index * 0.37;
        const x = point.x * scale + Math.sin(phase) * jitter;
        const y = point.y * scale + Math.cos(phase * 0.8) * jitter;
        if (pathIndex === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = `rgba(255, 224, 180, ${0.08 + this.values.coherence * 0.34})`;
      context.lineWidth = Math.max(1, width * (0.0009 + this.values.readiness * 0.0007));
      context.shadowColor = 'rgba(255, 196, 126, 0.42)';
      context.shadowBlur = 18 + this.values.relief * 28;
      context.stroke();
    }

    context.fillStyle = `rgba(167, 199, 255, ${0.04 + this.values.relief * 0.08})`;
    const stride = this.values.coherence > 0.68 ? 12 : 8;
    for (let index = 0; index < points.length; index += stride) {
      const point = points[index];
      if (!point) continue;
      const size = 1.2 + this.values.readiness * 2.2;
      context.beginPath();
      context.arc(point.x * scale, point.y * scale, size, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }

  private drawPurePresence(context: CanvasRenderingContext2D, now: number): void {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const count = this.reducedMotionQuery.matches ? 18 : 42;
    context.save();
    context.globalCompositeOperation = 'lighter';
    for (let index = 0; index < count; index += 1) {
      const angle = index * 2.399 + now * 0.00008;
      const radius = Math.min(width, height) * (0.08 + index / count * 0.34);
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;
      context.fillStyle = `rgba(255, 211, 132, ${0.025 + this.values.relief * 0.045})`;
      context.beginPath();
      context.arc(x, y, 1.5 + this.values.readiness * 2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  private onVisibilityChange = (): void => {
    if (document.hidden) {
      cancelAnimationFrame(this.frameHandle);
      return;
    }
    this.lastFrame = performance.now();
    this.frameHandle = requestAnimationFrame(this.render);
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/visual/soul-mirror-renderer.ts
git commit -m "feat: render soul mirror topology"
```

---

### Task 7: Add Mirror/Pure Preferences And Landing Controls

**Files:**
- Modify: `src/experience/session-preferences.ts`
- Modify: `src/experience/stillness-experience.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Produces:
  - `SessionPreferences.mode: 'mirror' | 'pure'`
  - entry controls for Mirror/Pure, Guided, Sound

- [ ] **Step 1: Extend preferences**

Modify `src/experience/session-preferences.ts`:

```ts
export type SessionMode = 'mirror' | 'pure';

export type SessionPreferences = {
  mode: SessionMode;
  guidance: boolean;
  sound: boolean;
  liveSignals: boolean;
  camera: boolean;
};

export const defaultSessionPreferences: SessionPreferences = Object.freeze({
  mode: 'mirror',
  guidance: true,
  sound: true,
  liveSignals: false,
  camera: true,
});
```

Keep `SessionCommand` and `commandForKey()` unchanged.

- [ ] **Step 2: Update initial telemetry**

Modify `initialTelemetry` in `src/experience/stillness-experience.tsx`:

```ts
const initialTelemetry: SessionTelemetry = {
  movement: 0,
  steadiness: 0,
  presence: 0,
  sensingQuality: 0,
  expressionActivity: 0,
  softness: 0,
  turbulence: 0,
  settling: 0,
  relief: 0,
  readiness: 0,
  confidence: 0,
  direction: 'holding',
  source: 'scripted',
};
```

- [ ] **Step 3: Replace landing copy and controls**

In `StillnessExperience`, replace the entry copy block with Relief wording:

```tsx
<p className="eyebrow">Relief</p>
<h1 id="stillness-title">Reset now. Return stronger.</h1>
<p>
  A private soul mirror responds to presence, movement, and expression signals
  so you can recover your center and rebuild readiness.
</p>
<fieldset className="entry-options">
  <legend>Begin with</legend>
  <label className="mode-choice">
    <input
      type="radio"
      name="session-mode"
      checked={preferences.mode === 'mirror'}
      onChange={() => setPreferences((current) => ({
        ...current,
        mode: 'mirror',
        camera: true,
      }))}
    />
    <span>Mirror</span>
  </label>
  <label className="mode-choice">
    <input
      type="radio"
      name="session-mode"
      checked={preferences.mode === 'pure'}
      onChange={() => setPreferences((current) => ({
        ...current,
        mode: 'pure',
        camera: false,
      }))}
    />
    <span>Pure</span>
  </label>
</fieldset>
<label className="mode-choice">
  <input
    type="checkbox"
    checked={preferences.guidance}
    onChange={(event) => setPreferences((current) => ({
      ...current,
      guidance: event.currentTarget.checked,
    }))}
  />
  <span>Guide me</span>
</label>
<label className="mode-choice">
  <input
    type="checkbox"
    checked={preferences.sound}
    onChange={(event) => setPreferences((current) => ({
      ...current,
      sound: event.currentTarget.checked,
    }))}
  />
  <span>Soothing sound</span>
</label>
<p className="mode-note">
  Mirror uses local camera analysis. Pure keeps the same reset without camera.
</p>
```

Keep the existing Begin button, session note, privacy disclosure, and clear calibration action.

- [ ] **Step 4: Add semantic CSS for entry options**

Add to `src/styles.css` inside `@layer components`:

```css
  .entry-options {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-s);
    padding: 0;
    border: 0;
  }
  .entry-options legend {
    inline-size: 100%;
    margin-block-end: var(--space-xs);
    color: var(--color-muted);
    font-size: var(--text-signal);
    font-weight: 650;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
```

- [ ] **Step 5: Commit**

```bash
git add src/experience/session-preferences.ts src/experience/stillness-experience.tsx src/styles.css
git commit -m "feat: make Relief mirror the default entry"
```

---

### Task 8: Select Renderer And Signal Adapter By Mode

**Files:**
- Modify: `src/experience/stillness-experience.tsx`
- Modify: `src/sensing/camera-sensor.ts`
- Modify: `src/sensing/mirror-signal.ts`

**Interfaces:**
- Consumes: `SessionPreferences.mode`
- Produces: Mirror mode uses `MirrorSignalAdapter` + `SoulMirrorRenderer`; Pure uses `CameraSensor` + `LightFieldRenderer`.

- [ ] **Step 1: Make `CameraSensor` emit `MirrorSignal`**

In `src/sensing/camera-sensor.ts`, import `initialMirrorSignal` and change `CameraObservation` to a type alias:

```ts
import { initialMirrorSignal, type MirrorSignal } from './mirror-signal.ts';

export type CameraObservation = MirrorSignal;
```

Replace `initialObservation` with:

```ts
const initialObservation: CameraObservation = {
  ...initialMirrorSignal,
  mode: 'pure',
};
```

In `analyseFrame()`, return:

```ts
return {
  mode: 'pure',
  motion,
  presence: clamp01(exposureConfidence * 0.45 + detailConfidence * 0.55),
  confidence,
  luminance: mean,
  expressionActivity: 0,
  softness: clamp01(1 - motion),
  topology: null,
};
```

- [ ] **Step 2: Import new classes**

In `src/experience/stillness-experience.tsx`, add:

```ts
import { MirrorSignalAdapter } from '../sensing/mirror-signal-adapter.ts';
import { SoulMirrorRenderer } from '../visual/soul-mirror-renderer.ts';
```

- [ ] **Step 3: Select adapter and renderer in `begin()`**

Before `new SessionController`, add:

```ts
const mirrorMode = preferences.mode === 'mirror';
const renderer = mirrorMode
  ? new SoulMirrorRenderer(canvas)
  : new LightFieldRenderer(canvas);
const camera = mirrorMode
  ? new MirrorSignalAdapter()
  : new CameraSensor();
```

Then pass:

```ts
renderer,
camera,
```

instead of constructing `LightFieldRenderer` and `CameraSensor` inline.

Change the camera pre-disable logic:

```ts
if (!preferences.camera || preferences.mode === 'pure') void controller.setCameraEnabled(false);
```

Change tracking:

```ts
trackEvent('session_started', {
  mode: preferences.mode,
  guidance: preferences.guidance,
  sound: preferences.sound,
  camera: preferences.camera,
});
```

- [ ] **Step 4: Commit**

```bash
git add src/experience/stillness-experience.tsx src/sensing/camera-sensor.ts src/sensing/mirror-signal.ts
git commit -m "feat: route Mirror and Pure session modes"
```

---

### Task 9: Expand Quick Menu And Live Signals

**Files:**
- Modify: `src/experience/session-menu.tsx`
- Modify: `src/experience/stillness-experience.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `SessionTelemetry` extended fields and `SessionPreferences.mode`.
- Produces: menu controls for mode, guidance, sound, live signals, camera; live signal rows for movement, expression, turbulence, settling, relief, readiness, confidence.

- [ ] **Step 1: Add labels**

In `src/experience/session-menu.tsx`, add:

```ts
export function expressionLabel(value: number): 'soft' | 'moving' | 'active' {
  if (value < 0.18) return 'soft';
  if (value < 0.52) return 'moving';
  return 'active';
}

export function reliefLabel(value: number): 'forming' | 'arriving' | 'clear' {
  if (value < 0.35) return 'forming';
  if (value < 0.72) return 'arriving';
  return 'clear';
}

export function readinessLabel(value: number): 'restoring' | 'returning' | 'readying' {
  if (value < 0.35) return 'restoring';
  if (value < 0.72) return 'returning';
  return 'readying';
}
```

- [ ] **Step 2: Add mode controls to the menu**

Inside the `Experience` fieldset, before Guidance:

```tsx
<label>
  <input
    type="radio"
    name="active-session-mode"
    checked={preferences.mode === 'mirror'}
    onChange={() => onToggle('mode', 'mirror')}
  />
  <span>Mirror</span>
</label>
<label>
  <input
    type="radio"
    name="active-session-mode"
    checked={preferences.mode === 'pure'}
    onChange={() => onToggle('mode', 'pure')}
  />
  <span>Pure</span>
</label>
```

Update prop types so `onToggle` accepts:

```ts
type PreferenceValue = boolean | SessionPreferences['mode'];
type SessionMenuProps = {
  preferences: SessionPreferences;
  telemetry: SessionTelemetry;
  audioAvailable: boolean;
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  onToggle: (preference: Preference, enabled: PreferenceValue) => void;
  onClose: () => void;
  onLeave: () => void;
};
```

- [ ] **Step 3: Add richer live signal rows**

Replace the current four-row live signal section with rows for:

```tsx
{[
  ['Movement', telemetry.movement, movementLabel(telemetry.movement, telemetry.direction)],
  ['Expression', telemetry.expressionActivity, expressionLabel(telemetry.expressionActivity)],
  ['Turbulence', telemetry.turbulence, telemetry.direction === 'rising' ? 'rising' : 'settling'],
  ['Settling', telemetry.settling, steadinessLabel(telemetry.settling)],
  ['Relief', telemetry.relief, reliefLabel(telemetry.relief)],
  ['Readiness', telemetry.readiness, readinessLabel(telemetry.readiness)],
  ['Signal', telemetry.confidence, sensingLabel(telemetry.confidence, telemetry.source)],
].map(([name, value, state]) => (
  <p key={name}>
    <span>{name}</span>
    <meter className="signal-meter" min="0" max="1" value={Number(value)}>
      {name}
    </meter>
    <span>{state}</span>
  </p>
))}
```

- [ ] **Step 4: Handle mode changes in the experience**

In `StillnessExperience.togglePreference`, change the signature:

```ts
const togglePreference = useCallback((
  preference: keyof SessionPreferences,
  enabled: boolean | SessionPreferences['mode'],
) => {
```

Add the mode branch first:

```ts
if (preference === 'mode') {
  const nextMode = enabled === 'mirror' ? 'mirror' : 'pure';
  setPreferences((current) => ({
    ...current,
    mode: nextMode,
    camera: nextMode === 'mirror',
  }));
  trackEvent('session_preference_changed', { preference, enabled: nextMode });
  if (nextMode === 'pure') void controllerRef.current?.setCameraEnabled(false);
  if (nextMode === 'mirror') void controllerRef.current?.setCameraEnabled(true);
  return;
}
```

Then cast boolean in existing branches:

```ts
const nextEnabled = Boolean(enabled);
setPreferences((current) => ({ ...current, [preference]: nextEnabled }));
```

- [ ] **Step 5: Adjust signal row CSS**

In `src/styles.css`, change:

```css
dialog.session-menu section p {
  grid-template-columns: 5rem 1fr 4.5rem;
}
```

to:

```css
dialog.session-menu section p {
  grid-template-columns: 5.75rem 1fr 5rem;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/experience/session-menu.tsx src/experience/stillness-experience.tsx src/styles.css
git commit -m "feat: expose Relief live signals"
```

---

### Task 10: Update Guidance For Relief

**Files:**
- Modify: `src/experience/guidance-policy.ts`

**Interfaces:**
- Consumes: extended `SessionTelemetry`.
- Produces: cues focused on reset, relief, restoration, and readiness.

- [ ] **Step 1: Replace cue keys and copy**

In `src/experience/guidance-policy.ts`, replace the cue key union and `CUES` with:

```ts
type GuidanceCueKey =
  | 'arrive'
  | 'active'
  | 'softening'
  | 'relief'
  | 'restore'
  | 'return'
  | 'scripted';

const CUES: Record<GuidanceCueKey, GuidanceCue> = {
  arrive: {
    id: 'arrive',
    label: 'Mirror forming',
    invitation: 'Arrive here for one breath.',
    explanation: 'The field is learning your starting rhythm on this device.',
  },
  active: {
    id: 'active',
    label: 'Movement has energy',
    invitation: 'Let your jaw release for one breath.',
    explanation: 'The mirror becomes more coherent as movement and expression signals soften.',
  },
  softening: {
    id: 'softening',
    label: 'Signals are softening',
    invitation: 'Let the next exhale take a little longer.',
    explanation: 'The field is opening as turbulence settles.',
  },
  relief: {
    id: 'relief',
    label: 'Relief is arriving',
    invitation: 'Rest in the space that is opening.',
    explanation: 'The mirror is responding to steadier movement and softer expression signals.',
  },
  restore: {
    id: 'restore',
    label: 'Restoration is forming',
    invitation: 'Soften your gaze or close your eyes for a few breaths.',
    explanation: 'Sound can carry the reset while the field keeps breathing with you.',
  },
  return: {
    id: 'return',
    label: 'Readiness is returning',
    invitation: 'Notice what feels easier to meet now.',
    explanation: 'Relief came first; readiness is building from that steadier base.',
  },
  scripted: {
    id: 'scripted',
    label: 'Following a gentle rhythm',
    invitation: 'Unclench the jaw and allow the shoulders to drop.',
    explanation: 'The field is guiding a reset while sensing is limited.',
  },
};
```

- [ ] **Step 2: Replace cue selection**

Replace `cueKeyFor` with:

```ts
function cueKeyFor(telemetry: SessionTelemetry, elapsedMs: number): GuidanceCueKey {
  if (telemetry.source === 'scripted') return 'scripted';
  if (elapsedMs < 12_000) return 'arrive';
  if (telemetry.readiness >= 0.68) return 'return';
  if (telemetry.relief >= 0.68) return 'restore';
  if (telemetry.relief >= 0.42) return 'relief';
  if (telemetry.direction === 'settling' || telemetry.softness >= 0.52) return 'softening';
  return 'active';
}
```

- [ ] **Step 3: Pass elapsed time into cue selection**

In `GuidancePolicy.evaluate()`, replace:

```ts
const nextKey = cueKeyFor(telemetry);
```

with:

```ts
const nextKey = cueKeyFor(telemetry, elapsedMs);
```

- [ ] **Step 4: Commit**

```bash
git add src/experience/guidance-policy.ts src/experience/session-controller.ts
git commit -m "feat: guide Relief recovery phases"
```

---

### Task 11: Tune Audio For Restore

**Files:**
- Modify: `src/audio/stillness-audio.ts`
- Modify: `src/resonance/resonance.ts`

**Interfaces:**
- Consumes: `ResonanceState.audioEnergy`, `space`, `coherence`, `pulse`.
- Produces: smoother, more supportive audio during Restore without adding external tracks.

- [ ] **Step 1: Soften audio parameter mapping**

In `src/audio/stillness-audio.ts`, update `mapAudioParameters` return:

```ts
return {
  masterGain: 0.018 + energy * 0.118 + space * 0.025,
  droneGain: 0.024 + energy * 0.09 + space * 0.035,
  textureGain: turbulence * energy * 0.044,
  filterHz: 160 + energy * 1_150 + turbulence * 520,
  pulseHz: 0.035 + pulse * 0.28,
  delayMix: 0.08 + space * 0.36,
};
```

- [ ] **Step 2: Make resonance less time-dominated**

In `src/resonance/resonance.ts`, reduce phase progress influence in `targetResonance`:

```ts
const progressInfluence = progress * 0.42;
```

Then replace direct `progress` terms with `progressInfluence`:

```ts
complexity: clamp01(0.04 + guidedActivation * 0.7 + (1 - progressInfluence) * 0.24),
turbulence: clamp01(0.02 + guidedActivation * 0.72 + (1 - settling) * 0.16 - progressInfluence * 0.08),
coherence: clamp01(0.22 + settling * 0.52 + progressInfluence * 0.25),
focus: clamp01(0.42 + presence * 0.38 + (1 - progressInfluence) * 0.16),
depth: clamp01(0.32 + guidedActivation * 0.2 + presence * 0.18 + (1 - progressInfluence) * 0.22),
pulse: clamp01(0.12 + guidedActivation * 0.62 + (1 - progressInfluence) * 0.16),
audioEnergy: clamp01(0.035 + guidedActivation * 0.62 + (1 - progressInfluence) * 0.18),
space: clamp01(0.18 + settling * 0.34 + progressInfluence * 0.48),
```

- [ ] **Step 3: Commit**

```bash
git add src/audio/stillness-audio.ts src/resonance/resonance.ts
git commit -m "feat: make Relief audio and visuals more signal led"
```

---

### Task 12: Update Project Context

**Files:**
- Modify: `AGENTS.md`

**Interfaces:**
- Produces durable project guidance for future agents.

- [ ] **Step 1: Add Relief direction**

In `AGENTS.md`, replace the mission with:

```md
## Mission

Relief is a short interactive reset for moments when the user needs to recover, reload their batteries, and return stronger. The first outcome is immediate relief. The second outcome is renewed readiness.
```

- [ ] **Step 2: Add product rules**

Append to Product rules:

```md
- Mirror mode is the default experience. It uses local MediaPipe face landmarks and blendshapes to drive an abstract soul mirror.
- Pure mode remains the no-camera fallback and should share the same session engine.
- The mirror preserves facial structure as topology and motion; it must not render a normal camera feed, realistic avatar, identity cues, skin tone reconstruction, age/gender/beauty cues, or emotion labels.
- User-facing language may say expression signals or facial movement signals. It must not say emotion recognition or claim to detect stress, anxiety, mood, health, or biological battery level.
```

- [ ] **Step 3: Add architecture note**

Append to Architecture:

```md
- MediaPipe Tasks Vision is isolated behind `src/sensing/face-landmarker-client.ts` and `src/sensing/mirror-signal-adapter.ts`; session state and renderers consume normalized signals only.
```

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md
git commit -m "docs: record Relief mirror direction"
```

---

### Task 13: Production Deploy Handoff

**Files:**
- No source edits.

**Interfaces:**
- Consumes: committed app changes from Tasks 1-12.
- Produces: production URL ready for user feedback.

- [ ] **Step 1: Push app commits**

Run:

```bash
git status --short --branch
git log --oneline -5
```

Expected: working tree clean and local commits visible.

Push:

```bash
git push
```

- [ ] **Step 2: Deploy through infra in a background subagent**

From the Hyperdrift infra repo:

```bash
cd /Users/yannvr/dev/hyperdrift/infra
make deploy app=stillness
```

This must run in a background subagent per the workspace async handoff rule for deploys.

- [ ] **Step 3: Run production deploy-safety checks**

From infra:

```bash
cd /Users/yannvr/dev/hyperdrift/infra
make check-launch-readiness app=stillness
```

This must run in a background subagent per the workspace async handoff rule for readiness loops.

- [ ] **Step 4: Manual production feedback gate**

Open:

```text
https://stillness.hyperdrift.io
```

Manually check:

- start screen says Relief and makes Mirror/Pure clear
- Mirror asks for camera permission
- soul mirror is nonblank and responds to face movement/expression activity
- Pure starts without camera
- `?` opens the quick menu
- live signals show expression, turbulence, settling, relief, readiness, confidence
- `M`, `G`, `D`, `C`, and Escape behave as expected
- audio toggles without abrupt cuts
- no normal camera feed appears
- user-facing copy avoids emotion/medical claims

Stop after this gate and ask for user feedback before choosing the next significant product change.
