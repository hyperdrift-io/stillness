import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { SessionTelemetry } from './session-controller.ts';
import type { SessionPreferences } from './session-preferences.ts';

type TelemetryDirection = SessionTelemetry['direction'];
type TelemetrySource = SessionTelemetry['source'];
type Preference = keyof SessionPreferences;
type DialogLifecycle = Pick<HTMLDialogElement, 'close' | 'open'>;
type FocusTarget = Pick<HTMLElement, 'focus'>;

type SessionMenuProps = {
  preferences: SessionPreferences;
  telemetry: SessionTelemetry;
  audioAvailable: boolean;
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  onToggle: (preference: Preference, enabled: boolean) => void;
  onClose: () => void;
  onLeave: () => void;
};

export function movementLabel(
  value: number,
  direction: TelemetryDirection,
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
  source: TelemetrySource,
): 'unavailable' | 'limited' | 'present' {
  if (source === 'scripted') return 'unavailable';
  if (value < 0.4) return 'limited';
  return 'present';
}

export function sensingLabel(
  value: number,
  source: TelemetrySource,
): 'unavailable' | 'limited' | 'clear' {
  if (source === 'scripted') return 'unavailable';
  if (value < 0.5) return 'limited';
  return 'clear';
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
        <h2 id="session-menu-title">Session options</h2>
        <button type="button" className="quiet" onClick={onClose} aria-label="Close session options">
          Close
        </button>
      </header>

      <fieldset>
        <legend>Experience</legend>
        <label>
          <input
            type="checkbox"
            role="switch"
            checked={preferences.guidance}
            onChange={(event) => onToggle('guidance', event.currentTarget.checked)}
          />
          <span>Guidance</span>
          <kbd aria-label="Keyboard shortcut G">G</kbd>
        </label>
        <label>
          <input
            type="checkbox"
            role="switch"
            checked={preferences.sound}
            disabled={!audioAvailable}
            aria-describedby={!audioAvailable ? 'sound-unavailable' : undefined}
            onChange={(event) => onToggle('sound', event.currentTarget.checked)}
          />
          <span>Soothing sound</span>
          <kbd aria-label="Keyboard shortcut M">M</kbd>
        </label>
        {!audioAvailable ? <small id="sound-unavailable">Sound is unavailable in this browser.</small> : null}
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
      </fieldset>

      {preferences.liveSignals ? (
        <section aria-labelledby="live-signals-title">
          <h3 id="live-signals-title">Live signals</h3>
          <p>
            <span id="movement-metric-name">Movement</span>
            <meter
              className="signal-meter"
              min="0"
              max="1"
              aria-labelledby="movement-metric-name"
              aria-describedby="movement-metric-state"
              value={telemetry.movement}
            >
              Movement
            </meter>
            <span id="movement-metric-state">
              {movementLabel(telemetry.movement, telemetry.direction)}
            </span>
          </p>
          <p>
            <span id="steadiness-metric-name">Steadiness</span>
            <meter
              className="signal-meter"
              min="0"
              max="1"
              aria-labelledby="steadiness-metric-name"
              aria-describedby="steadiness-metric-state"
              value={telemetry.steadiness}
            >
              Steadiness
            </meter>
            <span id="steadiness-metric-state">{steadinessLabel(telemetry.steadiness)}</span>
          </p>
          <p>
            <span id="presence-metric-name">Presence</span>
            <meter
              className="signal-meter"
              min="0"
              max="1"
              aria-labelledby="presence-metric-name"
              aria-describedby="presence-metric-state"
              value={telemetry.presence}
            >
              Presence
            </meter>
            <span id="presence-metric-state">
              {presenceLabel(telemetry.presence, telemetry.source)}
            </span>
          </p>
          <p>
            <span id="sensing-metric-name">Sensing</span>
            <meter
              className="signal-meter"
              min="0"
              max="1"
              aria-labelledby="sensing-metric-name"
              aria-describedby="sensing-metric-state"
              value={telemetry.sensingQuality}
            >
              Sensing
            </meter>
            <span id="sensing-metric-state">
              {sensingLabel(telemetry.sensingQuality, telemetry.source)}
            </span>
          </p>
        </section>
      ) : null}

      <p className="privacy-note">
        Camera, audio, and motion signals are processed only in memory on this device, then discarded. Nothing is saved or sent.
      </p>
      <button type="button" className="text-action" onClick={onLeave}>
        Leave experience
      </button>
    </dialog>
  );
}
