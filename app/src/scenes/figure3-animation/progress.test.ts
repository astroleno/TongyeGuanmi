import { describe, expect, it } from 'vitest';
import {
  FakeElement as TimelineRoot,
  FakeVideo as TimelineVideo
} from '../../transitions/__fixtures__/back-half.fixture';
import { renderFigure3AnimationProgress } from './index';

describe('Figure3 media timeline ownership', () => {
  it('keeps the latest forward/reverse/forward run as the only active media owner', () => {
    const root = new TimelineRoot();
    const video = new TimelineVideo();
    root.dataset.r4Scene = 'figure3-animation';
    root.connect('[data-figure3-alpha-video]', video);

    renderFigure3AnimationProgress(root as unknown as HTMLElement, 0.2, {
      mediaRun: { runId: 'figure3-media:1', direction: 1 }
    });
    expect(video.dataset.timelineVideoRun).toBe('figure3-media:1');
    expect(video.dataset.timelineVideoDirection).toBe('1');

    renderFigure3AnimationProgress(root as unknown as HTMLElement, 0.8, {
      mediaRun: { runId: 'figure3-media:2', direction: -1 }
    });
    expect(video.dataset.timelineVideoRun).toBe('figure3-media:2');
    expect(video.dataset.timelineVideoDirection).toBe('-1');

    renderFigure3AnimationProgress(root as unknown as HTMLElement, 0.4, {
      mediaRun: { runId: 'figure3-media:3', direction: 1 }
    });
    expect(video.dataset.timelineVideoRun).toBe('figure3-media:3');
    expect(video.dataset.timelineVideoDirection).toBe('1');
    expect(video.currentTimeWrites).toBeGreaterThan(0);
  });

  it('keeps the alpha video visible and disables the competing solid fill until p=1', () => {
    const root = new TimelineRoot();
    root.dataset.r4Scene = 'figure3-animation';

    expect(renderFigure3AnimationProgress(root as unknown as HTMLElement, 0.99)).toMatchObject({
      fillOpacity: 0,
      videoOpacity: 1
    });
    expect(renderFigure3AnimationProgress(root as unknown as HTMLElement, 1)).toMatchObject({
      fillOpacity: 0,
      videoOpacity: 0
    });
  });

  it('does not resubmit an unchanged terminal frame during the stable endpoint tail', () => {
    const root = new TimelineRoot();
    const video = new TimelineVideo();
    root.dataset.r4Scene = 'figure3-animation';
    root.connect('[data-figure3-alpha-video]', video);
    const mediaRun = { runId: 'figure3-terminal:1', direction: 1 as const };

    renderFigure3AnimationProgress(root as unknown as HTMLElement, 1, { mediaRun });
    const writes = video.currentTimeWrites;
    renderFigure3AnimationProgress(root as unknown as HTMLElement, 1, { mediaRun });

    expect(video.currentTimeWrites).toBe(writes);
  });
});
