/**
 * The breath pacer is the lead of the session: a planned sequence of breath
 * cycles the light and the sound follow, so the body has one slow rhythm to
 * fall into. It is pure: elapsed time in, cue and lung fullness out.
 *
 * Arc (evidence-led, never a clock alone):
 *  - arrive: one plain slow breath that teaches the mapping (light grows = in).
 *  - sigh:   cyclic sighing — two inhales, one long exhale — the fastest known
 *            voluntary way to lower arousal (Balban et al. 2023).
 *  - slow:   paced breathing gliding toward the resonance rate (~5.5–6 per
 *            minute) with a longer exhale; the glide speeds up when the sensed
 *            breath follows and keeps a slow floor when sensing is absent.
 *  - still:  the rate holds, the pacing fades, the body continues on its own.
 */

export type PacerStage = 'arrive' | 'sigh' | 'slow' | 'still';
export type BreathCue = 'in' | 'again' | 'out' | 'rest';

export type PacerSegment = {
  cue: BreathCue;
  seconds: number;
  from: number;
  to: number;
};

export type PacerCycle = {
  stage: PacerStage;
  index: number;
  startMs: number;
  seconds: number;
  breathsPerMinute: number;
  segments: readonly PacerSegment[];
};

export type PacerState = {
  stage: PacerStage;
  cue: BreathCue;
  cueProgress: number;
  fullness: number;
  cycleIndex: number;
  cycleProgress: number;
  cycleSeconds: number;
  breathsPerMinute: number;
  amplitude: number;
  stillness: number;
  arc: number;
  elapsedMs: number;
};

export const ARRIVE_CYCLES = 1;
export const SIGH_CYCLES = 5;
export const SLOW_START_BREATHS_PER_MINUTE = 7.5;
export const RESONANCE_BREATHS_PER_MINUTE = 5.5;
export const MIN_SLOW_CYCLES = 8;
export const MAX_SLOW_CYCLES = 14;
export const STILL_FADE_SECONDS = 90;

const ARRIVE_BREATHS_PER_MINUTE = 10;
const GLIDE_PER_CYCLE = 0.045;
const FOLLOW_GATE = 0.6;
const FOLLOW_CYCLES_TO_SETTLE = 3;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function easeInOutSine(value: number): number {
  const bounded = clamp01(value);
  return 0.5 - Math.cos(Math.PI * bounded) * 0.5;
}

function easeOutSine(value: number): number {
  return Math.sin(clamp01(value) * Math.PI * 0.5);
}

function sumSeconds(segments: readonly PacerSegment[]): number {
  return segments.reduce((total, segment) => total + segment.seconds, 0);
}

function arriveSegments(): PacerSegment[] {
  const seconds = 60 / ARRIVE_BREATHS_PER_MINUTE;
  return [
    { cue: 'in', seconds: seconds * 0.5, from: 0, to: 1 },
    { cue: 'out', seconds: seconds * 0.5, from: 1, to: 0 },
  ];
}

function sighSegments(): PacerSegment[] {
  return [
    { cue: 'in', seconds: 1.7, from: 0, to: 0.72 },
    { cue: 'again', seconds: 1.1, from: 0.72, to: 1 },
    { cue: 'out', seconds: 6.4, from: 1, to: 0 },
    { cue: 'rest', seconds: 0.6, from: 0, to: 0 },
  ];
}

/** Inhale share of the cycle: near even when fast, four-to-six once slow. */
function inhaleShare(breathsPerMinute: number): number {
  const span = SLOW_START_BREATHS_PER_MINUTE - RESONANCE_BREATHS_PER_MINUTE;
  const slowness = span > 0
    ? clamp01((SLOW_START_BREATHS_PER_MINUTE - breathsPerMinute) / span)
    : 1;
  return 0.46 - slowness * 0.06;
}

function pacedSegments(breathsPerMinute: number): PacerSegment[] {
  const cycleSeconds = 60 / breathsPerMinute;
  // No holds: the evidence rewards slower, not held. The short rest only marks
  // the turn so the bell and the light have a clean edge.
  const rest = 0.25;
  const breathing = cycleSeconds - rest;
  const inhale = breathing * inhaleShare(breathsPerMinute);
  return [
    { cue: 'in', seconds: inhale, from: 0, to: 1 },
    { cue: 'out', seconds: breathing - inhale, from: 1, to: 0 },
    { cue: 'rest', seconds: rest, from: 0, to: 0 },
  ];
}

function segmentFullness(segment: PacerSegment, progress: number): number {
  const eased = segment.cue === 'again'
    ? easeOutSine(progress)
    : easeInOutSine(progress);
  return segment.from + (segment.to - segment.from) * eased;
}

