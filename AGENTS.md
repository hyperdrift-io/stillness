# Stillness PWA

## Mission

Create an adaptive audiovisual presence that meets the user at their current velocity and progressively removes stimulus until only stillness remains.

## Product rules

- The canvas remains primary after entry; optional session controls stay behind the compact `?` quick menu.
- Guided mode explains sensed changes with gentle invitations. Pure mode removes prompts and visible metrics.
- Never expose a score, phase name, diagnosis, emotion label, streak, or achievement.
- Missing sensor evidence lowers system confidence; it never becomes a judgment about the user.
- Raw camera frames, audio, and motion samples stay in memory and are never transmitted or persisted.
- Persist only bounded aggregate session summaries for local calibration.
- The first session must remain complete with camera or motion access denied.
- User-facing copy follows `meta/PHILOSOPHY.md` section 8, Speak to Enable.

## Architecture

- Waku server component shell; one `StillnessExperience` client island.
- Browser-native WebGL2, Web Audio, Media Capture, Device Motion, IndexedDB, and Service Worker APIs.
- Pure TypeScript domain modules between sensors and the resonance engine.
- Semantic CSS only. No Tailwind, utility chains, inline presentation styles, or CSS-in-JS.

## Commands

```bash
pnpm dev
pnpm run type-check
pnpm run build
```

## Prototype loop

Stillness remains in discovery until the user explicitly promotes it to hardening. Do not add, expand, or run automated test suites by default. Make the smallest coherent change, run fast deploy-safety checks, deploy to `https://stillness.hyperdrift.io`, then pause for user feedback before choosing another significant product change.
