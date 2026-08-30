export type SpikeVideoFrameMap = Readonly<{
  fpsNumerator: number;
  fpsDenominator: number;
  firstPtsSeconds: number;
  frameCount: number;
  startFrame: number;
  endFrame: number;
}>;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function validateMap(map: SpikeVideoFrameMap): void {
  assert(Number.isInteger(map.fpsNumerator) && map.fpsNumerator > 0, 'fps numerator must be positive');
  assert(Number.isInteger(map.fpsDenominator) && map.fpsDenominator > 0, 'fps denominator must be positive');
  assert(Number.isFinite(map.firstPtsSeconds), 'first PTS must be finite');
  assert(Number.isInteger(map.frameCount) && map.frameCount > 0, 'frame count must be positive');
  assert(
    Number.isInteger(map.startFrame)
      && Number.isInteger(map.endFrame)
      && map.startFrame >= 0
      && map.startFrame <= map.endFrame
      && map.endFrame < map.frameCount,
    'frame range is invalid'
  );
}

function clampProgress(progress: number): number {
  assert(Number.isFinite(progress), 'progress must be finite');
  return Math.min(1, Math.max(0, progress));
}

function validateFrameIndex(map: SpikeVideoFrameMap, frameIndex: number): void {
  assert(
    Number.isInteger(frameIndex)
      && frameIndex >= map.startFrame
      && frameIndex <= map.endFrame,
    `frame index ${frameIndex} is outside the declared range`
  );
}

export function frameIndexForProgress(
  map: SpikeVideoFrameMap,
  progress: number
): number {
  validateMap(map);
  const clamped = clampProgress(progress);
  return Math.round(
    map.startFrame + clamped * (map.endFrame - map.startFrame)
  );
}

export function mediaTimeForFrame(
  map: SpikeVideoFrameMap,
  frameIndex: number
): number {
  validateMap(map);
  validateFrameIndex(map, frameIndex);
  return map.firstPtsSeconds
    + frameIndex * map.fpsDenominator / map.fpsNumerator;
}

export function frameIndexForMediaTime(
  map: SpikeVideoFrameMap,
  mediaTimeSeconds: number
): number {
  validateMap(map);
  assert(Number.isFinite(mediaTimeSeconds), 'media time must be finite');
  const rawFrame = Math.round(
    (mediaTimeSeconds - map.firstPtsSeconds)
      * map.fpsNumerator
      / map.fpsDenominator
  );
  return Math.min(map.endFrame, Math.max(map.startFrame, rawFrame));
}

export function progressForFrameIndex(
  map: SpikeVideoFrameMap,
  frameIndex: number
): number {
  validateMap(map);
  validateFrameIndex(map, frameIndex);
  if (map.startFrame === map.endFrame) return 0;
  return (frameIndex - map.startFrame) / (map.endFrame - map.startFrame);
}
