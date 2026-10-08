import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { SessionTelemetry } from './session-controller.ts';
import type { SessionPreferences } from './session-preferences.ts';

type Preference = 'sound' | 'liveSignals' | 'camera';
type DialogLifecycle = Pick<HTMLDialogElement, 'close' | 'open'>;
type FocusTarget = Pick<HTMLElement, 'focus'>;

type SessionMenuProps = {
  preferences: SessionPreferences;
  telemetry: SessionTelemetry | null;
  audioAvailable: boolean;
  cameraAvailable: boolean;
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  onToggle: (preference: Preference, enabled: boolean) => void;
  onClose: () => void;
  onLeave: () => void;
};

export function movementLabel(
  value: number,
  direction: SessionTelemetry['direction'],
): 'active' | 'settling' | 'quiet' {
  if (value <= 0.2) return 'quiet';
  if (direction === 'settling') return 'settling';
  return 'active';
}

export function steadinessLabel(value: number): 'changing' | 'forming' | 'steady' {
  if (value < 0.35) return 'changing';
  if (value < 0.7) return 'forming';
  return 'steady';
}

export function presenceLabel(
  value: number,
  source: SessionTelemetry['source'],
): 'unavailable' | 'limited' | 'present' {
  if (source === 'light') return 'unavailable';
  if (value < 0.4) return 'limited';
  return 'present';
}

export function expressionLabel(value: number): 'soft' | 'moving' | 'active' {
  if (value < 0.18) return 'soft';
  if (value < 0.52) return 'moving';
  return 'active';
}

export function breathingLabel(
  sensedBreathsPerMinute: number | null,
  lightBreathsPerMinute: number,
): 'learning' | 'finding the light' | 'with the light' {
  if (sensedBreathsPerMinute === null) return 'learning';
  const closeness = 1 - Math.abs(sensedBreathsPerMinute - lightBreathsPerMinute) / (lightBreathsPerMinute * 0.5);
  return closeness >= 0.6 ? 'with the light' : 'finding the light';
}

export function closeOpenDialogAndRestoreFocus(
  dialog: DialogLifecycle | null,
  trigger: FocusTarget | null,
): void {
  if (dialog === null || !dialog.open) return;
  dialog.close();
  trigger?.focus();
}

export function SessionMenu({
  preferences,
  telemetry,
  audioAvailable,
  cameraAvailable,
  open,
  triggerRef,
  onToggle,
  onClose,
  onLeave,
}: SessionMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    return () => {
      closeOpenDialogAndRestoreFocus(dialog, triggerRef.current);
    };
  }, [open, triggerRef]);

  const signals = telemetry
    ? [
      ['movement', 'Movement', telemetry.movement, movementLabel(telemetry.movement, telemetry.direction)],
      ['expression', 'Expression signals', telemetry.expressionActivity, expressionLabel(telemetry.expressionActivity)],
      ['softening', 'Facial softening', 1 - telemetry.facialTension, steadinessLabel(1 - telemetry.facialTension)],
      ['breathing', 'Breathing', telemetry.breathConfidence, breathingLabel(telemetry.sensedBreathsPerMinute, telemetry.pacer.breathsPerMinute)],
      ['presence', 'Face signal', telemetry.presence, presenceLabel(telemetry.presence, telemetry.source)],
    ] as const
    : [];

  return (
    <dialog
      ref={dialogRef}
      className="session-menu"
      aria-labelledby="session-menu-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => triggerRef.current?.focus()}
    >
      <header>
        <h2 id="session-menu-title">Session</h2>
        <button type="button" className="quiet" onClick={onClose} aria-label="Close session options">
          Close
        </button>
      </header>

      <fieldset>
        <legend>Adjust</legend>
        <label>
          <input
            type="checkbox"
            role="switch"
            checked={preferences.sound}
            disabled={!audioAvailable}
            onChange={(event) => onToggle('sound', event.currentTarget.checked)}
          />
          <span>Sound</span>
          <kbd aria-label="Keyboard shortcut M">M</kbd>
        </label>
        <label>
          <input
            type="checkbox"
            role="switch"
            checked={preferences.camera}
            onChange={(event) => onToggle('camera', event.currentTarget.checked)}
          />
          <span>Camera sensing</span>
          <kbd aria-label="Keyboard shortcut C">C</kbd>
        </label>
        {preferences.camera && !cameraAvailable ? (
          <div className="camera-reconnect">
            <small>Camera is paused. Reconnect when you are ready.</small>
            <button type="button" className="menu-action" onClick={() => onToggle('camera', true)}>
              Reconnect camera
            </button>
          </div>
        ) : null}
        <label>
          <input
            type="checkbox"
            role="switch"
            checked={preferences.liveSignals}
            onChange={(event) => onToggle('liveSignals', event.currentTarget.checked)}
          />
          <span>Live signals</span>
          <kbd aria-label="Keyboard shortcut D">D</kbd>
        </label>
        {!audioAvailable ? <small>Sound is unavailable in this browser.</small> : null}
      </fieldset>

      {preferences.liveSignals && telemetry ? (
        <section aria-labelledby="live-signals-title">
          <h3 id="live-signals-title">Live signals</h3>
          <p>
            <span id="live-signal-light-name">Light</span>
            <meter
              className="signal-meter"
              min="0"
              max="1"
              value={telemetry.pacer.fullness}
              aria-labelledby="live-signal-light-name"
              aria-describedby="live-signal-light-state"
            >
              Light
            </meter>
            <span id="live-signal-light-state">
              {Math.round(telemetry.pacer.breathsPerMinute * 10) / 10} a minute
            </span>
          </p>
          {signals.map(([id, name, value, state]) => (
            <p key={id}>
              <span id={`live-signal-${id}-name`}>{name}</span>
              <meter
                className="signal-meter"
                min="0"
                max="1"
                value={Number(value)}
                aria-labelledby={`live-signal-${id}-name`}
                aria-describedby={`live-signal-${id}-state`}
              >
                {name}
              </meter>
              <span id={`live-signal-${id}-state`}>{state}</span>
            </p>
          ))}
        </section>
      ) : null}

      <p className="privacy-note">
        Camera and motion signals stay in memory on this device, then are discarded. The sound is generated here. Nothing is uploaded.
      </p>
      <button type="button" className="text-action" onClick={onLeave}>
        Leave
      </button>
    </dialog>
  );
}