export class BreathPacer {
  private readonly cycles: PacerCycle[] = [];
  private slowRate = SLOW_START_BREATHS_PER_MINUTE;
  private slowCycles = 0;
  private followedCycles = 0;
  private stillSinceMs: number | null = null;
  private cycleFollow = 0.5;
  private cycleFollowSamples = 0;
  private lastCycleIndex = -1;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.cycles.length = 0;
    this.slowRate = SLOW_START_BREATHS_PER_MINUTE;
    this.slowCycles = 0;
    this.followedCycles = 0;
    this.stillSinceMs = null;
    this.cycleFollow = 0.5;
    this.cycleFollowSamples = 0;
    this.lastCycleIndex = -1;
    this.cycles.push(this.planCycle(0, 0));
  }

  /**
   * @param elapsedMs session time
   * @param follow evidence that the sensed breath follows the light, 0..1, or
   *   null when no trustworthy breath signal exists. It only changes how fast
   *   the next cycles glide; it never judges the person.
   */
  update(elapsedMs: number, follow: number | null): PacerState {
    const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
    let cycle = this.cycles[this.cycles.length - 1]!;
    while (elapsed >= cycle.startMs + cycle.seconds * 1_000) {
      this.completeCycle(cycle);
      const next = this.planCycle(cycle.index + 1, cycle.startMs + cycle.seconds * 1_000);
      this.cycles.push(next);
      if (this.cycles.length > 4) this.cycles.shift();
      cycle = next;
    }
    if (cycle.index !== this.lastCycleIndex) {
      this.lastCycleIndex = cycle.index;
      this.cycleFollow = 0.5;
      this.cycleFollowSamples = 0;
    }
    if (follow !== null && Number.isFinite(follow)) {
      this.cycleFollowSamples += 1;
      this.cycleFollow += (clamp01(follow) - this.cycleFollow) / this.cycleFollowSamples;
    }

    const cycleElapsedSeconds = (elapsed - cycle.startMs) / 1_000;
    let segmentStart = 0;
    let segment = cycle.segments[cycle.segments.length - 1]!;
    let cueProgress = 1;
    for (const candidate of cycle.segments) {
      if (cycleElapsedSeconds < segmentStart + candidate.seconds) {
        segment = candidate;
        cueProgress = candidate.seconds > 0
          ? (cycleElapsedSeconds - segmentStart) / candidate.seconds
          : 1;
        break;
      }
      segmentStart += candidate.seconds;
    }

    const stillness = this.stillSinceMs === null
      ? 0
      : clamp01((elapsed - this.stillSinceMs) / (STILL_FADE_SECONDS * 1_000));
    const amplitude = 1 - stillness * 0.62;
    return {
      stage: cycle.stage,
      cue: segment.cue,
      cueProgress: clamp01(cueProgress),
      fullness: clamp01(segmentFullness(segment, cueProgress)),
      cycleIndex: cycle.index,
      cycleProgress: clamp01(cycleElapsedSeconds / cycle.seconds),
      cycleSeconds: cycle.seconds,
      breathsPerMinute: cycle.breathsPerMinute,
      amplitude,
      stillness,
      arc: this.arc(cycle, stillness),
      elapsedMs: elapsed,
    };
  }

  private completeCycle(cycle: PacerCycle): void {
    if (cycle.stage !== 'slow') return;
    this.slowCycles += 1;
    const follow = this.cycleFollowSamples > 0 ? this.cycleFollow : 0.5;
    this.followedCycles = follow >= FOLLOW_GATE ? this.followedCycles + 1 : 0;
    const glide = GLIDE_PER_CYCLE * (0.55 + follow * 0.45);
    this.slowRate = Math.max(RESONANCE_BREATHS_PER_MINUTE, this.slowRate * (1 - glide));
  }

  private planCycle(index: number, startMs: number): PacerCycle {
    if (index < ARRIVE_CYCLES) {
      const segments = arriveSegments();
      return {
        stage: 'arrive',
        index,
        startMs,
        seconds: sumSeconds(segments),
        breathsPerMinute: ARRIVE_BREATHS_PER_MINUTE,
        segments,
      };
    }
    if (index < ARRIVE_CYCLES + SIGH_CYCLES) {
      const segments = sighSegments();
      const seconds = sumSeconds(segments);
      return {
        stage: 'sigh',
        index,
        startMs,
        seconds,
        breathsPerMinute: 60 / seconds,
        segments,
      };
    }

    const atResonance = this.slowRate <= RESONANCE_BREATHS_PER_MINUTE + 0.3;
    const settled = this.slowCycles >= MIN_SLOW_CYCLES
      && atResonance
      && (this.followedCycles >= FOLLOW_CYCLES_TO_SETTLE || this.slowCycles >= MAX_SLOW_CYCLES);
    if (settled || this.stillSinceMs !== null) {
      this.stillSinceMs ??= startMs;
      const segments = pacedSegments(RESONANCE_BREATHS_PER_MINUTE);
      return {
        stage: 'still',
        index,
        startMs,
        seconds: sumSeconds(segments),
        breathsPerMinute: RESONANCE_BREATHS_PER_MINUTE,
        segments,
      };
    }

    const segments = pacedSegments(this.slowRate);
    return {
      stage: 'slow',
      index,
      startMs,
      seconds: sumSeconds(segments),
      breathsPerMinute: this.slowRate,
      segments,
    };
  }

  private arc(cycle: PacerCycle, stillness: number): number {
    if (cycle.stage === 'arrive') return 0.04;
    if (cycle.stage === 'sigh') {
      const sighIndex = cycle.index - ARRIVE_CYCLES;
      return 0.08 + (sighIndex / Math.max(1, SIGH_CYCLES)) * 0.22;
    }
    if (cycle.stage === 'slow') {
      const span = SLOW_START_BREATHS_PER_MINUTE - RESONANCE_BREATHS_PER_MINUTE;
      const glide = span > 0
        ? clamp01((SLOW_START_BREATHS_PER_MINUTE - cycle.breathsPerMinute) / span)
        : 1;
      const count = clamp01(this.slowCycles / MIN_SLOW_CYCLES);
      return 0.3 + Math.min(glide, count) * 0.42;
    }
    return 0.72 + stillness * 0.28;
  }
}
