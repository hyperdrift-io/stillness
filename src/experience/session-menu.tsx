import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { SessionTelemetry } from './session-controller.ts';
import type { SessionPreferences, SessionTuning } from './session-preferences.ts';

type TelemetryDirection = SessionTelemetry['direction'];
type TelemetrySource = SessionTelemetry['source'];
type Preference = 'mode' | 'sound' | 'liveSignals' | 'camera' | 'visualControl';
type PreferenceValue = boolean | SessionPreferences['mode'] | SessionPreferences['visualControl'];
type DialogLifecycle = Pick<HTMLDialogElement, 'close' | 'open'>;
type FocusTarget = Pick<HTMLElement, 'focus'>;

type SessionMenuProps = {
  preferences: SessionPreferences;
  telemetry: SessionTelemetry;
  audioAvailable: boolean;
  open: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  onToggle: (preference: Preference, enabled: PreferenceValue) => void;
  onTuningChange: <Key extends keyof SessionTuning>(key: Key, value: SessionTuning[Key]) => void;
  onNextVariation: () => void;
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

export function expressionLabel(value: number): 'soft' | 'moving' | 'active' {
  if (value < 0.18) return 'soft';
  if (value < 0.52) return 'moving';
  return 'active';
}

export function expressionChannelLabel(value: number): 'quiet' | 'visible' | 'driving' {
  if (value < 0.14) return 'quiet';
  if (value < 0.48) return 'visible';
  return 'driving';
}

export function reliefLabel(value: number): 'forming' | 'arriving' | 'clear' {
  if (value < 0.35) return 'forming';
  if (value < 0.72) return 'arriving';
  return 'clear';
}

export function readinessLabel(value: number): 'restoring' | 'returning' | 'readying' {
  if (value < 0.35) return 'restoring';
  if (value < 0.72) return 'returning';
  return 'readying';
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
  onNextVariation,
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
            checked={preferences.mode === 'guided'}
            onChange={(event) => onToggle('mode', event.currentTarget.checked ? 'guided' : 'pure')}
          />
          <span>Guided mode</span>
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
        <button type="button" className="menu-action" onClick={onNextVariation}>
          <span>Next visual</span>
          <kbd aria-label="Keyboard shortcut V">V</kbd>
        </button>
        <label>
          <input
            type="checkbox"
            role="switch"
            checked={preferences.visualControl === 'auto'}
            onChange={(event) => onToggle('visualControl', event.currentTarget.checked ? 'auto' : 'locked')}
          />
          <span>Automatic visual cycle</span>
        </label>
      </fieldset>

      {preferences.liveSignals ? (
        <section aria-labelledby="live-signals-title">
          <h3 id="live-signals-title">Live signals</h3>
          {[
            ['movement', 'Movement', telemetry.movement, movementLabel(telemetry.movement, telemetry.direction)],
            ['expression', 'Expression signals', telemetry.expressionActivity, expressionLabel(telemetry.expressionActivity)],
            ['mouth-open', 'Mouth opening', telemetry.expression.mouthOpen, expressionChannelLabel(telemetry.expression.mouthOpen)],
            ['mouth-smile', 'Mouth lift', telemetry.expression.mouthSmile, expressionChannelLabel(telemetry.expression.mouthSmile)],
            ['brow-lift', 'Brow lift', telemetry.expression.browLift, expressionChannelLabel(telemetry.expression.browLift)],
            ['brow-tension', 'Brow tension', telemetry.expression.browTension, expressionChannelLabel(telemetry.expression.browTension)],
            ['eye-closure', 'Eye closure', telemetry.expression.eyeClosure, expressionChannelLabel(telemetry.expression.eyeClosure)],
            ['turbulence', 'Turbulence', telemetry.turbulence, telemetry.direction === 'rising' ? 'rising' : 'settling'],
            ['settling', 'Settling', telemetry.settling, steadinessLabel(telemetry.settling)],
            ['relief', 'Relief', telemetry.relief, reliefLabel(telemetry.relief)],
            ['readiness', 'Readiness', telemetry.readiness, readinessLabel(telemetry.readiness)],
            ['signal', 'Signal', telemetry.confidence, sensingLabel(telemetry.confidence, telemetry.source)],
          ].map(([id, name, value, state]) => (
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
        Camera, audio, and motion signals are processed only in memory on this device, then discarded. Nothing is saved or sent.
      </p>
      <button type="button" className="text-action" onClick={onLeave}>
        Leave experience
      </button>
    </dialog>
  );
}
