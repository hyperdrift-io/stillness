# Guided Stillness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Stillness visibly interactive through Guided and Pure modes, truthful live signals, fading signal-based advice, adaptive soothing sound controls, and an accessible keyboard/touch quick menu.

**Architecture:** Keep `SessionController` as the single owner of sensing and session time, and add a throttled telemetry callback rather than duplicating estimation in React. Pure policy modules map telemetry to guidance and keyboard commands; focused client components render guidance and the native-dialog quick menu. Existing browser-native WebGL, Web Audio, Media Capture, Device Motion, IndexedDB, and Service Worker boundaries remain unchanged.

**Tech Stack:** Waku 1 beta, React 19 RSC/client islands, TypeScript 6, semantic CSS, WebGL2, Web Audio, Media Capture, Device Motion, IndexedDB, Service Worker, Node test runner, dependency-free Chrome DevTools Protocol smoke test.

## Global Constraints

- Guided mode is checked by default; unchecking it produces Pure mode.
- The canvas remains the dominant session surface.
- Never expose a stillness score, target number, phase name, diagnosis, emotion label, streak, achievement, or completion judgment.
- Describe signals, never the person; guidance follows the Speak to Enable covenant.
- Only movement, steadiness, presence, sensing quality, and direction may be surfaced.
- No claims of breath, heart-rate, facial-expression, gaze, mood, attention, or emotion detection.
- Raw camera frames and motion samples remain in memory and are never transmitted or persisted.
- Sound begins from the trusted Begin gesture and can be faded off with `M`.
- No new production dependency.
- Semantic CSS only: no Tailwind, inline presentation styles, CSS-in-JS, or utility chains.
- Every interactive target is at least 44 by 44 CSS pixels and fully keyboard operable.

---

### Task 1: Session Preferences and Keyboard Commands

**Files:**
- Create: `src/experience/session-preferences.ts`
- Create: `tests/session-preferences.test.ts`

**Interfaces:**
- Produces: `SessionPreferences`, `defaultSessionPreferences`, `SessionCommand`, and `commandForKey(event)`.
- Consumed by: `StillnessExperience` and `SessionMenu` in Tasks 5 and 6.

- [ ] **Step 1: Write failing tests for defaults and commands**

```ts
test('Guided and soothing sound are enabled by default', () => {
  assert.deepEqual(defaultSessionPreferences, {
    guidance: true, sound: true, liveSignals: false, camera: true,
  });
});

test('commandForKey maps unmodified shortcuts and ignores form entry', () => {
  assert.equal(commandForKey({ key: '?', modifier: false, editable: false }), 'menu');
  assert.equal(commandForKey({ key: 'm', modifier: false, editable: false }), 'sound');
  assert.equal(commandForKey({ key: 'G', modifier: false, editable: false }), 'guidance');
  assert.equal(commandForKey({ key: 'd', modifier: true, editable: false }), null);
  assert.equal(commandForKey({ key: 'c', modifier: false, editable: true }), null);
});
```

- [ ] **Step 2: Run the focused test and confirm missing-module failure**

Run: `node --test --experimental-strip-types tests/session-preferences.test.ts`

Expected: FAIL because `session-preferences.ts` does not exist.

- [ ] **Step 3: Implement immutable defaults and shortcut mapping**

```ts
export type SessionPreferences = {
  guidance: boolean;
  sound: boolean;
  liveSignals: boolean;
  camera: boolean;
};

export const defaultSessionPreferences: SessionPreferences = Object.freeze({
  guidance: true,
  sound: true,
  liveSignals: false,
  camera: true,
});

export type SessionCommand = 'menu' | 'sound' | 'guidance' | 'signals' | 'camera';

export function commandForKey(input: {
  key: string;
  modifier: boolean;
  editable: boolean;
}): SessionCommand | null {
  if (input.modifier || input.editable) return null;
  const key = input.key.toLowerCase();
  if (input.key === '?') return 'menu';
  if (key === 'm') return 'sound';
  if (key === 'g') return 'guidance';
  if (key === 'd') return 'signals';
  if (key === 'c') return 'camera';
  return null;
}
```

- [ ] **Step 4: Run focused and full tests**

Run: `node --test --experimental-strip-types tests/session-preferences.test.ts && pnpm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/experience/session-preferences.ts tests/session-preferences.test.ts
git commit -m "feat: define stillness session preferences"
```

