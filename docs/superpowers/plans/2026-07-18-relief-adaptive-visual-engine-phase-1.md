# Relief Adaptive Visual Engine Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static-asset-led mirror with a locally testable, camera-driven audiovisual regulation loop whose facial, movement, and breathing signals visibly reshape a persistent GPU field and guide it through adaptive Relief scenes.

**Architecture:** A camera adapter sends transferable frames to a dedicated MediaPipe worker. The worker returns plain perception observations plus a low-resolution modulation frame; pure TypeScript calibration, breathing, and state modules convert those observations into a confidence-weighted adaptive state. A worker-hosted WebGL2 renderer uses ping-pong feedback buffers and procedural scene grammars, while a main-thread fallback preserves the same renderer port. The React island coordinates lifecycle and throttled telemetry only.

**Tech Stack:** Waku, React 19, TypeScript 6, `@mediapipe/tasks-vision@0.10.35`, Web Workers, transferable `ImageBitmap`, OffscreenCanvas where supported, WebGL2 floating-point framebuffers, Web Audio, semantic CSS.

## Global Constraints

- Use pnpm everywhere and Node `>=22.10`.
- Keep Waku and the existing client-island architecture; do not add a framework or npm dependency.
- Use semantic CSS only. No Tailwind, utility chains, CSS-in-JS, or presentation inline styles.
- Pure and Guided are coaching modes, not camera modes. Pure is default; camera sensing remains independently enabled by default.
- Expose bounded discovery controls for signal sensitivity, camera color influence, transition duration, visual intensity, and render quality in the quick menu.
- Require an 8–12 second head-and-shoulders calibration when camera sensing is available.
- Process camera frames, landmarks, pose, breathing traces, audio, and motion locally. Do not transmit or persist raw signals.
- Describe observable patterns only. Do not diagnose anxiety, stress, emotion, health, or biological energy.
- Never display a normal camera feed, realistic avatar, or static journey artwork as the experience.
- Keep the five-scene type contract: Turbulence, Gathering, Coherence, Release, and Radiance.
- Macro-scene changes are state-led with hysteresis. Randomness may vary compatible details only.
- Target 60 fps where possible and a stable 30 fps minimum on mobile. Reduce resolution before reducing responsiveness.
- This is prototype discovery. Do not write, expand, or run automated tests or browser suites. Use `pnpm run type-check`, `pnpm run build`, and direct user testing on a local server.
- Do not deploy to production. Stop at the local feedback checkpoint and ask the user to test.
- Preserve unrelated working-tree changes. Stage only the files named by each task.

---

## File Structure

### Sensing

- Create `src/sensing/perception-signal.ts`: transferable-free domain observations consumed by calibration, state, UI, and audio.
- Create `src/sensing/perception-worker-protocol.ts`: worker request/result messages and transferable payload types.
- Create `src/sensing/perception-worker.ts`: MediaPipe Face and Pose inference, low-resolution camera analysis, facial topology packing, and modulation-frame creation.
- Create `src/sensing/perception-worker-client.ts`: request correlation, ownership transfer, failure handling, and worker disposal.
- Create `src/sensing/perception-adapter.ts`: camera lifecycle and `requestVideoFrameCallback()`/animation-frame capture pump.
- Create `src/sensing/calibration-controller.ts`: 8–12 second framing and baseline gate.
- Create `src/sensing/breath-estimator.ts`: confidence-weighted respiratory phase and regularity from shoulder/head motion.
- Retire runtime use of `src/sensing/face-landmarker-client.ts`, `src/sensing/mirror-signal.ts`, and `src/sensing/mirror-signal-adapter.ts` only after the controller uses the new port.

### State and control

- Create `src/state/adaptive-state.ts`: state, scene, contribution, and tuning types.
- Create `src/state/adaptive-state-engine.ts`: signal normalization, weight redistribution, progress trend, scene hysteresis, and immediate render controls.
- Modify `src/experience/model.ts`: replace mirror-specific render-frame types with adaptive control-frame types.
- Modify `src/resonance/resonance.ts`: derive audiovisual resonance from adaptive state instead of elapsed phase.
- Modify `src/experience/session-controller.ts`: own calibration, breathing, state fusion, modulation transfer, telemetry throttling, pause, and cleanup.
- Stop using timer progression from `src/experience/phase-policy.ts`; do not delete it until all imports are removed.

### Rendering

- Create `src/visual/adaptive-visual-state.ts`: renderer input, scene configuration, quality tier, and runtime metrics.
- Create `src/visual/webgl-resources.ts`: shader, texture, framebuffer, resize, and cleanup helpers.
- Create `src/visual/adaptive-visual-shaders.ts`: warp/decay, face emission, scene emission, blur, and composite GLSL programs.
- Create `src/visual/adaptive-visual-core.ts`: persistent feedback renderer shared by worker and fallback.
- Create `src/visual/adaptive-renderer-protocol.ts`: worker messages.
- Create `src/visual/adaptive-renderer-worker.ts`: OffscreenCanvas renderer host.
- Rewrite `src/visual/soul-mirror-renderer.ts`: thin renderer port selecting worker or main-thread fallback.
- Preserve `public/journey-states.webp` only as documentation/reference material; remove every runtime URL, sampler, loader, and uniform for it.

