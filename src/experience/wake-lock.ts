/**
 * Keeps the screen lit while a session runs, so the phone does not dim mid-breath.
 * The browser drops the lock whenever the page is hidden; it is asked for again when
 * the page comes back. Devices without the Screen Wake Lock API (insecure origins,
 * some home-screen web apps) simply follow their own display timeout.
 * Returns the release, safe to call more than once.
 */
export function keepScreenAwake(): () => void {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return () => {};

  let held = true;
  let sentinel: WakeLockSentinel | null = null;

  const request = () => {
    if (!held || document.visibilityState !== 'visible') return;
    if (sentinel !== null && !sentinel.released) return;
    try {
      void navigator.wakeLock.request('screen').then((lock) => {
        if (held) {
          sentinel = lock;
        } else {
          void lock.release().catch(() => {});
        }
      }).catch(() => {});
    } catch {
      // Refused (battery saver, permissions policy); the display keeps its own timeout.
    }
  };

  document.addEventListener('visibilitychange', request);
  request();

  return () => {
    if (!held) return;
    held = false;
    document.removeEventListener('visibilitychange', request);
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}