### Task 2: Truthful Throttled Session Telemetry

**Files:**
- Modify: `src/experience/session-controller.ts`
- Modify: `tests/session-controller.test.ts`

**Interfaces:**
- Produces: exported `SessionTelemetry` and optional `onTelemetry(telemetry)` dependency callback.
- Produces method: `setCameraEnabled(enabled): Promise<boolean>`.
- Consumed by: guidance policy and React orchestration.

- [ ] **Step 1: Extend the harness and write failing telemetry tests**

```ts
const telemetry: SessionTelemetry[] = [];
const dependencies: SessionDependencies = {
  // existing ports
  onTelemetry: (snapshot) => telemetry.push(snapshot),
};

test('SessionController emits bounded telemetry at a readable cadence', async () => {
  const { controller, telemetry } = createHarness(1);
  await controller.start();
  controller.step(0);
  controller.step(100);
  controller.step(250);
  assert.equal(telemetry.length, 2);
  for (const value of Object.values(telemetry[0]!).filter((v) => typeof v === 'number')) {
    assert.ok(value >= 0 && value <= 1);
  }
});

test('SessionController labels unavailable sensing as scripted', async () => {
  const { controller, telemetry } = createHarness(0);
  await controller.start();
  controller.step(0);
  assert.equal(telemetry[0]?.source, 'scripted');
});
```

- [ ] **Step 2: Run the focused tests and confirm type/export failures**

Run: `node --test --experimental-strip-types tests/session-controller.test.ts`

Expected: FAIL because `SessionTelemetry` and `onTelemetry` are not defined.

- [ ] **Step 3: Derive and publish telemetry from existing smoothed observations**

```ts
export type SessionTelemetry = {
  movement: number;
  steadiness: number;
  presence: number;
  sensingQuality: number;
  direction: 'settling' | 'holding' | 'rising';
  source: 'sensed' | 'scripted';
};

const movement = clamp01(cameraWindow.mean * 0.68 + motionWindow.mean * 0.32);
const telemetry: SessionTelemetry = {
  movement,
  steadiness: clamp01(calibrated.stability),
  presence: clamp01(calibrated.presence),
  sensingQuality: this.sensorConfidence,
  direction: calibrated.trend < -0.08 ? 'settling' : calibrated.trend > 0.08 ? 'rising' : 'holding',
  source: this.sensorConfidence >= 0.15 ? 'sensed' : 'scripted',
};
if (now - this.lastTelemetryAt >= 250 || this.lastTelemetryAt === -Infinity) {
  this.dependencies.onTelemetry?.(telemetry);
  this.lastTelemetryAt = now;
}
```

Reset the throttle on `start()`. Reuse `CameraPort.start/stop` and delegate audio toggling through the audio port. Disabling camera must call `stop()` synchronously; enabling returns the result of `start()` without changing the running state.

- [ ] **Step 4: Add camera and sound toggle tests**

```ts
test('camera preference releases and restores its resource', async () => {
  const { controller, calls } = createHarness(1);
  await controller.start();
  assert.equal(await controller.setCameraEnabled(false), true);
  assert.ok(calls.includes('camera:stop'));
});
```

- [ ] **Step 5: Run focused tests, full tests, and type checking**

Run: `pnpm test && pnpm run type-check`

Expected: all tests PASS and no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/experience/session-controller.ts tests/session-controller.test.ts
git commit -m "feat: expose bounded stillness telemetry"
```

### Task 3: Guidance Policy with Stability and Uncertainty

**Files:**
- Create: `src/experience/guidance-policy.ts`
- Create: `tests/guidance-policy.test.ts`

**Interfaces:**
- Consumes: `SessionTelemetry` from Task 2.
- Produces: `GuidanceCue`, `GuidancePolicy.evaluate(telemetry, elapsedMs)`, and `reset()`.
- Consumed by: `StillnessExperience` in Task 6.

- [ ] **Step 1: Write failing tests for sensed, scripted, and stable cues**

```ts
test('low-confidence telemetry stays honest', () => {
  const policy = new GuidancePolicy();
  assert.equal(policy.evaluate(scriptedTelemetry, 0)?.label, 'Following a gentle rhythm');
});

