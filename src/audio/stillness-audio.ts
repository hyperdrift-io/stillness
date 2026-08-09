import { clamp01 } from '../experience/model.ts';
import type { ResonanceState } from '../resonance/resonance.ts';

export type AudioParameters = {
  delayMix: number;
  vocalGain: number;
  vocalPitchHz: number;
  formantsHz: readonly [number, number, number];
};

const SILENT_GAIN = 0.0001;
const VOCAL_MASTER_GAIN = 0.62;

const VOWEL_FORMANTS = {
  closed: [300, 870, 2_240],
  open: [730, 1_090, 2_440],
  clear: [270, 2_290, 3_010],
} as const;

function interpolate(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function formantsForVowel(position: number): readonly [number, number, number] {
  const vowel = clamp01(position);
  const from = vowel < 0.5 ? VOWEL_FORMANTS.closed : VOWEL_FORMANTS.open;
  const to = vowel < 0.5 ? VOWEL_FORMANTS.open : VOWEL_FORMANTS.clear;
  const amount = vowel < 0.5 ? vowel * 2 : (vowel - 0.5) * 2;
  return [
    interpolate(from[0], to[0], amount),
    interpolate(from[1], to[1], amount),
    interpolate(from[2], to[2], amount),
  ];
}

export function audibleGainTarget(audible: boolean, adaptiveGain: number): number {
  return audible && Number.isFinite(adaptiveGain) ? adaptiveGain : SILENT_GAIN;
}

export function mapAudioParameters(state: ResonanceState): AudioParameters {
  const space = clamp01(state.space);
  const vocalArrival = clamp01((space - 0.48) / 0.52);
  const vowelPosition = clamp01(space * 0.72 + state.pulse * 0.28);

  return {
    delayMix: 0.08 + space * 0.36,
    vocalGain: 0.035 + vocalArrival * vocalArrival * 0.18,
    vocalPitchHz: 73.42 + clamp01(state.warmth) * 9,
    formantsHz: formantsForVowel(vowelPosition),
  };
}

export class StillnessAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private delayGain: GainNode | null = null;
  private delayFeedback: GainNode | null = null;
  private vocalGain: GainNode | null = null;
  private vocalOscillators: OscillatorNode[] = [];
  private vocalFormants: BiquadFilterNode[] = [];
  private sources: AudioScheduledSourceNode[] = [];
  private adaptiveVocalGain = 0.035;
  private audible: boolean;
  private vocalEnabled: boolean;

  constructor(initiallyAudible = false, initiallyVocal = false) {
    this.audible = initiallyAudible;
    this.vocalEnabled = initiallyVocal;
  }

  async start(): Promise<void> {
    if (this.context) {
      await this.resume();
      return;
    }

    this.adaptiveVocalGain = 0.035;
    const context = new AudioContext({ latencyHint: 'playback' });
    const master = context.createGain();
    const delay = context.createDelay(2.5);
    const delayGain = context.createGain();
    const delayFeedback = context.createGain();
    const vocalInput = context.createGain();
    const vocalGain = context.createGain();

    master.gain.value = SILENT_GAIN;
    delay.delayTime.value = 0.72;
    delayGain.gain.value = 0.16;
    delayFeedback.gain.value = 0.22;
    vocalInput.gain.value = 0.28;
    vocalGain.gain.value = this.vocalEnabled ? this.adaptiveVocalGain : SILENT_GAIN;

    delay.connect(delayGain);
    delayGain.connect(master);
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    master.connect(context.destination);

    const vocalOscillators = [
      { type: 'sawtooth' as OscillatorType, frequency: 73.42, gain: 0.5 },
      { type: 'triangle' as OscillatorType, frequency: 146.84, gain: 0.22 },
    ].map((voice) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = voice.type;
      oscillator.frequency.value = voice.frequency;
      gain.gain.value = voice.gain;
      oscillator.connect(gain);
      gain.connect(vocalInput);
      oscillator.start();
      return oscillator;
    });

    const formantLevels = [0.62, 0.28, 0.12];
    const vocalFormants = VOWEL_FORMANTS.closed.map((frequency, index) => {
      const formant = context.createBiquadFilter();
      const formantGain = context.createGain();
      formant.type = 'bandpass';
      formant.frequency.value = frequency;
      formant.Q.value = index === 0 ? 3.5 : index === 1 ? 5 : 7;
      formantGain.gain.value = formantLevels[index] ?? 0.1;
      vocalInput.connect(formant);
      formant.connect(formantGain);
      formantGain.connect(vocalGain);
      return formant;
    });
    vocalGain.connect(master);
    vocalGain.connect(delay);

    this.context = context;
    this.master = master;
    this.delayGain = delayGain;
    this.delayFeedback = delayFeedback;
    this.vocalGain = vocalGain;
    this.vocalOscillators = vocalOscillators;
    this.vocalFormants = vocalFormants;
    this.sources = [...vocalOscillators];

    master.gain.exponentialRampToValueAtTime(
      audibleGainTarget(this.audible, VOCAL_MASTER_GAIN),
      context.currentTime + 1.8,
    );
    if (context.state === 'suspended') await context.resume();
  }

  update(state: ResonanceState, _elapsedSeconds: number): void {
    const context = this.context;
    if (!context) return;
    const parameters = mapAudioParameters(state);
    this.adaptiveVocalGain = parameters.vocalGain;
    const now = context.currentTime;
    this.setTarget(this.delayGain?.gain, parameters.delayMix, now, 2.5);
    this.setTarget(this.delayFeedback?.gain, 0.16 + parameters.delayMix * 0.42, now, 2.5);
    this.setTarget(
      this.vocalGain?.gain,
      this.vocalEnabled ? parameters.vocalGain : SILENT_GAIN,
      now,
      1.8,
    );
    this.vocalOscillators.forEach((oscillator, index) => {
      this.setTarget(
        oscillator.frequency,
        parameters.vocalPitchHz * (index === 0 ? 1 : 2),
        now,
        1.4,
      );
    });
    this.vocalFormants.forEach((formant, index) => {
      this.setTarget(formant.frequency, parameters.formantsHz[index] ?? 800, now, 1.2);
    });
  }

  setVocalEnabled(enabled: boolean): void {
    this.vocalEnabled = enabled;
    const context = this.context;
    if (!context) return;
    this.holdAndTarget(
      this.vocalGain?.gain,
      enabled ? this.adaptiveVocalGain : SILENT_GAIN,
      context.currentTime,
      0.18,
    );
  }

  async setAudible(audible: boolean): Promise<boolean> {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return false;

    if (audible && context.state === 'suspended') await context.resume();
    if (this.audible === audible) return true;
    this.audible = audible;
    this.holdAndTarget(
      master.gain,
      audibleGainTarget(audible, VOCAL_MASTER_GAIN),
      context.currentTime,
      0.08,
    );
    return true;
  }

  isAvailable(): boolean {
    return this.context !== null;
  }

  async suspend(): Promise<void> {
    if (this.context?.state === 'running') await this.context.suspend();
  }

  async resume(): Promise<void> {
    if (this.context?.state === 'suspended') await this.context.resume();
  }

  dispose(): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    if (context.state === 'running') this.holdAndTarget(this.master?.gain, SILENT_GAIN, now, 0.02);
    for (const source of this.sources) {
      try {
        source.stop(context.state === 'running' ? now + 0.08 : now);
      } catch {
        // A source may already have ended during an interruption.
      }
    }
    const close = () => {
      if (context.state !== 'closed') void context.close().catch(() => {});
    };
    const lastSource = this.sources.at(-1);
    if (context.state !== 'running') close();
    else if (lastSource) {
      lastSource.addEventListener('ended', close, { once: true });
      window.setTimeout(close, 400);
    } else close();
    this.sources = [];
    this.context = null;
    this.master = null;
    this.delayGain = null;
    this.delayFeedback = null;
    this.vocalGain = null;
    this.vocalOscillators = [];
    this.vocalFormants = [];
  }

  private setTarget(
    parameter: AudioParam | undefined,
    value: number,
    now: number,
    timeConstant: number,
  ): void {
    if (!parameter || !Number.isFinite(value)) return;
    parameter.cancelScheduledValues(now);
    parameter.setTargetAtTime(value, now, timeConstant);
  }

  private holdAndTarget(
    parameter: AudioParam | undefined,
    value: number,
    now: number,
    timeConstant: number,
  ): void {
    if (!parameter || !Number.isFinite(value)) return;
    if (typeof parameter.cancelAndHoldAtTime === 'function') {
      parameter.cancelAndHoldAtTime(now);
    } else {
      const heldValue = parameter.value;
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(heldValue, now);
    }
    parameter.setTargetAtTime(value, now, timeConstant);
  }
}
