export type SessionMode = 'mirror' | 'pure';

export type SessionPreferences = {
  mode: SessionMode;
  guidance: boolean;
  sound: boolean;
  liveSignals: boolean;
  camera: boolean;
};

export const defaultSessionPreferences: SessionPreferences = Object.freeze({
  mode: 'mirror',
  guidance: true,
  sound: true,
  liveSignals: false,
  camera: true,
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
