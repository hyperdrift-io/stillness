import { clamp01 } from '../experience/model.ts';

export type SessionSummary = {
  activationMean: number;
  stabilityMean: number;
  sampleCount: number;
};

export type PersonalBaseline = {
  activationMean: number;
  stabilityMean: number;
  sessionCount: number;
  updatedAt: number;
};

const DATABASE = 'stillness-local';
const STORE = 'calibration';
const KEY = 'personal-baseline';

export function mergeBaseline(
  current: PersonalBaseline | null,
  summary: SessionSummary,
  updatedAt = Date.now(),
): PersonalBaseline {
  const activationMean = clamp01(summary.activationMean, current?.activationMean ?? 0.65);
  const stabilityMean = clamp01(summary.stabilityMean, current?.stabilityMean ?? 0.35);
  if (!current) {
    return { activationMean, stabilityMean, sessionCount: 1, updatedAt };
  }

  const weight = Math.min(0.25, 1 / (current.sessionCount + 1));
  return {
    activationMean: current.activationMean + (activationMean - current.activationMean) * weight,
    stabilityMean: current.stabilityMean + (stabilityMean - current.stabilityMean) * weight,
    sessionCount: current.sessionCount + 1,
    updatedAt,
  };
}

export class BaselineStore {
  async load(): Promise<PersonalBaseline | null> {
    if (!('indexedDB' in globalThis)) return null;
    const database = await this.open();
    try {
      return await new Promise((resolve, reject) => {
        const request = database.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
        request.addEventListener('success', () => resolve((request.result as PersonalBaseline | undefined) ?? null));
        request.addEventListener('error', () => reject(request.error));
      });
    } finally {
      database.close();
    }
  }

  async saveSession(summary: SessionSummary): Promise<PersonalBaseline | null> {
    if (!('indexedDB' in globalThis) || summary.sampleCount < 10) return this.load();
    const current = await this.load();
    const next = mergeBaseline(current, summary);
    const database = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const request = database.transaction(STORE, 'readwrite').objectStore(STORE).put(next, KEY);
        request.addEventListener('success', () => resolve());
        request.addEventListener('error', () => reject(request.error));
      });
    } finally {
      database.close();
    }
    return next;
  }

  async clear(): Promise<void> {
    if (!('indexedDB' in globalThis)) return;
    const database = await this.open();
    try {
      await new Promise<void>((resolve, reject) => {
        const request = database.transaction(STORE, 'readwrite').objectStore(STORE).delete(KEY);
        request.addEventListener('success', () => resolve());
        request.addEventListener('error', () => reject(request.error));
      });
    } finally {
      database.close();
    }
  }

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.addEventListener('upgradeneeded', () => {
        if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
      });
      request.addEventListener('success', () => resolve(request.result));
      request.addEventListener('error', () => reject(request.error));
    });
  }
}
