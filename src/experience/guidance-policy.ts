import type { SessionTelemetry } from './session-controller.ts';

const MIN_CUE_MS = 7_000;
const OPENING_WINDOW_MS = 26_000;
const ACTIVE_MOVEMENT = 0.58;
const QUIET_MOVEMENT = 0.2;
const STEADY_LEVEL = 0.7;

type GuidanceCueKey =
  | 'active'
  | 'settling'
  | 'steady'
  | 'quiet'
  | 'changing'
  | 'scripted';

export type GuidanceCue = {
  id: GuidanceCueKey;
  label: string;
  invitation: string;
  explanation: string;
};

const CUES: Record<GuidanceCueKey, GuidanceCue> = {
  active: {
    id: 'active',
    label: 'Movement has energy',
    invitation: 'Let your hands become heavy for one breath.',
    explanation: 'The field is holding more energy while movement stays active.',
  },
  settling: {
    id: 'settling',
    label: 'Movement is settling',
    invitation: 'Let the next exhale take a little longer.',
    explanation: 'The field is making more space as movement becomes steadier.',
  },
  steady: {
    id: 'steady',
    label: 'A steadier rhythm is forming',
    invitation: 'Soften your gaze toward the center.',
    explanation: 'The field is smoothing into a more even rhythm.',
  },
  quiet: {
    id: 'quiet',
    label: 'The field has become quieter',
    invitation: 'Notice the space after the next breath.',
    explanation: 'The field is reducing detail as movement stays quiet.',
  },
  changing: {
    id: 'changing',
    label: 'The rhythm is changing',
    invitation: 'Let the field meet the change; nothing needs correcting.',
    explanation: 'The field is widening to meet the change.',
  },
  scripted: {
    id: 'scripted',
    label: 'Following a gentle rhythm',
    invitation: 'Unclench the jaw and allow the shoulders to drop.',
    explanation: 'The field is following its gentle descent while sensing is unavailable.',
  },
};

function cueKeyFor(telemetry: SessionTelemetry): GuidanceCueKey {
  if (telemetry.source === 'scripted') return 'scripted';
  if (telemetry.direction === 'settling') return 'settling';
  if (telemetry.direction === 'rising') return 'changing';
  if (telemetry.movement >= ACTIVE_MOVEMENT) return 'active';
  if (telemetry.movement <= QUIET_MOVEMENT && telemetry.steadiness >= STEADY_LEVEL) {
    return 'quiet';
  }
  return 'steady';
}

export class GuidancePolicy {
  private currentKey: GuidanceCueKey | null = null;
  private shownAtMs = 0;

  evaluate(telemetry: SessionTelemetry, elapsedMs: number): GuidanceCue | null {
    const nextKey = cueKeyFor(telemetry);

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
