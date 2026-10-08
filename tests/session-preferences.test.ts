import test from 'node:test';
import assert from 'node:assert/strict';

import {
  commandForKey,
  defaultSessionPreferences,
} from '../src/experience/session-preferences.ts';

test('a session starts with sound and camera on and the signal panel closed', () => {
  assert.deepEqual(defaultSessionPreferences, {
    sound: true,
    camera: true,
    liveSignals: false,
    tuning: {
      signalSensitivity: 1,
      colorInfluence: 0.15,
      transitionSeconds: 4.5,
      visualIntensity: 1,
      quality: 'auto',
    },
  });
});

test('commandForKey maps unmodified shortcuts and ignores form entry', () => {
  assert.equal(commandForKey({ key: '?', modifier: false, editable: false }), 'menu');
  assert.equal(commandForKey({ key: 'm', modifier: false, editable: false }), 'sound');
  assert.equal(commandForKey({ key: 'D', modifier: false, editable: false }), 'signals');
  assert.equal(commandForKey({ key: 'd', modifier: true, editable: false }), null);
  assert.equal(commandForKey({ key: 'c', modifier: false, editable: true }), null);
});