test('settling movement invites a longer exhale', () => {
  const policy = new GuidancePolicy();
  const cue = policy.evaluate({ ...sensedTelemetry, direction: 'settling' }, 0);
  assert.equal(cue?.invitation, 'Let the next exhale take a little longer.');
});

test('a cue is not replaced before its minimum display duration', () => {
  const policy = new GuidancePolicy();
  const first = policy.evaluate(activeTelemetry, 0);
  const second = policy.evaluate(quietTelemetry, 2_000);
  assert.equal(second?.id, first?.id);
});

test('guidance fades after the opening window when signals do not change', () => {
  const policy = new GuidancePolicy();
  policy.evaluate(sensedTelemetry, 0);
  assert.equal(policy.evaluate(sensedTelemetry, 30_001), null);
});
```

- [ ] **Step 2: Run focused tests and confirm missing-module failure**

Run: `node --test --experimental-strip-types tests/guidance-policy.test.ts`

Expected: FAIL because `guidance-policy.ts` does not exist.

- [ ] **Step 3: Implement deterministic cue selection and hysteresis**

Define the six approved cues from the spec. Use these constants:

```ts
const MIN_CUE_MS = 7_000;
const OPENING_WINDOW_MS = 26_000;
const ACTIVE_MOVEMENT = 0.58;
const QUIET_MOVEMENT = 0.2;
const STEADY_LEVEL = 0.7;
```

`evaluate()` chooses a cue key from source, direction, movement, and steadiness. It retains the current cue for `MIN_CUE_MS`, returns `null` after `OPENING_WINDOW_MS` when the key has not changed, and allows a changed key to reappear after the minimum duration. Copy must exactly match the approved design spec.

- [ ] **Step 4: Run focused and full tests**

Run: `node --test --experimental-strip-types tests/guidance-policy.test.ts && pnpm test`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/experience/guidance-policy.ts tests/guidance-policy.test.ts
git commit -m "feat: map stillness signals to gentle guidance"
```

### Task 4: Controllable Soothing Sound

**Files:**
- Modify: `src/audio/stillness-audio.ts`
- Modify: `src/experience/session-controller.ts`
- Modify: `tests/audio-parameters.test.ts`
- Modify: `tests/session-controller.test.ts`

**Interfaces:**
- Produces: `setAudible(audible: boolean): Promise<boolean>` and `isAvailable(): boolean`.
- Also modifies: `src/experience/session-controller.ts` and `tests/session-controller.test.ts` to add `setSoundEnabled(enabled): Promise<boolean>` to the controller audio port.
- Consumed by: the quick menu through `SessionController.setSoundEnabled()`.

- [ ] **Step 1: Write failing pure tests for audible gain targets**

Extract a pure function:

```ts
test('audible gain target fades to silence without reaching digital zero', () => {
  assert.equal(audibleGainTarget(false, 0.12), 0.0001);
  assert.equal(audibleGainTarget(true, 0.12), 0.12);
  assert.equal(audibleGainTarget(true, Number.NaN), 0.0001);
});
```

- [ ] **Step 2: Run the focused test and confirm missing-export failure**

Run: `node --test --experimental-strip-types tests/audio-parameters.test.ts`

Expected: FAIL because `audibleGainTarget` does not exist.

- [ ] **Step 3: Separate adaptive target from audible state**

Store `adaptiveMasterGain` and `audible`. `update()` continues updating the adaptive value but sends `0.0001` while muted. `setAudible()` resumes a suspended context when enabling, cancels scheduled master values, and uses `setTargetAtTime(target, currentTime, 0.08)` for a bounded fade. It returns `false` only when audio was never available; repeated calls are idempotent.

- [ ] **Step 4: Run audio tests, full tests, and type checking**

Extend the session harness audio port with `setAudible`, then assert `setSoundEnabled(false)` records `audio:audible:false` and returns the port result.

