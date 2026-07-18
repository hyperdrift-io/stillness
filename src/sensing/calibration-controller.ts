import { clamp01 } from '../experience/model.ts';
import type { PerceptionSnapshot } from './perception-signal.ts';

const MIN_FACE_CONFIDENCE = 0.65;
const MIN_SHOULDER_CONFIDENCE = 0.55;
const REQUIRED_SAMPLE_MS = 8_000;
const LIMITED_AFTER_MS = 12_000;
const MAX_CONTINUOUS_SAMPLE_GAP_MS = 250;

export type CalibrationStatus = {
  phase: 'framing' | 'sampling' | 'ready' | 'limited';
  progress: number;
  faceConfidence: number;
  shoulderConfidence: number;
  lightingConfidence: number;
  baselineMotion: number;
  baselineTension: number;
};

function trimmedMean(samples: readonly number[]): number {
  if (samples.length === 0) return 0;

  const sorted = [...samples].sort((left, right) => left - right);
  const trimCount = Math.min(
    Math.floor(sorted.length * 0.1),
    Math.floor((sorted.length - 1) * 0.5),
  );
  const retained = sorted.slice(trimCount, sorted.length - trimCount);
  return retained.reduce((sum, sample) => sum + sample, 0) / retained.length;
}

export class CalibrationController {
  private startedAtMs: number | null = null;
  private lastSnapshotTimestampMs: number | null = null;
  private previousUsableTimestampMs: number | null = null;
  private usableSampleMs = 0;
  private hasUsableSample = false;
  private terminalStatus: CalibrationStatus | null = null;
  private readonly faceConfidences: number[] = [];
  private readonly shoulderConfidences: number[] = [];
  private readonly lightingConfidences: number[] = [];
  private readonly motionSamples: number[] = [];
  private readonly tensionSamples: number[] = [];

  update(snapshot: PerceptionSnapshot, nowMs: number): CalibrationStatus {
    if (this.terminalStatus) return this.terminalStatus;

    if (Number.isFinite(nowMs) && this.startedAtMs === null) this.startedAtMs = nowMs;

    const faceConfidence = snapshot.facePresent ? clamp01(snapshot.faceConfidence) : 0;
    const shoulderConfidence = snapshot.shoulders.visible
      ? clamp01(snapshot.shoulders.confidence)
      : 0;
    const lightingConfidence = clamp01(snapshot.palette.confidence);
    const faceUsable = faceConfidence >= MIN_FACE_CONFIDENCE;
    const shouldersUsable = shoulderConfidence >= MIN_SHOULDER_CONFIDENCE;
    const jointlyUsable = faceUsable && shouldersUsable;

    const timestampMs = snapshot.timestampMs;
    const isNewSnapshot = Number.isFinite(timestampMs)
      && (this.lastSnapshotTimestampMs === null || timestampMs > this.lastSnapshotTimestampMs);

    if (isNewSnapshot) {
      this.lastSnapshotTimestampMs = timestampMs;
      this.faceConfidences.push(faceConfidence);
      this.shoulderConfidences.push(shoulderConfidence);
      this.lightingConfidences.push(lightingConfidence);

      if (faceUsable && Number.isFinite(snapshot.facial.tension)) {
        this.tensionSamples.push(clamp01(snapshot.facial.tension));
      }
      if (shouldersUsable && Number.isFinite(snapshot.motion.energy)) {
        this.motionSamples.push(clamp01(snapshot.motion.energy));
      }

      if (jointlyUsable) {
        this.hasUsableSample = true;
        if (this.previousUsableTimestampMs !== null) {
          const sampleGapMs = timestampMs - this.previousUsableTimestampMs;
          if (sampleGapMs > 0 && sampleGapMs <= MAX_CONTINUOUS_SAMPLE_GAP_MS) {
            this.usableSampleMs += sampleGapMs;
          }
        }
        this.previousUsableTimestampMs = timestampMs;
      } else {
        this.previousUsableTimestampMs = null;
      }
    }

    if (this.usableSampleMs >= REQUIRED_SAMPLE_MS) {
      this.terminalStatus = this.status('ready');
      return this.terminalStatus;
    }

    const attemptElapsedMs = this.startedAtMs !== null && Number.isFinite(nowMs)
      ? Math.max(0, nowMs - this.startedAtMs)
      : 0;
    if (attemptElapsedMs >= LIMITED_AFTER_MS) {
      this.terminalStatus = this.status('limited');
      return this.terminalStatus;
    }

    return {
      phase: jointlyUsable && this.hasUsableSample ? 'sampling' : 'framing',
      progress: clamp01(this.usableSampleMs / REQUIRED_SAMPLE_MS),
      faceConfidence,
      shoulderConfidence,
      lightingConfidence,
      baselineMotion: trimmedMean(this.motionSamples),
      baselineTension: trimmedMean(this.tensionSamples),
    };
  }

  reset(): void {
    this.startedAtMs = null;
    this.lastSnapshotTimestampMs = null;
    this.previousUsableTimestampMs = null;
    this.usableSampleMs = 0;
    this.hasUsableSample = false;
    this.terminalStatus = null;
    this.faceConfidences.length = 0;
    this.shoulderConfidences.length = 0;
    this.lightingConfidences.length = 0;
    this.motionSamples.length = 0;
    this.tensionSamples.length = 0;
  }

  private status(phase: 'ready' | 'limited'): CalibrationStatus {
    return {
      phase,
      progress: phase === 'ready' ? 1 : clamp01(this.usableSampleMs / REQUIRED_SAMPLE_MS),
      faceConfidence: trimmedMean(this.faceConfidences),
      shoulderConfidence: trimmedMean(this.shoulderConfidences),
      lightingConfidence: trimmedMean(this.lightingConfidences),
      baselineMotion: trimmedMean(this.motionSamples),
      baselineTension: trimmedMean(this.tensionSamples),
    };
  }
}
