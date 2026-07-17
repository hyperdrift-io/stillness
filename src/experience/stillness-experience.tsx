'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { trackEvent } from '../analytics/events.ts';
import { StillnessAudio } from '../audio/stillness-audio.ts';
import { neutralMirrorExpression } from '../sensing/mirror-signal.ts';
import { MirrorSignalAdapter } from '../sensing/mirror-signal-adapter.ts';
import { MotionSensor } from '../sensing/motion-sensor.ts';
import { BaselineStore } from '../state/baseline-store.ts';
import { SoulMirrorRenderer } from '../visual/soul-mirror-renderer.ts';
import { GuidancePolicy, type GuidanceCue } from './guidance-policy.ts';
import { SessionController, type SessionTelemetry } from './session-controller.ts';
import { SessionGuidance } from './session-guidance.tsx';
import { SessionMenu } from './session-menu.tsx';
import { SessionTransitions, type SessionToken } from './session-transitions.ts';
import {
  commandForKey,
  defaultSessionPreferences,
  type SessionPreferences,
} from './session-preferences.ts';

type ExperienceMode = 'ready' | 'starting' | 'calibrating' | 'active' | 'error';

const cameraUnavailableMessage = 'Pure is open. Mirror needs camera permission and can be enabled from ?.';
const CALIBRATION_DISPLAY_MS = 1_600;

const initialTelemetry: SessionTelemetry = {
  movement: 0,
  steadiness: 0,
  presence: 0,
  sensingQuality: 0,
  expressionActivity: 0,
  expression: neutralMirrorExpression,
  softness: 0,
  turbulence: 0,
  settling: 0,
  relief: 0,
  readiness: 0,
  confidence: 0,
  direction: 'holding',
  source: 'scripted',
};

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.matches('input, textarea, select'));
}

function mirrorProgressLabel(telemetry: SessionTelemetry): string {
  if (telemetry.source === 'scripted') return 'Finding a gentle rhythm';
  if (telemetry.readiness >= 0.68) return 'Readiness returning';
  if (telemetry.relief >= 0.68) return 'Stillness deepening';
  if (telemetry.relief >= 0.42) return 'Relief arriving';
  if (telemetry.direction === 'settling' || telemetry.softness >= 0.52) return 'Signals softening';
  return 'Meeting your rhythm';
}

