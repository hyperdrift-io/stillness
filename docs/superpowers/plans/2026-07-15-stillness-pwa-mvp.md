# Stillness PWA MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an installable, offline-capable Stillness PWA that opens through one consent gesture into a continuous audiovisual descent and progressively adapts to local camera and motion evidence.

**Architecture:** Waku statically renders the privacy and entry shell. A single React client island owns session lifecycle and connects independent browser-native modules for phase policy, resonance mapping, WebGL rendering, Web Audio, sensing, and local calibration. Raw sensor data never leaves memory; only bounded summary values are persisted locally.

**Tech Stack:** Waku 1 beta, React 19, TypeScript 6, semantic CSS, WebGL2, Web Audio, Media Capture, Device Motion, IndexedDB, Service Worker, Web App Manifest, Node test runner.

## Global Constraints

- Keep `capture -> match -> entrain -> dissolve -> stillness` as one continuous field, never five screens.
- Require only one pre-session `Begin` action; expose no active controls during the consumer experience.
- Render a compelling field immediately and treat sensing as optional guidance, not a gate.
- Never classify emotion, diagnose stress, or make medical claims.
- Never store raw video, facial landmarks, audio, or timestamped frame history.
- Keep all state estimation on device and exclude inferred regulation values from analytics.
- Use semantic CSS only: no Tailwind, CSS-in-JS, inline presentation styles, or utility chains.
- Respect `prefers-reduced-motion`, page visibility, audio interruption, permission denial, and low-power devices.
- Use WebGL2 as the MVP renderer; do not add a second WebGPU renderer.

---