### Experience and audio

- Modify `src/experience/session-preferences.ts`: model `pure | guided`, independent camera, sound, signals, scene lock, and variation controls.
- Modify `src/experience/stillness-experience.tsx`: real calibration lifecycle, simplified landing, independent camera fallback, and adaptive renderer wiring.
- Modify `src/experience/session-menu.tsx`: live signal confidence/contribution, visual controls, and tuning controls.
- Modify `src/experience/guidance-policy.ts`: sparse observational cues based on adaptive state.
- Modify `src/audio/stillness-audio.ts`: map breath, tension, coherence, and scene to a clearly audible but soothing sound field.
- Modify `src/styles.css`: calibration, progress hint, quick-menu signal matrix, and reduced-motion presentation.

---

### Task 1: Correct Pure and Guided Mode Semantics

**Files:**
- Modify: `src/experience/session-preferences.ts`
- Modify: `src/experience/stillness-experience.tsx`
- Modify: `src/experience/session-menu.tsx`

**Interfaces:**
- Produces: `SessionMode = 'pure' | 'guided'`.
- Produces: `SessionPreferences.mode`, `camera`, `sound`, `liveSignals`, `visualControl`, `variationSeed`.
- Produces: `SessionTuning` and `SessionMenu` callbacks `onTuningChange(key, value)` and `onNextVariation()`; do not route nested tuning through the boolean preference callback.
- Preserves: keyboard `G` toggles coaching, `C` toggles camera, `M` toggles sound, `D` toggles live signals.

- [ ] **Step 1: Replace mirror/pure mode with coaching mode**

Use this preference contract in `src/experience/session-preferences.ts`:

```ts
export type SessionMode = 'pure' | 'guided';
export type VisualControl = 'auto' | 'locked';

export type SessionTuning = {
  signalSensitivity: number;
  colorInfluence: number;
  transitionSeconds: number;
  visualIntensity: number;
  quality: 'auto' | 'high' | 'balanced' | 'reduced';
};

export type SessionPreferences = {
  mode: SessionMode;
  sound: boolean;
  liveSignals: boolean;
  camera: boolean;
  visualControl: VisualControl;
  variationSeed: number;
  tuning: SessionTuning;
};

export const defaultSessionPreferences: SessionPreferences = Object.freeze({
  mode: 'pure',
  sound: true,
  liveSignals: false,
  camera: true,
  visualControl: 'auto',
  variationSeed: 0,
  tuning: {
    signalSensitivity: 1,
    colorInfluence: 0.2,
    transitionSeconds: 4.5,
    visualIntensity: 1,
    quality: 'auto',
  },
});
```

Keep `SessionCommand = 'menu' | 'sound' | 'guidance' | 'signals' | 'camera'`; `guidance` now toggles `mode` between `pure` and `guided`.

- [ ] **Step 2: Make camera fallback independent from coaching**

In `StillnessExperience`, remove every branch that disables camera because `mode === 'pure'` and every fallback that changes the mode. Camera failure must apply only:

```ts
setPreferences((current) => ({ ...current, camera: false }));
setMessage('Camera sensing is unavailable. The reset can continue with available signals.');
```

Bind the landing checkbox to `preferences.mode === 'guided'`. Show progress copy and `SessionGuidance` only when `preferences.mode === 'guided'`; the quick menu remains available in both modes.

- [ ] **Step 3: Replace active-session Mirror/Pure radios**

Use one Guided-mode switch and keep Camera sensing as its own switch. Remove the `Mirror` label entirely. Keep the Voice Covenant copy:

```tsx
<label>
  <input
    type="checkbox"
    role="switch"
    checked={preferences.mode === 'guided'}
    onChange={(event) => onToggle('mode', event.currentTarget.checked ? 'guided' : 'pure')}
  />
  <span>Guided mode</span>
  <kbd aria-label="Keyboard shortcut G">G</kbd>
</label>
```

- [ ] **Step 4: Run deploy-safety checks**

Run:

```bash
pnpm run type-check
```

Expected: exit 0 with no TypeScript diagnostics.

- [ ] **Step 5: Commit the mode correction**

```bash
git add src/experience/session-preferences.ts src/experience/stillness-experience.tsx src/experience/session-menu.tsx
git commit -m "fix: separate Relief guidance from camera sensing"
```

---

### Task 2: Define the Perception and Worker Contracts

**Files:**
- Create: `src/sensing/perception-signal.ts`
- Create: `src/sensing/perception-worker-protocol.ts`

