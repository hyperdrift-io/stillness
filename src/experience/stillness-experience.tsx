'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { trackEvent } from '../analytics/events.ts';
import { BreathSoundscape } from '../audio/breath-soundscape.ts';
import { MotionSensor } from '../sensing/motion-sensor.ts';
import { PerceptionAdapter } from '../sensing/perception-adapter.ts';
import { BaselineStore } from '../state/baseline-store.ts';
import { SoulMirrorRenderer } from '../visual/soul-mirror-renderer.ts';
import type { AdaptiveVisualControlFrame } from '../visual/adaptive-visual-state.ts';
import type { PacerStage } from './breath-pacer.ts';
import {
  SessionController,
  type SessionSummary,
  type SessionTelemetry,
} from './session-controller.ts';
import { cueWords, minutesLabel, observationLines } from './session-copy.ts';
import { SessionMenu } from './session-menu.tsx';
import { SessionTransitions, type SessionToken } from './session-transitions.ts';
import {
  commandForKey,
  defaultSessionPreferences,
  type SessionPreferences,
} from './session-preferences.ts';

type ExperienceMode = 'ready' | 'starting' | 'active' | 'after' | 'error';
type FeltState = 'lighter' | 'same' | 'tense';

const cameraUnavailableMessage = 'Camera sensing is unavailable. The light carries the reset on its own.';
const AMBIENT_CYCLE_MS = 10_000;

const ambientVisualFrame: AdaptiveVisualControlFrame = {
  scene: 'release',
  sceneMix: 1,
  progress: 0.72,
  movementEnergy: 0.035,
  movementX: 0,
  movementY: 0,
  faceConfidence: 0,
  faceCenterX: 0.5,
  faceCenterY: 0.5,
  faceScale: 0,
  headYaw: 0,
  headPitch: 0,
  headRoll: 0,
  facialTension: 0,
  facialWarmth: 0,
  expressiveActivation: 0,
  mouthOpen: 0,
  browLift: 0,
  eyeClosure: 0,
  breathPhase: 0,
  breathConfidence: 0,
  coherence: 0.82,
  breathFullness: 0,
  breathAmplitude: 0.5,
  stillness: 0,
  palette: {
    shadow: [0, 0, 0],
    mid: [0.025, 0.075, 0.09],
    light: [0.62, 0.76, 0.78],
    confidence: 0,
  },
  topologySegments: new Float32Array(),
  colorInfluence: 0.2,
  visualIntensity: 0.76,
  transitionSeconds: 4.5,
  requestedQuality: 'auto',
  variationSeed: 0,
  reducedMotion: false,
};

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.matches('input, textarea, select'));
}

