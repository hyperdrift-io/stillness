import test from 'node:test';
import assert from 'node:assert/strict';

import {
  commandForKey,
  defaultSessionPreferences,
} from '../src/experience/session-preferences.ts';

test('Guided and soothing sound are enabled by default', () => {
  assert.deepEqual(defaultSessionPreferences, {
    guidance: true, sound: true, liveSignals: false, camera: true,
  });
});

test('commandForKey maps unmodified shortcuts and ignores form entry', () => {
  assert.equal(commandForKey({ key: '?', modifier: false, editable: false }), 'menu');
  assert.equal(commandForKey({ key: 'm', modifier: false, editable: false }), 'sound');
  assert.equal(commandForKey({ key: 'G', modifier: false, editable: false }), 'guidance');
  assert.equal(commandForKey({ key: 'd', modifier: true, editable: false }), null);
  assert.equal(commandForKey({ key: 'c', modifier: false, editable: true }), null);
});
