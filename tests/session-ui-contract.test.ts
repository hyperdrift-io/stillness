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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('session menu uses a labelled native dialog and every approved control', async () => {
  const source = await read('src/experience/session-menu.tsx');

  assert.match(source, /<dialog/);
  assert.match(source, /className="session-menu"/);
  assert.match(source, /aria-labelledby="session-menu-title"/);
  assert.match(source, /\.showModal\(\)/);
  assert.match(source, /\.close\(\)/);
  assert.match(source, /onCancel=/);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/);
  assert.match(
    source,
    /return \(\) => \{\s*closeOpenDialogAndRestoreFocus\(dialog, triggerRef\.current\);\s*\};/,
  );

  for (const label of ['Guidance', 'Soothing sound', 'Live signals', 'Camera sensing']) {
    assert.match(source, new RegExp(label));
  }

  assert.equal(source.match(/type="checkbox"/g)?.length, 4);
  assert.equal(source.match(/<meter/g)?.length, 4);
  assert.match(source, /preferences\.liveSignals \? \(/);
  assert.match(source, /Leave experience/);
  assert.doesNotMatch(source, />[^<]*%[^<]*</);
});

test('privacy copy states the exact in-memory processing boundary', async () => {
  const source = await read('src/experience/session-menu.tsx');

  assert.match(
    source,
    /Camera, audio, and motion signals are processed only in memory on this device, then discarded\. Nothing is saved or sent\./,
  );
});

test('every meter has a unique programmatic name and qualitative state association', async () => {
  const source = await read('src/experience/session-menu.tsx');
  const metrics = [
    {
      slug: 'movement',
      label: 'Movement',
      value: 'telemetry.movement',
      state: 'movementLabel(telemetry.movement, telemetry.direction)',
    },
    {
      slug: 'steadiness',
      label: 'Steadiness',
      value: 'telemetry.steadiness',
      state: 'steadinessLabel(telemetry.steadiness)',
    },
    {
      slug: 'presence',
      label: 'Presence',
      value: 'telemetry.presence',
      state: 'presenceLabel(telemetry.presence, telemetry.source)',
    },
    {
      slug: 'sensing',
      label: 'Sensing',
      value: 'telemetry.sensingQuality',
      state: 'sensingLabel(telemetry.sensingQuality, telemetry.source)',
    },
  ] as const;
  const associatedIds = metrics.flatMap(({ slug }) => [
    `${slug}-metric-name`,
    `${slug}-metric-state`,
  ]);

  assert.equal(new Set(associatedIds).size, 8);

  for (const { slug, label, value, state } of metrics) {
    const nameId = `${slug}-metric-name`;
    const stateId = `${slug}-metric-state`;
    const meterTag = source.match(
      new RegExp(`<meter[^>]*value=\\{${escapeRegExp(value)}\\}[^>]*>`),
    )?.[0];

    assert.ok(meterTag, `${label} meter is present`);
    assert.match(meterTag, new RegExp(`aria-labelledby="${nameId}"`));
    assert.match(meterTag, new RegExp(`aria-describedby="${stateId}"`));
    assert.match(source, new RegExp(`<span id="${nameId}">${label}</span>`));
    assert.match(
      source,
      new RegExp(`<span id="${stateId}">\\s*\\{${escapeRegExp(state)}\\}\\s*</span>`),
    );
    assert.equal(source.match(new RegExp(`id="${nameId}"`, 'g'))?.length, 1);
    assert.equal(source.match(new RegExp(`id="${stateId}"`, 'g'))?.length, 1);
  }
});

test('dialog teardown closes an open dialog before restoring trigger focus', async () => {
  const { closeOpenDialogAndRestoreFocus } = await loadMenuHelpers();
  const events: string[] = [];
  const dialog = {
    open: true,
    close() {
      events.push('close');
      this.open = false;
    },
  };
  const trigger = {
    focus() {
      events.push('focus');
    },
  };

  closeOpenDialogAndRestoreFocus(dialog, trigger);

  assert.deepEqual(events, ['close', 'focus']);
  assert.equal(dialog.open, false);
});

test('dialog teardown leaves focus alone when the dialog was never opened', async () => {
  const { closeOpenDialogAndRestoreFocus } = await loadMenuHelpers();
  let focused = false;

  closeOpenDialogAndRestoreFocus(
    { open: false, close: () => assert.fail('closed an inactive dialog') },
    { focus: () => { focused = true; } },
  );

  assert.equal(focused, false);
});

test('guidance exposes one polite live region', async () => {
  const source = await read('src/experience/session-guidance.tsx');

  assert.match(source, /aria-live="polite"/);
  assert.match(source, /className="signal-label">\{cue\.label\}/);
  assert.match(source, /cue\.invitation/);
  assert.match(source, /className="signal-explanation">\{cue\.explanation\}/);
  assert.doesNotMatch(source, />Guidance</);
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
  assert.equal(presenceLabel(0.2, 'mirror'), 'limited');
  assert.equal(presenceLabel(0.8, 'mirror'), 'present');

  assert.equal(sensingLabel(0.8, 'scripted'), 'unavailable');
  assert.equal(sensingLabel(0.2, 'mirror'), 'limited');
  assert.equal(sensingLabel(0.8, 'mirror'), 'clear');
});

test('metric helpers preserve every exact qualitative threshold boundary', async () => {
  const {
    movementLabel,
    presenceLabel,
    sensingLabel,
    steadinessLabel,
  } = await loadMenuHelpers();

  assert.equal(movementLabel(0.2, 'holding'), 'quiet');
  assert.equal(movementLabel(0.200_001, 'holding'), 'active');

  assert.equal(steadinessLabel(0.349_999), 'changing');
  assert.equal(steadinessLabel(0.35), 'forming');
  assert.equal(steadinessLabel(0.699_999), 'forming');
  assert.equal(steadinessLabel(0.7), 'steady');

  assert.equal(presenceLabel(0.399_999, 'mirror'), 'limited');
  assert.equal(presenceLabel(0.4, 'mirror'), 'present');

  assert.equal(sensingLabel(0.499_999, 'mirror'), 'limited');
  assert.equal(sensingLabel(0.5, 'mirror'), 'clear');
});
