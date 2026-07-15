import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SessionController,
  scriptedStateForElapsed,
  type SessionDependencies,
} from '../src/experience/session-controller.ts';
import type { ResonanceState } from '../src/resonance/resonance.ts';

function createHarness(observationConfidence = 0): {
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
    baseline: {
      saveSession: async () => null,
    },
    now: () => 0,
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
