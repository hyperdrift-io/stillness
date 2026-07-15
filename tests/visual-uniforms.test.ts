import test from 'node:test';
import assert from 'node:assert/strict';

import { createUniformSnapshot } from '../src/visual/uniforms.ts';
import { fragmentShaderSource } from '../src/visual/shaders.ts';
import type { ResonanceState } from '../src/resonance/resonance.ts';

const resonance: ResonanceState = {
  complexity: 1.8,
  turbulence: -0.4,
  coherence: Number.NaN,
  focus: 0.8,
  depth: 0.7,
  pulse: 0.5,
  audioEnergy: 0.4,
  warmth: 0.65,
  space: 0.25,
};

test('createUniformSnapshot returns finite bounded render inputs', () => {
  const uniforms = createUniformSnapshot(resonance, Number.NaN, -10, 0, true);

  assert.equal(uniforms.time, 0);
  assert.equal(uniforms.width, 1);
  assert.equal(uniforms.height, 1);
  assert.equal(uniforms.reducedMotion, 1);

  for (const name of [
    'complexity', 'turbulence', 'coherence', 'focus', 'depth', 'pulse', 'warmth', 'space',
  ] as const) {
    const value = uniforms[name];
    assert.equal(Number.isFinite(value), true, `${name} should be finite`);
    assert.ok(value >= 0 && value <= 1, `${name} should be normalized`);
  }
});

test('createUniformSnapshot preserves valid dimensions and time', () => {
  const uniforms = createUniformSnapshot(resonance, 12.5, 1080, 1920, false);
  assert.equal(uniforms.time, 12.5);
  assert.equal(uniforms.width, 1080);
  assert.equal(uniforms.height, 1920);
  assert.equal(uniforms.reducedMotion, 0);
});

test('fragment shader avoids reserved GLSL identifiers for local variables', () => {
  assert.doesNotMatch(fragmentShaderSource, /float\s+active\b/);
});

test('fragment shader keeps polar filaments periodic across the angle branch cut', () => {
  assert.match(fragmentShaderSource, /lowerBranches = floor\(branchLevel\)/);
  assert.match(fragmentShaderSource, /lowerBranches \+ 1\.0/);
  assert.doesNotMatch(fragmentShaderSource, /wAngle \* branches/);
});
