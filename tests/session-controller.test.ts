import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SessionController,
  scriptedStateForElapsed,
  type SessionDependencies,
  type SessionTelemetry,
} from '../src/experience/session-controller.ts';
import type { ResonanceState } from '../src/resonance/resonance.ts';
import type { PersonalBaseline } from '../src/state/baseline-store.ts';

type HarnessOptions = {
  now?: () => number;
  cameraStartResult?: boolean;
  cameraStart?: () => Promise<boolean>;
  baseline?: {
    load: () => Promise<PersonalBaseline | null>;
    saveSession: SessionDependencies['baseline']['saveSession'];
  };
};

function createHarness(observationConfidence = 0, options: HarnessOptions = {}): {
  controller: SessionController;
  updates: ResonanceState[];
  telemetry: SessionTelemetry[];
  calls: string[];
} {
  const updates: ResonanceState[] = [];
  const telemetry: SessionTelemetry[] = [];
  const calls: string[] = [];
  const dependencies: SessionDependencies = {
    renderer: {
      start: () => calls.push('renderer:start'),
      update: (state) => updates.push(state),
      dispose: () => calls.push('renderer:dispose'),
    },
    audio: {
      start: async () => { calls.push('audio:start'); },
      update: () => calls.push('audio:update'),
      suspend: async () => { calls.push('audio:suspend'); },
      resume: async () => { calls.push('audio:resume'); },
      dispose: () => calls.push('audio:dispose'),
    },
    camera: {
      start: async () => {
        calls.push('camera:start');
        if (options.cameraStart) return options.cameraStart();
        return options.cameraStartResult ?? true;
      },
      read: () => ({
        motion: 0.95,
        presence: 0.9,
        confidence: observationConfidence,
        luminance: 0.5,
      }),
      stop: () => calls.push('camera:stop'),
    },
    motion: {
      start: async () => true,
      read: () => ({ motion: 0.8, confidence: observationConfidence }),
      stop: () => calls.push('motion:stop'),
    },
    baseline: options.baseline ?? {
      load: async () => null,
      saveSession: async () => null,
    },
    now: options.now ?? (() => 0),
    requestFrame: () => 7,
    cancelFrame: () => calls.push('frame:cancel'),
    onTelemetry: (snapshot) => telemetry.push(snapshot),
  };
  return { controller: new SessionController(dependencies), updates, telemetry, calls };
}

test('scriptedStateForElapsed creates a continuous descent', () => {
  const beginning = scriptedStateForElapsed(0);
  const middle = scriptedStateForElapsed(90_000);
  const ending = scriptedStateForElapsed(180_000);
  assert.ok(beginning.activation > middle.activation);
  assert.ok(middle.activation > ending.activation);
  assert.ok(beginning.stability < middle.stability);
  assert.ok(middle.stability < ending.stability);
  assert.ok(Math.abs(ending.activation - 0.03) < 0.0001);
  assert.ok(Math.abs(ending.stability - 0.97) < 0.0001);
});

test('SessionController keeps the scripted descent when sensors are unavailable', async () => {
  const { controller, updates } = createHarness(0);
  await controller.start();
  controller.step(0);
  controller.step(180_000);

  assert.equal(controller.snapshot().phase, 'stillness');
  assert.ok((updates.at(-1)?.complexity ?? 1) < (updates[0]?.complexity ?? 0));
});

test('SessionController lets confident activation evidence hold more energy', async () => {
  const fallback = createHarness(0);
  const adaptive = createHarness(1);
  await fallback.controller.start();
  await adaptive.controller.start();
  fallback.controller.step(180_000);
  adaptive.controller.step(180_000);

  assert.ok(
    (adaptive.updates.at(-1)?.complexity ?? 0) >
    (fallback.updates.at(-1)?.complexity ?? 1),
  );
});

test('SessionController applies a loaded personal baseline to sensor evidence', async () => {
  const uncalibrated = createHarness(1);
  const calibrated = createHarness(1, {
    baseline: {
      load: async () => ({
        activationMean: 1,
        stabilityMean: 0,
        sessionCount: 3,
        updatedAt: 1,
      }),
      saveSession: async () => null,
    },
  });
  await uncalibrated.controller.start();
  await calibrated.controller.start();
  await Promise.resolve();
  uncalibrated.controller.step(180_000);
  calibrated.controller.step(180_000);

  assert.ok(
    (calibrated.updates.at(-1)?.complexity ?? 1) <
    (uncalibrated.updates.at(-1)?.complexity ?? 0),
  );
});

