import { describe, expect, it, vi } from 'vitest';

const timeline = vi.hoisted(() => ({
  dispose: vi.fn(),
  drive: vi.fn(),
  prepare: vi.fn(),
  snapshot: vi.fn()
}));

vi.mock('../../media/timeline-video-driver', () => ({
  disposeTimelineVideoDriver: timeline.dispose,
  driveTimelineVideo: timeline.drive,
  prepareTimelineVideoFrame: timeline.prepare,
  timelineVideoDriverFor: () => ({ snapshot: timeline.snapshot })
}));

import {
  disposePhoneTimelineVideo,
  drivePhoneTimelineVideo,
  phoneTimelineVideoSnapshot,
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

  it('returns prepared-frame and snapshot evidence as positional data', async () => {
    timeline.prepare.mockResolvedValue({
      status: 'ready',
      runId: 'phone-timeline:1',
      direction: -1,
      generation: 7,
      targetTime: 1.2
    });
    timeline.snapshot.mockReturnValue({
      runId: 'phone-timeline:1',
      direction: -1,
      generation: 7,
      desiredProgress: 0.42,
      targetTime: 1.2,
      seekPending: false,
      nativeFallback: false,
      frameReady: true
    });

    await expect(preparePhoneTimelineVideoFrame(video, input)).resolves.toEqual([
      'ready',
      'phone-timeline:1'
    ]);
    expect(phoneTimelineVideoSnapshot(video)).toEqual([
      'phone-timeline:1',
      -1,
      0.42,
      true
    ]);

    disposePhoneTimelineVideo(video);
    expect(timeline.dispose).toHaveBeenCalledWith(video);
  });
});
