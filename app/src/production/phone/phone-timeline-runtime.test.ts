import { describe, expect, it, vi } from 'vitest';

const timeline = vi.hoisted(() => ({
  dispose: vi.fn(),
  drive: vi.fn(),
  prepare: vi.fn()
}));

vi.mock('../../media/timeline-video-driver', () => ({
  disposeTimelineVideoDriver: timeline.dispose,
  driveTimelineVideo: timeline.drive,
  prepareTimelineVideoFrame: timeline.prepare
}));

import {
  disposePhoneTimelineVideo,
  drivePhoneTimelineVideo,
  preparePhoneTimelineVideoFrame,
  type PhoneTimelineVideoInput
} from './phone-timeline-runtime';

const video = {} as HTMLVideoElement;
const input: PhoneTimelineVideoInput = [
  'phone-timeline:1',
  -1,
  0.42,
  2.5,
  0,
  2.4,
  null,
  2500,
  'timeline',
  1,
  true,
  null,
  null
];

describe('phone timeline runtime bridge', () => {
  it('converts the cross-chunk positional request into the driver-owned object', () => {
    drivePhoneTimelineVideo(video, input);

    expect(timeline.drive).toHaveBeenCalledWith(video, {
      runId: 'phone-timeline:1',
      direction: -1,
      progress: 0.42,
      durationFallbackSeconds: 2.5,
      startSeconds: 0,
      endSeconds: 2.4,
      timelineDurationMs: 2500,
      mode: 'timeline',
      nativePlaybackDirection: 1,
      allowSeekedFrameFallback: true
    });
  });

  it('returns prepared-frame evidence as positional data', async () => {
    timeline.prepare.mockResolvedValue([
      'ready',
      'phone-timeline:1',
      -1,
      7,
      1.2,
      1.2
    ]);
    await expect(preparePhoneTimelineVideoFrame(video, input)).resolves.toEqual([
      'ready',
      'phone-timeline:1',
      -1,
      7,
      1.2,
      1.2
    ]);
    disposePhoneTimelineVideo(video);
    expect(timeline.dispose).toHaveBeenCalledWith(video);
  });
});