**Interfaces:**
- Produces: `PerceptionSnapshot`, `FacialPattern`, `ShoulderPose`, `CameraPalette`, `PerceptionConfidence`.
- Produces: `PerceptionWorkerRequest`, `PerceptionWorkerResult`, `PerceptionModulationFrame`.
- Later consumers must not import MediaPipe result types.

- [ ] **Step 1: Create plain domain observations**

Create `src/sensing/perception-signal.ts` with this public shape:

```ts
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
```

Export a complete `initialPerceptionSnapshot` with zeroed numeric values, `facePresent: false`, empty `Float32Array`, and neutral black/blue palette tuples.

- [ ] **Step 2: Define transferable worker messages**

Create `src/sensing/perception-worker-protocol.ts`:

```ts
import type { PerceptionSnapshot } from './perception-signal.ts';

export type PerceptionWorkerRequest =
  | { type: 'initialize' }
  | { type: 'analyse'; requestId: number; timestampMs: number; frame: ImageBitmap }
  | { type: 'dispose' };

export type PerceptionWorkerResult =
  | { type: 'ready' }
  | {
      type: 'result';
      requestId: number;
      snapshot: PerceptionSnapshot;
      modulation: ImageBitmap;
    }
  | { type: 'error'; requestId?: number; message: string };

export type PerceptionModulationFrame = {
  timestampMs: number;
  bitmap: ImageBitmap;
};
```

- [ ] **Step 3: Run type-check and commit**

```bash
pnpm run type-check
git add src/sensing/perception-signal.ts src/sensing/perception-worker-protocol.ts
git commit -m "feat: define Relief perception contracts"
```

Expected: type-check exits 0; commit contains only the two new contract files.

---

### Task 3: Move Face, Pose, Motion, and Camera Analysis into a Worker

**Files:**
- Create: `src/sensing/perception-worker.ts`
- Create: `src/sensing/perception-worker-client.ts`
- Create: `src/sensing/perception-adapter.ts`
- Modify: `src/sensing/face-landmarker-client.ts`

**Interfaces:**
- Produces: `PerceptionWorkerClient.start(): Promise<void>`.
- Produces: `PerceptionWorkerClient.analyse(frame, timestampMs): Promise<{ snapshot; modulation }>`.
- Produces: `PerceptionAdapter.start(): Promise<boolean>`, `read(): PerceptionSnapshot`, `takeModulationFrame(): PerceptionModulationFrame | null`, `stop(): void`.

- [ ] **Step 1: Generalize MediaPipe initialization for worker use**

Keep the existing face model URL and add the official lite pose model URL:

```ts
export const POSE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
```

Move MediaPipe construction into `perception-worker.ts`. Initialize one `FaceLandmarker` and one `PoseLandmarker` from the same `FilesetResolver`, with `runningMode: 'VIDEO'`, one subject, face blendshapes and transformation matrices enabled, and pose segmentation disabled. Attempt the GPU delegate first; if either task fails to initialize, close both partial tasks and retry both on CPU. Run inference serially in the single worker to avoid concurrent GPU delegates.

- [ ] **Step 2: Implement analysis and modulation output**

Use an `OffscreenCanvas(80, 60)` for frame motion, luminance, palette, and modulation. Pack modulation channels as:

```glsl
R = luminance gradient magnitude
G = temporal frame difference
B = face and shoulder influence mask
A = 1.0
```

Pack face connections into `topologySegments` as repeated normalized endpoints `[x1, y1, z1, x2, y2, z2]`. Extract only left and right shoulder landmarks from Pose Landmarker. Compute facial values from blendshapes as follows:

```ts
const tension = average('browDown', 'eyeSquint', 'mouthPress', 'mouthFrown');
const warmth = average('mouthSmile', 'cheekSquint');
const mouthOpen = average('jawOpen', 'mouthFunnel', 'mouthPucker');
const browLift = average('browInnerUp', 'browOuterUp');
const eyeClosure = average('eyeBlink', 'eyeSquint');
```

Post `snapshot.topologySegments.buffer` and the modulation `ImageBitmap` as transferables. Close every input `ImageBitmap` in a `finally` block.

- [ ] **Step 3: Implement the worker client**

The client must allow one in-flight analysis. If a newer frame arrives while busy, close the older queued frame and retain only the newest. Reject pending work on worker error or disposal. Use:

```ts
worker.postMessage(
  { type: 'analyse', requestId, timestampMs, frame } satisfies PerceptionWorkerRequest,
  [frame],
);
```

- [ ] **Step 4: Implement camera ownership and frame scheduling**

