import { clamp01 } from '../experience/model.ts';
import type { ResonanceState } from '../resonance/resonance.ts';

export type AudioParameters = {
  masterGain: number;
  droneGain: number;
  textureGain: number;
  filterHz: number;
  pulseHz: number;
  delayMix: number;
};

export function mapAudioParameters(state: ResonanceState): AudioParameters {
  const energy = clamp01(state.audioEnergy);
  const turbulence = clamp01(state.turbulence);
  const pulse = clamp01(state.pulse, 0.5);
  const space = clamp01(state.space);

  return {
    masterGain: 0.012 + energy * 0.148,
    droneGain: 0.018 + energy * 0.125,
    textureGain: turbulence * energy * 0.072,
    filterHz: 180 + energy * 1_550 + turbulence * 870,
    pulseHz: 0.04 + pulse * 0.36,
    delayMix: 0.04 + space * 0.3,
  };
}

export class StillnessAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private textureGain: GainNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private delayGain: GainNode | null = null;
  private delayFeedback: GainNode | null = null;
  private pulseGain: GainNode | null = null;
  private pulseOscillator: OscillatorNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];

  async start(): Promise<void> {
    if (this.context) {
      await this.resume();
      return;
    }

    const context = new AudioContext({ latencyHint: 'playback' });
    const master = context.createGain();
    const droneGain = context.createGain();
    const textureGain = context.createGain();
    const filter = context.createBiquadFilter();
    const delay = context.createDelay(2.5);
    const delayGain = context.createGain();
    const delayFeedback = context.createGain();
    const pulseGain = context.createGain();

    master.gain.value = 0.0001;
    droneGain.gain.value = 0.06;
    textureGain.gain.value = 0.025;
    filter.type = 'lowpass';
    filter.frequency.value = 1_200;
    filter.Q.value = 0.55;
    delay.delayTime.value = 0.72;
    delayGain.gain.value = 0.12;
    delayFeedback.gain.value = 0.22;
    pulseGain.gain.value = 0.008;

    droneGain.connect(filter);
    textureGain.connect(filter);
    filter.connect(master);
    filter.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(master);
    delay.connect(delayFeedback);
    delayFeedback.connect(delay);
    master.connect(context.destination);

    const frequencies = [55, 82.5, 110];
    const oscillators = frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      const voice = context.createGain();
      oscillator.type = index === 1 ? 'triangle' : 'sine';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index === 0 ? -4 : index === 2 ? 3 : 0;
      voice.gain.value = [0.5, 0.2, 0.08][index] ?? 0.1;
      oscillator.connect(voice);
      voice.connect(droneGain);
      oscillator.start();
      return oscillator;
    });

    const noise = context.createBufferSource();
    noise.buffer = this.createNoiseBuffer(context);
    noise.loop = true;
    noise.connect(textureGain);
    noise.start();

    const pulseOscillator = context.createOscillator();
    pulseOscillator.type = 'sine';
    pulseOscillator.frequency.value = 0.16;
    pulseOscillator.connect(pulseGain);
    pulseGain.connect(droneGain.gain);
    pulseOscillator.start();

    this.context = context;
    this.master = master;
    this.droneGain = droneGain;
    this.textureGain = textureGain;
    this.filter = filter;
    this.delayGain = delayGain;
    this.delayFeedback = delayFeedback;
    this.pulseGain = pulseGain;
    this.pulseOscillator = pulseOscillator;
    this.sources = [...oscillators, noise, pulseOscillator];

    master.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 1.8);
    if (context.state === 'suspended') await context.resume();
  }

  update(state: ResonanceState, _elapsedSeconds: number): void {
    const context = this.context;
    if (!context) return;
    const parameters = mapAudioParameters(state);
    const now = context.currentTime;
    this.setTarget(this.master?.gain, parameters.masterGain, now, 1.2);
    this.setTarget(this.droneGain?.gain, parameters.droneGain, now, 1.5);
    this.setTarget(this.textureGain?.gain, parameters.textureGain, now, 1.8);
    this.setTarget(this.filter?.frequency, parameters.filterHz, now, 2.2);
    this.setTarget(this.delayGain?.gain, parameters.delayMix, now, 2.5);
    this.setTarget(this.delayFeedback?.gain, 0.16 + parameters.delayMix * 0.42, now, 2.5);
    this.setTarget(this.pulseOscillator?.frequency, parameters.pulseHz, now, 2.2);
    this.setTarget(this.pulseGain?.gain, 0.002 + parameters.masterGain * 0.065, now, 1.8);
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
    this.master?.gain.cancelScheduledValues(now);
    if (context.state === 'running') this.master?.gain.setTargetAtTime(0.0001, now, 0.02);
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
    this.droneGain = null;
    this.textureGain = null;
    this.filter = null;
    this.delayGain = null;
    this.delayFeedback = null;
    this.pulseGain = null;
    this.pulseOscillator = null;
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const length = Math.floor(context.sampleRate * 2);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.985 + white * 0.015;
      channel[index] = previous * 3.2;
    }
    return buffer;
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
