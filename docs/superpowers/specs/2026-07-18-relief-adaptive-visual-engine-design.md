# Relief Adaptive Visual Engine Design

**Date:** 2026-07-18
**Status:** Approved for implementation planning
**Scope:** Camera perception, state fusion, GPU visual system, adaptive audiovisual guidance, performance, privacy, and prototype validation

## Product intent

Relief is a short interactive reset for moments when someone needs immediate relief and then renewed readiness. The product succeeds when the user can see and feel that their face, movement, and breathing are shaping the experience in real time, and when sustained settling produces an unmistakable transition from turbulence toward light.

This design replaces the current static-asset-led renderer with a living procedural field. The five artworks from the existing implementation plan remain the canonical visual language, not runtime imagery. They establish the progression from red fragmentation through amber orbit, gold and violet coherence, blue dissolution, and white presence.

The engine must be spectacular enough to invite attention, responsive enough to establish causality, and restrained enough to guide rather than overwhelm.

## Approved decisions

- Use a multimodal, confidence-weighted perception engine.
- Require an 8–12 second head-and-shoulders calibration.
- Detect observable facial patterns, movement, posture stability, and visual breathing rhythm without claiming to diagnose emotion or health.
- Render one persistent MilkDrop-inspired GPU feedback field. Do not display the camera feed or static journey artwork.
- Use five adaptive procedural scene grammars: Turbulence, Gathering, Coherence, Release, and Radiance.
- Let regulation state select the macro-scene. Use bounded variation for novelty, never random scene changes that could be mistaken for progress.
- Preserve a distinction between immediate reflection and slower guidance inside the same visual field.
- Pure and Guided modes share the same camera-driven engine. Guided mode is off by default and adds sparse coaching.
- Keep raw camera data on-device and ephemeral.
- Validate the prototype through a local user-feedback loop before any production deployment.

## Alternatives considered

### Import projectM and its preset packs

Rejected. projectM proves the value of previous-frame feedback, shader-defined behaviours, and smooth transitions, but directly importing it would add a large interpreter and a library of visuals designed for audio entertainment rather than regulation. The official Cream of the Crop pack contains 9,795 curated presets, and its preset licensing is historically ambiguous. Relief will study its visual families without bundling its presets or runtime.

### Randomly cycle visualisations

Rejected as the default. Random spectacle breaks causality because a user cannot tell whether a major change represents their input, genuine progress, or a timer. Randomness is allowed only within the active scene grammar for details such as seed, filament arrangement, and restrained palette variation.

### Show an abstracted camera feed beneath a separate progress visual

Rejected. Two competing layers recreate the mirror-plus-overlay problem and weaken the sense that the user is sculpting one living system. Camera-derived geometry, motion, luminance, and color must become inputs to a single procedural field.

## System architecture

The engine is divided into five bounded components.

### 1. Capture and calibration

The capture coordinator owns camera permission, stream lifecycle, visibility changes, and calibration. Calibration lasts 8–12 seconds and requires the face and shoulders to remain visible. It establishes:

- Neutral facial geometry and blendshape ranges.
- Landmark noise and natural head-motion variance.
- Shoulder and upper-torso regions suitable for breathing analysis.
- Lighting quality for optional color-based respiratory confirmation.
- Baseline confidence for every sensor channel.

Calibration provides visible cause and effect. Small head movements bend the field, and facial contraction reshapes its topology before the session starts. This demonstrates that the system is responding to the user without exposing a normal camera image.

### 2. Perception worker

MediaPipe Face Landmarker and Pose Landmarker execute outside the UI thread. The perception layer emits timestamped observations rather than emotional conclusions:

- Face landmarks and transformation matrix.
- Blendshape values for brow, eyes, cheeks, lips, jaw, and smile-like patterns.
- Head translation, rotation, and velocity.
- Shoulder and upper-torso landmarks.
- Torso and head micro-motion suitable for breathing analysis.
- Optional aggregate facial color rhythm for respiratory confirmation.
- Per-channel tracking, visibility, and signal-quality confidence.

MediaPipe calls are synchronous in the browser, so worker isolation is required wherever supported. The perception rate may adapt between approximately 15 and 24 Hz without affecting the render cadence.

### 3. Signal fusion

The fusion engine converts observations into normalized continuous dimensions relative to calibration:

- `facialTension`: contraction from brows, eyes, jaw, and mouth without assigning an emotion.
- `facialWarmth`: smile-like and soft-eye patterns used for color and openness, not as an automatic stillness reward.
- `expressiveActivation`: rate and amplitude of facial change.
- `movementEnergy`: normalized landmark velocity and head-motion energy.
- `postureStability`: continuity of head and shoulder position.
- `breathPhase`: inhale-to-exhale phase when confidence is sufficient.
- `breathRegularity`: periodic coherence over multiple cycles.
- `temporalCoherence`: stability of the combined state over time.
- `signalConfidence`: confidence for every component and for the fused estimate.

