// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const prepare = vi.hoisted(() => vi.fn(() => Promise.resolve({ status: 'ready' })));
vi.mock('../../media/timeline-video-driver', () => ({ prepareTimelineVideoFrame: prepare,
  driveTimelineVideo: vi.fn(() => ({})), disposeTimelineVideoDriver: vi.fn() }));
import { Figure2AnimationScene } from './index';

it('does not start a second opening-frame seek under the continuous owner', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const host = document.createElement('div'); host.dataset.scrollPlatform = 'desktop'; document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Figure2AnimationScene scene="figure2-animation" hidden={false} />));
    expect(prepare).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); }
});
