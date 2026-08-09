import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

import type { SessionTelemetry } from './session-controller.ts';
import type {
  SessionPreferences,
  SessionTuning,
  SoundMode,
} from './session-preferences.ts';

type TelemetryDirection = SessionTelemetry['direction'];
type TelemetrySource = SessionTelemetry['source'];
type Preference = 'mode' | 'soundMode' | 'liveSignals' | 'camera' | 'visualControl';
type PreferenceValue = boolean | SessionPreferences['mode'] | SessionPreferences['visualControl'] | SoundMode;
type DialogLifecycle = Pick<HTMLDialogElement, 'close' | 'open'>;
type FocusTarget = Pick<HTMLElement, 'focus'>;

type SessionMenuProps = {
  preferences: SessionPreferences;
  telemetry: SessionTelemetry;
  audioAvailable: boolean;
  musicAvailable: boolean;
  cameraAvailable: boolean;
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

export function breathingLabel(
  value: number,
  confidence: number,
): 'learning' | 'forming' | 'regular' {
  if (confidence < 0.35) return 'learning';
  if (value < 0.65) return 'forming';
  return 'regular';
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
  musicAvailable,
  cameraAvailable,
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
        {preferences.camera && !cameraAvailable ? (
          <div className="camera-reconnect">
            <small>Camera is paused. Reconnect when you’re ready.</small>
            <button type="button" className="menu-action" onClick={() => onToggle('camera', true)}>
              Reconnect camera
            </button>
          </div>
        ) : null}
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

      <fieldset>
        <legend>Sound</legend>
        {([
          ['off', 'Off'],
          ['waves', 'Gentle waves'],
          ['music', 'Local album · shuffled'],
        ] as const satisfies readonly (readonly [SoundMode, string])[]).map(([mode, label]) => (
          <label key={mode}>
            <input
              type="radio"
              name="sound-mode"
              value={mode}
              checked={preferences.soundMode === mode}
              disabled={!audioAvailable || (mode === 'music' && !musicAvailable)}
              aria-describedby={mode === 'music' ? 'music-stream-description' : undefined}
              onChange={() => onToggle('soundMode', mode)}
            />
            <span>{label}</span>
            {mode === 'waves' ? <kbd aria-label="Keyboard shortcut M">M</kbd> : null}
          </label>
        ))}
        {!audioAvailable ? <small>Sound is unavailable in this browser.</small> : null}
        <small id="music-stream-description">
          {musicAvailable
            ? 'Tracks stream in random order at half speed with a bass lift. Their beat moves the field while colour travels through the spectrum.'
            : 'The album stream is not configured on this server.'}
        </small>
      </fieldset>

      {preferences.liveSignals ? (
        <section aria-labelledby="live-signals-title">
          <h3 id="live-signals-title">Live signals</h3>
          {[
            ['movement', 'Movement', telemetry.movement, movementLabel(telemetry.movement, telemetry.direction)],
            ['head-turn', 'Head turn', telemetry.headTurn ?? 0, expressionChannelLabel(telemetry.headTurn ?? 0)],
            ['expression', 'Expression signals', telemetry.expressionActivity, expressionLabel(telemetry.expressionActivity)],
            ['mouth', 'Mouth movement', telemetry.expression.mouthOpen, expressionChannelLabel(telemetry.expression.mouthOpen)],
            ['brow', 'Brow movement', telemetry.expression.browLift, expressionChannelLabel(telemetry.expression.browLift)],
            ['eyes', 'Eye movement', telemetry.expression.eyeClosure, expressionChannelLabel(telemetry.expression.eyeClosure)],
            ['warmth', 'Facial warmth', telemetry.expression.mouthSmile, expressionChannelLabel(telemetry.expression.mouthSmile)],
            ['facial-release', 'Facial softening', 1 - (telemetry.facialTension ?? (1 - telemetry.softness)), steadinessLabel(1 - (telemetry.facialTension ?? (1 - telemetry.softness)))],
            ['breathing', 'Breathing rhythm', telemetry.breathRegularity ?? 0, breathingLabel(telemetry.breathRegularity ?? 0, telemetry.breathConfidence ?? 0)],
            ['coherence', 'Signal coherence', telemetry.temporalCoherence ?? telemetry.steadiness, steadinessLabel(telemetry.temporalCoherence ?? telemetry.steadiness)],
            ['presence', 'Face signal', telemetry.presence, presenceLabel(telemetry.presence, telemetry.source)],
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
        Camera and motion signals stay in memory on this device, then are discarded. Album playback is analysed only in this browser. Nothing is uploaded.
      </p>
      <button type="button" className="text-action" onClick={onLeave}>
        Leave experience
      </button>
    </dialog>
  );
}
