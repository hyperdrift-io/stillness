import test from 'node:test';
import assert from 'node:assert/strict';

import { PulseEstimator } from '../src/sensing/pulse-estimator.ts';
import { initialPerceptionSnapshot, type PerceptionSnapshot } from '../src/sensing/perception-signal.ts';

/**
 * A synthetic face: skin colour with a faint pulse at a known rate (a
 * fraction of a percent, mostly in green, as in real photoplethysmography),
 * slow lighting drift and sensor noise, sampled at an uneven camera rate.
 */
function syntheticSnapshot(atMs: number, beatsPerMinute: number, seed: { value: number }): PerceptionSnapshot {
  const seconds = atMs / 1_000;
  const pulse = Math.sin(2 * Math.PI * (beatsPerMinute / 60) * seconds);
  const drift = 0.02 * Math.sin(2 * Math.PI * 0.05 * seconds);
  const noise = () => {
    seed.value = (Math.imul(seed.value, 1_664_525) + 1_013_904_223) >>> 0;
    return (seed.value / 0xffff_ffff - 0.5) * 0.004;
  };
  const skin = (base: readonly [number, number, number]): readonly [number, number, number] => [
    base[0] * (1 + drift + pulse * 0.0025) + noise(),
    base[1] * (1 + drift + pulse * 0.005) + noise(),
    base[2] * (1 + drift + pulse * 0.002) + noise(),
  ];
  return {
    ...initialPerceptionSnapshot,
    timestampMs: atMs,
    facePresent: true,
    faceConfidence: 1,
    pulse: {
      sampled: true,
      forehead: skin([0.78, 0.6, 0.52]),
      leftCheek: skin([0.74, 0.55, 0.48]),
      rightCheek: skin([0.75, 0.56, 0.49]),
    },
  };
}

test('the pulse estimator finds a faint 72 bpm pulse in uneven webcam samples', () => {
  const estimator = new PulseEstimator();
  const seed = { value: 0x2545f491 };
  let atMs = 0;
  let signal = estimator.update(syntheticSnapshot(atMs, 72, seed));
  while (atMs < 20_000) {
    atMs += 40 + (atMs % 7) * 3;
    signal = estimator.update(syntheticSnapshot(atMs, 72, seed));
  }
  assert.ok(signal.beatsPerMinute !== null, 'a rate is reported once the history is long enough');
  assert.ok(Math.abs(signal.beatsPerMinute - 72) <= 3, `rate ${signal.beatsPerMinute} is within 3 bpm of 72`);
  assert.ok(signal.confidence > 0.5, `confidence ${signal.confidence} clears the gate`);
});

test('the pulse estimator reports no rate without a face or with too little history', () => {
  const estimator = new PulseEstimator();
  const seed = { value: 7 };
  let signal = estimator.update({ ...initialPerceptionSnapshot, timestampMs: 100 });
  assert.equal(signal.beatsPerMinute, null);
  for (let atMs = 200; atMs < 4_000; atMs += 50) {
    signal = estimator.update(syntheticSnapshot(atMs, 60, seed));
  }
  assert.equal(signal.beatsPerMinute, null, 'four seconds is not enough history');
  assert.equal(signal.confidence, 0);
});