export function StillnessExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<SessionController | null>(null);
  const controllerTokenRef = useRef<SessionToken | null>(null);
  const transitionsRef = useRef(new SessionTransitions());
  const guidancePolicyRef = useRef(new GuidancePolicy());
  const baselineRef = useRef(new BaselineStore());
  const [mode, setMode] = useState<ExperienceMode>('ready');
  const [message, setMessage] = useState('');
  const [preferences, setPreferences] = useState<SessionPreferences>(() => ({
    ...defaultSessionPreferences,
  }));
  const [telemetry, setTelemetry] = useState<SessionTelemetry>(initialTelemetry);
  const [cue, setCue] = useState<GuidanceCue | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(true);

  const fallBackToPure = useCallback((token: SessionToken | null = controllerTokenRef.current) => {
    if (token !== null && !transitionsRef.current.owns(token)) return;
    setPreferences((current) => ({
      ...current,
      mode: 'pure',
      camera: false,
    }));
    setMessage(cameraUnavailableMessage);
  }, []);

  const leave = useCallback((): Promise<void> => {
    const controller = controllerRef.current;
    const token = controllerTokenRef.current;
    if (controller === null || token === null) return Promise.resolve();

    const elapsedSeconds = Math.round(controller.snapshot().elapsedMs / 1_000);
    return transitionsRef.current.leave(token, () => controller.stop(), () => {
      if (controllerTokenRef.current === token) {
        controllerRef.current = null;
        controllerTokenRef.current = null;
      }
      guidancePolicyRef.current.reset();
      setTelemetry(initialTelemetry);
      setCue(null);
      setMenuOpen(false);
      setAudioAvailable(true);
      setMode('ready');
      setMessage('');
      trackEvent('session_ended', { elapsed_seconds: elapsedSeconds });
    });
  }, []);

  const togglePreference = useCallback((
    preference: keyof SessionPreferences,
    enabled: boolean | SessionPreferences['mode'],
  ) => {
    if (preference === 'mode') {
      const nextMode = enabled === 'mirror' ? 'mirror' : 'pure';
      setPreferences((current) => ({
        ...current,
        mode: nextMode,
        camera: nextMode === 'mirror',
      }));
      trackEvent('session_preference_changed', { preference, enabled: nextMode });
      if (nextMode === 'pure') void controllerRef.current?.setCameraEnabled(false);
      if (nextMode === 'mirror') {
        const token = controllerTokenRef.current;
        void controllerRef.current?.setCameraEnabled(true).then((available) => {
          if (!available) fallBackToPure(token);
        });
      }
      return;
    }

    const nextEnabled = Boolean(enabled);
    setPreferences((current) => ({
      ...current,
      [preference]: nextEnabled,
      ...(preference === 'camera' ? { mode: nextEnabled ? 'mirror' : 'pure' } : {}),
    }));
    trackEvent('session_preference_changed', { preference, enabled: nextEnabled });

    if (preference === 'sound') {
      const controller = controllerRef.current;
      const token = controllerTokenRef.current;
      void controller?.setSoundEnabled(nextEnabled).then((available) => {
        if (token !== null && transitionsRef.current.owns(token)) {
          setAudioAvailable(available);
        }
      });
    } else if (preference === 'camera') {
      const token = controllerTokenRef.current;
      void controllerRef.current?.setCameraEnabled(nextEnabled).then((available) => {
        if (nextEnabled && !available) fallBackToPure(token);
      });
    } else if (preference === 'guidance') {
      if (nextEnabled) {
        guidancePolicyRef.current.reset();
        const elapsedMs = controllerRef.current?.snapshot().elapsedMs ?? 0;
        setCue(guidancePolicyRef.current.evaluate(telemetry, elapsedMs));
      } else {
        setCue(null);
      }
    }
  }, [fallBackToPure, telemetry]);

  useEffect(() => {
    const localDevelopment = window.location.hostname === 'localhost'
      || window.location.hostname === '127.0.0.1';
    if ('serviceWorker' in navigator && !localDevelopment) {
      void navigator.serviceWorker.register('/sw.js').then(async () => {
        const registration = await navigator.serviceWorker.ready;
        const urls = performance.getEntriesByType('resource')
          .map((entry) => new URL(entry.name))
          .filter((url) => url.origin === window.location.origin)
          .map((url) => `${url.pathname}${url.search}`);
        registration.active?.postMessage({ type: 'CACHE_URLS', urls });
      }).catch(() => {
        // The experience remains available online when registration is blocked.
      });
    } else if ('serviceWorker' in navigator && localDevelopment) {
      void navigator.serviceWorker.getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {});
    }
    return () => {
      const controller = controllerRef.current;
      const token = controllerTokenRef.current;
      if (token !== null) transitionsRef.current.invalidate(token);
      controllerRef.current = null;
      controllerTokenRef.current = null;
      void controller?.stop();
    };
  }, []);

  useEffect(() => {
    if (mode !== 'active') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (menuOpen) {
          setMenuOpen(false);
        } else {
          void leave();
        }
        return;
      }

      const command = commandForKey({
        key: event.key,
        modifier: event.altKey || event.ctrlKey || event.metaKey,
        editable: isEditableTarget(event.target),
      });
      if (command === null) return;
      event.preventDefault();

      switch (command) {
        case 'menu':
          setMenuOpen((open) => !open);
          break;
        case 'sound':
          togglePreference('sound', !preferences.sound);
          break;
        case 'guidance':
          togglePreference('guidance', !preferences.guidance);
          break;
        case 'signals':
          if (!menuOpen) {
            togglePreference('liveSignals', true);
            setMenuOpen(true);
          } else {
            togglePreference('liveSignals', !preferences.liveSignals);
          }
          break;
        case 'camera':
          togglePreference('camera', !preferences.camera);
          break;
      }
    };
    const onVisibilityChange = () => {
      void controllerRef.current?.setHidden(document.hidden);
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [leave, menuOpen, mode, preferences, togglePreference]);

  async function begin(): Promise<void> {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const token = transitionsRef.current.begin();
    if (token === null) return;

    setMode('starting');
    setMessage('');
    guidancePolicyRef.current.reset();
    setTelemetry(initialTelemetry);
    setCue(null);
    setMenuOpen(false);
    setAudioAvailable(true);

    let controller: SessionController | null = null;
    try {
      const camera = new MirrorSignalAdapter();
      controller = new SessionController({
        renderer: new SoulMirrorRenderer(canvas),
        audio: new StillnessAudio(),
        camera,
        motion: new MotionSensor(),
        baseline: baselineRef.current,
        now: () => performance.now(),
        requestFrame: (callback) => requestAnimationFrame(callback),
        cancelFrame: (handle) => cancelAnimationFrame(handle),
        onTelemetry: (nextTelemetry) => {
          if (!transitionsRef.current.owns(token) || controller === null) return;
          setTelemetry(nextTelemetry);
          setCue(guidancePolicyRef.current.evaluate(
            nextTelemetry,
            controller.snapshot().elapsedMs,
          ));
        },
      });
      controllerRef.current = controller;
      controllerTokenRef.current = token;

      if (!preferences.camera || preferences.mode === 'pure') void controller.setCameraEnabled(false);
      const startResult = await controller.start();
      if (!transitionsRef.current.owns(token)) {
        await controller.stop();
        return;
      }
      const requestedCamera = preferences.camera && preferences.mode === 'mirror';
      const startedPreferences = requestedCamera && !startResult.cameraStarted
        ? { ...preferences, mode: 'pure' as const, camera: false }
        : preferences;
      if (requestedCamera && !startResult.cameraStarted) fallBackToPure(token);
      const available = await controller.setSoundEnabled(preferences.sound);
      setMode('calibrating');
      setMessage(startedPreferences.camera
        ? 'Calibrating the mirror. Let your face settle into the field.'
        : 'Camera was not available. Opening the pure reset.');
      globalThis.setTimeout(() => {
        if (!transitionsRef.current.owns(token)) return;
        transitionsRef.current.activate(token, () => {
          setAudioAvailable(available);
          setMode('active');
          setMessage('');
          trackEvent('session_started', {
            mode: startedPreferences.mode,
            guidance: preferences.guidance,
            sound: preferences.sound,
            camera: startedPreferences.camera,
          });
        });
      }, startedPreferences.camera ? CALIBRATION_DISPLAY_MS : 650);
    } catch {
      await controller?.stop();
      transitionsRef.current.fail(token, () => {
        if (controllerTokenRef.current === token) {
          controllerRef.current = null;
          controllerTokenRef.current = null;
        }
        setMessage('This browser could not open the soul mirror. A current browser can open it.');
        setMode('error');
      });
    }
  }

  return (
    <div className="experience" data-mode={mode} data-testid="stillness-experience">
      <canvas className="light-field" ref={canvasRef} aria-hidden="true" />

      <section
        className="entry-panel"
        aria-labelledby="stillness-title"
        aria-hidden={mode === 'active'}
        inert={mode === 'active' ? true : undefined}
      >
        <div className="entry-presence" aria-hidden="true" />
        <div className="entry-copy">
          <p className="eyebrow">Relief</p>
          <h1 id="stillness-title">Reset now.</h1>
          <p>
            Open a private mirror that turns your live image into a quiet field,
            then helps you return with more room.
          </p>
          <div className="entry-actions">
            <button
              className="primary"
              type="button"
              onClick={() => void begin()}
              disabled={mode !== 'ready'}
            >
              {mode === 'starting'
                ? 'Allow camera'
                : mode === 'calibrating'
                  ? 'Calibrating'
                  : 'Start reset'}
            </button>
            <label className="guided-toggle">
              <input
                type="checkbox"
                checked={preferences.guidance}
                disabled={mode !== 'ready'}
                onChange={(event) => setPreferences((current) => ({
                  ...current,
                  guidance: event.currentTarget.checked,
                }))}
              />
              <span>Guided mode</span>
            </label>
          </div>
          <p className="mode-note">Camera stays on this device. Guided starts off. Press <kbd>?</kbd> inside to adjust.</p>
          {message ? <p className="system-message" role="status">{message}</p> : null}
        </div>
      </section>

      {mode === 'active' ? (
        <>
          {preferences.mode === 'mirror' ? (
            <p className="mirror-progress" aria-live="polite">
              {mirrorProgressLabel(telemetry)}
            </p>
          ) : null}
          <SessionGuidance cue={cue} visible={preferences.guidance} />
          <button
            ref={menuTriggerRef}
            className="session-menu-trigger"
            type="button"
            aria-label="Adjust session"
            onClick={() => setMenuOpen(true)}
          >
            <span aria-hidden="true">?</span> adjust session
          </button>
          <SessionMenu
            preferences={preferences}
            telemetry={telemetry}
            audioAvailable={audioAvailable}
            open={menuOpen}
            triggerRef={menuTriggerRef}
            onToggle={togglePreference}
            onClose={() => setMenuOpen(false)}
            onLeave={() => void leave()}
          />
        </>
      ) : null}
      <p className="visually-hidden" aria-live="polite">
        {mode === 'active' ? 'The experience has begun. Press Escape to leave.' : ''}
      </p>
    </div>
  );
}
