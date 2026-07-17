# Stillness PWA

## Mission

Relief is a short interactive reset for moments when the user needs to recover, reload their batteries, and return stronger. The first outcome is immediate relief. The second outcome is renewed readiness.

## Product rules

- The canvas remains primary after entry; optional session controls stay behind the compact `?` quick menu.
- Guided mode explains sensed changes with gentle invitations. Pure mode removes prompts and visible metrics.
- Never expose a score, phase name, diagnosis, emotion label, streak, or achievement.
- Missing sensor evidence lowers system confidence; it never becomes a judgment about the user.
- Raw camera frames, audio, and motion samples stay in memory and are never transmitted or persisted.
- Persist only bounded aggregate session summaries for local calibration.
- The first session must remain complete with camera or motion access denied.
- User-facing copy follows `meta/PHILOSOPHY.md` section 8, Speak to Enable.
- Mirror mode is the default experience. It uses local MediaPipe face landmarks and blendshapes to drive an abstract soul mirror.
- Pure mode remains the no-camera fallback and should share the same session engine.
- The mirror preserves facial structure as topology and motion; it must not render a normal camera feed, realistic avatar, identity cues, skin tone reconstruction, age/gender/beauty cues, or emotion labels.
- User-facing language may say expression signals or facial movement signals. It must not say emotion recognition or claim to detect stress, anxiety, mood, health, or biological battery level.

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

Stillness remains in discovery until the user explicitly promotes it to hardening. Do not add, expand, or run automated test suites by default. Make the smallest coherent change, run fast deploy-safety checks, deploy to `https://stillness.hyperdrift.io`, then pause for user feedback before choosing another significant product change.
