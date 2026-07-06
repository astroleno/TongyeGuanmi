import { describe, expect, it } from 'vitest';
import {
  AOD_MEDIA_KEY,
  waitForAodVideoEnded,
  waitForAodVideoReady,
  type AodVideoMilestoneRecord
} from './media';

class FakeVideo extends EventTarget {
  readyState = 0;
  currentTime = 0;
  duration = 5.03;
  paused = true;

  play(): Promise<void> {
    this.paused = false;
    return Promise.resolve();
  }

  pause(): void {
    this.paused = true;
  }
}

describe('AOD video milestone truth pass', () => {
  it('accepts loadedmetadata and canplay once for the current prepare token', async () => {
    const video = new FakeVideo();
    const records: AodVideoMilestoneRecord[] = [];
    const ready = waitForAodVideoReady(video as HTMLVideoElement, {
      prepareToken: 'r3-pilot:prepare:1',
      timeoutMs: 100,
      isCurrent: (token) => token === 'r3-pilot:prepare:1',
      onMilestone: (record) => records.push(record)
    });

    video.readyState = 1;
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('loadedmetadata'));
    video.readyState = 3;
    video.dispatchEvent(new Event('canplay'));
    await ready;

    expect(records).toEqual([
      {
        milestone: 'loadedmetadata',
        key: AOD_MEDIA_KEY,
        prepareToken: 'r3-pilot:prepare:1',
        accepted: true,
        readyState: 1
      },
      {
        milestone: 'loadedmetadata',
        key: AOD_MEDIA_KEY,
        prepareToken: 'r3-pilot:prepare:1',
        accepted: false,
        reason: 'duplicate',
        readyState: 1
      },
      {
        milestone: 'canplay',
        key: AOD_MEDIA_KEY,
        prepareToken: 'r3-pilot:prepare:1',
        accepted: true,
        readyState: 3
      }
    ]);
  });

  it('ignores stale media readiness events and times out closed', async () => {
    const video = new FakeVideo();
    const records: AodVideoMilestoneRecord[] = [];
    const ready = waitForAodVideoReady(video as HTMLVideoElement, {
      prepareToken: 'r3-pilot:prepare:1',
      timeoutMs: 10,
      isCurrent: () => false,
      onMilestone: (record) => records.push(record)
    });

    video.readyState = 3;
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('canplay'));
    await expect(ready).rejects.toThrow(/timed out/);

    expect(records.map((record) => [record.milestone, record.accepted, record.reason])).toEqual([
      ['loadedmetadata', false, 'stale'],
      ['canplay', false, 'stale'],
      ['timeout', false, 'timeout']
    ]);
  });

  it('accepts ended only for the active run and treats stale ended as non-terminal', async () => {
    const video = new FakeVideo();
    const accepted: AodVideoMilestoneRecord[] = [];
    const ended = waitForAodVideoEnded(video as HTMLVideoElement, {
      runId: 'r3-pilot:1',
      timeoutMs: 100,
      isCurrent: (runId) => runId === 'r3-pilot:1',
      onMilestone: (record) => accepted.push(record)
    });

    video.dispatchEvent(new Event('ended'));
    await ended;

    expect(accepted).toEqual([
      {
        milestone: 'ended',
        key: AOD_MEDIA_KEY,
        runId: 'r3-pilot:1',
        accepted: true,
        readyState: 0
      }
    ]);

    const stale: AodVideoMilestoneRecord[] = [];
    const staleEnded = waitForAodVideoEnded(video as HTMLVideoElement, {
      runId: 'r3-pilot:2',
      timeoutMs: 10,
      isCurrent: () => false,
      onMilestone: (record) => stale.push(record)
    });
    video.dispatchEvent(new Event('ended'));
    await staleEnded;

    expect(stale.map((record) => [record.milestone, record.accepted, record.reason])).toEqual([
      ['ended', false, 'stale'],
      ['timeout', false, 'timeout']
    ]);
  });
});