`PerceptionAdapter` owns `getUserMedia()` and its hidden video. Prefer `video.requestVideoFrameCallback()`; use `requestAnimationFrame()` only when unavailable. Begin at one analysis every 66 ms. Adapt the interval between 42 and 66 ms (approximately 24–15 Hz) from the worker's rolling analysis duration, always keeping one in-flight request and one newest queued frame at most. Create one `ImageBitmap`, submit it to the worker, replace `latest`, and replace/close the previous unconsumed modulation bitmap.

The adapter must use a generation token so late media or worker promises cannot revive a stopped session. Pause frame capture when `document.hidden`, resume on visibility, and remove the listener during disposal. `stop()` closes queued bitmaps, terminates the worker, stops tracks, clears `srcObject`, and resets the snapshot.

- [ ] **Step 5: Verify worker bundling**

Run:

```bash
pnpm run type-check
pnpm run build
```

Expected: both commands exit 0 and the Waku client output contains a bundled perception worker chunk.

- [ ] **Step 6: Commit**

```bash
git add src/sensing/face-landmarker-client.ts src/sensing/perception-worker.ts src/sensing/perception-worker-client.ts src/sensing/perception-adapter.ts
git commit -m "feat: move Relief perception into a worker"
```

---

### Task 4: Add Calibration and Visual Breathing Analysis

**Files:**
- Create: `src/sensing/calibration-controller.ts`
- Create: `src/sensing/breath-estimator.ts`

**Interfaces:**
- Produces: `CalibrationStatus` and `CalibrationController.update(snapshot, nowMs)`.
- Produces: `BreathSignal` and `BreathEstimator.update(snapshot)`.

- [ ] **Step 1: Implement calibration as a real signal gate**

Use this contract:

```ts
export type CalibrationStatus = {
  phase: 'framing' | 'sampling' | 'ready' | 'limited';
  progress: number;
  faceConfidence: number;
  shoulderConfidence: number;
  lightingConfidence: number;
  baselineMotion: number;
  baselineTension: number;
};
```

Start sampling only when face confidence is at least `0.65` and shoulder confidence at least `0.55`. Accumulate good samples for at least 8 seconds. Return `limited` at 12 seconds if the minimum is not met, preserving whatever channels are trustworthy. Compute baseline motion and tension as robust trimmed means, dropping the highest and lowest 10% of samples.

- [ ] **Step 2: Implement the breathing estimator**

Maintain 12 seconds of timestamped samples. Derive the motion trace from shoulder midpoint Y, partially cancelling global head motion:

```ts
const shoulderY = (snapshot.shoulders.leftY + snapshot.shoulders.rightY) * 0.5;
const sample = shoulderY - snapshot.faceCenterY * 0.25;
```

Use a fast EMA (`0.7 s`) minus a slow EMA (`3 s`) to detrend. Track positive-going zero crossings. Derive:

```ts
export type BreathSignal = {
  phase: number;       // 0..1, inhale through exhale
  regularity: number;  // 0..1 interval consistency
  amplitude: number;   // normalized visual motion only
  confidence: number;  // visibility × amplitude × cycle evidence
  cycles: number;
};
```

Do not emit a phase above zero confidence until one complete cycle exists. Require at least two plausible cycles for regularity. Accept cycle intervals from 2.0 to 12.0 seconds; reject large motion spikes and intervals outside that range.

- [ ] **Step 3: Check and commit**

```bash
pnpm run type-check
git add src/sensing/calibration-controller.ts src/sensing/breath-estimator.ts
git commit -m "feat: add visual calibration and breathing signals"
```

Expected: type-check exits 0; no test files change.

---

### Task 5: Build the Confidence-Weighted Adaptive State Engine

**Files:**
- Create: `src/state/adaptive-state.ts`
- Create: `src/state/adaptive-state-engine.ts`
- Modify: `src/experience/model.ts`
- Modify: `src/resonance/resonance.ts`

**Interfaces:**
- Produces: `AdaptiveScene`, `AdaptiveState`, `SignalContribution`, `AdaptiveTuning`.
- Produces: `AdaptiveStateInput` and `toVisualControlFrame(state, perception, tuning, variationSeed)`.
- Produces: `AdaptiveStateEngine.update(input): AdaptiveState`.
- Produces: `targetResonance(state: AdaptiveState): ResonanceState`.

- [ ] **Step 1: Define the adaptive state contract**

```ts
export type AdaptiveScene =
  | 'turbulence'
  | 'gathering'
  | 'coherence'
  | 'release'
  | 'radiance';

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
  contributions: Record<'movement' | 'breathing' | 'facialRelease' | 'coherence', SignalContribution>;
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
```

- [ ] **Step 2: Implement confidence-based weight redistribution**

Use configured weights `0.30`, `0.25`, `0.25`, and `0.20`. Set each raw effective weight to `configuredWeight * confidence`, normalize their sum to 1, then calculate progress. An unavailable channel has effective weight zero and cannot lower progress.

Use calibration-relative values:

