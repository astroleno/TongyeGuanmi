// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { compositeScrollMedia } from '../../media/scroll-media-sampling';
import { AodAnimationScene } from './index';

it('composes the native AOD frame only in the accepted scroll batch and releases its buffer', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const drawImage = vi.fn(), clearRect = vi.fn();
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, clearRect } as unknown as CanvasRenderingContext2D);
  const host = document.createElement('div'); host.dataset.scrollPlatform = 'desktop'; document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AodAnimationScene scene="aod-animation" hidden={false} />));
    const video = host.querySelector('video')!, canvas = host.querySelector('canvas')!;
    expect(drawImage).not.toHaveBeenCalled();
    expect(compositeScrollMedia(video)).toBe(false);
    Object.defineProperties(video, { readyState: { value: 4 }, videoWidth: { value: 1672 }, videoHeight: { value: 941 } });
    video.currentTime = .6;
    expect(compositeScrollMedia(video)).toBe(true);
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0);
    expect([canvas.width, canvas.height]).toEqual([1672, 941]);
    expect(canvas.dataset.scrollVideoMediaTime).toBe('0.6');
    expect(canvas.style.filter).toBe('saturate(.95) contrast(1.02)');
    expect(video.style.opacity).toBe('0');
    await act(async () => root.unmount());
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
    drawImage.mockClear(); compositeScrollMedia(video); expect(drawImage).not.toHaveBeenCalled();
  } finally { context.mockRestore(); host.remove(); vi.unstubAllGlobals(); }
});
