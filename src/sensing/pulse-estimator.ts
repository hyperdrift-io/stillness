import { clamp01 } from '../experience/model.ts';
import type { PerceptionSnapshot, SkinSample } from './perception-signal.ts';

/**
 * Heart rate from the webcam, on device, with the plane-orthogonal-to-skin
 * method (Wang, den Brinker, Stuijk & de Haan 2017). The worker hands over
 * three mean skin colours per frame; this module keeps a short history,
 * resamples it evenly, projects colour onto the pulse plane, and reads the
 * dominant frequency between 42 and 240 beats a minute. Every estimate
 * carries a signal-to-noise ratio: when the signal is weak the rate is null,
 * never a guess. It is a measurement of light on skin, not a diagnosis.
 */

export type PulseSignal = {
  beatsPerMinute: number | null;
  snr: number;
  confidence: number;
  seconds: number;
};

export const emptyPulseSignal: PulseSignal = {
  beatsPerMinute: null,
  snr: 0,
  confidence: 0,
  seconds: 0,
};

const HISTORY_MS = 16_000;
const MIN_HISTORY_MS = 8_000;
const RESAMPLE_HZ = 20;
const POS_WINDOW_SAMPLES = 32;
const MIN_HZ = 0.7;
const MAX_HZ = 4;
const BAND_STEP_HZ = 0.02;
const PEAK_HALF_WIDTH_HZ = 0.15;
const MAX_GAP_MS = 400;
const ESTIMATE_INTERVAL_MS = 1_000;
const RATE_EMA_SECONDS = 4;
const SNR_FLOOR = 0.9;
const SNR_FULL = 2.2;

type Sample = { atMs: number; regions: readonly SkinSample[] };

function mean(values: Float64Array): number {
  let total = 0;
  for (const value of values) total += value;
  return values.length > 0 ? total / values.length : 0;
}

function standardDeviation(values: Float64Array): number {
  const average = mean(values);
  let total = 0;
  for (const value of values) total += (value - average) ** 2;
  return values.length > 1 ? Math.sqrt(total / (values.length - 1)) : 0;
}

/** Linear resampling of one colour channel onto an even grid. */
function resample(samples: readonly Sample[], region: number, channel: number, grid: Float64Array, startMs: number): boolean {
  let cursor = 0;
  for (let index = 0; index < grid.length; index += 1) {
    const atMs = startMs + (index / RESAMPLE_HZ) * 1_000;
    while (cursor < samples.length - 1 && samples[cursor + 1]!.atMs <= atMs) cursor += 1;
    const left = samples[cursor];
    const right = samples[cursor + 1] ?? left;
    if (!left || !right) return false;
    const span = right.atMs - left.atMs;
    const amount = span > 0 ? clamp01((atMs - left.atMs) / span) : 0;
    const leftValue = left.regions[region]?.[channel] ?? 0;
    const rightValue = right.regions[region]?.[channel] ?? leftValue;
    grid[index] = leftValue + (rightValue - leftValue) * amount;
  }
  return true;
}

/** The POS projection: an overlap-added pulse trace from an RGB series. */
export function posPulseTrace(red: Float64Array, green: Float64Array, blue: Float64Array): Float64Array {
  const length = red.length;
  const trace = new Float64Array(length);
  if (length < POS_WINDOW_SAMPLES) return trace;
  const window1 = new Float64Array(POS_WINDOW_SAMPLES);
  const window2 = new Float64Array(POS_WINDOW_SAMPLES);
  for (let start = 0; start + POS_WINDOW_SAMPLES <= length; start += 1) {
    let redMean = 0;
    let greenMean = 0;
    let blueMean = 0;
    for (let offset = 0; offset < POS_WINDOW_SAMPLES; offset += 1) {
      redMean += red[start + offset]!;
      greenMean += green[start + offset]!;
      blueMean += blue[start + offset]!;
    }
    redMean /= POS_WINDOW_SAMPLES;
    greenMean /= POS_WINDOW_SAMPLES;
    blueMean /= POS_WINDOW_SAMPLES;
    if (redMean <= 0 || greenMean <= 0 || blueMean <= 0) continue;
    for (let offset = 0; offset < POS_WINDOW_SAMPLES; offset += 1) {
      const normalisedRed = red[start + offset]! / redMean;
      const normalisedGreen = green[start + offset]! / greenMean;
      const normalisedBlue = blue[start + offset]! / blueMean;
      window1[offset] = normalisedGreen - normalisedBlue;
      window2[offset] = -2 * normalisedRed + normalisedGreen + normalisedBlue;
    }
    const ratio = standardDeviation(window2) > 0
      ? standardDeviation(window1) / standardDeviation(window2)
      : 0;
    let pulseMean = 0;
    for (let offset = 0; offset < POS_WINDOW_SAMPLES; offset += 1) {
      pulseMean += window1[offset]! + ratio * window2[offset]!;
    }
    pulseMean /= POS_WINDOW_SAMPLES;
    for (let offset = 0; offset < POS_WINDOW_SAMPLES; offset += 1) {
      trace[start + offset]! += window1[offset]! + ratio * window2[offset]! - pulseMean;
    }
  }
  return trace;
}