```ts
const movementStability = clamp01(1 - normalizedMovement);
const facialRelease = clamp01(1 - normalizedTension);
const breathing = breath.confidence > 0.35 ? breath.regularity : 0;
const coherence = temporalCoherence;
```

Do not mix elapsed session time into progress.

Export `toVisualControlFrame(state, perception, tuning, variationSeed)` from the state module so the controller has one canonical state-to-render mapping. It must copy current topology, palette, signal values, bounded visual tuning, and the current variation seed into the renderer contract without reading React state.

- [ ] **Step 3: Implement scene hysteresis**

Use progress bands `0.00`, `0.22`, `0.42`, `0.62`, and `0.82` for the five scenes. A new higher scene must remain supported for 4 seconds; a lower scene must remain supported for 6 seconds. Immediate render controls always respond even while the macro-scene is held. `sceneMix` moves from 0 to 1 over 3–6 seconds and never clears renderer history.

- [ ] **Step 4: Map adaptive state to resonance**

Remove `RegulationPhase` from `targetResonance`. Map:

```ts
return {
  complexity: clamp01(0.18 + state.expressiveActivation * 0.52 + state.movementEnergy * 0.3),
  turbulence: clamp01(state.movementEnergy * 0.52 + state.facialTension * 0.3 + (1 - state.temporalCoherence) * 0.18),
  coherence: clamp01(state.temporalCoherence * 0.55 + state.progress * 0.45),
  focus: clamp01(0.35 + state.overallConfidence * 0.3 + state.progress * 0.35),
  depth: clamp01(0.28 + state.progress * 0.5 + state.breathRegularity * 0.22),
  pulse: state.breathConfidence > 0.35 ? state.breathPhase : 0.5,
  audioEnergy: clamp01(0.12 + state.movementEnergy * 0.34 + (1 - state.progress) * 0.18),
  warmth: clamp01(0.18 + state.facialWarmth * 0.36 + state.progress * 0.24),
  space: clamp01(0.12 + state.progress * 0.68 + state.temporalCoherence * 0.2),
};
```

- [ ] **Step 5: Check and commit**

```bash
pnpm run type-check
git add src/state/adaptive-state.ts src/state/adaptive-state-engine.ts src/experience/model.ts src/resonance/resonance.ts
git commit -m "feat: add Relief adaptive state engine"
```

---

### Task 6: Build the Persistent GPU Feedback Field

**Files:**
- Create: `src/visual/adaptive-visual-state.ts`
- Create: `src/visual/webgl-resources.ts`
- Create: `src/visual/adaptive-visual-shaders.ts`
- Create: `src/visual/adaptive-visual-core.ts`
- Modify: `src/visual/soul-mirror-renderer.ts`
- Reference-only: `public/journey-states.webp`

**Interfaces:**
- Produces: `AdaptiveVisualControlFrame` and `RendererMetrics`.
- Produces: `AdaptiveVisualCore.start()`, `update(frame)`, `setModulation(bitmap)`, `resize(width, height, dpr)`, `render(nowMs)`, `dispose()`.

- [ ] **Step 1: Define renderer inputs**

```ts
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
  requestedQuality: 'auto' | 'high' | 'balanced' | 'reduced';
  variationSeed: number;
  reducedMotion: boolean;
};

export type RendererMetrics = {
  fps: number;
  frameTimeMs: number;
  quality: 'high' | 'balanced' | 'reduced';
};
```

- [ ] **Step 2: Create reusable WebGL resources**

Implement helpers that throw actionable errors and always delete owned resources:

```ts
createProgram(gl, vertexSource, fragmentSource): WebGLProgram
createTexture(gl, width, height, internalFormat, format, type): WebGLTexture
createFramebuffer(gl, texture): WebGLFramebuffer
resizeTexture(gl, texture, width, height, internalFormat, format, type): void
```

Request `EXT_color_buffer_float`. Prefer `RGBA16F`; fall back to `RGBA8` when unavailable. Allocate two feedback textures/FBOs for ping-pong, one modulation texture, two half-resolution bloom textures/FBOs, one full-screen VAO, and one dynamic face-segment buffer.

- [ ] **Step 3: Implement the shader pass contract**

Create these complete shader exports in `adaptive-visual-shaders.ts`:

```ts
export const fullscreenVertexShader: string;
export const feedbackWarpFragmentShader: string;
export const sceneEmissionFragmentShader: string;
export const faceEmissionVertexShader: string;
export const faceEmissionFragmentShader: string;
export const blurFragmentShader: string;
export const compositeFragmentShader: string;
```

The warp pass samples the previous frame, displaces UVs using modulation gradients plus movement direction, applies scene-dependent curl/noise, and decays history. The scene pass implements five parameter families in one program. Coherence and Radiance may share base math with Gathering and Release, but their palette, symmetry, decay, emission, and attractor parameters must remain distinct.

Use these scene characteristics:

