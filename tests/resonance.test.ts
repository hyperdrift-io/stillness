import test from 'node:test';
import assert from 'node:assert/strict';

import { targetResonance } from '../src/resonance/resonance.ts';
import { smoothValue } from '../src/resonance/smoothing.ts';
import type { StateEstimate } from '../src/experience/model.ts';

const activated: StateEstimate = {
  activation: 0.95,
  stability: 0.1,
  presence: 0.75,
  trend: -0.1,
  confidence: 1,
};

const settled: StateEstimate = {
  activation: 0.03,
  stability: 0.97,
  presence: 0.85,
  trend: 0.05,
  confidence: 1,
};

test('targetResonance keeps every normalized parameter finite and bounded', () => {
  const resonance = targetResonance(
    { activation: 8, stability: -4, presence: Number.NaN, trend: 6, confidence: 3 },
    'match',
  );

  for (const [name, value] of Object.entries(resonance)) {
    assert.equal(Number.isFinite(value), true, `${name} should be finite`);
    assert.ok(value >= 0 && value <= 1, `${name} should be normalized`);
  }
});

test('targetResonance progressively subtracts complexity and turbulence', () => {
  const capture = targetResonance(activated, 'capture');
  const stillness = targetResonance(settled, 'stillness');

  assert.ok(stillness.complexity < capture.complexity);
  assert.ok(stillness.turbulence < capture.turbulence);
  assert.ok(stillness.audioEnergy < capture.audioEnergy);
  assert.ok(stillness.coherence > capture.coherence);
  assert.ok(stillness.space > capture.space);
});

test('low sensing confidence stays close to the safe scripted prior', () => {
  const uncertain = targetResonance(
    { activation: 0, stability: 1, presence: 0, trend: 0, confidence: 0 },
    'capture',
  );

  assert.ok(uncertain.complexity > 0.5);
  assert.ok(uncertain.audioEnergy > 0.35);
  assert.ok(uncertain.focus > 0.5);
});

test('smoothValue approaches the target without overshoot', () => {
  const next = smoothValue(0.2, 0.8, 0.1, 0.5);
  assert.ok(next > 0.2);
  assert.ok(next < 0.8);
  assert.equal(smoothValue(0.2, 0.8, 0, 0.5), 0.2);
  assert.equal(smoothValue(0.2, 0.8, 1, 0), 0.8);
});