/** Power spectrum of a trace across the pulse band, Hann-windowed, detrended. */
export function pulseSpectrum(trace: Float64Array): Float64Array {
  const length = trace.length;
  const bins = Math.floor((MAX_HZ - MIN_HZ) / BAND_STEP_HZ) + 1;
  const spectrum = new Float64Array(bins);
  if (length < 2) return spectrum;
  const average = mean(trace);
  const windowed = new Float64Array(length);
  for (let index = 0; index < length; index += 1) {
    const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (length - 1));
    windowed[index] = (trace[index]! - average) * hann;
  }
  for (let bin = 0; bin < bins; bin += 1) {
    const hz = MIN_HZ + bin * BAND_STEP_HZ;
    const omega = (2 * Math.PI * hz) / RESAMPLE_HZ;
    let real = 0;
    let imaginary = 0;
    for (let index = 0; index < length; index += 1) {
      real += windowed[index]! * Math.cos(omega * index);
      imaginary -= windowed[index]! * Math.sin(omega * index);
    }
    spectrum[bin] = real * real + imaginary * imaginary;
  }
  return spectrum;
}

export function spectrumPeak(spectrum: Float64Array): { hz: number; snr: number } {
  let peakBin = 0;
  let total = 0;
  for (let bin = 0; bin < spectrum.length; bin += 1) {
    total += spectrum[bin]!;
    if (spectrum[bin]! > spectrum[peakBin]!) peakBin = bin;
  }
  if (total <= 0) return { hz: 0, snr: 0 };
  const halfWidthBins = Math.round(PEAK_HALF_WIDTH_HZ / BAND_STEP_HZ);
  let peakEnergy = 0;
  for (let bin = Math.max(0, peakBin - halfWidthBins); bin <= Math.min(spectrum.length - 1, peakBin + halfWidthBins); bin += 1) {
    peakEnergy += spectrum[bin]!;
  }
  const rest = total - peakEnergy;
  return {
    hz: MIN_HZ + peakBin * BAND_STEP_HZ,
    snr: rest > 0 ? peakEnergy / rest : SNR_FULL * 4,
  };
}

export class PulseEstimator {
  private readonly samples: Sample[] = [];
  private lastEstimateAt = -Infinity;
  private lastSampleAt: number | null = null;
  private smoothedRate: number | null = null;
  private signal: PulseSignal = { ...emptyPulseSignal };

  update(snapshot: PerceptionSnapshot): PulseSignal {
    const atMs = snapshot.timestampMs;
    if (!Number.isFinite(atMs)) return { ...this.signal };
    if (this.lastSampleAt !== null && atMs <= this.lastSampleAt) return { ...this.signal };
    if (!snapshot.facePresent || !snapshot.pulse.sampled) {
      if (this.lastSampleAt !== null && atMs - this.lastSampleAt > MAX_GAP_MS) this.clear();
      return { ...this.signal };
    }
    if (this.lastSampleAt !== null && atMs - this.lastSampleAt > MAX_GAP_MS) this.clear();
    this.lastSampleAt = atMs;
    this.samples.push({
      atMs,
      regions: [snapshot.pulse.forehead, snapshot.pulse.leftCheek, snapshot.pulse.rightCheek],
    });
    while ((this.samples[0]?.atMs ?? Infinity) < atMs - HISTORY_MS) this.samples.shift();
    if (atMs - this.lastEstimateAt >= ESTIMATE_INTERVAL_MS) {
      this.lastEstimateAt = atMs;
      this.signal = this.estimate(atMs);
    }
    return { ...this.signal };
  }

  reset(): void {
    this.clear();
    this.lastEstimateAt = -Infinity;
    this.smoothedRate = null;
    this.signal = { ...emptyPulseSignal };
  }

  private clear(): void {
    this.samples.length = 0;
    this.lastSampleAt = null;
  }

  private estimate(nowMs: number): PulseSignal {
    const first = this.samples[0];
    if (!first) return { ...emptyPulseSignal };
    const spanMs = nowMs - first.atMs;
    const seconds = spanMs / 1_000;
    if (spanMs < MIN_HISTORY_MS) {
      return { beatsPerMinute: null, snr: 0, confidence: 0, seconds };
    }
    const length = Math.floor((spanMs / 1_000) * RESAMPLE_HZ);
    const red = new Float64Array(length);
    const green = new Float64Array(length);
    const blue = new Float64Array(length);
    let combined: Float64Array | null = null;
    for (let region = 0; region < 3; region += 1) {
      if (
        !resample(this.samples, region, 0, red, first.atMs)
        || !resample(this.samples, region, 1, green, first.atMs)
        || !resample(this.samples, region, 2, blue, first.atMs)
      ) continue;
      const spectrum = pulseSpectrum(posPulseTrace(red, green, blue));
      let total = 0;
      for (const value of spectrum) total += value;
      if (total <= 0) continue;
      combined ??= new Float64Array(spectrum.length);
      for (let bin = 0; bin < spectrum.length; bin += 1) combined[bin]! += spectrum[bin]! / total;
    }
    if (!combined) return { beatsPerMinute: null, snr: 0, confidence: 0, seconds };
    const peak = spectrumPeak(combined);
    const confidence = clamp01((peak.snr - SNR_FLOOR) / (SNR_FULL - SNR_FLOOR))
      * clamp01((spanMs - MIN_HISTORY_MS) / (HISTORY_MS - MIN_HISTORY_MS) + 0.5);
    if (confidence <= 0) {
      return { beatsPerMinute: null, snr: peak.snr, confidence: 0, seconds };
    }
    const rate = peak.hz * 60;
    const alpha = 1 - Math.exp(-(ESTIMATE_INTERVAL_MS / 1_000) / RATE_EMA_SECONDS);
    this.smoothedRate = this.smoothedRate === null
      ? rate
      : this.smoothedRate + (rate - this.smoothedRate) * alpha * (0.5 + confidence * 0.5);
    return { beatsPerMinute: this.smoothedRate, snr: peak.snr, confidence, seconds };
  }
}
