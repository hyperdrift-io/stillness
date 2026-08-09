import test from 'node:test';
import assert from 'node:assert/strict';

import { audibleGainTarget, mapAudioParameters } from '../src/audio/stillness-audio.ts';
import type { ResonanceState } from '../src/resonance/resonance.ts';

const active: ResonanceState = {
  complexity: 0.9,
  turbulence: 0.8,
  coherence: 0.2,
  focus: 0.85,
  depth: 0.8,
  pulse: 0.9,
  audioEnergy: 0.9,
  warmth: 0.8,
  space: 0.15,
};

const still: ResonanceState = {
  complexity: 0.05,
  turbulence: 0.02,
  coherence: 0.98,
  focus: 0.8,
  depth: 0.2,
  pulse: 0.08,
  audioEnergy: 0.04,
  warmth: 0.2,
  space: 0.98,
};

test('mapAudioParameters keeps the vowel voice within safe ranges', () => {
  const parameters = mapAudioParameters({ ...active, audioEnergy: 4, pulse: Number.NaN });
  assert.ok(parameters.delayMix >= 0.08 && parameters.delayMix <= 0.44);
  assert.ok(parameters.vocalGain >= 0.035 && parameters.vocalGain <= 0.215);
  assert.ok(parameters.vocalPitchHz >= 73.42 && parameters.vocalPitchHz <= 82.42);
  assert.ok(parameters.formantsHz.every(Number.isFinite));
});

test('settling opens the vowel and its delay', () => {
  const beginning = mapAudioParameters(active);
  const ending = mapAudioParameters(still);
  assert.ok(ending.delayMix > beginning.delayMix);
  assert.ok(ending.vocalGain > beginning.vocalGain);
  assert.notDeepEqual(ending.formantsHz, beginning.formantsHz);
});

test('audible gain target fades to silence without reaching digital zero', () => {
  assert.equal(audibleGainTarget(false, 0.12), 0.0001);
  assert.equal(audibleGainTarget(true, 0.12), 0.12);
  assert.equal(audibleGainTarget(true, Number.NaN), 0.0001);
});
