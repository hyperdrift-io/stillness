import assert from 'node:assert/strict';
import test from 'node:test';

import { SessionTransitions } from '../src/experience/session-transitions.ts';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test('repeated leave calls share one in-flight teardown and stop once', async () => {
  const transitions = new SessionTransitions();
  const token = transitions.begin();
  assert.ok(token);
  assert.equal(transitions.activate(token, () => {}), true);

  const stopping = deferred();
  let stopCalls = 0;
  let completions = 0;
  const first = transitions.leave(token, () => {
    stopCalls += 1;
    return stopping.promise;
  }, () => {
    completions += 1;
  });
  const repeated = transitions.leave(token, async () => {
    assert.fail('started a second teardown');
  }, () => {
    assert.fail('used a second completion callback');
  });

  assert.strictEqual(repeated, first);
  await Promise.resolve();
  assert.equal(stopCalls, 1);
  assert.equal(completions, 0);

  stopping.resolve();
  await first;
  assert.equal(completions, 1);
});

test('begin is synchronously blocked during begin and leave transitions', async () => {
  const transitions = new SessionTransitions();
  const token = transitions.begin();
  assert.ok(token);
  assert.equal(transitions.begin(), null);
  assert.equal(transitions.activate(token, () => {}), true);

  const stopping = deferred();
  const leaving = transitions.leave(token, () => stopping.promise, () => {});
  assert.equal(transitions.begin(), null);

  stopping.resolve();
  await leaving;
  assert.ok(transitions.begin());
});

test('stale begin success and failure cannot update a replacement session', async () => {
  const transitions = new SessionTransitions();
  const staleToken = transitions.begin();
  assert.ok(staleToken);
  assert.equal(transitions.owns(staleToken), true);
  assert.equal(transitions.invalidate(staleToken), true);
  assert.equal(transitions.owns(staleToken), false);

  const currentToken = transitions.begin();
  assert.ok(currentToken);
  assert.equal(transitions.owns(currentToken), true);
  let activeUpdates = 0;
  let errorUpdates = 0;

  assert.equal(transitions.activate(staleToken, () => {
    activeUpdates += 1;
  }), false);
  assert.equal(transitions.fail(staleToken, () => {
    errorUpdates += 1;
  }), false);
  assert.equal(activeUpdates, 0);
  assert.equal(errorUpdates, 0);
  assert.equal(transitions.activate(currentToken, () => {
    activeUpdates += 1;
  }), true);
  assert.equal(activeUpdates, 1);
});

test('stale leave completion cannot reset UI and still blocks begin until stop settles', async () => {
  const transitions = new SessionTransitions();
  const staleToken = transitions.begin();
  assert.ok(staleToken);
  assert.equal(transitions.activate(staleToken, () => {}), true);

  const stopping = deferred();
  let resets = 0;
  const leaving = transitions.leave(staleToken, () => stopping.promise, () => {
    resets += 1;
  });
  assert.equal(transitions.invalidate(staleToken), true);
  assert.equal(transitions.begin(), null);

  stopping.resolve();
  await leaving;
  assert.equal(resets, 0);
  assert.ok(transitions.begin());
});
