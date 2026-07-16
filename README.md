# Stillness PWA

An installable, privacy-first audiovisual experience that meets the mind at its current velocity and progressively descends toward stillness.

## Run locally

```bash
pnpm install
pnpm dev
```

Open the local HTTPS or localhost URL. A single **Begin** gesture unlocks browser audio and, when available, on-device sensing. The experience remains complete when camera or motion access is unavailable.

## Session controls

Guided mode is selected by default. Uncheck it before Begin for Pure mode.
During a session: `?` menu, `G` guidance, `M` sound, `D` live signals,
`C` camera sensing, and `Escape` close/leave.

## Privacy

Camera and motion observations are processed on device. Raw frames and samples are never stored or transmitted. Local calibration contains aggregate session summaries only and can be cleared from the entry screen.

## Verify

```bash
pnpm test
pnpm run type-check
pnpm run test:browser
```

The browser smoke gate uses an installed Chrome without adding a browser automation dependency. It verifies WebGL startup, camera fallback-safe cleanup, reduced motion, and an offline reload after first use.
