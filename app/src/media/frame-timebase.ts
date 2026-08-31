export type VideoFrameMap = Readonly<{
  fpsNumerator: number;
  fpsDenominator: number;
  firstPtsSeconds: number;
  frameCount: number;
  startFrame: number;
  endFrame: number;
}>;

function assertValidMap(map: VideoFrameMap): void {
  if (!Number.isInteger(map.fpsNumerator) || map.fpsNumerator <= 0) {
    throw new Error('fpsNumerator must be a positive integer');
  }
  if (!Number.isInteger(map.fpsDenominator) || map.fpsDenominator <= 0) {
    throw new Error('fpsDenominator must be a positive integer');
  }
  if (!Number.isFinite(map.firstPtsSeconds)) {
    throw new Error('firstPtsSeconds must be finite');
  }
  if (!Number.isInteger(map.frameCount) || map.frameCount <= 0) {
    throw new Error('frameCount must be a positive integer');
  }
  if (!Number.isInteger(map.startFrame) || !Number.isInteger(map.endFrame)) {
    throw new Error('startFrame and endFrame must be integers');
  }
  if (map.startFrame < 0 || map.startFrame > map.endFrame || map.endFrame >= map.frameCount) {
    throw new Error('frame range must satisfy 0 <= startFrame <= endFrame < frameCount');
  }
}

function assertFrameIndex(map: VideoFrameMap, frameIndex: number): void {
  assertValidMap(map);
  if (!Number.isInteger(frameIndex) || frameIndex < map.startFrame || frameIndex > map.endFrame) {
    throw new Error(`frameIndex must be an integer in ${map.startFrame}..${map.endFrame}`);
  }
}

export function validateVideoFrameMap(map: VideoFrameMap): VideoFrameMap {
  assertValidMap(map);
  return map;
}

export function frameIndexForProgress(map: VideoFrameMap, progress: number): number {
  assertValidMap(map);
  if (!Number.isFinite(progress)) {
    throw new Error('progress must be finite');
  }
  const clamped = Math.min(1, Math.max(0, progress));
  if (clamped === 0) return map.startFrame;
  if (clamped === 1) return map.endFrame;
  return Math.round(map.startFrame + clamped * (map.endFrame - map.startFrame));
}

export function mediaTimeForFrame(map: VideoFrameMap, frameIndex: number): number {
  assertFrameIndex(map, frameIndex);
  return map.firstPtsSeconds + frameIndex * map.fpsDenominator / map.fpsNumerator;
}

export function frameIndexForMediaTime(map: VideoFrameMap, mediaTimeSeconds: number): number {
  assertValidMap(map);
  if (!Number.isFinite(mediaTimeSeconds)) {
    throw new Error('mediaTimeSeconds must be finite');
  }
  const quantized = Math.round(
    (mediaTimeSeconds - map.firstPtsSeconds) * map.fpsNumerator / map.fpsDenominator
  );
  return Math.min(map.endFrame, Math.max(map.startFrame, quantized));
}

export function progressForFrameIndex(map: VideoFrameMap, frameIndex: number): number {
  assertFrameIndex(map, frameIndex);
  const span = map.endFrame - map.startFrame;
  return span === 0 ? 0 : (frameIndex - map.startFrame) / span;
}
