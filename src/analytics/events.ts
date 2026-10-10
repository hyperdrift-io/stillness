type StillnessEvent =
  | 'session_started'
  | 'session_ended'
  | 'session_preference_changed'
  | 'stage_reached'
  | 'shared'
  | 'research_opened';

type EventProperties = Record<string, string | boolean | number>;

type PostHogLike = { capture: (event: string, properties?: EventProperties) => void };

/** PostHog capture when the snippet is loaded; a silent no-op otherwise. Analytics never breaks the page. */
export function trackEvent(name: StillnessEvent, properties?: EventProperties): void {
  if (typeof window === 'undefined') return;
  try {
    (window as Window & { posthog?: PostHogLike }).posthog?.capture(name, properties);
  } catch {
    // ignore
  }
}
