import type { PacerState } from './breath-pacer.ts';
import type { SessionSummary } from './session-controller.ts';

/**
 * The few words the session shows. The light is the instruction; words only
 * teach the mapping in the first breaths and mark the two turns of the arc.
 * Every line follows meta/PHILOSOPHY.md section 8: it leaves the person more
 * capable, never smaller.
 */

const TEACHING_CYCLES = 4;

export function cueWords(pacer: PacerState, stageStartCycle: number): string {
  if (pacer.cycleIndex < TEACHING_CYCLES) {
    if (pacer.cue === 'in') return 'breathe in';
    if (pacer.cue === 'again') return 'and again';
    if (pacer.cue === 'out') return 'let it go';
    return '';
  }
  const firstCycleOfStage = pacer.cycleIndex === stageStartCycle;
  if (pacer.stage === 'slow' && firstCycleOfStage) return 'slower now';
  if (pacer.stage === 'still' && firstCycleOfStage) return 'stay as long as you like';
  return '';
}

function roundRate(value: number): number {
  return Math.max(1, Math.round(value));
}

/** Plain observations, strengths first; a missing signal is a limit of the scan, never a failing. */
export function observationLines(summary: SessionSummary): string[] {
  const lines: string[] = [];
  const breath = summary.breathsPerMinute;
  if (breath.start !== null && breath.end !== null) {
    const start = roundRate(breath.start);
    const end = roundRate(breath.end);
    if (end < start) {
      lines.push(`Your breathing slowed from ${start} to ${end} a minute.`);
    } else {
      lines.push(`Your breathing held near ${end} a minute.`);
    }
  }
  const movement = summary.movement;
  if (movement.start !== null && movement.end !== null) {
    if (movement.end < movement.start * 0.75) lines.push('Your movement settled.');
    else if (movement.end < 0.2) lines.push('You stayed very still.');
  }
  const tension = summary.tension;
  if (tension.start !== null && tension.end !== null && tension.end < tension.start - 0.04) {
    lines.push('Your brow softened.');
  }
  if (lines.length === 0) {
    const light = roundRate(summary.lightBreathsPerMinute || 6);
    lines.push(`The light reached ${light} breaths a minute. The pace is yours to keep.`);
  }
  return lines;
}

export function minutesLabel(elapsedSeconds: number): string {
  const minutes = Math.max(1, Math.round(elapsedSeconds / 60));
  return minutes === 1 ? 'one minute' : `${minutes} minutes`;
}