The initial progress weighting is:

| Factor | Weight |
|---|---:|
| Movement stability | 30% |
| Breathing regularity | 25% |
| Facial tension release | 25% |
| Temporal coherence | 20% |

Unavailable or unreliable signals never reduce progress. Their weight is redistributed proportionally among trustworthy factors. The composite progress value is an internal control signal, not a user-facing score.

Breathing analysis is explicitly non-medical. It combines shoulder and upper-torso cyclic movement with head micro-motion and optional facial color rhythm. Breath phase appears only after sufficient confidence; respiratory rate requires multiple cycles. The engine must never manufacture a breathing rhythm when evidence is weak.

### 4. Adaptive controller

The controller has two timescales:

- The reflex loop maps spatial movement and facial-pattern changes to render parameters immediately.
- The guidance loop uses smoothed, confidence-weighted trends to select progress, scene, audio tension, and optional coaching.

Immediate disturbance must not cause immediate stage regression. A sudden movement creates a local ripple; sustained change affects the journey. Initial prototype semantics are:

- Movement response begins within 100 ms where hardware permits.
- Facial-pattern response begins within 100–250 ms.
- Progress uses a rolling multi-second window.
- A candidate macro-scene must remain supported for several seconds before transition.
- Scene transitions take approximately 3–6 seconds.
- Hysteresis keeps the experience reversible without oscillating between scenes.

The exact persistence thresholds remain quick-menu tuning parameters during discovery. Their purpose is fixed: immediate acknowledgement, slow interpretation, and stable progression.

### 5. GPU audiovisual field

The renderer uses WebGL2 and floating-point ping-pong framebuffers. Each frame reuses the previous frame through advection, warp, decay, procedural emission, and composite passes. This is the source of the organic MilkDrop-like continuity.

The pipeline is:

1. Upload the newest camera-derived modulation texture only when a new camera frame is available.
2. Produce a low-resolution force field from facial topology, motion, luminance gradients, and current state.
3. Advect and decay the previous feedback texture.
4. Inject scene-specific filaments, particles, contours, and light.
5. Apply bloom, tone mapping, restrained chromatic treatment, and final compositing.
6. Preserve the feedback buffer across scene changes.

The DOM performs no per-frame animation. Live metrics are throttled before reaching React state.

## Camera fusion

The raw camera image is never visible. Camera input affects the field through four channels:

- Facial topology seeds line emitters, attractors, and deformation geometry.
- Motion supplies spatial direction and turbulence rather than a global activity flash.
- Luminance gradients influence depth and displacement.
- Camera color supplies a constrained 15–25% palette bias within the active scene's authored color corridor.

This treatment must let users recognize that their face and expression are the source without leaving them staring at a portrait or avatar. Facial structure can appear as constellation, mesh, topology, or luminous contour during calibration and early interaction, then dissolve further into the field while remaining causally active.

## Reflection and guidance

The visual field serves two simultaneous roles:

- Reflection expresses the user's current visible state quickly.
- Guidance preserves a stable light attractor that shows the direction toward relief.

| Visible pattern | Immediate reflection | Guidance response |
|---|---|---|
| Faster movement | Spatial turbulence follows the movement | The central field becomes slower and more magnetic |
| Facial contraction | Topology compresses and gains fine tension | Surrounding contours open toward calmer geometry |
| Smile-like warmth | Filaments widen and warm | Warmth is acknowledged without counting as automatic stillness |
| Jaw and eye release | Harsh frequencies soften | Trails lengthen and become coherent |
| Stable posture | Random divergence falls | The attractor strengthens and progression becomes possible |
| Inhalation | The field gathers and expands | The light remains stable |
| Exhalation | Energy travels outward and dissipates | Light and harmonic tension clear |
| Regular breathing | Pulsation becomes coherent | Symmetry, depth, and scene stability increase |
| Sustained renewed agitation | Disturbance returns gradually | Progress recedes without removing the guiding light |

The interface uses enabling observational language such as “movement settling,” “breath rhythm emerging,” and “facial tension releasing.” It must not claim that the user is anxious, happy, unhealthy, or biologically depleted.

## Adaptive scene hierarchy

All scenes share the same feedback buffers and signal contract. They differ through authored parameter families, procedural emitters, vector fields, and color corridors.

| Scene | Visual grammar | Primary meaning |
|---|---|---|
| Turbulence | Reaction liquid, windy trails, fragmented topology | Current energy is visible and can be shaped |
| Gathering | Magnetosphere, particle orbit, converging trails | Movement and attention begin to organize |
| Coherence | Fractal lattice, wire flower, cathedral geometry | Stable signals align into structure |
| Release | Aurora, liquid ripples, open blue flow | Tension disperses and space returns |
| Radiance | Stellar gas, soft supernova emission, white presence | Sustained coherence becomes renewed readiness |