| Scene | Decay | Warp | Emission |
|---|---:|---:|---|
| Turbulence | 0.935 | 0.032 | fragmented red reaction lines |
| Gathering | 0.955 | 0.018 | amber orbit and converging trails |
| Coherence | 0.970 | 0.010 | gold/violet lattice and wire flower |
| Release | 0.978 | 0.006 | blue aurora and liquid ripples |
| Radiance | 0.985 | 0.003 | white stellar gas and stable presence |

The face pass renders topology segments additively into the active feedback FBO. Tension increases local curvature and high-frequency displacement; warmth widens and warms lines; breathing scales the whole field only when confidence is above `0.35`.

- [ ] **Step 4: Implement the multi-pass render loop**

Each frame must execute in this order:

```text
feedback read -> warp/decay -> feedback write
scene emission -> feedback write
face segment emission -> feedback write
feedback write -> half-resolution blur X -> blur Y
feedback + bloom -> display composite
swap feedback read/write
```

Do not clear feedback during normal scene transitions. Use the central light attractor in every scene so regression never removes the direction of travel. Blend camera palette at 15–25% inside the authored scene palette rather than sampling camera RGB into the final image.

- [ ] **Step 5: Remove runtime static-art rendering**

Delete `JOURNEY_ASSET_URL`, `uJourney`, `uHasJourney`, journey texture allocation/loading, atlas sampling, and all static-art compositing from `soul-mirror-renderer.ts`. Keep `public/journey-states.webp` out of runtime imports; preserve it only as reference material until the user decides whether to move or remove the file.

- [ ] **Step 6: Check shader compilation through the build**

```bash
pnpm run type-check
pnpm run build
```

Expected: both commands exit 0; no `/journey-states.webp` reference appears in generated JavaScript when checked with:

```bash
if rg -n "journey-states|uJourney|uHasJourney" dist; then
  echo "Static journey art is still referenced by the runtime bundle."
  exit 1
fi
```

Expected: no matches in generated application code.

- [ ] **Step 7: Commit**

```bash
git add src/visual/adaptive-visual-state.ts src/visual/webgl-resources.ts src/visual/adaptive-visual-shaders.ts src/visual/adaptive-visual-core.ts src/visual/soul-mirror-renderer.ts
git commit -m "feat: render Relief as a persistent GPU field"
```

---

### Task 7: Host Rendering in a Worker with a Main-Thread Fallback

**Files:**
- Create: `src/visual/adaptive-renderer-protocol.ts`
- Create: `src/visual/adaptive-renderer-worker.ts`
- Modify: `src/visual/soul-mirror-renderer.ts`

**Interfaces:**
- Preserves the existing renderer port: `start()`, `update(frame)`, `dispose()`.
- Adds: `setModulation(frame: PerceptionModulationFrame)` and `getMetrics(): RendererMetrics`.

- [ ] **Step 1: Define renderer worker messages**

```ts
export type RendererWorkerRequest =
  | { type: 'probe'; canvas: OffscreenCanvas }
  | { type: 'initialize'; canvas: OffscreenCanvas; width: number; height: number; dpr: number }
  | { type: 'update'; frame: AdaptiveVisualControlFrame }
  | { type: 'modulation'; bitmap: ImageBitmap }
  | { type: 'resize'; width: number; height: number; dpr: number }
  | { type: 'visibility'; hidden: boolean }
  | { type: 'dispose' };

export type RendererWorkerResult =
  | { type: 'probe-result'; supported: boolean }
  | { type: 'ready' }
  | { type: 'metrics'; metrics: RendererMetrics }
  | { type: 'error'; message: string };
```

- [ ] **Step 2: Implement the OffscreenCanvas host**

The worker first handles `probe` using a disposable `new OffscreenCanvas(1, 1)`. It must create WebGL2, compile the pass programs, draw one frame, verify `gl.getError() === gl.NO_ERROR`, dispose the probe resources, and report `supported`. After `initialize`, it constructs `AdaptiveVisualCore`, renders with worker `requestAnimationFrame`, and publishes metrics at most once per second. Close modulation bitmaps immediately after texture upload. Pause rendering on `visibility.hidden` without destroying feedback.

- [ ] **Step 3: Implement feature-detected fallback**

`SoulMirrorRenderer.start()` creates the worker and completes the disposable OffscreenCanvas probe before calling `transferControlToOffscreen()` on the visible canvas. Choose the worker only when the probe succeeds. Otherwise terminate the probe worker and instantiate `AdaptiveVisualCore` against the untouched HTML canvas WebGL2 context on the main thread. Do not maintain two shader implementations. This ordering is mandatory because transferring the visible canvas is irreversible.

If both worker and main-thread WebGL2 initialization fail, reject `start()` with a typed compatibility error. `StillnessExperience` must catch it and show an honest limited-experience message; do not substitute the static journey artwork or claim that the live visual is active.

