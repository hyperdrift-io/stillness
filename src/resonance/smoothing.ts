export function smoothValue(
  current: number,
  target: number,
  deltaSeconds: number,
  timeConstantSeconds: number,
): number {
  if (!Number.isFinite(current) || !Number.isFinite(target)) return target;
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) return current;
  if (!Number.isFinite(timeConstantSeconds) || timeConstantSeconds <= 0) return target;

  const alpha = 1 - Math.exp(-deltaSeconds / timeConstantSeconds);
  return current + (target - current) * alpha;
}
