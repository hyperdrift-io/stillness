import type { PerceptionSnapshot } from './perception-signal.ts';

export type PerceptionWorkerRequest =
  | { type: 'initialize' }
  | { type: 'analyse'; requestId: number; timestampMs: number; frame: ImageBitmap }
  | { type: 'dispose' };

export type PerceptionWorkerResult =
  | { type: 'ready' }
  | {
      type: 'result';
      requestId: number;
      snapshot: PerceptionSnapshot;
      modulation: ImageBitmap;
    }
  | { type: 'error'; requestId?: number; message: string };

export type PerceptionModulationFrame = {
  timestampMs: number;
  bitmap: ImageBitmap;
};