When posting a topology array to the worker, transfer a dedicated copy so the state engine retains its observation:

```ts
const topologySegments = frame.topologySegments.slice();
worker.postMessage(
  { type: 'update', frame: { ...frame, topologySegments } },
  [topologySegments.buffer],
);
```

- [ ] **Step 4: Add adaptive quality**

Measure a rolling 2-second frame-time average. Select:

- `high`: under 18 ms, simulation scale 0.65, full bloom.
- `balanced`: 18–28 ms, simulation scale 0.5, reduced particles.
- `reduced`: above 28 ms, simulation scale 0.38, one bloom level, 30 fps cap.

Require 3 seconds of stable measurements before changing tier to prevent oscillation.

- [ ] **Step 5: Build and commit**

```bash
pnpm run type-check
pnpm run build
git add src/visual/adaptive-renderer-protocol.ts src/visual/adaptive-renderer-worker.ts src/visual/soul-mirror-renderer.ts
git commit -m "perf: move Relief rendering off the UI thread"
```

Expected: commands exit 0 and Waku emits a renderer worker chunk.

---

### Task 8: Wire the Closed Loop, Audio, Calibration, and Quick Menu

**Files:**
- Modify: `src/experience/session-controller.ts`
- Modify: `src/experience/model.ts`
- Modify: `src/audio/stillness-audio.ts`
- Modify: `src/experience/guidance-policy.ts`
- Modify: `src/experience/stillness-experience.tsx`
- Modify: `src/experience/session-menu.tsx`
- Modify: `src/styles.css`
- Retire runtime imports from: `src/sensing/mirror-signal-adapter.ts`, `src/sensing/mirror-signal.ts`, `src/experience/phase-policy.ts`

**Interfaces:**
- `SessionController` consumes `PerceptionAdapter`, `CalibrationController`, `BreathEstimator`, `AdaptiveStateEngine`, renderer, audio, and motion ports.
- `SessionTelemetry` exposes observable signals, confidences, contribution weights, scene, trend, and renderer metrics at no more than 5 Hz.

- [ ] **Step 1: Replace timer/scripted progression in the controller**

On every session frame:

```ts
const perception = dependencies.perception.read();
const calibration = calibrationController.update(perception, now);
const breath = breathEstimator.update(perception);
const adaptive = adaptiveStateEngine.update({ perception, breath, calibration, deviceMotion, tuning, nowMs: now });
const resonance = targetResonance(adaptive);

dependencies.renderer.update(toVisualControlFrame(adaptive, perception, tuning, preferences.variationSeed));
const modulation = dependencies.perception.takeModulationFrame();
if (modulation) dependencies.renderer.setModulation(modulation);
dependencies.audio.update(adaptive, resonance, elapsedSeconds);
```

Remove elapsed-time contribution to progress. When all sensing confidence is low, maintain a neutral generative field and report limited confidence; do not simulate increasing relief.

Remove the old `BaselineStore` dependency and activation/stability baseline reads from `SessionController` and `StillnessExperience` for this phase. The new calibration is in-session and ephemeral. Leave the store file in place until post-feedback cleanup rather than deleting it in this slice.

- [ ] **Step 2: Use calibration readiness instead of a fixed timeout**

Remove `CALIBRATION_DISPLAY_MS`. Keep the experience in `calibrating` until `CalibrationStatus.phase` becomes `ready` or `limited`. Show one framing message at a time:

- `framing`: “Bring your face and shoulders into the field.”
- `sampling`: “Stay naturally here while the field learns your rhythm.”
- `limited`: “The field will use the signals available here.”

Do not show the camera feed or a face silhouette.

- [ ] **Step 3: Expand telemetry without exposing a composite score**

Include movement, facial tension, facial warmth, expressive activation, breath regularity, breath confidence, temporal coherence, overall confidence, trend, current visual family, effective contribution weights, and renderer fps/quality. Do not expose internal `progress` as a numerical meter.

- [ ] **Step 4: Make sound clearly audible and state-led**

Change `StillnessAudio.update(state: AdaptiveState, resonance: ResonanceState, elapsedSeconds: number): void` to consume both state contracts. Keep safe gain ramps and autoplay handling. Apply:

- Movement energy -> texture density and filter roughness, not gain spikes.
- Facial tension -> bounded dissonant interval mix.
- Breath phase with confidence > `0.35` -> drone amplitude and filter breathing.
- Coherence -> longer delay and lower event density.
- Scene progress -> harmonic opening and brighter upper partials.

Raise initial master target only enough to be unambiguously audible on laptop speakers; cap the adaptive master gain at `0.24`.

- [ ] **Step 5: Update sparse guidance**

Base cues on observable state and hold each cue at least 7 seconds. Examples:

