import { describe, expect, it } from 'vitest';
import {
  frameIndexForMediaTime,
  frameIndexForProgress,
  mediaTimeForFrame,
  progressForFrameIndex,
  validateVideoFrameMap,
  type VideoFrameMap
} from './frame-timebase';

const map: VideoFrameMap = {
  fpsNumerator: 30000,
  fpsDenominator: 1001,
  firstPtsSeconds: 0.25,
  frameCount: 120,
  startFrame: 10,
  endFrame: 109
};

describe('frame-timebase', () => {
  it('maps clamped progress to exact endpoint and nearest integer frames', () => {
    expect(frameIndexForProgress(map, -1)).toBe(10);
    expect(frameIndexForProgress(map, 0)).toBe(10);
    expect(frameIndexForProgress(map, 0.5)).toBe(60);
    expect(frameIndexForProgress(map, 1)).toBe(109);
    expect(frameIndexForProgress(map, 2)).toBe(109);
  });

  it('uses rational fps and round-trips every declared frame', () => {
    for (let frame = map.startFrame; frame <= map.endFrame; frame += 1) {
      const time = mediaTimeForFrame(map, frame);
      expect(frameIndexForMediaTime(map, time)).toBe(frame);
      expect(progressForFrameIndex(map, frame)).toBeCloseTo(
        (frame - map.startFrame) / (map.endFrame - map.startFrame)
      );
    }
  });

  it('validates fps, timestamps, frame count, and frame range', () => {
    expect(validateVideoFrameMap(map)).toBe(map);
    for (const invalid of [
      { ...map, fpsNumerator: 0 },
      { ...map, fpsDenominator: -1 },
      { ...map, firstPtsSeconds: Number.NaN },
      { ...map, frameCount: 0 },
      { ...map, startFrame: -1 },
      { ...map, startFrame: 110 },
      { ...map, endFrame: 120 }
    ]) {
      expect(() => validateVideoFrameMap(invalid)).toThrow();
    }
    expect(() => mediaTimeForFrame(map, 9)).toThrow();
    expect(() => progressForFrameIndex(map, 110)).toThrow();
  });
});
