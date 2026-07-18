# Task 6C report: persistent field lifecycle wrapper

## Status

Complete.

## Delivered

- Replaced `src/visual/soul-mirror-renderer.ts` with a thin lifecycle port over `AdaptiveVisualCore`.
- Preserved the existing `constructor(canvas)`, `start`, `update`, and idempotent `dispose` public surface.
- Added synchronous `setModulation(ImageBitmap | PerceptionModulationFrame)` handoff and `getMetrics()` without implementing Task 7 worker orchestration.
- Removed the legacy shaders, direct WebGL program/texture code, video upload, journey image allocation/loading, atlas sampling, and static-art compositing.

## Lifecycle audit

- The wrapper alone owns request/cancel animation frame scheduling, window resize, document visibility, reduced-motion media-query changes, and WebGL context loss/restoration.
- `start()` constructs/starts one core, attaches each listener once, applies DPR-aware resize, pushes the latest frame, and requests at most one animation frame.
- Visibility hide cancels only the scheduled frame and preserves the persistent feedback resources. Visibility resume requests exactly one frame through the guarded scheduler.
- Context loss calls `preventDefault`, cancels animation, and disposes invalid GPU handles while retaining the latest control frame. Restoration restarts the same core context, resizes, reapplies the target, and resumes once.
- Startup/render/restoration failures cancel scheduling, remove every listener, dispose the core, and leave the wrapper restartable.
- `dispose()` is idempotent: it cancels RAF, removes window/document/canvas/media-query listeners, disposes core resources, and clears frame/metrics state.
- Reduced motion is an override (`frame.reducedMotion || mediaQuery.matches`) and caps DPR at `1`. Requested high/balanced-or-auto/reduced quality caps DPR at `2/1.5/1` before delegating pass rendering to the core.

## Legacy compatibility audit

`update` accepts canonical `AdaptiveVisualControlFrame` directly. The only legacy conversion is the clearly marked private `mapLegacyFrame(SessionRenderFrame)` retained for Task 8 sequencing.

- Derives bounded progress from existing relief, readiness, settling, turbulence, and coherence signals.
- Maps progress into the five canonical scene bands and synthesizes an initial scene crossfade window.
- Maps bounded movement energy, facial tension, warmth, expressive activation, and coherence. Legacy data has no directional motion or reliable breathing evidence, so direction and breath confidence remain neutral.
- Uses a neutral authored palette with zero camera-palette confidence; it never infers camera colour from luminance or video.
- Converts the legacy clip-space face mesh back to normalized landmark endpoints, skips missing/non-finite connections, and packs at most 4,096 six-float segments.
- Never reads or forwards `mirror.sourceVideo`. The current camera still drives the field only through normalized face topology and bounded aggregate signals.

## Static-art and implementation-boundary audit

The wrapper contains no shader strings and no `getContext`, `createShader`, `texImage2D`, `HTMLVideoElement`, or `Image` implementation path. `AdaptiveVisualCore` is the only GL renderer.

Exact static checks after the production build:

```text
runtime static-art references: 0
wrapper direct media/GL implementation paths: 0
```

The checked forbidden runtime identifiers were `journey-states`, `uJourney`, and `uHasJourney` in the wrapper plus generated JavaScript. The reference file remains untouched under `public/` and is not referenced by the bundle.

## Verification

```text
$ pnpm run type-check
$ tsc --noEmit
```

Exit code: `0`.

```text
$ pnpm run build
$ waku build
...
✓ 3 files generated
```

Exit code: `0`.

No automated test suite or browser run was performed by prototype/task constraint.

## Concerns / next-task notes

- Waku now imports and bundles the core/shader modules through the wrapper, but it does not create a browser WebGL context or runtime-compile GLSL. The first allowed browser/GPU probe remains responsible for validating driver compilation and visual alignment.
- The legacy mapper intentionally provides no modulation texture and no breath confidence. Task 8 should remove this compatibility path when the adaptive controller becomes the canonical producer; Task 7 owns worker modulation cadence and automatic performance tiers.
- Render failures are contained and logged to the developer console because the current renderer port has no user-facing error callback. A later controller contract can add a graceful fallback signal without coupling UI into this wrapper.
