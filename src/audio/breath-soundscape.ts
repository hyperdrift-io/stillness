import type { BreathCue, PacerStage } from '../experience/breath-pacer.ts';

/**
 * One designed soundscape, locked to the breath pacer, generated in the
 * browser. Nothing streams and nothing is recorded.
 *
 *  - ocean: filtered noise that swells on the inhale and recedes on the
 *    exhale, the oldest breath pacer there is;
 *  - ground: a low two-note drone (A2 + E3) that gives the room a floor;
 *  - bells: a soft tone at the start of each inhale and a lower one at the
 *    start of each exhale, so eyes can close and the rhythm still carries.
 *
 * Everything thins toward silence as the session reaches stillness. There
 * are no beats, no onsets and no claims about frequencies: slow, low and
 * predictable is what the evidence rewards.
 */

export type SoundscapeInput = {
  fullness: number;
  cue: BreathCue;
  stage: PacerStage;
  amplitude: number;
  stillness: number;
};

const SILENT_GAIN = 0.0001;
const MASTER_GAIN = 0.7;
const NOISE_SECONDS = 12;
const BELL_FREQUENCIES: Record<Exclude<BreathCue, 'rest'>, number> = {
  in: 659.26,
  again: 739.99,
  out: 493.88,
};
const BELL_DECAY_SECONDS: Record<Exclude<BreathCue, 'rest'>, number> = {
  in: 1.9,
  again: 1.3,
  out: 3.2,
};

function clamp01(value: number, fallback = 0): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function createOceanNoise(context: AudioContext): AudioBuffer {
  const frameCount = Math.max(1, Math.round(context.sampleRate * NOISE_SECONDS));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 0x6d2b79f5;
  let wash = 0;
  for (let index = 0; index < samples.length; index += 1) {
    seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
    const white = seed / 0xffff_ffff * 2 - 1;
    wash = wash * 0.965 + white * 0.035;
    samples[index] = Math.max(-1, Math.min(1, white * 0.22 + wash * 2.2));
  }
  return buffer;
}

export type SoundscapeTargets = {
  oceanGain: number;
  oceanCutoffHz: number;
  groundGain: number;
  groundCutoffHz: number;
  bellGain: number;
};

/** Pure mapping from breath state to the audio targets, so it can be read and tuned. */
export function soundscapeTargets(input: SoundscapeInput): SoundscapeTargets {
  const fullness = clamp01(input.fullness);
  const amplitude = clamp01(input.amplitude, 1);
  const stillness = clamp01(input.stillness);
  const shaped = fullness ** 1.3;
  const hush = 1 - stillness * 0.55;
  return {
    oceanGain: (0.06 + shaped * 0.26) * (0.55 + amplitude * 0.45) * hush,
    oceanCutoffHz: (170 + shaped * 920) * (1 - stillness * 0.3),
    groundGain: (0.05 + fullness * 0.035) * (1 - stillness * 0.65),
    groundCutoffHz: 280 + fullness * 240,
    bellGain: 0.055 * amplitude * (1 - stillness * 0.92),
  };
}

export class BreathSoundscape {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private oceanGain: GainNode | null = null;
  private oceanLowpass: BiquadFilterNode | null = null;
  private oceanSource: AudioBufferSourceNode | null = null;
  private groundGain: GainNode | null = null;
  private groundLowpass: BiquadFilterNode | null = null;
  private groundOscillators: OscillatorNode[] = [];
  private groundLfo: OscillatorNode | null = null;
  private bellBus: GainNode | null = null;
  private lastCue: BreathCue | null = null;
  private enabled: boolean;
  private bellGain = 0;

  constructor(initiallyEnabled = true) {
    this.enabled = initiallyEnabled;
  }

