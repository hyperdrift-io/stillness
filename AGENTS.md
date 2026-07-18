# Stillness PWA

## Mission

Relief is a short interactive reset for moments when the user needs to recover, reload their batteries, and return stronger. The first outcome is immediate relief. The second outcome is renewed readiness.

## Vision ledger and change gate

Treat user feedback as directional input to reconcile with this ledger, not as an automatic replacement specification. Classify it as a correction, elaboration, compatible proposal, or vision challenge before implementation. A change to the mission, core interaction model, signal semantics, visual metaphor, privacy boundary, or an approved behavior requires a focused alignment question that states the current decision, proposed change, and consequence.

Approved experience pillars:

- Relief is a face-driven audiovisual companion that helps the user move from immediate relief toward renewed readiness.
- The abstract soul mirror remains visibly driven by the user's facial structure and expression signals.
- The five visual states in `.worktrees/relief-soul-mirror/STILLNESS_IMPLEMENTATION_PLAN.md` remain the canonical journey language: red fragmentation, amber orbit, gold/violet coherence, blue dissolution, and a single white presence. Those images are visual references only and must never replace the live renderer.
- The experience is one persistent procedural GPU feedback field. Facial topology, expression, movement, breathing, and constrained camera color reshape that field; raw camera pixels and static journey artwork are never composited as competing layers.
- The visual field both reflects the user's current input and preserves a light attractor that guides toward relief. Immediate environmental response and slower confidence-based progress operate on different timescales inside the same field.
- Light and an opening blue clearing are the destination. Movement, color, density, sound, and guidance must tell one coherent storm-to-clear-sky progression.
- Stillness is inferred from multiple weighted signals over time, never from one gesture or a timer alone. Confidence and persistence protect against tracking glitches and momentary expressions.
- The model uses observable, non-diagnostic facial patterns and continuous dimensions such as tension, activation, warmth, stability, and coherence. It must not claim to know the user's internal emotion or expose diagnostic labels.
- The adaptive five-scene hierarchy is approved: Turbulence, Gathering, Coherence, Release, and Radiance. Progress selects the macro-scene; bounded randomness may vary details but never the journey's meaning.
- Pure and Guided modes share the same camera-driven engine. Guided mode remains optional and off by default; it adds sparse coaching without changing signal semantics.

Open decisions:

- Final visual tuning, signal thresholds, and persistence windows remain prototype parameters to refine through user feedback. The approved initial weighting is movement stability 30%, breathing regularity 25%, facial tension release 25%, and temporal coherence 20%, with unavailable-signal weight redistributed among trustworthy inputs.

## Product rules

- The canvas remains primary after entry; optional session controls stay behind the compact `?` quick menu.
- Guided mode explains sensed changes with gentle invitations. Pure mode removes prompts; both modes keep live metrics and controls available behind the quick menu.
- Never expose a composite stillness score, diagnostic phase label, diagnosis, emotion label, streak, or achievement. Technical visual-family names may appear only as quick-menu controls.
- Missing sensor evidence lowers system confidence; it never becomes a judgment about the user.
- Raw camera frames, audio, and motion samples stay in memory and are never transmitted or persisted.
- Persist only bounded aggregate session summaries for local calibration.
- The first session must remain complete with camera or motion access denied.
- User-facing copy follows `meta/PHILOSOPHY.md` section 8, Speak to Enable.
- Mirror mode is the default experience. It uses local MediaPipe face landmarks and blendshapes to drive an abstract soul mirror.
- Camera-denied fallback remains available, but it is a degraded capability rather than the definition of Pure mode.
- The mirror uses the user's face mesh and expression signals as the live driver. It should feel like an astral projection of the user, not a normal camera feed and not a detached pure abstraction.
- The visual may preserve facial structure as constellation, mesh, light, topology, and motion. It must not render a realistic avatar, skin tone reconstruction, age/gender/beauty cues, or emotion labels.
- User-facing language may say expression signals, facial movement signals, softening, relief, stillness, and readiness. It must not claim to diagnose stress, anxiety, mood, health, or biological battery level.

## Architecture

- Waku server component shell; one `StillnessExperience` client island.
- Browser-native WebGL2, Web Audio, Media Capture, Device Motion, IndexedDB, and Service Worker APIs.
- Pure TypeScript domain modules between sensors and the resonance engine.
- Semantic CSS only. No Tailwind, utility chains, inline presentation styles, or CSS-in-JS.
- MediaPipe Tasks Vision is isolated behind `src/sensing/face-landmarker-client.ts` and `src/sensing/mirror-signal-adapter.ts`; session state and renderers consume normalized signals only.

## Commands

```bash
pnpm dev
pnpm run type-check
pnpm run build
```

## Prototype loop

Stillness remains in discovery until the user explicitly promotes it to hardening. Do not add, expand, or run automated test suites by default. Make the smallest coherent change, run fast deploy-safety checks, expose a local/dev test build, then pause for user feedback before choosing another significant product change. Do not deploy untested prototype changes to `https://stillness.hyperdrift.io` unless the user explicitly confirms production is the test target or says to deploy to production.
