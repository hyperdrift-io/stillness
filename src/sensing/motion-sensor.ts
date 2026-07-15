import { clamp01 } from '../experience/model.ts';

type PermissionAwareDeviceMotion = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

export type MotionObservation = { motion: number; confidence: number };

export class MotionSensor {
  private latest: MotionObservation = { motion: 0, confidence: 0 };
  private running = false;

  async start(): Promise<boolean> {
    if (this.running) return true;
    if (!('DeviceMotionEvent' in window)) return false;
    const constructor = DeviceMotionEvent as PermissionAwareDeviceMotion;
    if (constructor.requestPermission) {
      const permission = await constructor.requestPermission();
      if (permission !== 'granted') return false;
    }
    window.addEventListener('devicemotion', this.onMotion);
    this.running = true;
    return true;
  }

  read(): MotionObservation {
    return { ...this.latest };
  }

  stop(): void {
    if (this.running) window.removeEventListener('devicemotion', this.onMotion);
    this.running = false;
    this.latest = { motion: 0, confidence: 0 };
  }

  private onMotion = (event: DeviceMotionEvent): void => {
    const acceleration = event.acceleration;
    const rotation = event.rotationRate;
    const accelerationMagnitude = Math.hypot(
      acceleration?.x ?? 0,
      acceleration?.y ?? 0,
      acceleration?.z ?? 0,
    );
    const rotationMagnitude = Math.hypot(
      rotation?.alpha ?? 0,
      rotation?.beta ?? 0,
      rotation?.gamma ?? 0,
    );
    this.latest = {
      motion: clamp01(accelerationMagnitude / 4 * 0.65 + rotationMagnitude / 120 * 0.35),
      confidence: event.interval > 0 ? 1 : 0.65,
    };
  };
}
