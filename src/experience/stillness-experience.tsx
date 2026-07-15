'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { StillnessAudio } from '../audio/stillness-audio.ts';
import { CameraSensor } from '../sensing/camera-sensor.ts';
import { MotionSensor } from '../sensing/motion-sensor.ts';
import { BaselineStore } from '../state/baseline-store.ts';
import { LightFieldRenderer } from '../visual/light-field-renderer.ts';
import { SessionController } from './session-controller.ts';

type ExperienceMode = 'ready' | 'starting' | 'active' | 'error';

export function StillnessExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controllerRef = useRef<SessionController | null>(null);
  const baselineRef = useRef(new BaselineStore());
  const [mode, setMode] = useState<ExperienceMode>('ready');
  const [message, setMessage] = useState('');

  const leave = useCallback(async () => {
    const controller = controllerRef.current;
    controllerRef.current = null;
    try {
      if (controller) await controller.stop();
    } finally {
      setMode('ready');
      setMessage('');
    }
  }, []);

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
      if (event.key === 'Escape') void leave();
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
  }, [leave, mode]);

  async function begin(): Promise<void> {
    const canvas = canvasRef.current;
    if (!canvas || mode === 'starting' || mode === 'active') return;
    setMode('starting');
    setMessage('');

    const controller = new SessionController({
      renderer: new LightFieldRenderer(canvas),
      audio: new StillnessAudio(),
      camera: new CameraSensor(),
      motion: new MotionSensor(),
      baseline: baselineRef.current,
      now: () => performance.now(),
      requestFrame: (callback) => requestAnimationFrame(callback),
      cancelFrame: (handle) => cancelAnimationFrame(handle),
    });
    controllerRef.current = controller;

    try {
      await controller.start();
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
            A private audiovisual experience that meets your present rhythm and
            gradually makes space for quiet.
          </p>
          <button
            className="primary"
            type="button"
            onClick={() => void begin()}
            disabled={mode === 'starting'}
          >
            {mode === 'starting' ? 'Opening' : 'Begin'}
          </button>
          <p className="privacy-note">Camera sensing is optional and stays on this device.</p>
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
        <button className="exit-session" type="button" onClick={() => void leave()}>
          Leave experience
        </button>
      ) : null}
      <p className="visually-hidden" aria-live="polite">
        {mode === 'active' ? 'The experience has begun. Press Escape to leave.' : ''}
      </p>
    </div>
  );
}
