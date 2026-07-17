import test from 'node:test';
import assert from 'node:assert/strict';

import { GuidancePolicy } from '../src/experience/guidance-policy.ts';
import type { SessionTelemetry } from '../src/experience/session-controller.ts';
import { neutralMirrorExpression } from '../src/sensing/mirror-signal.ts';

const mirrorTelemetry: SessionTelemetry = {
  movement: 0.4,
  steadiness: 0.5,
  presence: 0.8,
  sensingQuality: 0.9,
  expressionActivity: 0.2,
  expression: neutralMirrorExpression,
  softness: 0.4,
  turbulence: 0.5,
  settling: 0.3,
  relief: 0.2,
  readiness: 0.1,
  confidence: 0.9,
  direction: 'holding',
  source: 'mirror',
};

const scriptedTelemetry: SessionTelemetry = {
  movement: 0,
  steadiness: 0.9,
  presence: 0.8,
  sensingQuality: 0,
  expressionActivity: 0,
  expression: neutralMirrorExpression,
  softness: 0.5,
  turbulence: 0.1,
  settling: 0.9,
  relief: 0,
  readiness: 0,
  confidence: 0,
  direction: 'holding',
  source: 'scripted',
};

function copyFor(
  telemetry: SessionTelemetry,
  elapsedMs = 12_000,
): { label: string; invitation: string } {
  const cue = new GuidancePolicy().evaluate(telemetry, elapsedMs);
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

test('the opening window gives the mirror time to form', () => {
  assert.deepEqual(copyFor(mirrorTelemetry, 0), {
    label: 'Mirror forming',
    invitation: 'Arrive here for one breath.',
  });
});

test('softening signals invite a longer exhale', () => {
  assert.deepEqual(copyFor({ ...mirrorTelemetry, direction: 'settling' }), {
    label: 'Signals are softening',
    invitation: 'Let the next exhale take a little longer.',
  });
});

test('softening takes precedence above active movement', () => {
  assert.deepEqual(
    copyFor({ ...mirrorTelemetry, movement: 0.9, direction: 'settling' }),
    {
      label: 'Signals are softening',
      invitation: 'Let the next exhale take a little longer.',
    },
  );
});

test('active movement uses the approved grounding cue', () => {
  assert.deepEqual(copyFor({ ...mirrorTelemetry, movement: 0.9 }), {
    label: 'Movement has energy',
    invitation: 'Let your jaw release for one breath.',
  });
});

test('relief and readiness cues follow the recovery stages', () => {
  assert.equal(copyFor({ ...mirrorTelemetry, relief: 0.42 }).label, 'Relief is arriving');
  assert.equal(copyFor({ ...mirrorTelemetry, relief: 0.68 }).label, 'Restoration is forming');
  assert.equal(copyFor({ ...mirrorTelemetry, readiness: 0.68 }).label, 'Readiness is returning');
});

test('relief threshold starts exactly at 0.42', () => {
  assert.equal(
    copyFor({ ...mirrorTelemetry, relief: 0.419_999 }).label,
    'Movement has energy',
  );
  assert.equal(copyFor({ ...mirrorTelemetry, relief: 0.42 }).label, 'Relief is arriving');
});

test('restoration threshold starts exactly at 0.68', () => {
  assert.equal(
    copyFor({ ...mirrorTelemetry, relief: 0.679_999 }).label,
    'Relief is arriving',
  );
  assert.equal(copyFor({ ...mirrorTelemetry, relief: 0.68 }).label, 'Restoration is forming');
});

test('readiness threshold starts exactly at 0.68', () => {
  assert.equal(
    copyFor({ ...mirrorTelemetry, relief: 0.68, readiness: 0.679_999 }).label,
    'Restoration is forming',
  );
  assert.equal(
    copyFor({ ...mirrorTelemetry, relief: 0.68, readiness: 0.68 }).label,
    'Readiness is returning',
  );
});

test('opening cue ends exactly at 12 seconds', () => {
  assert.equal(copyFor(mirrorTelemetry, 11_999).label, 'Mirror forming');
  assert.equal(copyFor(mirrorTelemetry, 12_000).label, 'Movement has energy');
});

test('a cue is not replaced before its minimum display duration', () => {
  const policy = new GuidancePolicy();
  const first = policy.evaluate({ ...mirrorTelemetry, movement: 0.9 }, 12_000);
  const second = policy.evaluate({ ...mirrorTelemetry, relief: 0.68 }, 14_000);

  assert.equal(second?.id, first?.id);
  assert.equal(policy.evaluate({ ...mirrorTelemetry, relief: 0.68 }, 19_000)?.label, 'Restoration is forming');
});

test('guidance remains through 26 seconds and fades one millisecond later', () => {
  const policy = new GuidancePolicy();
  const first = policy.evaluate(mirrorTelemetry, 12_000);

  assert.equal(policy.evaluate(mirrorTelemetry, 26_000)?.id, first?.id);
  assert.equal(policy.evaluate(mirrorTelemetry, 26_001), null);
});

test('a changed cue can reappear after the opening window and remains readable', () => {
  const policy = new GuidancePolicy();
  policy.evaluate(mirrorTelemetry, 12_000);
  assert.equal(policy.evaluate(mirrorTelemetry, 30_001), null);

  const changed = policy.evaluate({ ...mirrorTelemetry, relief: 0.42 }, 30_002);
  assert.equal(changed?.label, 'Relief is arriving');
  assert.equal(policy.evaluate({ ...mirrorTelemetry, relief: 0.68 }, 31_000)?.id, changed?.id);
  assert.equal(
    policy.evaluate({ ...mirrorTelemetry, relief: 0.68 }, 37_002)?.label,
    'Restoration is forming',
  );
});

test('reset clears cue hysteresis for a new session', () => {
  const policy = new GuidancePolicy();
  policy.evaluate({ ...mirrorTelemetry, movement: 0.9 }, 12_000);

  policy.reset();

  assert.equal(policy.evaluate({ ...mirrorTelemetry, relief: 0.42 }, 1_000)?.label, 'Mirror forming');
});

test('every cue explains how the field is responding to the signal', () => {
  const cases = [
    [mirrorTelemetry, 'The mirror becomes more coherent as movement and expression signals soften.', 12_000],
    [
      { ...mirrorTelemetry, direction: 'settling' as const },
      'The field is opening as turbulence settles.',
      12_000,
    ],
    [
      { ...mirrorTelemetry, relief: 0.42 },
      'The mirror is responding to steadier movement and softer expression signals.',
      12_000,
    ],
    [
      { ...mirrorTelemetry, relief: 0.68 },
      'Sound can carry the reset while the field keeps breathing with you.',
      12_000,
    ],
    [
      { ...mirrorTelemetry, readiness: 0.68 },
      'Relief came first; readiness is building from that steadier base.',
      12_000,
    ],
    [scriptedTelemetry, 'The field is guiding a reset while sensing is limited.', 0],
    [mirrorTelemetry, 'The field is learning your starting rhythm on this device.', 0],
  ] as const;

  for (const [telemetry, explanation, elapsedMs] of cases) {
    assert.equal(new GuidancePolicy().evaluate(telemetry, elapsedMs)?.explanation, explanation);
  }
});
