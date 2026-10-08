# Stillness PWA

> Inherits the [Hyperdrift workspace AGENTS.md](../../AGENTS.md)
> (`~/dev/hyperdrift/AGENTS.md`) and `meta/PHILOSOPHY.md`, including the Voice Covenant.
> This file adds Stillness-specific context only.

## Mission

Stillness is a few-minute SOS reset for someone whose mind is running too fast: light and sound slow the breath to a calm pace, the camera stays on the device, and the person leaves with a pace they can keep. First outcome: relief in minutes. Second: the slow breath becomes theirs.

## Approved direction — Breathe with the light (2026-10-08)

Decision record: `docs/superpowers/specs/2026-10-08-breathe-with-the-light-design.md`. Research: workspace `.research/stillness-sos.md`. Treat feedback as directional input to reconcile with this ledger; a change to the mission, the breath arc, signal semantics, the visual metaphor or the privacy boundary needs a focused alignment question.

Pillars:

- **The whole screen breathes.** The breath pacer (`src/experience/breath-pacer.ts`) is the lead: arrive, cyclic sighs, a glide to about 5.5 breaths a minute with a longer exhale, then stillness. The light's fullness, the field's scale, the ocean and the bells all follow it.
- **Evidence steers, never judges.** Sensed breath, movement and facial tension pull the journey toward what the body does and speed the glide when the breath follows. Without a camera the arc still arrives at the same place.
- **The person arrives as a constellation and leaves as light.** The face topology drives the mirror in the early stages and dissolves as stillness rises. Five scenes remain the journey language: Turbulence, Gathering, Coherence, Release, Radiance.
- **Nothing flickers.** The light cycles every five to eleven seconds; no beat-reactive or onset-driven visuals; `prefers-reduced-motion` lowers amplitude and warp.
- **Sound is generated here**, on by default, thinning toward silence. No streams, no frequency claims.
- **Observations, not scores.** The end panel reports plain measurements (breaths a minute, movement, brow) only when the signal was trustworthy, strengths first. Never a composite score, emotion label, diagnosis, streak or achievement.

## Product rules

- One action starts the session; controls stay behind the compact `?` menu (sound M, camera C, live signals D, Escape leaves).
- Missing sensor evidence lowers confidence; it never becomes a judgment about the person.
- Raw camera frames and motion samples stay in memory and are never transmitted or persisted. Only bounded aggregate session summaries persist for local calibration.
- The first session is complete with camera access denied.
- User-facing copy follows `meta/PHILOSOPHY.md` section 8, Speak to Enable.
- The visual may preserve facial structure as constellation, mesh, light and motion. It must not render a realistic avatar, skin tone reconstruction, age/gender/beauty cues or emotion labels.
- User-facing language may say expression signals, breathing, softening, settling and stillness. It must not claim to diagnose stress, anxiety, mood or health.

## Architecture

- Waku server component shell; one `StillnessExperience` client island.
- Browser-native WebGL2, Web Audio, Media Capture, Device Motion, IndexedDB, and Service Worker APIs.
- Pure TypeScript domain modules between sensors and the renderer: `breath-pacer` (the lead), `breath-soundscape` (Web Audio), `session-controller` (orchestration and the session summary), `adaptive-state-engine` (evidence), `adaptive-visual-core` + shaders (one persistent WebGL2 feedback field).
- Semantic CSS only. No Tailwind, utility chains, inline presentation styles, or CSS-in-JS.
- MediaPipe Tasks Vision runs in `src/sensing/perception-worker.ts` off the main thread; session state and renderers consume normalized signals only.

## Commands

```bash
npm run dev
npm run type-check
npm run build
```

## Prototype loop

Stillness is a prototype in discovery until real people depend on it and the founder promotes it to hardening. While shaping it, the live preview is the only check; type check, build and the existing tests run at the release gate. A finished change merges to `main`, the root pin is bumped, and production moves with `cd infra && make deploy app=stillness` from a `release-watch` subagent (there is no deploy workflow). Read the signal in PostHog afterwards.
