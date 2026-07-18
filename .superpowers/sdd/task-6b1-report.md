# Task 6B1 report: adaptive visual shader library

## Status

Complete.

## Delivered

- Created `src/visual/adaptive-visual-shaders.ts` with all seven complete GLSL ES 3.00 exports required by Task 6:
  - `fullscreenVertexShader`
  - `feedbackWarpFragmentShader`
  - `sceneEmissionFragmentShader`
  - `faceEmissionVertexShader`
  - `faceEmissionFragmentShader`
  - `blurFragmentShader`
  - `compositeFragmentShader`
- Kept this slice independent of the adaptive core and existing renderer wrapper. No dependency, UI, CSS, worker, infrastructure, deployment, test, or browser file changed.

## Uniform and vertex contract for the core

### Shared scene identity

Scene indices are stable: `0` Turbulence, `1` Gathering, `2` Coherence, `3` Release, and `4` Radiance. The core supplies `uPreviousScene`, `uTargetScene`, and clamped `uSceneMix`; the warp and scene passes use the same crossfade.

### Feedback warp pass

- Textures: `uFeedback` and `uModulation`.
- Frame inputs: `uResolution`, `uMovementDirection`, `uMovementEnergy`, `uTime`, `uDeltaScale`, `uVariationSeed`, `uBreathScale`, and `uReducedMotion`.
- `uDeltaScale` is elapsed frame time relative to 60 fps. This makes each scene's exact per-frame decay constant frame-rate aware.
- The modulation upload must preserve analysis bytes and orientation expected by the field:
  - R: luminance-gradient magnitude.
  - G: temporal frame difference.
  - B: face-and-shoulder influence.
  - A: `1.0`.
- The modulation texture is never interpreted as camera RGB. Its channel gradients and B influence mask steer the feedback displacement.

### Scene emission pass

- Frame inputs: `uResolution`, `uTime`, `uDeltaScale`, scene identity uniforms, `uProgress`, `uCoherence`, `uExpressiveActivation`, `uFacialWarmth`, `uMovementEnergy`, `uVisualIntensity`, `uVariationSeed`, `uBreathScale`, and `uReducedMotion`.
- Palette inputs: `uPaletteShadow`, `uPaletteMid`, `uPaletteLight`, `uPaletteConfidence`, and `uColorInfluence`.
- The shader clamps authored camera palette influence to 15–25%, then weights it by palette confidence. No raw image sampler exists.
- `uBreathScale` is a neutral `1.0` unless the host has already passed the breath-confidence threshold of `0.35`.

### Face emission pass

- The vertex buffer is packed as repeated six-float segments: `x1, y1, z1, x2, y2, z2`.
- Bind `aStart` at location `0` as three floats and `aEnd` at location `1` as three floats, both with a 24-byte stride and instancing divisor `1`.
- Draw six vertices per instance. `gl_VertexID` selects the two ribbon triangles; the core bounds the number of instances before upload/draw.
- Vertex uniforms: `uResolution`, `uTime`, `uFacialTension`, `uFacialWarmth`, `uBreathScale`, and `uReducedMotion`.
- Fragment uniforms: `uFacialTension`, `uFacialWarmth`, `uVisualIntensity`, `uDeltaScale`, `uPaletteLight`, `uPaletteConfidence`, and `uColorInfluence`.

### Bloom and composite passes

- Blur: bind the source as `uTexture`; set `uTexelDirection` to one source texel horizontally, then vertically. Set `uApplyThreshold` to `1` on the first pass and `0` on the second.
- Composite: bind `uFeedback` and `uBloom`, then supply `uResolution` and `uVisualIntensity`. The pass uses restrained bloom, chroma restraint, ACES-like tone mapping, vignette, and display gamma.

## Verification

Command:

```text
pnpm run type-check
```

Exact output:

```text
$ tsc --noEmit
```

Exit code: `0`.

Command:

```text
pnpm run build
```

Result: Waku completed all five build stages and static generation successfully. Exit code: `0`.

The build proves the TypeScript module parses and bundles safely. It does **not** compile or execute GLSL: this shader library is intentionally not imported by the runtime until the separate adaptive-core/wrapper tasks, and Waku is not a WebGL shader compiler. Runtime shader compilation remains a later browser/GPU integration check.

## Static pass and resource self-review

- Warp/decay: exact scene characteristics are encoded in one bounded selector: Turbulence `0.935/0.032`, Gathering `0.955/0.018`, Coherence `0.970/0.010`, Release `0.978/0.006`, and Radiance `0.985/0.003`. Movement, modulation gradients, influence-mask steering, scene curl, breath scale, and reduced-motion attenuation all affect spatial history sampling.
- Authored grammars: the single scene program has five distinct functions for fragmented red reaction lines, amber orbit/convergence, gold-violet lattice/wire flower, blue aurora/liquid ripples, and white stellar gas/stable presence. Every function contains its own central core and halo, so a regression crossfade cannot remove the light attractor.
- Variation: the seed changes fine noise/texture only. It does not select another palette, scene, or semantic family.
- Face topology: packed endpoints are expanded into instanced ribbon quads. Degenerate segments use a safe tangent. Tension affects curvature and high-frequency displacement; warmth affects width and authored colour.
- Numerical safety: resolutions, texture sizes, breath scale, normalization, and tone-map denominators have explicit lower bounds or safe branches. All loops and array sizes are compile-time bounded; there are no dynamic sampler arrays.
- Pass compatibility: all full-screen passes share the same `vUv` contract. Warp, blur, and composite overwrite their target; scene and face fragments emit additive energy for the core to blend into the active feedback target.
- Privacy boundary: no shader accepts a camera-image sampler. Only constrained palette triples, normalized control values, packed topology, and the four-channel modulation analysis texture enter the renderer.

## Concerns / next-task notes

- Runtime GLSL compilation and visual correctness are intentionally unverified in this slice because browser/GPU execution is outside Task 6B1. The next core task should compile all programs through `createProgram(...)`, fail with its actionable logs, and preserve those logs during wrapper fallback.
- The core must set `uBreathScale` to `1.0` at breath confidence `<= 0.35`; the shader treats it as already gated.
- The core owns the topology segment cap, instancing divisor setup, additive blend state for scene/face emission, and exact feedback/blur/composite pass ordering.