test('SessionController suspends, resumes, and disposes every resource', async () => {
  const { controller, calls } = createHarness();
  await controller.start();
  await controller.setHidden(true);
  await controller.setHidden(false);
  await controller.stop();

  assert.ok(calls.includes('audio:suspend'));
  assert.ok(calls.includes('audio:resume'));
  assert.ok(calls.includes('renderer:dispose'));
  assert.ok(calls.includes('audio:dispose'));
  assert.ok(calls.includes('camera:stop'));
  assert.ok(calls.includes('motion:stop'));
  assert.ok(calls.includes('frame:cancel'));
});

test('SessionController excludes hidden time and restarts sensing when visible', async () => {
  let now = 0;
  const { controller, calls } = createHarness(0, { now: () => now });
  await controller.start();
  controller.step(1_000);
  now = 1_000;
  await controller.setHidden(true);
  now = 61_000;
  await controller.setHidden(false);
  controller.step(61_000);

  assert.equal(controller.snapshot().elapsedMs, 1_000);
  assert.ok(calls.includes('audio:suspend'));
  assert.ok(calls.includes('audio:resume'));
});

test('SessionController completes teardown when calibration storage fails', async () => {
  const { controller, calls } = createHarness(1, {
    baseline: {
      load: async () => null,
      saveSession: async () => { throw new Error('storage unavailable'); },
    },
  });
  await controller.start();
  for (let index = 0; index < 10; index += 1) controller.step(index * 100);
  await assert.doesNotReject(() => controller.stop());

  assert.ok(calls.includes('renderer:dispose'));
  assert.ok(calls.includes('audio:dispose'));
  assert.equal(controller.snapshot().running, false);
});

test('SessionController emits bounded telemetry at a readable cadence', async () => {
  const { controller, telemetry } = createHarness(1);
  await controller.start();
  controller.step(0);
  controller.step(100);
  controller.step(250);

  assert.equal(telemetry.length, 2);
  for (const snapshot of telemetry) {
    for (const value of Object.values(snapshot).filter((candidate) => typeof candidate === 'number')) {
      assert.ok(value >= 0 && value <= 1);
    }
  }
});

test('SessionController labels unavailable sensing as scripted', async () => {
  const { controller, telemetry } = createHarness(0);
  await controller.start();
  controller.step(0);

  assert.equal(telemetry[0]?.source, 'scripted');
});

test('SessionController resets telemetry cadence for a restarted session', async () => {
  const { controller, telemetry } = createHarness(1);
  await controller.start();
  controller.step(0);
  await controller.stop();
  await controller.start();
  controller.step(0);

  assert.equal(telemetry.length, 2);
});

test('camera preference releases its resource immediately', async () => {
  const { controller, calls } = createHarness(1);
  await controller.start();

  const disabled = controller.setCameraEnabled(false);
  assert.ok(calls.includes('camera:stop'));
  assert.equal(await disabled, true);
  assert.equal(controller.snapshot().running, true);
});

test('camera preference truthfully returns restoration failure', async () => {
  const { controller, calls } = createHarness(1, { cameraStartResult: false });
  await controller.start();

  assert.equal(await controller.setCameraEnabled(true), false);
  assert.equal(calls.filter((call) => call === 'camera:start').length, 2);
  assert.equal(controller.snapshot().running, true);
});

test('camera preference releases a resource acquired after disabling', async () => {
  let resolveCameraStart: (started: boolean) => void = () => {};
  const cameraStart = new Promise<boolean>((resolve) => {
    resolveCameraStart = resolve;
  });
  const { controller, calls } = createHarness(1, { cameraStart: () => cameraStart });
  await controller.start();

  assert.equal(await controller.setCameraEnabled(false), true);
  assert.equal(calls.filter((call) => call === 'camera:stop').length, 1);
  resolveCameraStart(true);
  await cameraStart;
  await Promise.resolve();

  assert.equal(calls.filter((call) => call === 'camera:stop').length, 2);
});

test('camera preference stays disabled across page visibility changes', async () => {
  const { controller, calls } = createHarness(1);
  await controller.start();
  await controller.setCameraEnabled(false);
  await controller.setHidden(true);
  await controller.setHidden(false);

  assert.equal(calls.filter((call) => call === 'camera:start').length, 1);
});

test('camera preference can disable sensing before a session starts', async () => {
  const { controller, calls } = createHarness(1);
  await controller.setCameraEnabled(false);
  await controller.start();

  assert.equal(calls.filter((call) => call === 'camera:start').length, 0);
});
