import test from 'node:test';
import assert from 'node:assert/strict';

import { mergeBaseline, type PersonalBaseline } from '../src/state/baseline-store.ts';

test('mergeBaseline starts from the first aggregate session summary', () => {
  const baseline = mergeBaseline(null, {
    activationMean: 0.7,
    stabilityMean: 0.4,
    sampleCount: 120,
  }, 1_000);

  assert.equal(baseline.activationMean, 0.7);
  assert.equal(baseline.stabilityMean, 0.4);
  assert.equal(baseline.sessionCount, 1);
  assert.equal(baseline.updatedAt, 1_000);
});

test('mergeBaseline limits the influence of a single later session', () => {
  const current: PersonalBaseline = {
    activationMean: 0.5,
    stabilityMean: 0.6,
    sessionCount: 4,
    updatedAt: 500,
  };
  const next = mergeBaseline(current, {
    activationMean: 1,
    stabilityMean: 0,
    sampleCount: 500,
  }, 1_000);

  assert.ok(next.activationMean <= 0.625);
  assert.ok(next.stabilityMean >= 0.45);
  assert.equal(next.sessionCount, 5);
});
