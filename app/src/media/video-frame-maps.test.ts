import { describe, expect, it } from 'vitest';
import { frameIndexForMediaTime, frameIndexForProgress, mediaTimeForFrame } from './frame-timebase';
import { VIDEO_FRAME_MAPS, videoFrameMapFor } from './video-frame-maps';

describe('VIDEO_FRAME_MAPS', () => {
  it('contains every production semantic animation and exhaustive round trips', () => {
    expect(Object.keys(VIDEO_FRAME_MAPS)).toEqual([
      'hero-figure-motion', 'aod-figure-motion', 'figure2-pair-motion',
      'figure3-motion', 'ttg-figure-motion', 'ph-figure-motion',
      'crane-figure-motion', 'crane-flock-motion'
    ]);
    for (const map of Object.values(VIDEO_FRAME_MAPS)) {
      expect(frameIndexForProgress(map, 0)).toBe(map.startFrame);
      expect(frameIndexForProgress(map, 1)).toBe(map.endFrame);
      for (let frame = map.startFrame; frame <= map.endFrame; frame += 1) {
        expect(frameIndexForMediaTime(map, mediaTimeForFrame(map, frame))).toBe(frame);
      }
    }
  });

  it('resolves known keys and rejects an unregistered semantic key', () => {
    expect(videoFrameMapFor('ph-figure-motion').frameCount).toBe(46);
    expect(() => videoFrameMapFor('unknown-animation')).toThrow(/no production video frame map/);
  });
});
