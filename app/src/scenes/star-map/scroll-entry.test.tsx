// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { renderStarMapProgress, starMapScene } from './index';

const fallback = vi.hoisted(() => ({ ready: false, renderBackground: vi.fn(), dispose: vi.fn() }));
vi.mock('./star-field-worker-client', () => ({
  StarFieldWorkerClient: vi.fn(),
  loadStarFieldFallback: async () => ({ createStarFieldFallback: () => fallback })
}));

it('restores the requested scroll texture after asynchronous readiness and samples through the outer layer', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('Worker', undefined);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.set(++id, callback); return id; });
  vi.stubGlobal('cancelAnimationFrame', (key: number) => frames.delete(key));
  fallback.ready = false; fallback.renderBackground.mockClear();
  const host = document.createElement('div'); host.dataset.scrollPlatform = 'desktop'; document.body.append(host);
  const root = createRoot(host), Component = starMapScene.Component;
  try {
    renderStarMapProgress(host, .75);
    await act(async () => root.render(<Component scene="star-map" hidden={false} />));
    expect(fallback.renderBackground).not.toHaveBeenCalled();
    fallback.ready = true;
    await act(async () => {
      const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback(98765));
    });
    expect(fallback.renderBackground).toHaveBeenLastCalledWith(expect.objectContaining({ timeSeconds: 9 }));
    renderStarMapProgress(host, .25);
    expect(fallback.renderBackground).toHaveBeenLastCalledWith(expect.objectContaining({ timeSeconds: 3 }));
    expect(frames.size).toBe(0);
  } finally {
    await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  }
});
