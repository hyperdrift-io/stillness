import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function read(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

async function loadMenuHelpers() {
  const source = await read('src/experience/session-menu.tsx');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
  }).outputText.replace(/^import .*;$/gm, '');
  const url = `data:text/javascript;base64,${Buffer.from(transpiled).toString('base64')}`;
  return import(url) as Promise<typeof import('../src/experience/session-menu.tsx')>;
}

test('session menu uses a labelled native dialog and every approved control', async () => {
  const source = await read('src/experience/session-menu.tsx');

  assert.match(source, /<dialog/);
  assert.match(source, /aria-labelledby="session-menu-title"/);
  assert.match(source, /\.showModal\(\)/);
  assert.match(source, /\.close\(\)/);
  assert.match(source, /onCancel=/);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/);

  for (const label of ['Guidance', 'Soothing sound', 'Live signals', 'Camera sensing']) {
    assert.match(source, new RegExp(label));
  }

  assert.equal(source.match(/type="checkbox"/g)?.length, 4);
  assert.equal(source.match(/<meter/g)?.length, 4);
  assert.match(source, /preferences\.liveSignals \? \(/);
  assert.match(source, /Leave experience/);
  assert.doesNotMatch(source, />[^<]*%[^<]*</);
});

test('guidance exposes one polite live region', async () => {
  const source = await read('src/experience/session-guidance.tsx');

  assert.match(source, /aria-live="polite"/);
  assert.match(source, /cue\.invitation/);
  assert.equal(source.match(/aria-live=/g)?.length, 1);
});

test('metric helpers describe values without exposing numbers', async () => {
  const {
    movementLabel,
    presenceLabel,
    sensingLabel,
    steadinessLabel,
  } = await loadMenuHelpers();

  assert.equal(movementLabel(0.8, 'holding'), 'active');
  assert.equal(movementLabel(0.4, 'settling'), 'settling');
  assert.equal(movementLabel(0.1, 'holding'), 'quiet');

  assert.equal(steadinessLabel(0.1), 'changing');
  assert.equal(steadinessLabel(0.5), 'forming');
  assert.equal(steadinessLabel(0.8), 'steady');

  assert.equal(presenceLabel(0.8, 'scripted'), 'unavailable');
  assert.equal(presenceLabel(0.2, 'sensed'), 'limited');
  assert.equal(presenceLabel(0.8, 'sensed'), 'present');

  assert.equal(sensingLabel(0.8, 'scripted'), 'unavailable');
  assert.equal(sensingLabel(0.2, 'sensed'), 'limited');
  assert.equal(sensingLabel(0.8, 'sensed'), 'clear');
});
