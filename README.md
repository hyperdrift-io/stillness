# Stillness

Breathe with the light. An installable, privacy-first reset for the minutes when the mind runs too fast: one light fills and empties with the lungs, an ocean follows it, and the pace slows to about six breaths a minute. The camera stays on the device.

## Production

[stillness.hyperdrift.io](https://stillness.hyperdrift.io). One **Begin** unlocks sound and, when allowed, on-device sensing. The session is complete without the camera.

## In a session

`?` menu · `M` sound · `C` camera sensing · `D` live signals · `Escape` leave. The end panel reports what the light observed (breaths a minute, heart beats a minute, movement, brow) when the signal was trustworthy, and asks one question: how do you feel?

## Why it works

Design decision and sources: `docs/superpowers/specs/2026-10-08-breathe-with-the-light-design.md`.

## Privacy

Camera and motion observations are processed on device. Raw frames and samples are never stored or transmitted. Sound is generated in the browser. Local calibration keeps aggregate session summaries only.

## Commands

```bash
npm run dev
npm run type-check
npm run build
npm test
```