export function StillnessExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<SessionController | null>(null);
  const audioRef = useRef<BreathSoundscape | null>(null);
  const rendererRef = useRef<SoulMirrorRenderer | null>(null);
  const controllerTokenRef = useRef<SessionToken | null>(null);
  const cameraRequestRef = useRef(0);
  const transitionsRef = useRef(new SessionTransitions());
  const baselineRef = useRef(new BaselineStore());
  const stageStartCycleRef = useRef<{ stage: PacerStage; cycle: number }>({ stage: 'arrive', cycle: 0 });
  const [mode, setMode] = useState<ExperienceMode>('ready');
  const [message, setMessage] = useState('');
  const [preferences, setPreferences] = useState<SessionPreferences>(() => ({
    ...defaultSessionPreferences,
  }));
  const [telemetry, setTelemetry] = useState<SessionTelemetry | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [audioAvailable, setAudioAvailable] = useState(true);
  const [cameraAvailable, setCameraAvailable] = useState(true);
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [felt, setFelt] = useState<FeltState | null>(null);

  if (audioRef.current === null) {
    audioRef.current = new BreathSoundscape(defaultSessionPreferences.sound);
  }

  const reportUnavailableCamera = useCallback((
    token: SessionToken | null = controllerTokenRef.current,
    cameraRequest: number = cameraRequestRef.current,
  ) => {
    if (token !== null && !transitionsRef.current.owns(token)) return;
    if (cameraRequest !== cameraRequestRef.current) return;
    setCameraAvailable(false);
    setMessage(cameraUnavailableMessage);
  }, []);

  const ambientFrame = useCallback((nowMs: number): AdaptiveVisualControlFrame => {
    const phase = (nowMs % AMBIENT_CYCLE_MS) / AMBIENT_CYCLE_MS;
    return {
      ...ambientVisualFrame,
      breathFullness: 0.5 - Math.cos(phase * Math.PI * 2) * 0.5,
      requestedQuality: preferences.tuning.quality,
      visualIntensity: preferences.tuning.visualIntensity * ambientVisualFrame.visualIntensity,
    };
  }, [preferences.tuning.quality, preferences.tuning.visualIntensity]);

  const startAmbientField = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const existingRenderer = rendererRef.current;
    const renderer = existingRenderer ?? new SoulMirrorRenderer(canvas);
    try {
      renderer.setVariation(0, true);
      renderer.update(ambientFrame(performance.now()));
      renderer.start();
      rendererRef.current = renderer;
    } catch {
      if (existingRenderer === null) renderer.dispose();
      rendererRef.current = null;
    }
  }, [ambientFrame]);

  const leave = useCallback((): Promise<void> => {
    const controller = controllerRef.current;
    const token = controllerTokenRef.current;
    if (controller === null || token === null) return Promise.resolve();

    const sessionSummary = controller.summary();
    return transitionsRef.current.leave(token, () => controller.stop(), () => {
      cameraRequestRef.current += 1;
      if (controllerTokenRef.current === token) {
        controllerRef.current = null;
        controllerTokenRef.current = null;
      }
      setTelemetry(null);
      setMenuOpen(false);
      setAudioAvailable(true);
      setCameraAvailable(true);
      setSummary(sessionSummary);
      setFelt(null);
      setMode('after');
      setMessage('');
      trackEvent('session_ended', {
        elapsed_seconds: sessionSummary.elapsedSeconds,
        stage: sessionSummary.stage,
        sensed: sessionSummary.sensed,
        breath_start: sessionSummary.breathsPerMinute.start ?? -1,
        breath_end: sessionSummary.breathsPerMinute.end ?? -1,
        heart_start: sessionSummary.heartBeatsPerMinute.start ?? -1,
        heart_end: sessionSummary.heartBeatsPerMinute.end ?? -1,
        movement_start: sessionSummary.movement.start ?? -1,
        movement_end: sessionSummary.movement.end ?? -1,
        tension_start: sessionSummary.tension.start ?? -1,
        tension_end: sessionSummary.tension.end ?? -1,
      });
    });
  }, []);

  const togglePreference = useCallback((
    preference: 'sound' | 'liveSignals' | 'camera',
    enabled: boolean,
  ) => {
    if (preference === 'sound') {
      const controller = controllerRef.current;
      const token = controllerTokenRef.current;
      setPreferences((current) => ({ ...current, sound: enabled }));
      trackEvent('session_preference_changed', { preference, enabled });
      if (!controller || token === null) return;
      void controller.setSoundEnabled(enabled).then((available) => {
        if (!transitionsRef.current.owns(token)) return;
        if (!available) {
          setAudioAvailable(false);
          setMessage('Sound is unavailable in this browser.');
        }
      });
      return;
    }

    setPreferences((current) => ({ ...current, [preference]: enabled }));
    trackEvent('session_preference_changed', { preference, enabled });

    if (preference === 'camera') {
      const token = controllerTokenRef.current;
      const cameraRequest = ++cameraRequestRef.current;
      const controller = controllerRef.current;
      setCameraAvailable(false);
      setMessage(enabled ? 'Reconnecting the private mirror.' : '');
      void controller?.setCameraEnabled(enabled).then((available) => {
        if (cameraRequest !== cameraRequestRef.current) return;
        if (enabled && !available && !controller.isCameraEnabled()) {
          reportUnavailableCamera(token, cameraRequest);
        }
        if (enabled && available) {
          setCameraAvailable(true);
          setMessage('');
        }
      });
    }
  }, [reportUnavailableCamera]);

  const recordFeltState = useCallback((value: FeltState) => {
    setFelt(value);
    trackEvent('felt_state', { value, elapsed_seconds: summary?.elapsedSeconds ?? 0 });
  }, [summary]);

  useEffect(() => {
    if (mode !== 'ready' && mode !== 'after' && mode !== 'error') return;
    startAmbientField();
    let handle = 0;
    const breathe = (nowMs: number) => {
      rendererRef.current?.update(ambientFrame(nowMs));
      handle = requestAnimationFrame(breathe);
    };
    handle = requestAnimationFrame(breathe);
    return () => cancelAnimationFrame(handle);
  }, [ambientFrame, mode, startAmbientField]);

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
      cameraRequestRef.current += 1;
      controllerRef.current = null;
      controllerTokenRef.current = null;
      void controller?.stop();
      if (controller === null) {
        rendererRef.current?.dispose();
        audioRef.current?.dispose();
      }
      rendererRef.current = null;
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
    const cameraRequest = ++cameraRequestRef.current;

    setMode('starting');
    setMessage('');
    setTelemetry(null);
    setMenuOpen(false);
    setAudioAvailable(true);
    setCameraAvailable(preferences.camera);
    setSummary(null);
    setFelt(null);
    stageStartCycleRef.current = { stage: 'arrive', cycle: 0 };

    let controller: SessionController | null = null;
    try {
      const camera = new PerceptionAdapter();
      const renderer = rendererRef.current ?? new SoulMirrorRenderer(canvas);
      renderer.setVariation(0, true);
      rendererRef.current = renderer;
      const audio = audioRef.current ?? new BreathSoundscape(preferences.sound);
      audioRef.current = audio;
      void audio.setEnabled(preferences.sound);
      controller = new SessionController({
        renderer,
        audio,
        camera,
        motion: new MotionSensor(),
        baseline: baselineRef.current,
        now: () => performance.now(),
        requestFrame: (callback) => requestAnimationFrame(callback),
        cancelFrame: (handle) => cancelAnimationFrame(handle),
        onTelemetry: (nextTelemetry) => {
          if (!transitionsRef.current.owns(token) || controller === null) return;
          const stage = nextTelemetry.pacer.stage;
          if (stage !== stageStartCycleRef.current.stage) {
            stageStartCycleRef.current = { stage, cycle: nextTelemetry.pacer.cycleIndex };
            trackEvent('stage_reached', {
              stage,
              elapsed_seconds: Math.round(nextTelemetry.pacer.elapsedMs / 1_000),
            });
          }
          setTelemetry(nextTelemetry);
        },
        onCameraAvailabilityChange: (available) => {
          if (available) {
            setCameraAvailable(true);
            setMessage('');
          } else {
            reportUnavailableCamera(token, cameraRequestRef.current);
          }
        },
      });
      controller.setTuning(preferences.tuning);
      controllerRef.current = controller;
      controllerTokenRef.current = token;

      if (!preferences.camera) void controller.setCameraEnabled(false);
      setMessage(preferences.camera
        ? 'Opening the private mirror on this device.'
        : 'Opening the light.');
      const startResult = await controller.start();
      if (!transitionsRef.current.owns(token)) {
        await controller.stop();
        return;
      }
      if (preferences.camera && !startResult.cameraStarted) {
        reportUnavailableCamera(token, cameraRequest);
      } else if (startResult.cameraStarted) {
        setCameraAvailable(true);
      }
      const soundAvailable = controller.isAudioAvailable();
      transitionsRef.current.activate(token, () => {
        setAudioAvailable(soundAvailable);
        setMode('active');
        if (startResult.cameraStarted || !preferences.camera) setMessage('');
        trackEvent('session_started', {
          sound: soundAvailable && preferences.sound,
          camera: startResult.cameraStarted,
        });
      });
    } catch {
      await controller?.stop();
      transitionsRef.current.fail(token, () => {
        if (controllerTokenRef.current === token) {
          controllerRef.current = null;
          controllerTokenRef.current = null;
        }
        setMessage('This browser could not open the light. A current browser can.');
        setMode('error');
      });
    }
  }

  const cue = telemetry
    ? cueWords(telemetry.pacer, stageStartCycleRef.current.cycle)
    : '';
  const panelVisible = mode !== 'active';
  const observations = summary ? observationLines(summary) : [];

  return (
    <div className="experience" data-mode={mode} data-testid="stillness-experience">
      <canvas className="light-field" ref={canvasRef} aria-hidden="true" />

      <section
        className="entry-panel"
        data-panel={mode === 'after' ? 'after' : 'entry'}
        aria-labelledby="stillness-title"
        aria-hidden={!panelVisible}
        inert={panelVisible ? undefined : true}
      >
        {mode === 'after' && summary ? (
          <div className="entry-copy">
            <p className="eyebrow">Stillness</p>
            <h1 id="stillness-title">The slow breath is yours now.</h1>
            <ul className="observations" aria-label="What the light observed">
              {observations.map((line) => <li key={line}>{line}</li>)}
            </ul>
            {felt === null ? (
              <fieldset className="felt-state">
                <legend>How do you feel?</legend>
                <button type="button" onClick={() => recordFeltState('lighter')}>Lighter</button>
                <button type="button" onClick={() => recordFeltState('same')}>About the same</button>
                <button type="button" onClick={() => recordFeltState('tense')}>Still tense</button>
              </fieldset>
            ) : (
              <p className="mode-note" role="status">
                {felt === 'tense'
                  ? 'Thank you. A second round often goes deeper; the light is here whenever you want it.'
                  : `Thank you. ${minutesLabel(summary.elapsedSeconds)} well spent.`}
              </p>
            )}
            <div className="entry-actions">
              <button className="primary" type="button" onClick={() => void begin()}>
                Begin again
              </button>
            </div>
          </div>
        ) : (
          <div className="entry-copy">
            <p className="eyebrow">Stillness</p>
            <h1 id="stillness-title">Breathe with the light.</h1>
            <p>A few minutes. The light slows, you follow, and the noise thins out.</p>
            <div className="entry-actions">
              <button
                className="primary"
                type="button"
                onClick={() => void begin()}
                disabled={mode === 'starting'}
              >
                {mode === 'starting' ? 'Opening' : 'Begin'}
              </button>
            </div>
            <p className="mode-note">Sound on. Camera stays on this device. Nothing is saved or sent.</p>
            {message ? <p className="system-message" role="status">{message}</p> : null}
          </div>
        )}
      </section>

      {mode === 'active' ? (
        <>
          <p
            key={`${telemetry?.pacer.cycleIndex ?? 0}-${telemetry?.pacer.cue ?? 'rest'}`}
            className="breath-cue"
            data-cue={telemetry?.pacer.cue ?? 'rest'}
            data-stage={telemetry?.pacer.stage ?? 'arrive'}
            aria-live="polite"
          >
            {cue}
          </p>
          {message ? <p className="session-message" role="status">{message}</p> : null}
          <button
            ref={menuTriggerRef}
            className="session-menu-trigger"
            type="button"
            aria-label="Adjust session"
            onClick={() => setMenuOpen(true)}
          >
            <span aria-hidden="true">?</span>
          </button>
          <SessionMenu
            preferences={preferences}
            telemetry={telemetry}
            audioAvailable={audioAvailable}
            cameraAvailable={cameraAvailable}
            open={menuOpen}
            triggerRef={menuTriggerRef}
            onToggle={togglePreference}
            onClose={() => setMenuOpen(false)}
            onLeave={() => void leave()}
          />
        </>
      ) : null}
      <p className="visually-hidden" aria-live="polite">
        {mode === 'active' ? 'The light is breathing. Press Escape to leave.' : ''}
      </p>
    </div>
  );
}
