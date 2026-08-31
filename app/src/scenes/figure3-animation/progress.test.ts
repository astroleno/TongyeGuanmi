import { describe, expect, it } from 'vitest';
import {
  FakeElement as TimelineRoot,
  FakeVideo as TimelineVideo
} from '../../transitions/__fixtures__/back-half.fixture';
import {
  FIGURE3_FRAME_MAP,
  figure3MediaProgressForFrame,
  renderFigure3AnimationProgress,
  requestFigure3AnimationFrame
} from './index';

describe('Figure3 media timeline ownership', () => {
  it('keeps visual rendering pure and records the active media run only', () => {
    const root = new TimelineRoot();
    const video = new TimelineVideo();
    root.dataset.r4Scene = 'figure3-animation';
    root.connect('[data-figure3-alpha-video]', video);

    renderFigure3AnimationProgress(root as unknown as HTMLElement, 0.2, {
      mediaRun: { runId: 'figure3-media:1', direction: 1 }
    });
    expect(root.dataset.figure3PlaybackRun).toBe('figure3-media:1');
    expect(root.dataset.figure3PlaybackDirection).toBe('1');
    expect(video.currentTimeWrites).toBe(0);

    renderFigure3AnimationProgress(root as unknown as HTMLElement, 0.8, {
      mediaRun: { runId: 'figure3-media:2', direction: -1 }
    });
    expect(root.dataset.figure3PlaybackRun).toBe('figure3-media:2');
    expect(root.dataset.figure3PlaybackDirection).toBe('-1');

    renderFigure3AnimationProgress(root as unknown as HTMLElement, 0.4, {
      mediaRun: { runId: 'figure3-media:3', direction: 1 }
    });
    expect(root.dataset.figure3PlaybackRun).toBe('figure3-media:3');
    expect(root.dataset.figure3PlaybackDirection).toBe('1');
    expect(video.currentTimeWrites).toBe(0);
  });

  it('keeps the alpha video visible while the source layer owns terminal fade-out', () => {
    const root = new TimelineRoot();
    root.dataset.r4Scene = 'figure3-animation';

    expect(renderFigure3AnimationProgress(root as unknown as HTMLElement, 0.99)).toMatchObject({
      fillOpacity: 0,
      videoOpacity: 1
    });
    expect(renderFigure3AnimationProgress(root as unknown as HTMLElement, 1)).toMatchObject({
      fillOpacity: 0,
      videoOpacity: 1
    });
  });

  it('presents an exact mapped frame without starting native playback', async () => {
    const root = new TimelineRoot();
    const video = new TimelineVideo();
    root.dataset.r4Scene = 'figure3-animation';
    root.connect('[data-figure3-alpha-video]', video);
    const mediaRun = { runId: 'figure3-present:1', direction: 1 as const };

    const result = await requestFigure3AnimationFrame(
      root as unknown as HTMLElement,
      0.5,
      mediaRun
    );

    expect(result.status).toBe('ready');
    expect(result.targetFrameIndex).toBe(result.presentedFrameIndex);
    expect(result.evidence).toBe('video-frame-callback');
    expect(video.playCalls).toBe(0);
    expect(root.dataset.figure3DesiredFrame).toBe(String(result.targetFrameIndex));
    expect(root.dataset.figure3PresentedFrame).toBe(String(result.presentedFrameIndex));
    expect(root.dataset.figure3FrameEvidence).toBe('video-frame-callback');
    expect(figure3MediaProgressForFrame(result.presentedFrameIndex)).toBeGreaterThan(0.4);
    expect(FIGURE3_FRAME_MAP.endFrame).toBeGreaterThan(result.presentedFrameIndex);
  });
});
