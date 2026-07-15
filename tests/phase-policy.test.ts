import test from 'node:test';
import assert from 'node:assert/strict';

import { phaseForElapsed } from '../src/experience/phase-policy.ts';

test('phaseForElapsed changes phase at the defined descent boundaries', () => {
  assert.equal(phaseForElapsed(0), 'capture');
  assert.equal(phaseForElapsed(4_999), 'capture');
  assert.equal(phaseForElapsed(5_000), 'match');
  assert.equal(phaseForElapsed(19_999), 'match');
  assert.equal(phaseForElapsed(20_000), 'entrain');
  assert.equal(phaseForElapsed(59_999), 'entrain');
  assert.equal(phaseForElapsed(60_000), 'dissolve');
  assert.equal(phaseForElapsed(179_999), 'dissolve');
  assert.equal(phaseForElapsed(180_000), 'stillness');
});

test('phaseForElapsed treats negative and non-finite time as the first frame', () => {
  assert.equal(phaseForElapsed(-1), 'capture');
  assert.equal(phaseForElapsed(Number.NaN), 'capture');
  assert.equal(phaseForElapsed(Number.POSITIVE_INFINITY), 'capture');
});
