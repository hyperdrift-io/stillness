import { clamp01 } from '../experience/model.ts';
import type { PerceptionSnapshot } from './perception-signal.ts';

const SAMPLE_WINDOW_MS = 12_000;
const FAST_EMA_SECONDS = 0.7;
const SLOW_EMA_SECONDS = 3;
const MIN_CYCLE_MS = 2_000;
const MAX_CYCLE_MS = 12_000;
const MAX_SAMPLE_GAP_MS = 1_000;
const MIN_SPIKE_STEP = 0.025;
const MAX_SPIKE_STEP = 0.08;
const MAX_VISUAL_SPEED_PER_SECOND = 0.35;
const AMPLITUDE_FLOOR = 0.0025;
const FULL_AMPLITUDE_RANGE = 0.025;

type TraceSample = {
  timestampMs: number;
  detrended: number;
  visibility: number;
};

type BreathCycle = {
  startMs: number;
  endMs: number;
  intervalMs: number;
};

export type BreathSignal = {
  phase: number;
  regularity: number;
  amplitude: number;
  confidence: number;
  cycles: number;
};

const emptyBreathSignal: BreathSignal = {
  phase: 0,
  regularity: 0,
  amplitude: 0,
  confidence: 0,
  cycles: 0,
};

function percentile(sorted: readonly number[], position: number): number {
  if (sorted.length === 0) return 0;
  const index = (sorted.length - 1) * clamp01(position);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const amount = index - lower;
  return (sorted[lower] ?? 0) * (1 - amount) + (sorted[upper] ?? 0) * amount;
}

export class BreathEstimator {
  private readonly trace: TraceSample[] = [];
  private readonly cycleHistory: BreathCycle[] = [];
  private lastSignal: BreathSignal = { ...emptyBreathSignal };
  private lastObservedTimestampMs: number | null = null;
  private lastTimestampMs: number | null = null;
  private lastRawSample = 0;
  private fastEma = 0;
  private slowEma = 0;
  private previousDetrended = 0;
  private previousDetrendedTimestampMs: number | null = null;
  private lastPositiveCrossingMs: number | null = null;

  update(snapshot: PerceptionSnapshot): BreathSignal {
    const timestampMs = snapshot.timestampMs;
    if (!Number.isFinite(timestampMs)) return { ...emptyBreathSignal };
    if (this.lastObservedTimestampMs !== null && timestampMs <= this.lastObservedTimestampMs) {
      return { ...this.lastSignal };
    }
    this.lastObservedTimestampMs = timestampMs;

    this.prune(timestampMs);
    const visibility = this.visibility(snapshot);
    if (visibility <= 0) return this.emitSignal(timestampMs, 0);

    const shoulderY = (snapshot.shoulders.leftY + snapshot.shoulders.rightY) * 0.5;
    const rawSample = shoulderY - snapshot.faceCenterY * 0.25;
    if (!Number.isFinite(rawSample)) return this.emitSignal(timestampMs, 0);

    if (this.lastTimestampMs === null || timestampMs - this.lastTimestampMs > MAX_SAMPLE_GAP_MS) {
      if (this.lastTimestampMs !== null) this.clearContinuity();
      this.beginContinuity(rawSample, timestampMs, visibility);
      return this.emitSignal(timestampMs, visibility);
    }

    const elapsedMs = timestampMs - this.lastTimestampMs;
    const elapsedSeconds = elapsedMs / 1_000;
    const allowedStep = Math.max(
      MIN_SPIKE_STEP,
      Math.min(MAX_SPIKE_STEP, elapsedSeconds * MAX_VISUAL_SPEED_PER_SECOND),
    );
    if (Math.abs(rawSample - this.lastRawSample) > allowedStep) {
      this.clearContinuity();
      this.beginContinuity(rawSample, timestampMs, visibility);
      return this.emitSignal(timestampMs, visibility);
    }

    const fastAlpha = 1 - Math.exp(-elapsedSeconds / FAST_EMA_SECONDS);
    const slowAlpha = 1 - Math.exp(-elapsedSeconds / SLOW_EMA_SECONDS);
    this.fastEma += (rawSample - this.fastEma) * fastAlpha;
    this.slowEma += (rawSample - this.slowEma) * slowAlpha;
    const detrended = this.fastEma - this.slowEma;

    if (this.previousDetrended <= 0 && detrended > 0) {
      const denominator = detrended - this.previousDetrended;
      const crossingAmount = denominator > 0 ? -this.previousDetrended / denominator : 1;
      const previousTimestampMs = this.previousDetrendedTimestampMs ?? this.lastTimestampMs;
      const crossingTimestampMs = previousTimestampMs
        + (timestampMs - previousTimestampMs) * clamp01(crossingAmount);
      this.recordPositiveCrossing(crossingTimestampMs);
    }

    this.trace.push({ timestampMs, detrended, visibility });
    this.lastTimestampMs = timestampMs;
    this.lastRawSample = rawSample;
    this.previousDetrended = detrended;
    this.previousDetrendedTimestampMs = timestampMs;
    this.prune(timestampMs);
    return this.emitSignal(timestampMs, visibility);
  }

