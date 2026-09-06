import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { FakeElement, FakeVideo } from '../../transitions/__fixtures__/back-half.fixture';
import { frameIndexForMediaTime } from '../../media/frame-timebase';
import { videoFrameMapFor } from '../../media/video-frame-maps';
import {
  parkPhMedia,
  phAnimationScene,
  phPlaybackProgress,
  phRawProgressForFrame,
  renderPhAnimationProgress,
  requestPhAnimationFrame
} from './index';

class ExactFakeVideo extends FakeVideo {
  private callbackId = 0;
  private readonly frameCallbacks = new Map<number, (
    now: DOMHighResTimeStamp,
    metadata: VideoFrameCallbackMetadata
  ) => void>();

  override requestVideoFrameCallback(
    callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void
  ): number {
    const handle = ++this.callbackId;
    this.frameCallbacks.set(handle, callback);
    queueMicrotask(() => {
      const pending = this.frameCallbacks.get(handle);
      if (!pending) {
        return;
      }
      this.frameCallbacks.delete(handle);
      pending(0, { mediaTime: this.currentTime } as VideoFrameCallbackMetadata);
    });
    return handle;
  }

  override cancelVideoFrameCallback(handle?: number): void {
    if (handle === undefined) {
      this.frameCallbacks.clear();
      return;
    }
    this.frameCallbacks.delete(handle);
  }
}

describe('PH media residency', () => {
  it('parks a prepared PH surface without downgrading preload or reloading metadata', () => {
    const root = new FakeElement();
    const video = new FakeVideo();
    const pause = vi.spyOn(video, 'pause');
    root.dataset.r4Scene = 'ph-animation';
    root.connect('[data-ph-alpha-video]', video);

    parkPhMedia(root as unknown as HTMLElement);

    expect(pause).toHaveBeenCalledOnce();
    expect(video.preload).toBe('auto');
    expect(video.loadCalls).toBe(0);
  });

  it('declares auto preload for the full mounted PH scene window', () => {
    const markup = renderToStaticMarkup(createElement(phAnimationScene.Component, {
      scene: 'ph-animation',
      hidden: false,
      role: 'next'
    }));

    expect(markup).toContain('data-ph-alpha-video="true"');
    expect(markup).toContain('preload="auto"');
  });

  it('requests exact forward and reverse frames without starting native playback', async () => {
    const root = new FakeElement();
    const video = new ExactFakeVideo();
    root.dataset.r4Scene = 'ph-animation';
    root.connect('[data-ph-alpha-video]', video);
    const frameMap = videoFrameMapFor('ph-figure-motion');

    const forward = await requestPhAnimationFrame(root as unknown as HTMLElement, 0.5, {
      runId: 'ph-progress:forward',
      direction: 1,
      sequence: 1
    });
    const reverse = await requestPhAnimationFrame(root as unknown as HTMLElement, 0.25, {
      runId: 'ph-progress:reverse',
      direction: -1,
      sequence: 2
    });

    expect(forward).toMatchObject({
      status: 'ready',
      targetFrameIndex: Math.round(phPlaybackProgress(0.5) * frameMap.endFrame),
      evidence: 'video-frame-callback'
    });
    expect(reverse).toMatchObject({
      status: 'ready',
      targetFrameIndex: Math.round(phPlaybackProgress(0.25) * frameMap.endFrame),
      evidence: 'video-frame-callback'
    });
    expect(forward.presentedFrameIndex).toBe(forward.targetFrameIndex);
    expect(reverse.presentedFrameIndex).toBe(reverse.targetFrameIndex);
    expect(video.playCalls).toBe(0);
    expect(frameIndexForMediaTime(frameMap, video.currentTime)).toBe(reverse.presentedFrameIndex);
    expect(phPlaybackProgress(phRawProgressForFrame(forward.presentedFrameIndex))).toBeCloseTo(
      forward.presentedFrameIndex / frameMap.endFrame,
      8
    );
  });

  it('keeps render-only progress free of media seeks and native playback', () => {
    const root = new FakeElement();
    const video = new ExactFakeVideo();
    root.dataset.r4Scene = 'ph-animation';
    root.connect('[data-ph-alpha-video]', video);

    renderPhAnimationProgress(root as unknown as HTMLElement, 0.75, {
      mediaRun: { runId: 'ph-render-only:1', direction: 1 }
    });

    expect(video.currentTimeWrites).toBe(0);
    expect(video.playCalls).toBe(0);
    expect(root.dataset.phProgress).toBe(phPlaybackProgress(0.75).toFixed(4));
  });
});
