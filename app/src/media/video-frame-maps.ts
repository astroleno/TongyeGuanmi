import type { MediaKey } from '../story/types';
import type { VideoFrameMap } from './frame-timebase';

export const VIDEO_FRAME_MAPS = {
  'hero-figure-motion': {
    fpsNumerator: 24,
    fpsDenominator: 1,
    firstPtsSeconds: 0,
    frameCount: 49,
    startFrame: 0,
    endFrame: 48
  },
  'aod-figure-motion': {
    fpsNumerator: 30,
    fpsDenominator: 1,
    firstPtsSeconds: 0,
    frameCount: 78,
    startFrame: 0,
    endFrame: 77
  },
  'figure2-pair-motion': {
    fpsNumerator: 30,
    fpsDenominator: 1,
    firstPtsSeconds: 0,
    frameCount: 156,
    startFrame: 0,
    endFrame: 155
  },
  'figure3-motion': {
    fpsNumerator: 30,
    fpsDenominator: 1,
    firstPtsSeconds: 0,
    frameCount: 78,
    startFrame: 0,
    endFrame: 77
  },
  'ttg-figure-motion': {
    fpsNumerator: 30,
    fpsDenominator: 1,
    firstPtsSeconds: 0,
    frameCount: 75,
    startFrame: 0,
    endFrame: 74
  },
  'ph-figure-motion': {
    fpsNumerator: 30,
    fpsDenominator: 1,
    firstPtsSeconds: 0,
    frameCount: 46,
    startFrame: 0,
    endFrame: 45
  },
  'crane-figure-motion': {
    fpsNumerator: 30,
    fpsDenominator: 1,
    firstPtsSeconds: 0,
    frameCount: 75,
    startFrame: 0,
    endFrame: 74
  },
  'crane-flock-motion': {
    fpsNumerator: 30,
    fpsDenominator: 1,
    firstPtsSeconds: 0,
    frameCount: 74,
    startFrame: 0,
    endFrame: 73
  }
} as const satisfies Readonly<Record<string, VideoFrameMap>>;

export function videoFrameMapFor(mediaKey: MediaKey): VideoFrameMap {
  const map = VIDEO_FRAME_MAPS[mediaKey as keyof typeof VIDEO_FRAME_MAPS];
  if (!map) throw new Error(`no production video frame map for ${mediaKey}`);
  return map;
}