### Task 1: Establish the own-stack PWA shell

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.json`, `waku.config.ts`
- Create: `AGENTS.md`, `MISSION.md`, `README.md`, `.gitignore`
- Create: `src/pages/_layout.tsx`, `src/pages/index.tsx`, `src/styles.css`, `src/global.d.ts`
- Create: `public/manifest.webmanifest`, `public/sw.js`, `public/icon.svg`, `public/robots.txt`, `public/sitemap.xml`

**Interfaces:**
- Produces: static `/` route, install metadata, offline shell, `StillnessExperience` mount point.

- [ ] Copy only the own-stack configuration files needed by a one-route static app and rename the package to `stillness-pwa`.
- [ ] Add mission, privacy, metadata, manifest, robots, sitemap, and a deterministic vector icon.
- [ ] Add scripts: `dev`, `build`, `start`, `type-check`, and `test`.
- [ ] Run `pnpm install` and `pnpm run build`; expect exit code 0.
- [ ] Commit with `init: scaffold stillness pwa`.

### Task 2: Build the deterministic phase and resonance core with TDD

**Files:**
- Test: `tests/phase-policy.test.ts`, `tests/resonance.test.ts`
- Create: `src/experience/model.ts`, `src/experience/phase-policy.ts`, `src/resonance/resonance.ts`, `src/resonance/smoothing.ts`

**Interfaces:**
- Produces: `RegulationPhase`, `StateEstimate`, `ResonanceState`, `phaseForElapsed(elapsedMs)`, `targetResonance(state, phase)`, and `smoothValue(current, target, dt, timeConstant)`.

- [ ] Write tests proving phase boundaries at 5, 20, 60, and 180 seconds; run them and confirm failure because modules do not exist.
- [ ] Implement the five deterministic phase boundaries; rerun and expect pass.
- [ ] Write tests proving bounded resonance output and monotonic subtraction as activation falls; run and confirm failure.
- [ ] Implement pure resonance mapping and exponential smoothing; rerun and expect pass.
- [ ] Commit with `feat: add deterministic resonance core`.

### Task 3: Render the continuous light field

**Files:**
- Create: `src/visual/light-field-renderer.ts`, `src/visual/shaders.ts`, `src/visual/uniforms.ts`
- Test: `tests/visual-uniforms.test.ts`

**Interfaces:**
- Consumes: `ResonanceState`.
- Produces: `LightFieldRenderer.start()`, `update(state)`, `resize()`, and `dispose()`.

- [ ] Write and fail a test mapping each bounded resonance property to a finite shader uniform.
- [ ] Implement uniform packing and pass the test.
- [ ] Implement one WebGL2 full-screen triangle and a fragment shader with a dominant attractor, convergent filaments, layered depth, deterministic noise, and progressive entropy removal.
- [ ] Add device-pixel-ratio capping, context-loss recovery, visibility pause, and reduced-motion behavior.
- [ ] Commit with `feat: render adaptive stillness field`.

### Task 4: Add the shared audio field

**Files:**
- Create: `src/audio/stillness-audio.ts`, `src/audio/noise-worklet.ts`
- Test: `tests/audio-parameters.test.ts`

**Interfaces:**
- Consumes: `ResonanceState` and shared elapsed seconds.
- Produces: `StillnessAudio.start()`, `update(state, elapsedSeconds)`, `suspend()`, `resume()`, and `dispose()`.

- [ ] Write and fail tests for bounded gain, filter frequency, and pulse period.
- [ ] Implement pure audio parameter mapping and pass tests.
- [ ] Build an AudioContext graph from oscillators, filtered procedural noise, gain envelopes, and a shared phase; create/resume it only from the Begin gesture.
- [ ] Fade safely during visibility changes and disposal.
- [ ] Commit with `feat: add generative stillness audio`.

### Task 5: Add privacy-first sensing and local calibration

**Files:**
- Create: `src/sensing/camera-sensor.ts`, `src/sensing/motion-sensor.ts`, `src/sensing/feature-window.ts`
- Create: `src/state/state-estimator.ts`, `src/state/baseline-store.ts`
- Test: `tests/feature-window.test.ts`, `tests/state-estimator.test.ts`, `tests/baseline-store.test.ts`

**Interfaces:**
- Produces: latest-value `ObservationSample`, deterministic `estimateState(features, baseline)`, and local summary persistence.

- [ ] Write and fail tests for rolling mean, variance, slope, confidence decay, and bounded state output.
- [ ] Implement fixed-size rolling windows and deterministic state estimation; pass tests.
- [ ] Request the front camera with `getUserMedia`, analyse low-resolution frame energy in memory, and stop every track on exit.
- [ ] Treat Device Motion as optional evidence and support iOS permission requests when present.
- [ ] Persist only aggregate session summaries in IndexedDB; expose `clearBaseline()` for privacy settings.
- [ ] Commit with `feat: add on-device adaptation signals`.

### Task 6: Orchestrate the no-controls experience

**Files:**
- Create: `src/experience/stillness-experience.tsx`, `src/experience/session-controller.ts`
- Modify: `src/pages/index.tsx`, `src/styles.css`
- Test: `tests/session-controller.test.ts`

**Interfaces:**
- Consumes: phase core, resonance mapping, renderer, audio, sensors, and baseline store.
- Produces: entry, permission recovery, active session, and quiet exit states.

- [ ] Write and fail tests for scripted fallback, confidence-weighted sensing, visibility pause, and resource disposal.
- [ ] Implement `SessionController` and pass tests.
- [ ] Build the pre-session cover with one `Begin` button, concise on-device privacy copy, optional camera continuation, and accessible recovery messages.
- [ ] During the session render only the canvas plus a keyboard/screen-reader exit affordance; never show phase names, scores, or instructions.
- [ ] Commit with `feat: orchestrate continuous stillness session`.

### Task 7: Verify the PWA as a user would experience it

**Files:**
- Create: `tests/pwa-assets.test.ts`
- Modify only if verification finds a defect.

**Interfaces:**
- Validates: installability, offline assets, session entry, resource cleanup, accessibility, responsiveness, console health, tests, type-check, and production build.

- [ ] Write asset-contract tests for manifest, icon, service worker, sitemap, robots, metadata, and cache version; fail then fix until passing.
- [ ] Run `pnpm test`, `pnpm run type-check`, and `pnpm run build`; require exit code 0 for all.
- [ ] Start the production build locally and inspect `/` at mobile and desktop sizes with browser automation.
- [ ] Verify one-button entry, graceful camera denial, canvas rendering, audible graph start, reduced-motion path, and zero console errors.
- [ ] Run an offline reload and confirm the cached shell remains available.
- [ ] Commit with `test: verify stillness pwa experience`.

