'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { trackEvent } from '../analytics/events.ts';
import { StillnessAudio } from '../audio/stillness-audio.ts';
import { neutralMirrorExpression } from '../sensing/mirror-signal.ts';
import { MotionSensor } from '../sensing/motion-sensor.ts';
import { PerceptionAdapter } from '../sensing/perception-adapter.ts';
import { BaselineStore } from '../state/baseline-store.ts';
import { SoulMirrorRenderer } from '../visual/soul-mirror-renderer.ts';
import type { AdaptiveVisualControlFrame } from '../visual/adaptive-visual-state.ts';
import { GuidancePolicy, type GuidanceCue } from './guidance-policy.ts';
import { SessionController, type SessionTelemetry } from './session-controller.ts';
import { SessionGuidance } from './session-guidance.tsx';
import { SessionMenu } from './session-menu.tsx';
import { SessionTransitions, type SessionToken } from './session-transitions.ts';
import {
  commandForKey,
  defaultSessionPreferences,
  type SessionPreferences,
  type SessionTuning,
} from './session-preferences.ts';

type ExperienceMode = 'ready' | 'starting' | 'calibrating' | 'active' | 'error';

const cameraUnavailableMessage = 'Camera sensing is unavailable. The reset can continue with available signals.';

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

const initialTelemetry: SessionTelemetry = {
  movement: 0,
  steadiness: 0,
  presence: 0,
  sensingQuality: 0,
  expressionActivity: 0,
  headTurn: 0,
  expression: neutralMirrorExpression,
  softness: 0,
  turbulence: 0,
  settling: 0,
  relief: 0,
  readiness: 0,
  confidence: 0,
  breathRegularity: 0,
  breathConfidence: 0,
  temporalCoherence: 0,
  facialTension: 0,
  calibrationPhase: 'framing',
  calibrationProgress: 0,
  scene: 'turbulence',
  contributions: {
    movement: { value: 0, confidence: 0, configuredWeight: 0.3, effectiveWeight: 0 },
    breathing: { value: 0, confidence: 0, configuredWeight: 0.25, effectiveWeight: 0 },
    facialRelease: { value: 0, confidence: 0, configuredWeight: 0.25, effectiveWeight: 0 },
    coherence: { value: 0, confidence: 0, configuredWeight: 0.2, effectiveWeight: 0 },
  },
  direction: 'holding',
  source: 'scripted',
};

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && (target.isContentEditable || target.matches('input, textarea, select'));
}

function mirrorProgressLabel(telemetry: SessionTelemetry): string {
  if (telemetry.source === 'scripted') return 'A gentle rhythm is opening';
  if (telemetry.sensingQuality < 0.25) return 'The field is finding your signal';
  if (telemetry.direction === 'rising' && telemetry.turbulence >= 0.45) {
    return 'The field is active · lengthen the exhale';
  }
  if (telemetry.direction === 'settling') {
    return telemetry.relief >= 0.68
      ? 'The clearing is widening · stay with this'
      : 'The clearing is opening · stay with this';
  }
  if (telemetry.readiness >= 0.68) return 'Clear and ready when you are';
  if (telemetry.relief >= 0.68) return 'More space is opening';
  if (telemetry.expressionActivity >= 0.42 || telemetry.movement >= 0.42) {
    return 'Energy rising · soften the jaw';
  }
  return 'The light is steady · let the exhale lengthen';
}

