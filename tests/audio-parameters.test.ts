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

test('mapAudioParameters keeps the audio graph within safe ranges', () => {
  const parameters = mapAudioParameters({ ...active, audioEnergy: 4, pulse: Number.NaN });
  assert.ok(parameters.masterGain >= 0 && parameters.masterGain <= 0.18);
  assert.ok(parameters.droneGain >= 0 && parameters.droneGain <= 0.16);
  assert.ok(parameters.textureGain >= 0 && parameters.textureGain <= 0.08);
  assert.ok(parameters.filterHz >= 180 && parameters.filterHz <= 2_600);
  assert.ok(parameters.pulseHz >= 0.04 && parameters.pulseHz <= 0.4);
  assert.ok(parameters.delayMix >= 0 && parameters.delayMix <= 0.35);
});

test('settling removes texture and slows the shared pulse', () => {
  const beginning = mapAudioParameters(active);
  const ending = mapAudioParameters(still);
  assert.ok(ending.masterGain < beginning.masterGain);
  assert.ok(ending.textureGain < beginning.textureGain);
  assert.ok(ending.filterHz < beginning.filterHz);
  assert.ok(ending.pulseHz < beginning.pulseHz);
  assert.ok(ending.delayMix > beginning.delayMix);
});

test('audible gain target fades to silence without reaching digital zero', () => {
  assert.equal(audibleGainTarget(false, 0.12), 0.0001);
  assert.equal(audibleGainTarget(true, 0.12), 0.12);
  assert.equal(audibleGainTarget(true, Number.NaN), 0.0001);
});
