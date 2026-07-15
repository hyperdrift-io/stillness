import { clamp01 } from '../experience/model.ts';

type TimedSample = { value: number; timestampMs: number };

export type FeatureSnapshot = {
  count: number;
  mean: number;
  variance: number;
  slopePerSecond: number;
  latest: number;
};

export class FeatureWindow {
  private readonly samples: TimedSample[] = [];
  private readonly capacity: number;

  constructor(capacity: number) {
    this.capacity = Math.max(2, Math.floor(Number.isFinite(capacity) ? capacity : 2));
  }

  push(value: number, timestampMs: number): void {
    if (!Number.isFinite(value) || !Number.isFinite(timestampMs)) return;
    this.samples.push({ value: clamp01(value), timestampMs });
    if (this.samples.length > this.capacity) this.samples.splice(0, this.samples.length - this.capacity);
  }

  clear(): void {
    this.samples.length = 0;
  }

  snapshot(): FeatureSnapshot {
    if (this.samples.length === 0) {
      return { count: 0, mean: 0, variance: 0, slopePerSecond: 0, latest: 0 };
    }

    const count = this.samples.length;
    const mean = this.samples.reduce((sum, sample) => sum + sample.value, 0) / count;
    const variance = this.samples.reduce((sum, sample) => {
      const difference = sample.value - mean;
      return sum + difference * difference;
    }, 0) / count;

    const firstTimestamp = this.samples[0]?.timestampMs ?? 0;
    const meanTime = this.samples.reduce(
      (sum, sample) => sum + (sample.timestampMs - firstTimestamp) / 1_000,
      0,
    ) / count;
    let covariance = 0;
    let timeVariance = 0;
    for (const sample of this.samples) {
      const centeredTime = (sample.timestampMs - firstTimestamp) / 1_000 - meanTime;
      covariance += centeredTime * (sample.value - mean);
      timeVariance += centeredTime * centeredTime;
    }

    return {
      count,
      mean,
      variance,
      slopePerSecond: timeVariance > 0 ? covariance / timeVariance : 0,
      latest: this.samples.at(-1)?.value ?? 0,
    };
  }
}