Macro-scene selection is progress-led and trend-aware. Bounded variation may change seeds or compatible sub-patterns during a plateau. Regression morphs the active field toward turbulence instead of hard-cutting backward. The feedback buffer is never cleared during normal transitions.

The quick menu provides:

- Auto journey.
- Lock current visual family.
- Next compatible variation.
- Live normalized signals, confidence, and contribution.
- Performance and sensitivity parameters needed during discovery.

Pure mode keeps prompts hidden while retaining these controls. Guided mode adds sparse, supportive prompts. Both modes use the same perception, state, visual, and audio engines.

## Audio behaviour

Sound is driven by the same state vector as the visual field. It must not become an independent animation source that obscures user causality.

- Movement energy influences texture density, not abrupt loudness.
- Facial tension influences harmonic tension and spectral roughness within safe bounds.
- Exhalation can release harmonic tension once breath confidence is sufficient.
- Coherence lengthens tones and reduces event density.
- Progress opens brightness and harmonic space.
- Pure mode may still use sound; Guided mode adds sparse text invitations without changing the sound-state mapping.

Audio and visual transitions must resolve together.

## Performance strategy

Responsiveness takes priority over native display resolution.

- Target 60 fps on capable hardware and a stable 30 fps minimum on mobile.
- Run the feedback simulation below display resolution and upscale through GPU composite passes.
- Adapt particle count, blur pyramid depth, simulation resolution, and perception frequency to measured frame time.
- Use `requestVideoFrameCallback()` to avoid uploading duplicate camera frames.
- Use `OffscreenCanvas` and transferable frames where browser support is reliable.
- Retain a main-thread WebGL2 fallback behind the same renderer interface.
- Cap device pixel ratio and expensive effects on mobile or thermally constrained devices.
- Pause camera, audio, workers, and GPU work when the app is backgrounded.

WebGPU is not required for this prototype. The architecture may support a future backend, but implementing two renderers now would add complexity without improving the first user-feedback loop.

## Failure and degradation behaviour

- Low breathing confidence hides breath phase and redistributes its weight.
- Lost face or shoulder tracking preserves the field briefly, then offers a gentle framing invitation.
- Poor lighting disables color-based analysis while retaining geometry and movement.
- Worker rendering failure falls back to reduced-complexity WebGL2.
- WebGL failure presents an honest compatibility state and a limited visual-only fallback. Static journey artwork must not masquerade as the live experience.
- Camera denial provides a complete but explicitly reduced visual session driven by available non-camera inputs. It is not the definition of Pure mode.
- Audio remains opt-in and respects browser autoplay constraints.

## Privacy

Camera processing is local. Raw frames, audio samples, landmarks, and physiological traces are not transmitted or persisted. Only ephemeral normalized values enter the session state. Any locally persisted calibration summary must be bounded, non-identifying, and removable through settings.

## Prototype validation gate

This project remains in discovery. Do not add or expand automated test suites for this slice. Run only fast deploy-safety checks such as type-check and build, then provide a local test server for direct feedback. Do not deploy the slice to production without explicit approval after user testing.

The first testable implementation must demonstrate:

1. Head-and-shoulders calibration completes and communicates signal quality.
2. The quick menu shows face, expression, movement, breathing confidence, and signal contribution.
3. Movement and facial changes reshape the field without perceptible delay.
4. Breathing affects the field only after confidence is established.
5. The core Turbulence, Gathering, and Release behaviours are visually polished enough to judge.
6. Sustained settling produces unmistakable visual and sonic progression.
7. Regression is reversible and does not feel punitive.
8. No static journey image or visible camera feed appears in the runtime renderer.

The user-feedback checkpoint occurs as soon as this coherent vertical slice is locally testable. The remaining scene depth and parameter tuning follow feedback rather than assumptions.

## Research references

- [projectM architecture and preset ecosystem](https://github.com/projectM-visualizer/projectm)
- [projectM Cream of the Crop preset taxonomy](https://github.com/projectM-visualizer/presets-cream-of-the-crop)
- [projectM transition shaders](https://github.com/projectM-visualizer/projectm/tree/master/src/libprojectM/Renderer/TransitionShaders)
- [WebGL floating-point color buffers](https://registry.khronos.org/webgl/extensions/EXT_color_buffer_float/)
- [MediaPipe Face Landmarker for web](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js)
- [MediaPipe Pose Landmarker for web](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker/web_js)
- [OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [Multimodal breathing estimation from facial motion and rPPG](https://sra.samsung.com/publications/multimodal-breathing-rate-estimation-using-facial-motion-and-rppg-from-rgb-camera/)

## Out of scope

- Medical, mental-health, stress, or emotion diagnosis.
- Uploading, recording, or sharing camera footage.
- Direct integration of projectM, MilkDrop presets, or a general preset interpreter.
- A WebGPU-only backend.
- Apple Watch, native mobile applications, or store release work.
- Automated test-suite expansion during prototype discovery.
- Production deployment before explicit post-feedback approval.
