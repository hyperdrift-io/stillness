import { clamp01 } from '../experience/model.ts';
import type { SoundMode } from '../experience/session-preferences.ts';
import type { ResonanceState } from '../resonance/resonance.ts';

export type AudioParameters = {
  waveGain: number;
  waveCutoffHz: number;
  waveHighpassHz: number;
  swell: number;
};

export type AudioVisualSignal = {
  active: boolean;
  energy: number;
  bass: number;
  beat: number;
  hue: number;
};

type LocalTrack = {
  title: string;
  url: string;
  bytes: number;
};

const SILENT_GAIN = 0.0001;
const WAVE_MASTER_GAIN = 0.28;
const MUSIC_MASTER_GAIN = 0.42;
const NOISE_SECONDS = 12;
const CHROMATIC_CYCLE_SECONDS = 72;
const TAU = Math.PI * 2;
const neutralVisualSignal: AudioVisualSignal = Object.freeze({
  active: false,
  energy: 0,
  bass: 0,
  beat: 0,
  hue: 0,
});

function interpolate(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function smoothstep(value: number): number {
  const bounded = clamp01(value);
  return bounded * bounded * (3 - 2 * bounded);
}

export function audibleGainTarget(audible: boolean, adaptiveGain: number): number {
  return audible && Number.isFinite(adaptiveGain) ? adaptiveGain : SILENT_GAIN;
}

export function mapAudioParameters(
  state: ResonanceState,
  elapsedSeconds = 0,
): AudioParameters {
  const space = clamp01(state.space);
  const energy = clamp01(state.audioEnergy);
  const turbulence = clamp01(state.turbulence);
  const coherence = clamp01(state.coherence);
  const pulse = Number.isFinite(state.pulse) ? clamp01(state.pulse) : 0.5;
  const cycleSeconds = interpolate(8.5, 14, space);
  const timedPhase = ((Math.max(0, elapsedSeconds) % cycleSeconds) / cycleSeconds) * TAU;
  const timedSwell = 0.5 - Math.cos(timedPhase) * 0.5;
  const sensedSwell = 0.5 - Math.cos(pulse * TAU) * 0.5;
  const swell = smoothstep(interpolate(timedSwell, sensedSwell, coherence * 0.72));

  return {
    waveGain: 0.045 + energy * 0.035 + swell * interpolate(0.12, 0.075, space),
    waveCutoffHz: 420 + (1 - space) * 460 + turbulence * 260 + swell * 340,
    waveHighpassHz: 48 + (1 - space) * 34,
    swell,
  };
}

function createWaveNoise(context: AudioContext): AudioBuffer {
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

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapWith]] = [result[swapWith]!, result[index]!];
  }
  return result;
}

