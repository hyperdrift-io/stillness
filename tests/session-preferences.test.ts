import test from 'node:test';
import assert from 'node:assert/strict';

import {
  commandForKey,
  defaultSessionPreferences,
} from '../src/experience/session-preferences.ts';

test('Pure mode starts with vowel voice off and live signals visible', () => {
  assert.deepEqual(defaultSessionPreferences, {
    mode: 'pure',
    vocal: false,
    liveSignals: true,
    camera: true,
    visualControl: 'auto',
    variationSeed: 0,
    tuning: {
      signalSensitivity: 1,
      colorInfluence: 0.2,
      transitionSeconds: 4.5,
      visualIntensity: 1,
      quality: 'auto',
    },
  });
});

test('commandForKey maps unmodified shortcuts and ignores form entry', () => {
  assert.equal(commandForKey({ key: '?', modifier: false, editable: false }), 'menu');
  assert.equal(commandForKey({ key: 'm', modifier: false, editable: false }), 'vocal');
  assert.equal(commandForKey({ key: 'G', modifier: false, editable: false }), 'guidance');
  assert.equal(commandForKey({ key: 'd', modifier: true, editable: false }), null);
  assert.equal(commandForKey({ key: 'c', modifier: false, editable: true }), null);
});
