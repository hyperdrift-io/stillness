import { cp, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const wasmEntry = require.resolve('@mediapipe/tasks-vision/vision_wasm_internal.js');
const sourceDirectory = dirname(wasmEntry);
const destinationDirectory = resolve('public/wasm');

await mkdir(destinationDirectory, { recursive: true });
await cp(sourceDirectory, destinationDirectory, { recursive: true, force: true });

console.log('Prepared local MediaPipe vision runtime.');