  reset(): void {
    this.clearContinuity();
    this.lastObservedTimestampMs = null;
  }

  private visibility(snapshot: PerceptionSnapshot): number {
    if (!snapshot.facePresent || !snapshot.shoulders.visible) return 0;
    return Math.min(
      clamp01(snapshot.faceConfidence),
      clamp01(snapshot.shoulders.confidence),
    );
  }

  private beginContinuity(rawSample: number, timestampMs: number, visibility: number): void {
    this.lastTimestampMs = timestampMs;
    this.lastRawSample = rawSample;
    this.fastEma = rawSample;
    this.slowEma = rawSample;
    this.previousDetrended = 0;
    this.previousDetrendedTimestampMs = timestampMs;
    this.trace.push({ timestampMs, detrended: 0, visibility });
  }

  private clearContinuity(): void {
    this.trace.length = 0;
    this.cycleHistory.length = 0;
    this.lastTimestampMs = null;
    this.lastRawSample = 0;
    this.fastEma = 0;
    this.slowEma = 0;
    this.previousDetrended = 0;
    this.previousDetrendedTimestampMs = null;
    this.lastPositiveCrossingMs = null;
    this.lastSignal = { ...emptyBreathSignal };
  }

  private recordPositiveCrossing(timestampMs: number): void {
    if (this.lastPositiveCrossingMs === null) {
      this.lastPositiveCrossingMs = timestampMs;
      return;
    }

    const intervalMs = timestampMs - this.lastPositiveCrossingMs;
    const previousCrossingMs = this.lastPositiveCrossingMs;
    this.lastPositiveCrossingMs = timestampMs;
    if (intervalMs < MIN_CYCLE_MS || intervalMs > MAX_CYCLE_MS) {
      this.cycleHistory.length = 0;
      return;
    }

    this.cycleHistory.push({
      startMs: previousCrossingMs,
      endMs: timestampMs,
      intervalMs,
    });
  }

  private prune(timestampMs: number): void {
    const cutoffMs = timestampMs - SAMPLE_WINDOW_MS;
    while ((this.trace[0]?.timestampMs ?? Infinity) < cutoffMs) this.trace.shift();
    while ((this.cycleHistory[0]?.startMs ?? Infinity) < cutoffMs) this.cycleHistory.shift();
    if (this.lastPositiveCrossingMs !== null && this.lastPositiveCrossingMs < cutoffMs) {
      this.lastPositiveCrossingMs = null;
    }
  }

  private signal(timestampMs: number, currentVisibility: number): BreathSignal {
    const sortedTrace = this.trace
      .map((sample) => sample.detrended)
      .sort((left, right) => left - right);
    const robustRange = percentile(sortedTrace, 0.9) - percentile(sortedTrace, 0.1);
    const amplitude = clamp01(
      (robustRange - AMPLITUDE_FLOOR) / (FULL_AMPLITUDE_RANGE - AMPLITUDE_FLOOR),
    );
    const cycles = this.cycleHistory.length;
    const intervals = this.cycleHistory.map((cycle) => cycle.intervalMs);
    const meanInterval = intervals.length > 0
      ? intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length
      : 0;

    let regularity = 0;
    if (intervals.length >= 2 && meanInterval > 0) {
      const variance = intervals.reduce((sum, interval) => {
        const difference = interval - meanInterval;
        return sum + difference * difference;
      }, 0) / intervals.length;
      regularity = clamp01(1 - Math.sqrt(variance) / meanInterval);
    }

    const windowVisibility = this.trace.length > 0
      ? this.trace.reduce((sum, sample) => sum + sample.visibility, 0) / this.trace.length
      : 0;
    const cycleEvidence = clamp01(cycles / 2);
    const confidence = clamp01(
      Math.min(currentVisibility, windowVisibility) * amplitude * cycleEvidence,
    );

    let phase = 0;
    if (
      confidence > 0
      && cycles > 0
      && meanInterval > 0
      && this.lastPositiveCrossingMs !== null
    ) {
      phase = clamp01((timestampMs - this.lastPositiveCrossingMs) / meanInterval);
    }

    return { phase, regularity, amplitude, confidence, cycles };
  }

  private emitSignal(timestampMs: number, currentVisibility: number): BreathSignal {
    this.lastSignal = this.signal(timestampMs, currentVisibility);
    return { ...this.lastSignal };
  }
}
