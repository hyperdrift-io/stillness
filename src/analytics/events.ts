type StillnessEvent = 'session_started' | 'session_ended' | 'session_preference_changed';

type EventProperties = Record<string, string | boolean | number>;

declare global {
  interface Window {
    gtag?: (command: 'event', name: string, properties?: EventProperties) => void;
  }
}

export function trackEvent(name: StillnessEvent, properties?: EventProperties): void {
  window.gtag?.('event', name, properties);
}
