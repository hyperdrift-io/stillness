# Relief Publishable POC Improvement Plan

**Date:** 2026-08-04
**Status:** Approved implementation slice

## Outcome

Turn the existing adaptive-engine branch into one locally testable closed loop: the camera worker observes facial structure, expression, movement, and breathing evidence; calibration establishes trustworthy baselines; sustained evidence selects the Relief scene; and one persistent GPU field responds immediately while guiding more slowly toward an open clearing.

## Design brief

The eye enters a near-black blue-green field and lands on one living facial constellation. One action starts the reset. Movement is acknowledged immediately; progress is spacious, gradual, and confidence-led. The feeling is: **this met me, and I can feel it listening.**

## Scope

1. Replace the legacy mirror adapter and elapsed-time progression with the existing worker perception, calibration, breathing, and adaptive-state modules.
2. Feed the adaptive control frame and low-resolution modulation texture into the persistent WebGL renderer.
3. Drive audio and live telemetry from the same adaptive state without exposing a composite score or diagnostic label.
4. Keep camera denial complete and non-punitive; unavailable evidence redistributes weight instead of advancing progress.
5. Reduce the concentrated white core and bloom while preserving the approved red-to-amber-to-violet-to-teal-to-pearl journey.
6. Keep Pure as the default, Guided optional, album playback beginning with the experience, controls behind `?`, and visual variation independent from progress.

## Explicitly deferred

- Production deployment and article publication.
- New visual metaphors or generated runtime artwork.
- Native mobile, Apple Watch, WebGPU, dependencies, and automated test work.
- Moving the renderer to an OffscreenCanvas worker; perception moves off the main thread now, and renderer delegation remains the next performance step if direct device feedback requires it.

## Validation

- `pnpm run type-check`
- `pnpm run build`
- Local development server responds successfully.
- Direct user feedback determines the next visual and performance change.

## Follow-up correction — 2026-08-05

- Keep camera intent owned by the newest asynchronous request so an older failure cannot untick a newer successful choice.
- Default the private live-signal panel to on and surface genuine runtime camera loss without treating missing evidence as user failure.
- Make Radiance clear feedback history faster and cap display output so arrival remains a structured teal-and-pearl presence rather than accumulating toward white.
- Start the shuffled album stream when the user begins the experience, with a silent fallback when the server stream or browser audio is unavailable. Playback uses half speed and a restrained bass lift. Stream through HTTP Range requests from `STILLNESS_MUSIC_DIR`; browser analysis lets bass onsets pulse the persistent field while colour moves through one continuous chromatic cycle. Recordings remain gitignored and outside the application build; production streaming requires separately provisioned, licensed files.
- Keep media-track ownership independent from perception-worker readiness. A slow model load, failed analysis frame, worker restart, or visual upload error must not stop an otherwise healthy camera stream.

## Approved landing direction — First Breath — 2026-08-05

- Let the persistent procedural field begin in a quiet ambient state before camera consent, so the landing and reset feel like one continuous place.
- Use one visual anchor, “Take a minute back.”, one supporting sentence, and one primary action.
- Keep privacy close to the action; move Guided mode and all other choices behind the in-session `?` menu.
- Dissolve the landing copy into the same live field when the reset begins instead of replacing it with a second visual layer.

## Interaction regression correction — 2026-08-06

- Restore face-relative normalization lost when commit `55a3457` connected the persistent GPU field. Raw camera coordinates made the mesh too small and unstable to act as the experience's focal mirror.
- Keep one legible astral face in the field. Live center, scale, yaw, pitch, roll, mouth, brow, eye, warmth, and tension signals may move and reshape it; no emotion or diagnostic label is inferred or displayed.
- Report the observable expression channels behind `?` so the user can verify that sensing is live without exposing a composite stillness score.
- Remove the vowel synthesis. The optional filtered-surf layer remains the only generated audio; album playback streams from a separately provisioned server directory and is excluded from the service-worker cache.
- Protect landing copy from the brightest procedural frames with a local shadow field. Do not rely on CSS blend modes for essential text contrast.
- Cap final display output below the earlier white-out level so Radiance remains luminous rather than blinding.
