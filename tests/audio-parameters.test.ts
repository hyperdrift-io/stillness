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

test('mapAudioParameters keeps the wave layer within safe ranges', () => {
  const parameters = mapAudioParameters({ ...active, audioEnergy: 4, pulse: Number.NaN });
  assert.ok(parameters.waveGain >= 0.045 && parameters.waveGain <= 0.2);
  assert.ok(parameters.waveCutoffHz >= 420 && parameters.waveCutoffHz <= 1_480);
  assert.ok(parameters.waveHighpassHz >= 48 && parameters.waveHighpassHz <= 82);
  assert.ok(parameters.swell >= 0 && parameters.swell <= 1);
});

test('settling softens the generated surf', () => {
  const beginning = mapAudioParameters(active);
  const ending = mapAudioParameters(still);
  assert.ok(ending.waveGain < beginning.waveGain);
  assert.ok(ending.waveCutoffHz < beginning.waveCutoffHz);
  assert.ok(ending.waveHighpassHz < beginning.waveHighpassHz);
});

test('the generated surf rises and retreats on a slow cycle', () => {
  const retreat = mapAudioParameters({ ...active, coherence: 0 }, 0);
  const crest = mapAudioParameters({ ...active, coherence: 0 }, 4.6625);
  assert.ok(crest.swell > retreat.swell);
  assert.ok(crest.waveGain > retreat.waveGain);
  assert.ok(crest.waveCutoffHz > retreat.waveCutoffHz);
});

test('audible gain target fades to silence without reaching digital zero', () => {
  assert.equal(audibleGainTarget(false, 0.12), 0.0001);
  assert.equal(audibleGainTarget(true, 0.12), 0.12);
  assert.equal(audibleGainTarget(true, Number.NaN), 0.0001);
});
