import { trackEvent } from '../analytics/events.ts';

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

const SITE = 'https://stillness.hyperdrift.io';

/** The app's own door, tagged so PostHog can count visits that came from a share. */
export function shareUrl(): string {
  return `${SITE}/?utm_source=stillness-share&utm_medium=share`;
}

export const shareLine = 'Breathe with the light. A few minutes that slow the breath to a calm pace.';

/** Native share sheet where the device has one; otherwise the link goes to the clipboard. */
export async function shareStillness(surface: 'session' | 'close' | 'after'): Promise<ShareOutcome> {
  const url = shareUrl();
  const data = { title: 'Stillness', text: shareLine, url };
  let outcome: ShareOutcome = 'failed';
  try {
    if (typeof navigator.share === 'function' && (!navigator.canShare || navigator.canShare(data))) {
      await navigator.share(data);
      outcome = 'shared';
    }
  } catch (error) {
    // Dismissing the share sheet must not write to the clipboard.
    if (error instanceof Error && error.name === 'AbortError') outcome = 'cancelled';
  }
  if (outcome === 'failed') {
    try {
      await navigator.clipboard.writeText(url);
      outcome = 'copied';
    } catch {
      // The after panel keeps a visible link when the clipboard is unavailable.
    }
  }
  trackEvent('shared', { outcome, surface });
  return outcome;
}

/** Full screen is part of the immersion; browsers that refuse it (iPhone) simply stay windowed. */
export function enterFullscreen(): void {
  const root = document.documentElement;
  if (document.fullscreenElement || typeof root.requestFullscreen !== 'function') return;
  try {
    void root.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  } catch {
    // Not available on this device.
  }
}

export function leaveFullscreen(): void {
  if (!document.fullscreenElement || typeof document.exitFullscreen !== 'function') return;
  void document.exitFullscreen().catch(() => {});
}
