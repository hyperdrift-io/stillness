import test from 'node:test';
import assert from 'node:assert/strict';

import { GuidancePolicy } from '../src/experience/guidance-policy.ts';
import type { SessionTelemetry } from '../src/experience/session-controller.ts';

const sensedTelemetry: SessionTelemetry = {
  movement: 0.4,
  steadiness: 0.5,
  presence: 0.8,
  sensingQuality: 0.9,
  direction: 'holding',
  source: 'sensed',
};

const scriptedTelemetry: SessionTelemetry = {
  movement: 0,
  steadiness: 0.9,
  presence: 0.8,
  sensingQuality: 0,
  direction: 'holding',
  source: 'scripted',
};

const activeTelemetry: SessionTelemetry = {
  ...sensedTelemetry,
  movement: 0.58,
};

const quietTelemetry: SessionTelemetry = {
  ...sensedTelemetry,
  movement: 0.2,
  steadiness: 0.7,
};

function copyFor(telemetry: SessionTelemetry): { label: string; invitation: string } {
  const cue = new GuidancePolicy().evaluate(telemetry, 0);
  assert.ok(cue);
  return { label: cue.label, invitation: cue.invitation };
}

test('scripted source uses the honest fallback despite sensed-looking values', () => {
  assert.deepEqual(
    copyFor({ ...scriptedTelemetry, movement: 0.9, direction: 'rising' }),
    {
      label: 'Following a gentle rhythm',
      invitation: 'Unclench the jaw and allow the shoulders to drop.',
    },
  );
});

test('settling movement invites a longer exhale', () => {
  assert.deepEqual(copyFor({ ...sensedTelemetry, direction: 'settling' }), {
    label: 'Movement is settling',
    invitation: 'Let the next exhale take a little longer.',
  });
});

test('settling direction takes precedence above the active movement threshold', () => {
  assert.deepEqual(
    copyFor({ ...activeTelemetry, movement: 0.9, direction: 'settling' }),
    {
      label: 'Movement is settling',
      invitation: 'Let the next exhale take a little longer.',
    },
  );
});

test('active movement uses the approved grounding cue', () => {
  assert.deepEqual(copyFor(activeTelemetry), {
    label: 'Movement has energy',
    invitation: 'Let your hands become heavy for one breath.',
  });
});

test('moderate holding movement uses the approved steady cue', () => {
  assert.deepEqual(copyFor(sensedTelemetry), {
    label: 'A steadier rhythm is forming',
    invitation: 'Soften your gaze toward the center.',
  });
});

test('quiet steady movement uses the approved quiet cue', () => {
  assert.deepEqual(copyFor(quietTelemetry), {
    label: 'The field has become quieter',
    invitation: 'Notice the space after the next breath.',
  });
});

test('rising movement describes change without judgment', () => {
  assert.deepEqual(copyFor({ ...sensedTelemetry, direction: 'rising' }), {
    label: 'The rhythm is changing',
    invitation: 'Let the field meet the change; nothing needs correcting.',
  });
});

test('rising direction takes precedence above the active movement threshold', () => {
  assert.deepEqual(
    copyFor({ ...activeTelemetry, movement: 0.9, direction: 'rising' }),
    {
      label: 'The rhythm is changing',
      invitation: 'Let the field meet the change; nothing needs correcting.',
    },
  );
});

test('active movement starts exactly at 0.58', () => {
  assert.equal(
    copyFor({ ...sensedTelemetry, movement: 0.579_999 }).label,
    'A steadier rhythm is forming',
  );
  assert.equal(copyFor({ ...sensedTelemetry, movement: 0.58 }).label, 'Movement has energy');
});

test('quiet movement ends exactly at 0.20', () => {
  assert.equal(
    copyFor({ ...quietTelemetry, movement: 0.2 }).label,
    'The field has become quieter',
  );
  assert.equal(
    copyFor({ ...quietTelemetry, movement: 0.200_001 }).label,
    'A steadier rhythm is forming',
  );
});

test('quiet steadiness starts exactly at 0.70', () => {
  assert.equal(
    copyFor({ ...quietTelemetry, steadiness: 0.699_999 }).label,
    'A steadier rhythm is forming',
  );
  assert.equal(
    copyFor({ ...quietTelemetry, steadiness: 0.7 }).label,
    'The field has become quieter',
  );
});

test('a cue is not replaced before its minimum display duration', () => {
  const policy = new GuidancePolicy();
  const first = policy.evaluate(activeTelemetry, 0);
  const second = policy.evaluate(quietTelemetry, 2_000);

  assert.equal(second?.id, first?.id);
  assert.equal(policy.evaluate(quietTelemetry, 7_000)?.label, 'The field has become quieter');
});

test('guidance remains through 26 seconds and fades one millisecond later', () => {
  const policy = new GuidancePolicy();
  const first = policy.evaluate(sensedTelemetry, 0);

  assert.equal(policy.evaluate(sensedTelemetry, 26_000)?.id, first?.id);
  assert.equal(policy.evaluate(sensedTelemetry, 26_001), null);
});

test('a changed cue can reappear after the opening window and remains readable', () => {
  const policy = new GuidancePolicy();
  policy.evaluate(sensedTelemetry, 0);
  assert.equal(policy.evaluate(sensedTelemetry, 30_001), null);

  const changed = policy.evaluate(activeTelemetry, 30_002);
  assert.equal(changed?.label, 'Movement has energy');
  assert.equal(policy.evaluate(quietTelemetry, 31_000)?.id, changed?.id);
  assert.equal(policy.evaluate(quietTelemetry, 37_002)?.label, 'The field has become quieter');
});

test('reset clears cue hysteresis for a new session', () => {
  const policy = new GuidancePolicy();
  policy.evaluate(activeTelemetry, 0);

  policy.reset();

  assert.equal(policy.evaluate(quietTelemetry, 1_000)?.label, 'The field has become quieter');
});
