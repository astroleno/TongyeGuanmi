import { describe, expect, it } from 'vitest';

import {
  frameIndexForMediaTime,
  frameIndexForProgress,
  mediaTimeForFrame,
  progressForFrameIndex
} from './spike-frame-map';

const map = {
  fpsNumerator: 30,
  fpsDenominator: 1,
  firstPtsSeconds: 0.25,
  frameCount: 15,
  startFrame: 10,
  endFrame: 14
} as const;

describe('Spike frame map', () => {
  it('maps exact endpoints and nearest progress to integer frames', () => {
    expect(frameIndexForProgress(map, 0)).toBe(10);
    expect(frameIndexForProgress(map, 1)).toBe(14);
    expect(frameIndexForProgress(map, 0.49)).toBe(12);
    expect(frameIndexForProgress(map, 0.51)).toBe(12);
    expect(frameIndexForProgress(map, -1)).toBe(10);
    expect(frameIndexForProgress(map, 2)).toBe(14);
  });

  it('maps nonzero first PTS and reverse frame progress without drift', () => {
    expect(mediaTimeForFrame(map, 10)).toBeCloseTo(0.25 + 10 / 30);
    expect(mediaTimeForFrame(map, 14)).toBeCloseTo(0.25 + 14 / 30);
    expect(frameIndexForMediaTime(map, 0.25 + 13 / 30)).toBe(13);
    expect(progressForFrameIndex(map, 10)).toBe(0);
    expect(progressForFrameIndex(map, 14)).toBe(1);
    expect(progressForFrameIndex(map, 12)).toBe(0.5);
  });

  it('round-trips every declared frame at 30000/1001 fps', () => {
    const ntscMap = {
      fpsNumerator: 30000,
      fpsDenominator: 1001,
      firstPtsSeconds: 1 / 1000,
      frameCount: 9,
      startFrame: 2,
      endFrame: 8
    } as const;

    for (let frame = ntscMap.startFrame; frame <= ntscMap.endFrame; frame += 1) {
      const progress = progressForFrameIndex(ntscMap, frame);
      expect(frameIndexForProgress(ntscMap, progress)).toBe(frame);
      expect(frameIndexForMediaTime(ntscMap, mediaTimeForFrame(ntscMap, frame))).toBe(frame);
    }
  });
});
