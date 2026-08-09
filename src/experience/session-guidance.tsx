import type { GuidanceCue } from './guidance-policy.ts';

type SessionGuidanceProps = {
  cue: GuidanceCue | null;
  visible: boolean;
};

export function SessionGuidance({ cue, visible }: SessionGuidanceProps) {
  if (!visible || cue === null) return null;

  return (
    <section
      className="session-guidance"
      data-cue={cue.id}
      aria-live="polite"
      aria-atomic="true"
    >
      <p className="visually-hidden">{cue.label}</p>
      <h2>{cue.invitation}</h2>
      <p className="visually-hidden">{cue.explanation}</p>
    </section>
  );
}