export function StillnessExperience() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const controllerRef = useRef<SessionController | null>(null);
  const rendererRef = useRef<SoulMirrorRenderer | null>(null);
  const controllerTokenRef = useRef<SessionToken | null>(null);
  const cameraRequestRef = useRef(0);
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
  const [cameraAvailable, setCameraAvailable] = useState(true);

  const reportUnavailableCamera = useCallback((
    token: SessionToken | null = controllerTokenRef.current,
    cameraRequest: number = cameraRequestRef.current,
  ) => {
    if (token !== null && !transitionsRef.current.owns(token)) return;
    if (cameraRequest !== cameraRequestRef.current) return;
    setCameraAvailable(false);
    setMessage(cameraUnavailableMessage);
  }, []);

  const startAmbientField = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const existingRenderer = rendererRef.current;
    const renderer = existingRenderer ?? new SoulMirrorRenderer(canvas);
    try {
      renderer.setVariation(
        preferences.variationSeed,
        preferences.visualControl === 'auto',
      );
      renderer.update({
        ...ambientVisualFrame,
        variationSeed: preferences.variationSeed,
        requestedQuality: preferences.tuning.quality,
        visualIntensity: preferences.tuning.visualIntensity * ambientVisualFrame.visualIntensity,
      });
      renderer.start();
      rendererRef.current = renderer;
    } catch {
      if (existingRenderer === null) renderer.dispose();
      rendererRef.current = null;
    }
  }, [preferences.tuning.quality, preferences.tuning.visualIntensity, preferences.variationSeed, preferences.visualControl]);

  const leave = useCallback((): Promise<void> => {
    const controller = controllerRef.current;
    const token = controllerTokenRef.current;
    if (controller === null || token === null) return Promise.resolve();

    const elapsedSeconds = Math.round(controller.snapshot().elapsedMs / 1_000);
    return transitionsRef.current.leave(token, () => controller.stop(), () => {
      cameraRequestRef.current += 1;
      if (controllerTokenRef.current === token) {
        controllerRef.current = null;
        controllerTokenRef.current = null;
      }
      guidancePolicyRef.current.reset();
      setTelemetry(initialTelemetry);
      setCue(null);
      setMenuOpen(false);
      setAudioAvailable(true);
      setCameraAvailable(true);
      setMode('ready');
      setMessage('');
      trackEvent('session_ended', { elapsed_seconds: elapsedSeconds });
    });
  }, []);

  const togglePreference = useCallback((
    preference: 'mode' | 'vocal' | 'liveSignals' | 'camera' | 'visualControl',
    enabled: boolean | SessionPreferences['mode'] | SessionPreferences['visualControl'],
  ) => {
    if (preference === 'mode') {
      const nextMode = enabled === 'guided' ? 'guided' : 'pure';
      setPreferences((current) => ({ ...current, mode: nextMode }));
      trackEvent('session_preference_changed', { preference, enabled: nextMode });
      if (nextMode === 'guided') {
        guidancePolicyRef.current.reset();
        const elapsedMs = controllerRef.current?.snapshot().elapsedMs ?? 0;
        setCue(guidancePolicyRef.current.evaluate(telemetry, elapsedMs));
      } else {
        setCue(null);
      }
      return;
    }

    if (preference === 'visualControl') {
      const visualControl = enabled === 'locked' ? 'locked' : 'auto';
      setPreferences((current) => ({ ...current, visualControl }));
      trackEvent('session_preference_changed', { preference, enabled: visualControl });
      return;
    }

    const nextEnabled = Boolean(enabled);
    setPreferences((current) => ({ ...current, [preference]: nextEnabled }));
    trackEvent('session_preference_changed', { preference, enabled: nextEnabled });

    if (preference === 'vocal') {
      const controller = controllerRef.current;
      const token = controllerTokenRef.current;
      controller?.setVocalEnabled(nextEnabled);
      void controller?.setVocalAudible(nextEnabled).then((available) => {
        if (token !== null && transitionsRef.current.owns(token)) {
          setAudioAvailable(available);
        }
      });
    } else if (preference === 'camera') {
      const token = controllerTokenRef.current;
      const cameraRequest = ++cameraRequestRef.current;
      const controller = controllerRef.current;
      setCameraAvailable(false);
      setMessage(nextEnabled ? 'Reconnecting the private mirror.' : '');
      void controller?.setCameraEnabled(nextEnabled).then((available) => {
        if (cameraRequest !== cameraRequestRef.current) return;
        if (nextEnabled && !available && !controller.isCameraEnabled()) {
          reportUnavailableCamera(token, cameraRequest);
        }
        if (nextEnabled && available) {
          setCameraAvailable(true);
          setMessage('');
        }
      });
    }
  }, [reportUnavailableCamera, telemetry]);

  const changeTuning = useCallback(function changeTuning<Key extends keyof SessionTuning>(
    key: Key,
    value: SessionTuning[Key],
  ) {
    setPreferences((current) => {
      const tuning = { ...current.tuning, [key]: value };
      controllerRef.current?.setTuning(tuning);
      return { ...current, tuning };
    });
  }, []);

  const nextVariation = useCallback(() => {
    setPreferences((current) => ({
      ...current,
      variationSeed: current.variationSeed + 1,
    }));
  }, []);

  useEffect(() => {
    rendererRef.current?.setVariation(
      preferences.variationSeed,
      preferences.visualControl === 'auto',
    );
  }, [preferences.variationSeed, preferences.visualControl]);

  useEffect(() => {
    if (mode === 'ready') startAmbientField();
  }, [mode, startAmbientField]);

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
      if (controller === null) rendererRef.current?.dispose();
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
        case 'vocal':
          togglePreference('vocal', !preferences.vocal);
          break;
        case 'guidance':
          togglePreference('mode', preferences.mode === 'guided' ? 'pure' : 'guided');
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
        case 'variation':
          nextVariation();
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
  }, [leave, menuOpen, mode, nextVariation, preferences, togglePreference]);

  async function begin(): Promise<void> {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const token = transitionsRef.current.begin();
    if (token === null) return;
    const cameraRequest = ++cameraRequestRef.current;

    setMode('starting');
    setMessage('');
    guidancePolicyRef.current.reset();
    setTelemetry(initialTelemetry);
    setCue(null);
    setMenuOpen(false);
    setAudioAvailable(true);
    setCameraAvailable(preferences.camera);

    let controller: SessionController | null = null;
    try {
      const camera = new PerceptionAdapter();
      const renderer = rendererRef.current ?? new SoulMirrorRenderer(canvas);
      renderer.setVariation(preferences.variationSeed, preferences.visualControl === 'auto');
      rendererRef.current = renderer;
      controller = new SessionController({
        renderer,
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
          if (nextTelemetry.calibrationPhase === 'framing') {
            setMessage('Find a comfortable distance so your face and shoulders can shape the field.');
          } else if (nextTelemetry.calibrationPhase === 'sampling') {
            setMessage('The field is learning your natural movement. Stay as you are.');
          }
          setCue(guidancePolicyRef.current.evaluate(
            nextTelemetry,
            controller.snapshot().elapsedMs,
          ));
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
      controller.setVocalEnabled(preferences.vocal);
      controllerRef.current = controller;
      controllerTokenRef.current = token;

      if (!preferences.camera) void controller.setCameraEnabled(false);
      setMode('calibrating');
      setMessage(preferences.camera
        ? 'Opening the private mirror on this device.'
        : 'Opening the reset with available signals.');
      const startResult = await controller.start();
      if (!transitionsRef.current.owns(token)) {
        await controller.stop();
        return;
      }
      const requestedCamera = preferences.camera;
      if (requestedCamera && !startResult.cameraStarted) {
        reportUnavailableCamera(token, cameraRequest);
      } else if (startResult.cameraStarted) {
        setCameraAvailable(true);
      }
      const available = await controller.setVocalAudible(preferences.vocal);
      if (startResult.cameraStarted) await controller.waitForCalibration();
      if (!transitionsRef.current.owns(token)) return;
      transitionsRef.current.activate(token, () => {
        setAudioAvailable(available);
        setMode('active');
        setMessage('');
        trackEvent('session_started', {
          mode: preferences.mode,
          guidance: preferences.mode === 'guided',
          vocal: preferences.vocal,
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
        <div className="entry-copy">
          <p className="eyebrow">Relief</p>
          <h1 id="stillness-title">Take a minute back.</h1>
          <p>A private mirror that moves with you, then opens into calm.</p>
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
                  : 'Begin reset'}
            </button>
          </div>
          <p className="mode-note">Camera stays on this device. Nothing is saved or sent.</p>
          {message ? <p className="system-message" role="status">{message}</p> : null}
        </div>
      </section>

      {mode === 'active' ? (
        <>
          {preferences.mode === 'guided' ? (
            <>
              <p
                className="mirror-progress"
                data-direction={telemetry.direction}
                aria-live="polite"
              >
                {mirrorProgressLabel(telemetry)}
              </p>
              <SessionGuidance cue={cue} visible />
            </>
          ) : null}
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
            cameraAvailable={cameraAvailable}
            open={menuOpen}
            triggerRef={menuTriggerRef}
            onToggle={togglePreference}
            onTuningChange={changeTuning}
            onNextVariation={nextVariation}
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
