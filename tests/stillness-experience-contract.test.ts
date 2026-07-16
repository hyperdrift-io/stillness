import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

async function read(path: string): Promise<string> {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('landing explains sensing, modes, sound, and session adjustment', async () => {
  const source = await read('src/experience/stillness-experience.tsx');

  assert.match(source, /Guide me into stillness/);
  assert.match(source, /uninterrupted Pure session/);
  assert.match(source, /Soothing sound begins/);
  assert.match(source, /Press.*\?.*anytime/s);
});

test('active experience renders guidance, menu, and a touch menu trigger', async () => {
  const source = await read('src/experience/stillness-experience.tsx');

  assert.match(source, /<SessionGuidance/);
  assert.match(source, /<SessionMenu/);
  assert.match(source, /aria-label="Adjust session"/);
});

test('begin wires telemetry and applies camera and sound preferences in gesture-safe order', async () => {
  const source = await read('src/experience/stillness-experience.tsx');

  assert.match(source, /onTelemetry:\s*\(nextTelemetry\) =>/);
  assert.match(source, /setTelemetry\(nextTelemetry\)/);
  assert.match(source, /guidancePolicyRef\.current\.evaluate\(/);
  assert.match(
    source,
    /if \(!preferences\.camera\)[\s\S]*controller\.setCameraEnabled\(false\)[\s\S]*await controller\.start\(\)[\s\S]*controller\.setSoundEnabled\(preferences\.sound\)/,
  );
  assert.doesNotMatch(source, /setCameraEnabled\(true\)[\s\S]*controller\.start\(\)/);
});

test('shortcuts ignore editable targets and non-shift modifiers while escape closes before leaving', async () => {
  const source = await read('src/experience/stillness-experience.tsx');

  assert.match(source, /commandForKey\(/);
  assert.match(source, /event\.altKey \|\| event\.ctrlKey \|\| event\.metaKey/);
  assert.doesNotMatch(source, /event\.shiftKey \|\|/);
  assert.match(source, /isEditableTarget\(event\.target\)/);
  assert.match(source, /if \(menuOpen\)[\s\S]*setMenuOpen\(false\)[\s\S]*else[\s\S]*void leave\(\)/);
});

test('live controls update preferences, resources, and guidance visibility', async () => {
  const source = await read('src/experience/stillness-experience.tsx');

  assert.match(source, /controllerRef\.current\?\.setSoundEnabled\(enabled\)/);
  assert.match(source, /controllerRef\.current\?\.setCameraEnabled\(enabled\)/);
  assert.match(source, /guidancePolicyRef\.current\.reset\(\)/);
  assert.match(source, /setCue\(null\)/);
  assert.match(source, /setPreferences\(\(current\) => \(\{ \.\.\.current, \[preference\]: enabled \}\)\)/);
});

test('the signals shortcut reveals the menu when closed', async () => {
  const source = await read('src/experience/stillness-experience.tsx');

  assert.match(
    source,
    /case 'signals':[\s\S]*if \(!menuOpen\)[\s\S]*togglePreference\('liveSignals', true\)[\s\S]*setMenuOpen\(true\)/,
  );
});

test('active presentation keeps the menu mounted and resets only session-visible state on leave', async () => {
  const source = await read('src/experience/stillness-experience.tsx');
  const leaveBody = source.match(/const leave = useCallback\(async \(\) => \{([\s\S]*?)\n  \}, \[/)?.[1];

  assert.ok(leaveBody);
  assert.match(leaveBody, /guidancePolicyRef\.current\.reset\(\)/);
  assert.match(leaveBody, /setCue\(null\)/);
  assert.match(leaveBody, /setMenuOpen\(false\)/);
  assert.doesNotMatch(leaveBody, /setPreferences/);
  assert.match(source, /mode === 'active' \? \([\s\S]*<SessionGuidance[\s\S]*<SessionMenu/);
});

test('session presentation uses the approved semantic responsive roles without inline styles', async () => {
  const experience = await read('src/experience/stillness-experience.tsx');
  const styles = await read('src/styles.css');

  for (const selector of [
    '.mode-choice',
    '.session-guidance',
    'button.session-menu-trigger',
    'dialog.session-menu',
    '.signal-meter',
  ]) {
    assert.match(styles, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(styles, /@media \(max-width: 40rem\)/);
  assert.doesNotMatch(experience, /style=\{/);
});
