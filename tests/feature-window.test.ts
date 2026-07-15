import test from 'node:test';
import assert from 'node:assert/strict';

import { FeatureWindow } from '../src/sensing/feature-window.ts';

test('FeatureWindow calculates mean, variance, and time-normalized slope', () => {
  const window = new FeatureWindow(4);
  window.push(0.1, 0);
  window.push(0.2, 1_000);
  window.push(0.3, 2_000);

  const snapshot = window.snapshot();
  assert.equal(snapshot.count, 3);
  assert.ok(Math.abs(snapshot.mean - 0.2) < 0.0001);
  assert.ok(Math.abs(snapshot.variance - 0.0066667) < 0.0001);
  assert.ok(Math.abs(snapshot.slopePerSecond - 0.1) < 0.0001);
  assert.equal(snapshot.latest, 0.3);
});

test('FeatureWindow keeps only its newest bounded samples', () => {
  const window = new FeatureWindow(3);
  window.push(Number.NaN, 0);
  window.push(-2, 0);
  window.push(0.25, 1_000);
  window.push(0.5, 2_000);
  window.push(1.4, 3_000);

  const snapshot = window.snapshot();
  assert.equal(snapshot.count, 3);
  assert.equal(snapshot.mean, (0.25 + 0.5 + 1) / 3);
  assert.equal(snapshot.latest, 1);
});
