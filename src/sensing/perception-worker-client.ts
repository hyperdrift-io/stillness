import type { PerceptionSnapshot } from './perception-signal.ts';
import type {
  PerceptionWorkerRequest,
  PerceptionWorkerResult,
} from './perception-worker-protocol.ts';

export type PerceptionAnalysis = {
  snapshot: PerceptionSnapshot;
  modulation: ImageBitmap;
};

type AnalysisRequest = {
  requestId: number;
  timestampMs: number;
  frame: ImageBitmap;
  resolve: (analysis: PerceptionAnalysis) => void;
  reject: (error: Error) => void;
};

export class PerceptionWorkerClient {
  private worker: Worker | null = null;
  private startPromise: Promise<void> | null = null;
  private resolveStart: (() => void) | null = null;
  private rejectStart: ((error: Error) => void) | null = null;
  private active: AnalysisRequest | null = null;
  private queued: AnalysisRequest | null = null;
  private nextRequestId = 1;
  private disposed = false;

  start(): Promise<void> {
    if (this.disposed) return Promise.reject(new Error('Relief perception worker client is disposed.'));
    if (this.startPromise) return this.startPromise;

    const worker = new Worker(new URL('./perception-worker.ts', import.meta.url), {
      type: 'module',
      name: 'relief-perception',
    });
    this.worker = worker;
    worker.addEventListener('message', this.handleMessage);
    worker.addEventListener('error', this.handleWorkerError);
    worker.addEventListener('messageerror', this.handleMessageError);
    this.startPromise = new Promise<void>((resolve, reject) => {
      this.resolveStart = resolve;
      this.rejectStart = reject;
    });
    try {
      worker.postMessage({ type: 'initialize' } satisfies PerceptionWorkerRequest);
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
    }
    return this.startPromise;
  }

  analyse(frame: ImageBitmap, timestampMs: number): Promise<PerceptionAnalysis> {
    if (this.disposed || !this.worker || !this.startPromise) {
      frame.close();
      return Promise.reject(new Error('Relief perception worker client is not running.'));
    }

    return new Promise<PerceptionAnalysis>((resolve, reject) => {
      const request: AnalysisRequest = {
        requestId: this.nextRequestId,
        timestampMs,
        frame,
        resolve,
        reject,
      };
      this.nextRequestId += 1;

      if (this.active) {
        this.rejectQueued(new Error('Relief perception frame was superseded by a newer frame.'));
        this.queued = request;
        return;
      }

      this.dispatch(request);
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const error = new Error('Relief perception worker client was disposed.');
    this.rejectStart?.(error);
    this.rejectStart = null;
    this.resolveStart = null;
    this.active?.reject(error);
    this.active = null;
    this.rejectQueued(error);

    const worker = this.worker;
    if (worker) {
      worker.removeEventListener('message', this.handleMessage);
      worker.removeEventListener('error', this.handleWorkerError);
      worker.removeEventListener('messageerror', this.handleMessageError);
      try {
        worker.postMessage({ type: 'dispose' } satisfies PerceptionWorkerRequest);
      } finally {
        worker.terminate();
      }
    }
    this.worker = null;
  }

  private dispatch(request: AnalysisRequest): void {
    const worker = this.worker;
    if (!worker || this.disposed) {
      request.frame.close();
      request.reject(new Error('Relief perception worker client is not running.'));
      return;
    }

    this.active = request;
    try {
      worker.postMessage(
        {
          type: 'analyse',
          requestId: request.requestId,
          timestampMs: request.timestampMs,
          frame: request.frame,
        } satisfies PerceptionWorkerRequest,
        [request.frame],
      );
    } catch (error) {
      request.frame.close();
      this.active = null;
      request.reject(error instanceof Error ? error : new Error(String(error)));
      this.dispatchQueued();
    }
  }

  private dispatchQueued(): void {
    const request = this.queued;
    this.queued = null;
    if (request) this.dispatch(request);
  }

  private rejectQueued(error: Error): void {
    const queued = this.queued;
    this.queued = null;
    if (!queued) return;
    queued.frame.close();
    queued.reject(error);
  }

  private fail(error: Error): void {
    this.rejectStart?.(error);
    this.rejectStart = null;
    this.resolveStart = null;
    this.active?.reject(error);
    this.active = null;
    this.rejectQueued(error);
    this.worker?.terminate();
    this.worker = null;
    this.disposed = true;
  }

  private handleMessage = (event: MessageEvent<PerceptionWorkerResult>): void => {
    const message = event.data;
    if (message.type === 'ready') {
      this.resolveStart?.();
      this.resolveStart = null;
      this.rejectStart = null;
      return;
    }

    if (message.type === 'error') {
      this.fail(new Error(message.message));
      return;
    }

    const active = this.active;
    if (!active || active.requestId !== message.requestId || this.disposed) {
      message.modulation.close();
      return;
    }

    this.active = null;
    active.resolve({ snapshot: message.snapshot, modulation: message.modulation });
    this.dispatchQueued();
  };

  private handleWorkerError = (event: ErrorEvent): void => {
    event.preventDefault();
    this.fail(new Error(event.message || 'Relief perception worker failed.'));
  };

  private handleMessageError = (): void => {
    this.fail(new Error('Relief perception worker returned an unreadable message.'));
  };
}
