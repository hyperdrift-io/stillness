'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { StillnessAudio } from '../audio/stillness-audio.ts';
import { CameraSensor } from '../sensing/camera-sensor.ts';
import { MotionSensor } from '../sensing/motion-sensor.ts';
import { BaselineStore } from '../state/baseline-store.ts';
import { LightFieldRenderer } from '../visual/light-field-renderer.ts';
import { GuidancePolicy, type GuidanceCue } from './guidance-policy.ts';
import { SessionController, type SessionTelemetry } from './session-controller.ts';
import { SessionGuidance } from './session-guidance.tsx';
import { SessionMenu } from './session-menu.tsx';
import {
  commandForKey,
  defaultSessionPreferences,
  type SessionPreferences,
} from './session-preferences.ts';

type ExperienceMode = 'ready' | 'starting' | 'active' | 'error';

const initialTelemetry: SessionTelemetry = {
  movement: 0,
  steadiness: 0,
  presence: 0,
  sensingQuality: 0,
  direction: 'holding',
  source: 'scripted',
};

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.matches('input, textarea, select'));
}

export function StillnessExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<SessionController | null>(null);
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

  const leave = useCallback(async () => {
    const controller = controllerRef.current;
    controllerRef.current = null;
    try {
      if (controller) await controller.stop();
    } finally {
      guidancePolicyRef.current.reset();
      setTelemetry(initialTelemetry);
      setCue(null);
      setMenuOpen(false);
      setAudioAvailable(true);
      setMode('ready');
      setMessage('');
    }
  }, []);

  const togglePreference = useCallback((
    preference: keyof SessionPreferences,
    enabled: boolean,
  ) => {
    setPreferences((current) => ({ ...current, [preference]: enabled }));

    if (preference === 'sound') {
      void controllerRef.current?.setSoundEnabled(enabled).then((available) => {
        setAudioAvailable(available);
      });
    } else if (preference === 'camera') {
      void controllerRef.current?.setCameraEnabled(enabled);
    } else if (preference === 'guidance') {
      if (enabled) {
        guidancePolicyRef.current.reset();
        const elapsedMs = controllerRef.current?.snapshot().elapsedMs ?? 0;
        setCue(guidancePolicyRef.current.evaluate(telemetry, elapsedMs));
      } else {
        setCue(null);
      }
    }
  }, [telemetry]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
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
    }
    return () => {
      void controllerRef.current?.stop();
      controllerRef.current = null;
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
    if (!canvas || mode === 'starting' || mode === 'active') return;
    setMode('starting');
    setMessage('');
    guidancePolicyRef.current.reset();
    setTelemetry(initialTelemetry);
    setCue(null);
    setMenuOpen(false);
    setAudioAvailable(true);

    const controller = new SessionController({
      renderer: new LightFieldRenderer(canvas),
      audio: new StillnessAudio(),
      camera: new CameraSensor(),
      motion: new MotionSensor(),
      baseline: baselineRef.current,
      now: () => performance.now(),
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (handle) => cancelAnimationFrame(handle),
      onTelemetry: (nextTelemetry) => {
        setTelemetry(nextTelemetry);
        setCue(guidancePolicyRef.current.evaluate(
          nextTelemetry,
          controller.snapshot().elapsedMs,
        ));
      },
    });
    controllerRef.current = controller;

    try {
      if (!preferences.camera) void controller.setCameraEnabled(false);
      await controller.start();
      setAudioAvailable(await controller.setSoundEnabled(preferences.sound));
      setMode('active');
    } catch {
      await controller.stop();
      controllerRef.current = null;
      setMessage('This browser could not create the light field. A current browser with WebGL2 can open it.');
      setMode('error');
    }
  }

  async function clearCalibration(): Promise<void> {
    try {
      await baselineRef.current.clear();
      setMessage('Local calibration cleared. Your next session can begin fresh.');
    } catch {
      setMessage('This browser could not clear local calibration. You can still begin normally.');
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
          <p className="eyebrow">Stillness</p>
          <h1 id="stillness-title">Let the noise disappear.</h1>
          <p>
            Camera and motion sensing meet your present rhythm while everything stays
            private on this device.
          </p>
          <label className="mode-choice">
            <input
              type="checkbox"
              checked={preferences.guidance}
              onChange={(event) => setPreferences((current) => ({
                ...current,
                guidance: event.currentTarget.checked,
              }))}
            />
            <span>Guide me into stillness</span>
          </label>
          <p className="mode-note">
            Turn guidance off for an uninterrupted Pure session.
          </p>
          <button
            className="primary"
            type="button"
            onClick={() => void begin()}
            disabled={mode === 'starting'}
          >
            {mode === 'starting' ? 'Opening' : 'Begin'}
          </button>
          <p className="session-note">
            Soothing sound begins with the experience. Press <kbd>?</kbd> anytime to adjust
            guidance, sound, live signals, or camera sensing.
          </p>
          <details>
            <summary>Privacy</summary>
            <p>
              Frames and motion samples are processed in memory. Nothing is recorded or
              sent away. Only aggregate calibration remains on this device.
            </p>
            <button className="quiet" type="button" onClick={() => void clearCalibration()}>
              Clear local calibration
            </button>
          </details>
          {message ? <p className="system-message" role="status">{message}</p> : null}
        </div>
      </section>

      {mode === 'active' ? (
        <>
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
