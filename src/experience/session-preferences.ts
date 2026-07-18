export type SessionMode = 'pure' | 'guided';
export type VisualControl = 'auto' | 'locked';

export type SessionTuning = {
  signalSensitivity: number;
  colorInfluence: number;
  transitionSeconds: number;
  visualIntensity: number;
  quality: 'auto' | 'high' | 'balanced' | 'reduced';
};

export type SessionPreferences = {
  mode: SessionMode;
  sound: boolean;
  liveSignals: boolean;
  camera: boolean;
  visualControl: VisualControl;
  variationSeed: number;
  tuning: SessionTuning;
};

export const defaultSessionPreferences: SessionPreferences = Object.freeze({
  mode: 'pure',
  sound: true,
  liveSignals: false,
  camera: true,
  visualControl: 'auto',
  variationSeed: 0,
  tuning: {
    signalSensitivity: 1,
    colorInfluence: 0.2,
    transitionSeconds: 4.5,
    visualIntensity: 1,
    quality: 'auto' as const,
  },
});

export type SessionCommand = 'menu' | 'sound' | 'guidance' | 'signals' | 'camera';

export function commandForKey(input: {
  key: string;
  modifier: boolean;
  editable: boolean;
}): SessionCommand | null {
  if (input.modifier || input.editable) return null;
  const key = input.key.toLowerCase();
  if (input.key === '?') return 'menu';
  if (key === 'm') return 'sound';
  if (key === 'g') return 'guidance';
  if (key === 'd') return 'signals';
  if (key === 'c') return 'camera';
  return null;
}
