# Relief Soul Mirror Design

**Date:** 2026-07-16
**Status:** Approved direction; written spec ready for user review

## Purpose

Relief is a short interactive reset for the moment when the user needs to recover, reload their batteries, and return stronger. The first outcome is immediate relief. The second outcome is renewed readiness.

The current Stillness prototype proves the audiovisual direction, but its signals are not legible or responsive enough. Relief makes the feedback loop central: an abstract soul-like mirror responds to the user's facial structure, movement, and expression activity without showing a normal webcam feed, realistic avatar, identity cues, or emotion labels.

The product should feel useful on the web before a native mobile or Apple Watch version is justified.

## Product Direction

Relief uses the first approach selected in brainstorming: **Soul Mirror Default**.

- **Mirror** is the default mode. It uses the camera locally to build an abstract face-structured presence field.
- **Pure** remains available as the no-camera fallback and uninterrupted visual reset.
- **Guidance** is a setting layered onto either mode, not a separate engine.
- **Audio** supports relief and can become primary when the user softens their gaze or closes their eyes.
- **Metrics** remain available from the quick menu for transparency and tuning, not as a visible score.

The mirror should preserve facial structure, not appearance. It should feel like the app is responding to the user without making them inspect their own face.

## Experience Principles

1. **Structure without self-consciousness.** The visual can reflect eyes, mouth, jaw, brow, symmetry, and head posture as forces in a field, but it must not render a literal face, selfie, or avatar.
2. **Signals, not judgment.** Relief can describe movement, steadiness, presence, signal quality, and expression activity. It must not tell users they are anxious, sad, stressed, angry, or emotionally deficient.
3. **Relief before readiness.** The session first helps the user feel a reset. Readiness emerges later through sustained steadiness and a light end-of-session self-check.
4. **Ritual, not calibration.** The first seconds establish baseline, but the user experiences this as arrival, not as a scan.
5. **Local by default.** Camera frames, landmarks, blendshapes, audio, and motion samples stay on device. Nothing is recorded or transmitted.
6. **Prototype discipline.** Significant changes should be deployed to production for feedback before further product steering. Do not add or expand automated test suites during prototype iteration.

## Start Screen

The start screen should be clear that Relief is an interactive reset.

Primary framing:

> Relief helps you reset now and return stronger.

Supporting copy:

> A private soul mirror that responds to presence, movement, and expression signals. Use it for a few minutes when you need to recover your center and rebuild readiness.

Pre-session controls:

- **Mirror mode** checked by default: "Use the soul mirror."
- **Pure mode** available as the no-camera option.
- **Guided** checkbox controls prompts.
- **Soothing sound** toggle controls adaptive audio.

The screen should explain that all camera analysis stays on device and that the user can press `?` during the session to change mode, sound, guidance, sensing, and live signals.

## Session Flow

Relief runs as a short recovery ritual with four phases.

### 1. Arrive

The abstract mirror forms from the user's presence. The first 8-12 seconds quietly establish personal baseline and signal quality. No real camera preview appears.

If needed, practical hints appear:

- "A little more light helps the mirror respond."
- "Move a little closer."
- "Keep one face centered."

These hints describe signal quality, not user failure.

### 2. Release

The mirror becomes highly responsive. Movement and expression activity create turbulence. Steadiness and softening make the field clearer and more coherent.

This phase proves that the app is responding in real time.

### 3. Restore

Audio becomes more important. The user can keep watching, soften their gaze, or close their eyes. Closing eyes is optional, because forcing it would break the interactive promise for some users.

Guidance remains sparse and physical:

- "Let your jaw release for one breath."
- "Let the next exhale take a little longer."
- "Let the field meet the change; nothing needs correcting."

### 4. Return

The mirror shows the shift toward readiness. Relief gives a simple completion state: relief first, readiness emerging.

The ending can ask for a light self-check such as:

> Do you feel ready to return?

This self-check is not a medical score and should not be framed as proof of physiological change.

Default duration: 3 minutes. Quick options: 1, 3, and 5 minutes.

## Signal Model

Mirror and Pure modes use one shared state model.

Inputs from Mirror mode:

- face presence
- landmark tracking confidence
- head movement
- whole-frame motion
- expression activity from blendshape changes
- facial softness proxies from reduced tension/activity over baseline
- signal quality

Inputs from Pure mode:

- elapsed ritual curve
- optional device motion
- breathing interaction if available
- user controls
- scripted fallback state

Shared derived state:

- **presence:** enough signal exists to respond.
- **motion:** head/body/camera instability.
- **expression activity:** facial movement signals from landmarks and blendshapes.
- **softness:** reduced facial tension and smoother movement relative to baseline.
- **turbulence:** short-term agitation in the signal.
- **settling:** sustained reduction in turbulence against the user's own baseline.
- **relief:** first-stage outcome when turbulence drops and coherence rises.
- **readiness:** second-stage outcome after relief, sustained steadiness, and self-check.

