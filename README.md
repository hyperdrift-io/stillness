# Stillness PWA

An installable, privacy-first audiovisual experience that meets the mind at its current velocity and progressively descends toward stillness.

## Production

The prototype is evaluated at [stillness.hyperdrift.io](https://stillness.hyperdrift.io).

A single **Begin** gesture unlocks browser audio and, when available, on-device sensing. The experience remains complete when camera or motion access is unavailable.

## Session controls

Guided mode is selected by default. Uncheck it before Begin for Pure mode.
During a session: `?` menu, `G` guidance, `M` sound, `D` live signals,
`C` camera sensing, and `Escape` close/leave.

## Privacy

Camera and motion observations are processed on device. Raw frames and samples are never stored or transmitted. Local calibration contains aggregate session summaries only and can be cleared from the entry screen.

## Deploy-safety checks

```bash
pnpm run type-check
pnpm run build
```

Stillness is a prototype in discovery. Product feedback comes from the canonical production URL; automated test investment begins only when the direction is explicitly promoted to hardening.