export class StillnessAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private waveGain: GainNode | null = null;
  private waveBus: GainNode | null = null;
  private waveLowpass: BiquadFilterNode | null = null;
  private waveHighpass: BiquadFilterNode | null = null;
  private waveSource: AudioBufferSourceNode | null = null;
  private musicElement: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;
  private musicBassBoost: BiquadFilterNode | null = null;
  private musicAnalyser: AnalyserNode | null = null;
  private musicBus: GainNode | null = null;
  private frequencyData = new Uint8Array();
  private tracks: LocalTrack[] = [];
  private trackQueue: LocalTrack[] = [];
  private trackIndex = 0;
  private smoothedMusicEnergy = 0;
  private smoothedBassEnergy = 0;
  private bassBaseline = 0;
  private smoothedBeat = 0;
  private musicSampleRate = 48_000;
  private analysisPrimed = false;
  private mode: SoundMode;

  constructor(initialMode: SoundMode = 'off') {
    this.mode = initialMode;
  }

  async prime(): Promise<boolean> {
    if (this.tracks.length > 0) return true;
    return this.loadTrackManifest();
  }

  async start(): Promise<void> {
    if (this.context) {
      await this.resume();
      return;
    }

    const context = new AudioContext({ latencyHint: 'playback' });
    const master = context.createGain();
    const waveGain = context.createGain();
    const waveBus = context.createGain();
    const waveHighpass = context.createBiquadFilter();
    const waveLowpass = context.createBiquadFilter();
    const waveSource = context.createBufferSource();
    const musicBus = context.createGain();
    const initial = mapAudioParameters({
      complexity: 0.5,
      turbulence: 0.35,
      coherence: 0.4,
      focus: 0.5,
      depth: 0.5,
      pulse: 0.5,
      audioEnergy: 0.35,
      warmth: 0.4,
      space: 0.35,
    });

    master.gain.value = SILENT_GAIN;
    waveGain.gain.value = initial.waveGain;
    waveBus.gain.value = this.mode === 'waves' ? 1 : SILENT_GAIN;
    musicBus.gain.value = this.mode === 'music' ? 0.82 : SILENT_GAIN;
    waveHighpass.type = 'highpass';
    waveHighpass.frequency.value = initial.waveHighpassHz;
    waveHighpass.Q.value = 0.7;
    waveLowpass.type = 'lowpass';
    waveLowpass.frequency.value = initial.waveCutoffHz;
    waveLowpass.Q.value = 0.58;
    waveSource.buffer = createWaveNoise(context);
    waveSource.loop = true;

    waveSource.connect(waveHighpass);
    waveHighpass.connect(waveLowpass);
    waveLowpass.connect(waveGain);
    waveGain.connect(waveBus);
    waveBus.connect(master);
    musicBus.connect(master);
    master.connect(context.destination);
    waveSource.start();

    this.context = context;
    this.master = master;
    this.waveGain = waveGain;
    this.waveBus = waveBus;
    this.waveLowpass = waveLowpass;
    this.waveHighpass = waveHighpass;
    this.waveSource = waveSource;
    this.musicBus = musicBus;

    // Ask for audio permission while Begin still owns the browser gesture. The
    // manifest is primed on the landing screen so track playback can follow
    // without waiting on the camera or model startup path.
    const resumePromise = context.state === 'suspended' ? context.resume() : null;
    await this.prepareStreamedMusic(context, musicBus);
    if (resumePromise) await resumePromise;
    if (this.mode === 'music' && !await this.startNextTrack()) this.mode = 'off';
    master.gain.exponentialRampToValueAtTime(
      audibleGainTarget(this.mode !== 'off', this.mode === 'music' ? MUSIC_MASTER_GAIN : WAVE_MASTER_GAIN),
      context.currentTime + 1.8,
    );
  }

  update(state: ResonanceState, elapsedSeconds: number): AudioVisualSignal {
    const context = this.context;
    if (!context) return neutralVisualSignal;
    const parameters = mapAudioParameters(state, elapsedSeconds);
    const now = context.currentTime;
    this.setTarget(this.waveGain?.gain, parameters.waveGain, now, 0.7);
    this.setTarget(this.waveLowpass?.frequency, parameters.waveCutoffHz, now, 1.25);
    this.setTarget(this.waveHighpass?.frequency, parameters.waveHighpassHz, now, 1.8);

    if (this.mode === 'music') return this.analyseMusic(elapsedSeconds);
    if (this.mode === 'waves') {
      return {
        active: true,
        energy: clamp01(parameters.swell * 0.72 + state.audioEnergy * 0.28),
        bass: clamp01(parameters.swell * 0.85),
        beat: 0,
        hue: (Math.max(0, elapsedSeconds) / CHROMATIC_CYCLE_SECONDS) % 1,
      };
    }
    return neutralVisualSignal;
  }

  async setMode(mode: SoundMode): Promise<boolean> {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return false;
    if (mode === 'music' && this.tracks.length === 0) return false;
    if (mode !== 'off' && context.state === 'suspended') await context.resume();
    if (mode === 'music' && !await this.startCurrentOrNextTrack()) return false;
    if (this.mode === mode) return true;

    this.mode = mode;
    if (mode !== 'music') this.musicElement?.pause();
    const now = context.currentTime;
    this.holdAndTarget(this.waveBus?.gain, mode === 'waves' ? 1 : SILENT_GAIN, now, 0.45);
    this.holdAndTarget(this.musicBus?.gain, mode === 'music' ? 0.82 : SILENT_GAIN, now, 0.45);
    this.holdAndTarget(
      master.gain,
      audibleGainTarget(mode !== 'off', mode === 'music' ? MUSIC_MASTER_GAIN : WAVE_MASTER_GAIN),
      now,
      0.45,
    );
    return true;
  }

  isMusicAvailable(): boolean {
    return this.tracks.length > 0 && this.musicElement !== null;
  }

  async suspend(): Promise<void> {
    if (this.context?.state === 'running') await this.context.suspend();
  }

  async resume(): Promise<void> {
    if (this.context?.state === 'suspended') await this.context.resume();
    if (this.mode === 'music' && this.musicElement?.paused) {
      await this.musicElement.play().catch(() => {});
    }
  }

  dispose(): void {
    const context = this.context;
    if (!context) return;
    const now = context.currentTime;
    if (context.state === 'running') this.holdAndTarget(this.master?.gain, SILENT_GAIN, now, 0.08);
    try {
      this.waveSource?.stop(context.state === 'running' ? now + 0.18 : now);
    } catch {
      // The looping source may already have stopped during an interruption.
    }
    if (this.musicElement) {
      this.musicElement.removeEventListener('ended', this.onTrackEnded);
      this.musicElement.pause();
      this.musicElement.removeAttribute('src');
      this.musicElement.load();
    }
    this.musicSource?.disconnect();
    this.musicBassBoost?.disconnect();
    const close = () => {
      if (context.state !== 'closed') void context.close().catch(() => {});
    };
    if (context.state !== 'running') close();
    else if (this.waveSource) {
      this.waveSource.addEventListener('ended', close, { once: true });
      window.setTimeout(close, 500);
    } else close();
    this.context = null;
    this.master = null;
    this.waveGain = null;
    this.waveBus = null;
    this.waveLowpass = null;
    this.waveHighpass = null;
    this.waveSource = null;
    this.musicElement = null;
    this.musicSource = null;
    this.musicBassBoost = null;
    this.musicAnalyser = null;
    this.musicBus = null;
    this.frequencyData = new Uint8Array();
    this.trackQueue = [];
    this.trackIndex = 0;
    this.smoothedMusicEnergy = 0;
    this.smoothedBassEnergy = 0;
    this.bassBaseline = 0;
    this.smoothedBeat = 0;
    this.analysisPrimed = false;
  }

  private async prepareStreamedMusic(context: AudioContext, musicBus: GainNode): Promise<void> {
    if (typeof Audio !== 'function' || typeof context.createMediaElementSource !== 'function') return;
    if (this.tracks.length === 0 && !await this.loadTrackManifest()) return;
    try {
      const element = new Audio();
      element.preload = 'metadata';
      element.playbackRate = 0.5;
      element.preservesPitch = false;
      element.addEventListener('ended', this.onTrackEnded);
      const bassBoost = context.createBiquadFilter();
      bassBoost.type = 'lowshelf';
      bassBoost.frequency.value = 160;
      bassBoost.gain.value = 6;
      const analyser = context.createAnalyser();
      analyser.fftSize = 4_096;
      analyser.smoothingTimeConstant = 0.45;
      const source = context.createMediaElementSource(element);
      source.connect(bassBoost);
      bassBoost.connect(analyser);
      analyser.connect(musicBus);

      this.trackQueue = shuffled(this.tracks);
      this.trackIndex = 0;
      this.musicElement = element;
      this.musicSource = source;
      this.musicBassBoost = bassBoost;
      this.musicAnalyser = analyser;
      this.musicSampleRate = context.sampleRate;
      this.frequencyData = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      // The album is an optional localhost companion; waves remain available.
    }
  }

  private async loadTrackManifest(): Promise<boolean> {
    try {
      const response = await fetch('/local-music/manifest.json', { cache: 'no-store' });
      if (!response.ok) return false;
      const manifest = await response.json() as { tracks?: LocalTrack[] };
      const tracks = (manifest.tracks ?? []).filter((track) => (
        typeof track.title === 'string'
        && typeof track.url === 'string'
        && track.url.startsWith('/local-music/')
        && Number.isFinite(track.bytes)
      ));
      if (tracks.length === 0) return false;
      this.tracks = tracks;
      return true;
    } catch {
      return false;
    }
  }

  private analyseMusic(elapsedSeconds: number): AudioVisualSignal {
    const analyser = this.musicAnalyser;
    const element = this.musicElement;
    if (!analyser || !element || element.paused || this.frequencyData.length === 0) {
      return neutralVisualSignal;
    }
    analyser.getByteFrequencyData(this.frequencyData);
    const binHz = this.musicSampleRate / analyser.fftSize;
    const firstEnergyBin = Math.max(1, Math.ceil(15 / binHz));
    const lastEnergyBin = Math.min(this.frequencyData.length - 1, Math.floor(3_000 / binHz));
    const firstKickBin = Math.max(1, Math.ceil(15 / binHz));
    const lastKickBin = Math.min(this.frequencyData.length - 1, Math.floor(110 / binHz));
    let total = 0;
    let energyBins = 0;
    let kickTotal = 0;
    let kickBins = 0;
    for (let index = firstEnergyBin; index <= lastEnergyBin; index += 1) {
      const value = this.frequencyData[index]! / 255;
      total += value;
      energyBins += 1;
      if (index >= firstKickBin && index <= lastKickBin) {
        kickTotal += value;
        kickBins += 1;
      }
    }
    const rawEnergy = clamp01((total / Math.max(1, energyBins) - 0.025) * 1.75);
    const rawBass = clamp01((kickTotal / Math.max(1, kickBins) - 0.018) * 1.65);
    const energyBlend = rawEnergy > this.smoothedMusicEnergy ? 0.24 : 0.065;
    const bassBlend = rawBass > this.smoothedBassEnergy ? 0.3 : 0.08;
    this.smoothedMusicEnergy = interpolate(this.smoothedMusicEnergy, rawEnergy, energyBlend);
    this.smoothedBassEnergy = interpolate(this.smoothedBassEnergy, rawBass, bassBlend);

    let onset = 0;
    if (this.analysisPrimed) {
      onset = clamp01((rawBass - this.bassBaseline - 0.01) * 9.0);
    } else {
      this.analysisPrimed = true;
      this.bassBaseline = rawBass;
    }
    this.bassBaseline = interpolate(this.bassBaseline, rawBass, 0.022);
    this.smoothedBeat = Math.max(onset, this.smoothedBeat * 0.74);
    return {
      active: true,
      energy: this.smoothedMusicEnergy,
      bass: this.smoothedBassEnergy,
      beat: this.smoothedBeat,
      hue: (Math.max(0, elapsedSeconds) / CHROMATIC_CYCLE_SECONDS) % 1,
    };
  }

  private async startCurrentOrNextTrack(): Promise<boolean> {
    const element = this.musicElement;
    if (!element) return false;
    if (!element.src) return this.startNextTrack();
    try {
      await element.play();
      return true;
    } catch {
      return false;
    }
  }

  private async startNextTrack(): Promise<boolean> {
    const element = this.musicElement;
    if (!element || this.tracks.length === 0) return false;
    if (this.trackIndex >= this.trackQueue.length) {
      const previous = this.trackQueue.at(-1);
      this.trackQueue = shuffled(this.tracks);
      if (this.trackQueue.length > 1 && this.trackQueue[0] === previous) {
        [this.trackQueue[0], this.trackQueue[1]] = [this.trackQueue[1]!, this.trackQueue[0]!];
      }
      this.trackIndex = 0;
    }
    const track = this.trackQueue[this.trackIndex++];
    if (!track) return false;
    element.src = track.url;
    element.load();
    try {
      await element.play();
      return true;
    } catch {
      return false;
    }
  }

  private readonly onTrackEnded = (): void => {
    if (this.mode === 'music') void this.startNextTrack();
  };

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