User-facing copy should use "expression signals" or "facial movement signals," not "emotion recognition." Internally, the implementation may use blendshape scores, but the product must not claim to infer emotions.

## Technology Direction

Use current browser APIs and one isolated face-tracking dependency:

- `getUserMedia` for front-camera access.
- `requestVideoFrameCallback` where available, with `requestAnimationFrame` fallback.
- MediaPipe Face Landmarker for live face landmarks, blendshapes, and transformation matrices.
- Canvas or WebGL for rendering the soul mirror.
- Web Audio for adaptive soothing sound.
- Device motion only as an optional supporting signal on phones.

Do not rely on the browser-native `FaceDetector` or Shape Detection APIs because support is fragmented. Do not use Apple Watch or HealthKit in the PWA; those require native app work and belong to a later decision.

## Architecture

Relief should be structured around one shared session engine.

```text
SignalAdapter -> ReliefStateEstimator -> Renderer + Guidance + Audio + Metrics
```

### MirrorSignalAdapter

Owns camera access, MediaPipe loading, face landmarks, blendshapes, tracking confidence, and whole-frame fallback motion. It emits normalized signal inputs only.

It must not own rendering, guidance, copy, or session progression.

### PureSignalAdapter

Emits the same signal shape without camera. It uses the ritual curve, optional device motion, breathing interaction if available, and user input.

Pure mode should not be a separate product branch.

### ReliefStateEstimator

Converts signal inputs into the shared state: presence, motion, expression activity, softness, turbulence, settling, relief, and readiness.

It should use personal baseline from the arrival phase so users are compared against their own starting state, not a universal stillness template.

### SoulMirrorRenderer

Turns landmarks and state into abstract topology, contours, light, particles, rhythm, and coherence.

Rules:

- no normal webcam feed
- no realistic avatar
- no skin tone reconstruction
- no identity, age, gender, beauty, or face-recognition cues
- no explicit emotion labels

The face structure may be readable as topology, but should feel soul-like rather than literal.

### PureRenderer

Uses the same ReliefState output but renders a non-camera field. It can be improved later without touching session state logic.

### GuidancePolicy

Produces sparse, positive prompts from state changes. It should describe what the app can honestly sense and one physical invitation.

### AudioEngine

Generates or mixes soothing audio that responds gently to relief state. Audio should become more prominent during Restore and should fade smoothly when toggled.

### MetricsOverlay

Available from the quick menu. Shows live signals such as presence, movement, expression activity, turbulence, settling, relief, readiness, and confidence.

Metrics are for transparency and debugging. They must not become a consumer score.

## Error Handling And Fallbacks

- **Camera denied:** start in Pure mode and explain that Mirror needs camera permission.
- **MediaPipe load fails:** fall back to camera-motion mirror if available; otherwise Pure mode.
- **Face not found:** keep the abstract field alive and offer practical guidance.
- **Low confidence:** reduce claims and show limited signal quality.
- **Performance drops:** lower analysis FPS, simplify rendering, and disable heavy effects before ending the session.
- **User leaves and returns:** pause camera and audio safely, then resume unless the baseline is stale.
- **Multiple faces:** track the most stable central face and avoid identity-like behavior.
- **Poor light or background motion:** show practical hints only when they affect responsiveness.

## Privacy And Claims

Relief must maintain a strict privacy and claims boundary.

- Camera frames stay local.
- Landmarks and blendshapes stay local.
- No recording.
- No upload.
- No face recognition.
- No identity matching.
- No health diagnosis.
- No stress, anxiety, mood, or emotion claim.
- No "battery level" as a measured physiological metric.

"Recharge your battery" can be used as metaphorical product language, but the app must not imply it measures biological energy unless a future native version has validated signals and appropriate review.

## Validation During Prototype

Per the current prototype doctrine, do not add, expand, or run automated test suites for this phase. Validation should focus on production feedback after significant changes.

Deploy-safety checks should remain lightweight:

- production deployment succeeds
- camera permission flow works
- fallback to Pure mode works
- mirror renderer is nonblank
- quick menu opens
- audio can toggle
- no obvious runtime console failure during manual production use

The key prototype question is not "does the test suite pass?" It is:

> Does a face-structured soul mirror make users feel immediate relief and progressively renewed readiness?

## Open Later

These are intentionally out of scope for this spec:

- native iOS app
- Apple Watch heart-rate and haptic integration
- HealthKit mindful session writing
- App Store positioning
- account system
- cloud sync
- clinical or mental-health claims
- long-term progress analytics
- The Ascent integration beyond conceptual alignment

The native path becomes worth revisiting only if the web mirror produces repeat use and clear user feedback that richer signals would deepen the experience.
