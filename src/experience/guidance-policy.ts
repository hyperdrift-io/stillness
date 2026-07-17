import type { SessionTelemetry } from './session-controller.ts';

const MIN_CUE_MS = 7_000;
const OPENING_WINDOW_MS = 26_000;

type GuidanceCueKey =
  | 'arrive'
  | 'active'
  | 'softening'
  | 'relief'
  | 'restore'
  | 'return'
  | 'scripted';

export type GuidanceCue = {
  id: GuidanceCueKey;
  label: string;
  invitation: string;
  explanation: string;
};

const CUES: Record<GuidanceCueKey, GuidanceCue> = {
  arrive: {
    id: 'arrive',
    label: 'Mirror forming',
    invitation: 'Arrive here for one breath.',
    explanation: 'The field is learning your starting rhythm on this device.',
  },
  active: {
    id: 'active',
    label: 'Movement has energy',
    invitation: 'Let your jaw release for one breath.',
    explanation: 'The mirror becomes more coherent as movement and expression signals soften.',
  },
  softening: {
    id: 'softening',
    label: 'Signals are softening',
    invitation: 'Let the next exhale take a little longer.',
    explanation: 'The field is opening as turbulence settles.',
  },
  relief: {
    id: 'relief',
    label: 'Relief is arriving',
    invitation: 'Rest in the space that is opening.',
    explanation: 'The mirror is responding to steadier movement and softer expression signals.',
  },
  restore: {
    id: 'restore',
    label: 'Restoration is forming',
    invitation: 'Soften your gaze or close your eyes for a few breaths.',
    explanation: 'Sound can carry the reset while the field keeps breathing with you.',
  },
  return: {
    id: 'return',
    label: 'Readiness is returning',
    invitation: 'Notice what feels easier to meet now.',
    explanation: 'Relief came first; readiness is building from that steadier base.',
  },
  scripted: {
    id: 'scripted',
    label: 'Following a gentle rhythm',
    invitation: 'Unclench the jaw and allow the shoulders to drop.',
    explanation: 'The field is guiding a reset while sensing is limited.',
  },
};

function cueKeyFor(telemetry: SessionTelemetry, elapsedMs: number): GuidanceCueKey {
  if (telemetry.source === 'scripted') return 'scripted';
  if (elapsedMs < 12_000) return 'arrive';
  if (telemetry.readiness >= 0.68) return 'return';
  if (telemetry.relief >= 0.68) return 'restore';
  if (telemetry.relief >= 0.42) return 'relief';
  if (telemetry.direction === 'settling' || telemetry.softness >= 0.52) return 'softening';
  return 'active';
}

export class GuidancePolicy {
  private currentKey: GuidanceCueKey | null = null;
  private shownAtMs = 0;

  evaluate(telemetry: SessionTelemetry, elapsedMs: number): GuidanceCue | null {
    const nextKey = cueKeyFor(telemetry, elapsedMs);

    if (this.currentKey === null) {
      this.currentKey = nextKey;
      this.shownAtMs = elapsedMs;
      return CUES[nextKey];
    }

    if (elapsedMs - this.shownAtMs < MIN_CUE_MS) return CUES[this.currentKey];

    if (nextKey !== this.currentKey) {
      this.currentKey = nextKey;
      this.shownAtMs = elapsedMs;
      return CUES[nextKey];
    }

    if (elapsedMs > OPENING_WINDOW_MS) return null;
    return CUES[this.currentKey];
  }

  reset(): void {
    this.currentKey = null;
    this.shownAtMs = 0;
  }
}