```ts
movement: 'The field is following your movement. Let it gather around one slower exhale.'
tension: 'The contours are holding some tension. See what softens when the jaw releases.'
breath: 'Your breathing rhythm is becoming visible. Let the next exhale travel through the field.'
settling: 'The field is opening with you. Stay with what is becoming easier.'
```

Pure mode renders none of these prompts.

- [ ] **Step 6: Add quick-menu visual controls and live matrix**

Add Auto journey, Lock visual, and Next variation controls. Live signals show value words, confidence, and effective contribution. Show technical visual-family names only inside the quick menu. Add bounded semantic range/select controls with these limits:

- Signal sensitivity: `0.75–1.25`, step `0.05`.
- Camera color influence: `0.15–0.25`, step `0.01`.
- Transition duration: `3–6 seconds`, step `0.5`.
- Visual intensity: `0.75–1.25`, step `0.05`.
- Render quality: Auto, High, Balanced, Reduced.

Pass tuning through the controller into the state engine and renderer without React updates on every frame. Keep all controls semantic HTML and preserve dialog focus restoration.

Give `SessionMenu` explicit `onTuningChange<K extends keyof SessionTuning>(key: K, value: SessionTuning[K])` and `onNextVariation()` props. The experience updates the preference snapshot only when a control changes; the controller keeps the latest snapshot in an imperative ref/port. `onNextVariation()` increments `variationSeed` without changing the active macro-scene. Lock visual holds the current scene family while preserving immediate facial, movement, breathing, and color response.

- [ ] **Step 7: Simplify and style the calibration/session surfaces**

Keep the canvas full-screen and primary. The landing must contain only Relief identity, one benefit statement, Start reset, the Guided-mode checkbox, and the concise privacy/quick-menu note. Add semantic CSS for calibration messages, signal-confidence rows, visual controls, and direction hints. Do not add cards over the active canvas.

Wire visibility changes through the controller so perception capture, renderer frames, and audio suspend while backgrounded and resume without resetting the adaptive field or calibration history.

- [ ] **Step 8: Remove superseded runtime imports and check**

Use `rg` before deletion:

```bash
rg -n "mirror-signal-adapter|mirror-signal|phase-policy|journey-states" \
  src/experience src/state src/resonance src/visual src/audio
```

Expected: no active runtime import after the controller and renderer migration. Leave obsolete files in place for this prototype checkpoint if deleting them would broaden the diff; remove them in the post-feedback cleanup plan.

Run:

```bash
pnpm run type-check
pnpm run build
```

Expected: both commands exit 0.

- [ ] **Step 9: Commit the closed loop**

```bash
git add src/experience/session-controller.ts src/experience/model.ts src/audio/stillness-audio.ts src/experience/guidance-policy.ts src/experience/stillness-experience.tsx src/experience/session-menu.tsx src/styles.css
git commit -m "feat: connect Relief signals to adaptive guidance"
```

---

### Task 9: Local User Feedback Checkpoint

**Files:**
- Modify only if required by deploy-safety checks: files already touched in Tasks 1–8.
- Do not modify tests, production infra, service worker strategy, analytics, or deployment configuration.

**Interfaces:**
- Produces: a local URL for direct camera/audio testing.
- Produces: a concise list of signals and visual transitions for the user to evaluate.

- [ ] **Step 1: Run the permitted final checks**

```bash
pnpm run type-check
pnpm run build
git status --short
```

Expected: type-check and build exit 0. Status contains no accidental test, infra, lockfile, or generated build artifacts.

- [ ] **Step 2: Start the local server**

```bash
pnpm dev
```

Expected: Waku prints a localhost URL, normally `http://localhost:3000/`.

- [ ] **Step 3: Perform only a developer smoke observation**

Open the landing once to confirm that it renders and the local URL is reachable. Do not run Playwright, browser smoke scripts, visual-regression tooling, or an automated interaction suite.

- [ ] **Step 4: Hand the build to the user**

Ask the user to evaluate:

1. Whether calibration clearly finds face and shoulders within 8–12 seconds.
2. Whether head movement, frowning, smiling, jaw release, and stillness reshape the field promptly.
3. Whether breathing becomes visible without the field pretending to know it too early.
4. Whether Turbulence, Gathering, Coherence, Release, and Radiance feel like one journey rather than preset changes.
5. Whether progress and regression are understandable without opening the quick menu.
6. Whether sound is clearly audible and supports the same transition.
7. Whether the quick-menu metrics explain what the engine is using.

- [ ] **Step 5: Stop and wait for feedback**

Do not deploy, add automated tests, polish unrelated UI, or implement native/mobile work. Record the user's feedback as corrections, elaborations, compatible proposals, or vision challenges before creating the next implementation slice.

---

## Plan Completion Boundary

Phase 1 is complete only when the local build demonstrates the approved closed loop and the user has been prompted to test it. This plan intentionally does not prescribe post-feedback shader tuning, additional visual families, native mobile work, Apple Watch integration, automated hardening, or production deployment.