  isAvailable(): boolean {
    return this.context !== null;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /** Must be called inside the Begin gesture so the browser allows audio. */
  async start(): Promise<void> {
    if (this.context) {
      await this.resume();
      return;
    }
    const context = new AudioContext({ latencyHint: 'playback' });
    const master = context.createGain();
    master.gain.value = SILENT_GAIN;
    master.connect(context.destination);

    const oceanSource = context.createBufferSource();
    oceanSource.buffer = createOceanNoise(context);
    oceanSource.loop = true;
    const oceanHighpass = context.createBiquadFilter();
    oceanHighpass.type = 'highpass';
    oceanHighpass.frequency.value = 55;
    oceanHighpass.Q.value = 0.7;
    const oceanLowpass = context.createBiquadFilter();
    oceanLowpass.type = 'lowpass';
    oceanLowpass.frequency.value = 220;
    oceanLowpass.Q.value = 0.6;
    const oceanGain = context.createGain();
    oceanGain.gain.value = 0.06;
    oceanSource.connect(oceanHighpass);
    oceanHighpass.connect(oceanLowpass);
    oceanLowpass.connect(oceanGain);
    oceanGain.connect(master);
    oceanSource.start();

    const groundLowpass = context.createBiquadFilter();
    groundLowpass.type = 'lowpass';
    groundLowpass.frequency.value = 320;
    groundLowpass.Q.value = 0.5;
    const groundGain = context.createGain();
    groundGain.gain.value = 0.05;
    groundLowpass.connect(groundGain);
    groundGain.connect(master);
    const groundVoices: Array<{ type: OscillatorType; frequency: number; gain: number }> = [
      { type: 'sine', frequency: 110, gain: 0.5 },
      { type: 'triangle', frequency: 164.81, gain: 0.22 },
      { type: 'sine', frequency: 220, gain: 0.12 },
    ];
    const groundLfo = context.createOscillator();
    groundLfo.type = 'sine';
    groundLfo.frequency.value = 0.07;
    const lfoDepth = context.createGain();
    lfoDepth.gain.value = 3.5;
    groundLfo.connect(lfoDepth);
    const groundOscillators: OscillatorNode[] = [];
    for (const voice of groundVoices) {
      const oscillator = context.createOscillator();
      oscillator.type = voice.type;
      oscillator.frequency.value = voice.frequency;
      if (voice.type === 'triangle') lfoDepth.connect(oscillator.detune);
      const voiceGain = context.createGain();
      voiceGain.gain.value = voice.gain;
      oscillator.connect(voiceGain);
      voiceGain.connect(groundLowpass);
      oscillator.start();
      groundOscillators.push(oscillator);
    }
    groundLfo.start();

    const bellBus = context.createGain();
    bellBus.gain.value = 1;
    bellBus.connect(master);

    this.context = context;
    this.master = master;
    this.oceanGain = oceanGain;
    this.oceanLowpass = oceanLowpass;
    this.oceanSource = oceanSource;
    this.groundGain = groundGain;
    this.groundLowpass = groundLowpass;
    this.groundOscillators = groundOscillators;
    this.groundLfo = groundLfo;
    this.bellBus = bellBus;
    this.lastCue = null;

    if (context.state === 'suspended') await context.resume();
    if (this.enabled) {
      master.gain.exponentialRampToValueAtTime(MASTER_GAIN, context.currentTime + 3);
    }
  }

  update(input: SoundscapeInput): void {
    const context = this.context;
    if (!context) return;
    const targets = soundscapeTargets(input);
    const now = context.currentTime;
    this.setTarget(this.oceanGain?.gain, targets.oceanGain, now, 0.22);
    this.setTarget(this.oceanLowpass?.frequency, targets.oceanCutoffHz, now, 0.3);
    this.setTarget(this.groundGain?.gain, targets.groundGain, now, 0.6);
    this.setTarget(this.groundLowpass?.frequency, targets.groundCutoffHz, now, 0.6);
    this.bellGain = targets.bellGain;

    if (input.cue !== this.lastCue) {
      const previous = this.lastCue;
      this.lastCue = input.cue;
      if (previous !== null && input.cue !== 'rest' && this.enabled) {
        this.ringBell(input.cue, now);
      }
    }
  }

  async setEnabled(enabled: boolean): Promise<boolean> {
    const context = this.context;
    const master = this.master;
    this.enabled = enabled;
    if (!context || !master) return context !== null;
    if (enabled && context.state === 'suspended') await context.resume();
    const now = context.currentTime;
    if (typeof master.gain.cancelAndHoldAtTime === 'function') {
      master.gain.cancelAndHoldAtTime(now);
    } else {
      const held = master.gain.value;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(held, now);
    }
    master.gain.setTargetAtTime(enabled ? MASTER_GAIN : SILENT_GAIN, now, 0.4);
    return true;
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
    if (context.state === 'running' && this.master) {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(SILENT_GAIN, now, 0.12);
    }
    const stopAt = context.state === 'running' ? now + 0.6 : now;
    try {
      this.oceanSource?.stop(stopAt);
      for (const oscillator of this.groundOscillators) oscillator.stop(stopAt);
      this.groundLfo?.stop(stopAt);
    } catch {
      // Sources may already be stopped after an interruption.
    }
    const close = () => {
      if (context.state !== 'closed') void context.close().catch(() => {});
    };
    if (context.state !== 'running') close();
    else window.setTimeout(close, 800);
    this.context = null;
    this.master = null;
    this.oceanGain = null;
    this.oceanLowpass = null;
    this.oceanSource = null;
    this.groundGain = null;
    this.groundLowpass = null;
    this.groundOscillators = [];
    this.groundLfo = null;
    this.bellBus = null;
    this.lastCue = null;
  }

  private ringBell(cue: Exclude<BreathCue, 'rest'>, now: number): void {
    const context = this.context;
    const bellBus = this.bellBus;
    if (!context || !bellBus || this.bellGain <= 0.0005) return;
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.value = BELL_FREQUENCIES[cue];
    const overtone = context.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.value = BELL_FREQUENCIES[cue] * 2.01;
    const overtoneGain = context.createGain();
    overtoneGain.gain.value = 0.18;
    const envelope = context.createGain();
    const decay = BELL_DECAY_SECONDS[cue];
    envelope.gain.setValueAtTime(SILENT_GAIN, now);
    envelope.gain.exponentialRampToValueAtTime(this.bellGain, now + 0.03);
    envelope.gain.exponentialRampToValueAtTime(SILENT_GAIN, now + decay);
    oscillator.connect(envelope);
    overtone.connect(overtoneGain);
    overtoneGain.connect(envelope);
    envelope.connect(bellBus);
    oscillator.start(now);
    overtone.start(now);
    oscillator.stop(now + decay + 0.05);
    overtone.stop(now + decay + 0.05);
    oscillator.addEventListener('ended', () => {
      oscillator.disconnect();
      overtone.disconnect();
      overtoneGain.disconnect();
      envelope.disconnect();
    }, { once: true });
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
}
