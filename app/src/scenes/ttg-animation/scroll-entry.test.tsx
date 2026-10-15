// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const prepare = vi.hoisted(() => vi.fn(() => Promise.resolve({ status: 'ready' })));
vi.mock('../../media/timeline-video-driver', () => ({ prepareTimelineVideoFrame: prepare,
  driveTimelineVideo: vi.fn(() => ({})), disposeTimelineVideoDriver: vi.fn() }));
import { renderTtgAnimationProgress, ttgAnimationScene, TTG_FIGURE_END_SECONDS } from './index';
import { driveTimelineVideo } from '../../media/timeline-video-driver';
import { phAnimationScene } from '../ph-animation';

it.each([ttgAnimationScene, phAnimationScene])('$id leaves cold-frame ownership to continuous scroll', async (scene) => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); host.dataset.scrollPlatform = 'desktop'; document.body.append(host);
  const root = createRoot(host);
  const Scene = scene.Component;
  try {
    await act(async () => root.render(<Scene scene={scene.id} hidden={false} />));
    expect(prepare).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});

it('samples the authored TTG media time on cold scroll seeks without a legacy leg commit', () => {
  const section = document.createElement('article');
  section.dataset.r4Scene = 'ttg-animation';
  section.innerHTML = '<video data-ttg-figure-video></video>';
  const video = section.querySelector('video');
  for (const progress of [.2, .85, .5, 0, 1]) {
    vi.mocked(driveTimelineVideo).mockClear();
    renderTtgAnimationProgress(section, progress, {
      mediaRun: { runId: 'scroll:cold', direction: 1, sampling: 'scroll' }
    });
    expect(driveTimelineVideo).toHaveBeenCalledWith(video, expect.objectContaining({
      progress, runId: 'scroll:cold', mode: 'timeline', endSeconds: TTG_FIGURE_END_SECONDS
    }));
  }
});