Run: `pnpm test && pnpm run type-check`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/audio/stillness-audio.ts src/experience/session-controller.ts tests/audio-parameters.test.ts tests/session-controller.test.ts
git commit -m "feat: add soothing sound controls"
```

### Task 5: Accessible Guidance and Session Menu Components

**Files:**
- Create: `src/experience/session-guidance.tsx`
- Create: `src/experience/session-menu.tsx`
- Create: `tests/session-ui-contract.test.ts`

**Interfaces:**
- `SessionGuidance({ cue, visible })` consumes `GuidanceCue | null`.
- `SessionMenu` consumes preferences, telemetry, audio availability, menu open state, and callbacks for toggle/close/leave.
- Consumed by: `StillnessExperience` in Task 6.

- [ ] **Step 1: Write failing semantic contract tests**

```ts
test('session menu uses a labelled native dialog and every approved control', async () => {
  const source = await read('src/experience/session-menu.tsx');
  assert.match(source, /<dialog/);
  assert.match(source, /aria-labelledby="session-menu-title"/);
  for (const label of ['Guidance', 'Soothing sound', 'Live signals', 'Camera sensing']) {
    assert.match(source, new RegExp(label));
  }
});

test('guidance exposes one polite live region', async () => {
  const source = await read('src/experience/session-guidance.tsx');
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /cue\.invitation/);
});
```

- [ ] **Step 2: Run the focused test and confirm missing-file failure**

Run: `node --test --experimental-strip-types tests/session-ui-contract.test.ts`

Expected: FAIL because both component files do not exist.

- [ ] **Step 3: Implement the guidance renderer**

Render a `<section className="session-guidance" aria-live="polite" aria-atomic="true">` only while visible and a cue exists. Include `p.signal-label`, `h2` invitation, and `p.signal-explanation`. Never render normalized values in this component.

- [ ] **Step 4: Implement the native-dialog menu**

Use a `dialog` ref. Synchronize `open` through `showModal()`/`close()`, handle `cancel` by calling `onClose`, and restore focus to the trigger supplied by the parent. Render semantic checkbox switches with their keyboard hints, four metric rows only when `liveSignals` is true, a clear privacy line, and a text **Leave experience** action.

Metric labels come from pure helpers in the same file:

```ts
movementLabel(value, direction) // active | settling | quiet
steadinessLabel(value)          // changing | forming | steady
presenceLabel(value, source)    // unavailable | limited | present
sensingLabel(value, source)     // unavailable | limited | clear
```

- [ ] **Step 5: Run contract tests and type checking**

Run: `node --test --experimental-strip-types tests/session-ui-contract.test.ts && pnpm run type-check`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/experience/session-guidance.tsx src/experience/session-menu.tsx tests/session-ui-contract.test.ts
git commit -m "feat: add guided session controls"
```

### Task 6: Orchestrate Guided and Pure Modes

**Files:**
- Modify: `src/experience/stillness-experience.tsx`
- Modify: `src/styles.css`
- Modify: `tests/pwa-assets.test.ts`
- Create: `tests/stillness-experience-contract.test.ts`

**Interfaces:**
- Consumes all Tasks 1–5.
- Produces the complete landing, guided/pure session, shortcuts, touch trigger, and responsive presentation.

- [ ] **Step 1: Write failing landing and shortcut contract tests**

```ts
test('landing explains sensing, modes, sound, and session adjustment', async () => {
  const source = await read('src/experience/stillness-experience.tsx');
  assert.match(source, /Guide me into stillness/);
  assert.match(source, /uninterrupted Pure session/);
  assert.match(source, /Soothing sound begins/);
  assert.match(source, /Press.*\?.*anytime/s);
});

test('active experience renders guidance, menu, and a touch menu trigger', async () => {
  const source = await read('src/experience/stillness-experience.tsx');
  assert.match(source, /<SessionGuidance/);
  assert.match(source, /<SessionMenu/);
  assert.match(source, /aria-label="Adjust session"/);
});
```

- [ ] **Step 2: Run the focused test and confirm content failures**

Run: `node --test --experimental-strip-types tests/stillness-experience-contract.test.ts`

Expected: FAIL because the approved content and components are absent.

- [ ] **Step 3: Add session state and controller callbacks**

Store `preferences`, `telemetry`, `cue`, `menuOpen`, and `audioAvailable`. Keep one `GuidancePolicy` ref. Pass `onTelemetry` to the controller; update React at the controller’s four-Hz cadence, then evaluate guidance. Reset the policy and visible state for each Begin and Leave.

The Guided checkbox updates only `preferences.guidance` before Begin. Begin creates the controller from the current preferences, starts audio automatically, disables camera immediately when requested, and begins in Guided or Pure presentation accordingly.

- [ ] **Step 4: Implement keyboard and touch interactions**

