import test from 'node:test';
import assert from 'node:assert/strict';

import { estimateState } from '../src/state/state-estimator.ts';

test('estimateState distinguishes active evidence from settled evidence', () => {
  const active = estimateState({
    cameraMotion: 0.9,
    cameraPresence: 0.85,
    deviceMotion: 0.75,
    variability: 0.8,
    settlingTrend: -0.6,
    expressionActivity: 0.6,
    softness: 0.2,
    confidence: 0.9,
    elapsedProgress: 0.1,
  });
  const settled = estimateState({
    cameraMotion: 0.08,
    cameraPresence: 0.9,
    deviceMotion: 0.04,
    variability: 0.06,
    settlingTrend: 0.7,
    expressionActivity: 0.05,
    softness: 0.8,
    confidence: 0.9,
    elapsedProgress: 0.7,
  });

  assert.ok(active.activation > settled.activation);
  assert.ok(active.stability < settled.stability);
  assert.ok(active.trend < settled.trend);
  assert.ok(settled.presence > 0.7);
});

test('estimateState falls back to a safe prior when evidence confidence is low', () => {
  const state = estimateState({
    cameraMotion: 0,
    cameraPresence: 0,
    deviceMotion: 0,
    variability: 0,
    settlingTrend: 1,
    expressionActivity: 0,
    softness: 0.5,
    confidence: 0,
    elapsedProgress: 0,
  });

  assert.equal(state.activation, 0.65);
  assert.equal(state.stability, 0.35);
  assert.equal(state.presence, 0.5);
  assert.equal(state.confidence, 0);
});
