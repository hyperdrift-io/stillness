import test from 'node:test';
import assert from 'node:assert/strict';

import { CameraSensor } from '../src/sensing/camera-sensor.ts';

test('CameraSensor releases an acquired track when video playback fails', async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const originalRequestFrame = Object.getOwnPropertyDescriptor(globalThis, 'requestAnimationFrame');
  const originalCancelFrame = Object.getOwnPropertyDescriptor(globalThis, 'cancelAnimationFrame');
  let stopped = false;
  const track = { stop: () => { stopped = true; } };
  const stream = { getTracks: () => [track] };
  const video = {
    muted: false,
    playsInline: false,
    srcObject: null as unknown,
    play: async () => { throw new Error('autoplay blocked'); },
    pause: () => {},
  };

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: { getUserMedia: async () => stream } },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => video },
  });
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    configurable: true,
    value: () => 1,
  });
  Object.defineProperty(globalThis, 'cancelAnimationFrame', {
    configurable: true,
    value: () => {},
  });

  try {
    const sensor = new CameraSensor();
    assert.equal(await sensor.start(), false);
    assert.equal(stopped, true);
    assert.equal(video.srcObject, null);
  } finally {
    restoreGlobal('navigator', originalNavigator);
    restoreGlobal('document', originalDocument);
    restoreGlobal('requestAnimationFrame', originalRequestFrame);
    restoreGlobal('cancelAnimationFrame', originalCancelFrame);
  }
});

function restoreGlobal(name: string, descriptor: PropertyDescriptor | undefined): void {
  if (descriptor) Object.defineProperty(globalThis, name, descriptor);
  else Reflect.deleteProperty(globalThis, name);
}