Use `commandForKey()` and ignore editable targets/modifiers. `?` toggles menu; `M`, `G`, `D`, and `C` update the matching preference and controller resource. Escape closes the menu first and otherwise leaves. Render a visible `button.session-menu-trigger` during active mode for touch users.

- [ ] **Step 5: Implement the approved semantic CSS**

Add tokens for panel background, fine borders, and signal typography. Style:

- `.mode-choice` as the compact pre-Begin checkbox row.
- `.session-guidance` centered over the canvas with one signal label and serif invitation.
- `button.session-menu-trigger` as a subtle lower-left `? adjust session` affordance.
- `dialog.session-menu` as an upper-right compact panel on desktop and safe-area bottom sheet below 40rem.
- `.signal-meter` using a child bar whose width is set through the semantic `value` element or CSS custom property assigned by the component without inline presentation; prefer native `<meter min="0" max="1" value={...}>`.
- All transitions under existing reduced-motion override.

No existing semantic-CSS rules are replaced with utility classes.

- [ ] **Step 6: Update offline/PWA source contracts for new chunks**

The existing runtime resource collection already sends all same-origin performance resources to the service worker. Extend `pwa-assets.test.ts` to assert the new component names are reachable through the client island and retain the `CACHE_URLS` message contract.

- [ ] **Step 7: Run all unit checks and build**

Run: `pnpm test && pnpm run type-check && pnpm run build && git diff --check`

Expected: all tests PASS, build completes, and no whitespace errors appear.

- [ ] **Step 8: Commit**

```bash
git add src/experience/stillness-experience.tsx src/styles.css tests/pwa-assets.test.ts tests/stillness-experience-contract.test.ts
git commit -m "feat: make stillness visibly interactive"
```

### Task 7: Production Browser and Visual QA

**Files:**
- Modify: `scripts/browser-smoke.mjs`
- Modify: `README.md`

**Interfaces:**
- Verifies the complete product contract from Tasks 1–6.

- [ ] **Step 1: Extend the Chrome smoke script with Guided and Pure assertions**

Add helper flows that:

1. Confirm the Guided checkbox is checked and landing copy explains sensing/sound/`?`.
2. Begin Guided, wait for `.session-guidance`, open the menu with `?`, and assert the labelled modal dialog.
3. Toggle live signals with `D` and assert four named metric rows.
4. Toggle sound with `M`, camera with `C`, guidance with `G`, and verify the session remains active.
5. Close the menu with Escape; use Escape again to leave.
6. Uncheck Guided, begin Pure, and assert no guidance or metrics are visible.
7. Repeat the offline reload and reduced-motion paths.

Use DOM state and accessibility attributes rather than pixel coordinates.

- [ ] **Step 2: Run the browser gate and confirm it catches any missing interaction**

Run: `pnpm run test:browser`

Expected before all integration fixes: FAIL on the first missing Guided/Pure assertion. Fix app code only if the failure reveals a real contract gap, then rerun.

- [ ] **Step 3: Update operator documentation**

Document Guided/Pure behavior and shortcuts in `README.md`:

```md
## Session controls

Guided mode is selected by default. Uncheck it before Begin for Pure mode.
During a session: `?` menu, `G` guidance, `M` sound, `D` live signals,
`C` camera sensing, and `Escape` close/leave.
```

- [ ] **Step 4: Run the final verification matrix**

Run:

```bash
pnpm test
pnpm run type-check
pnpm run test:browser
pnpm audit --prod
git diff --check
```

Expected: all tests and browser flows PASS, audit reports no known vulnerabilities, and the worktree is clean except for the intended files.

- [ ] **Step 5: Perform visual inspection**

Capture production screenshots for desktop landing, desktop Guided with menu, desktop Pure, mobile Guided, reduced-motion Guided, and live signals. Verify the canvas remains the focal point, the menu fits at 320 CSS pixels, prompts do not collide with the menu, and no shader seam or viewport overflow appears.

- [ ] **Step 6: Commit**

```bash
git add scripts/browser-smoke.mjs README.md
git commit -m "test: verify guided stillness interactions"
```

## Final Review Gate

- Run a focused code review for correctness, privacy boundaries, accessibility, cleanup, and Voice Covenant compliance.
- Fix all critical and important findings with tests.
- Rerun the full final verification matrix after the last fix.
- Infra remains unchanged because this standalone bundle still has no registered app name, remote, domain, or deploy request; report this explicitly rather than inventing a production target.
