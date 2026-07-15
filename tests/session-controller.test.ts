import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SessionController,
  scriptedStateForElapsed,
  type SessionDependencies,
} from '../src/experience/session-controller.ts';
import type { ResonanceState } from '../src/resonance/resonance.ts';
import type { PersonalBaseline } from '../src/state/baseline-store.ts';

type HarnessOptions = {
  now?: () => number;
  baseline?: {
    load: () => Promise<PersonalBaseline | null>;
    saveSession: SessionDependencies['baseline']['saveSession'];
  };
};

function createHarness(observationConfidence = 0, options: HarnessOptions = {}): {
  controller: SessionController;
  updates: ResonanceState[];
  calls: string[];
} {
  const updates: ResonanceState[] = [];
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
      start: async () => true,
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
  };
  return { controller: new SessionController(dependencies), updates, calls };
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
