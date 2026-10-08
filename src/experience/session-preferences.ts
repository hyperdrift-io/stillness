export type SessionTuning = {
  signalSensitivity: number;
  colorInfluence: number;
  transitionSeconds: number;
  visualIntensity: number;
  quality: 'auto' | 'high' | 'balanced' | 'reduced';
};

export type SessionPreferences = {
  sound: boolean;
  camera: boolean;
  liveSignals: boolean;
  tuning: SessionTuning;
};

export const defaultSessionPreferences: SessionPreferences = Object.freeze({
  sound: true,
  camera: true,
  liveSignals: false,
  tuning: {
    signalSensitivity: 1,
    colorInfluence: 0.2,
    transitionSeconds: 4.5,
    visualIntensity: 1,
    quality: 'auto' as const,
  },
});

export type SessionCommand = 'menu' | 'sound' | 'signals' | 'camera';

export function commandForKey(input: {
  key: string;
  modifier: boolean;
  editable: boolean;
}): SessionCommand | null {
  if (input.modifier || input.editable) return null;
  const key = input.key.toLowerCase();
  if (input.key === '?') return 'menu';
  if (key === 'm') return 'sound';
  if (key === 'd') return 'signals';
  if (key === 'c') return 'camera';
  return null;
}
