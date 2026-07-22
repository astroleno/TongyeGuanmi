import { describe, expect, it, vi } from 'vitest';
import {
  PHONE_FIGURE3_PAPER_COLOR,
  paintPhoneFigure3PaperFrame,
  phoneFigure3PaperCoverRect,
  releasePhoneFigure3PaperCanvas
} from './paper-compositor';

describe('Figure3 phone paper compositor', () => {
  it('keeps the authored left-edge cover crop on a portrait stage', () => {
    const frame = phoneFigure3PaperCoverRect(1280, 720, 390, 844);

    expect(frame.x).toBe(0);
    expect(frame.y).toBeCloseTo(0);
    expect(frame.width).toBeCloseTo(1500.444, 3);
    expect(frame.height).toBeCloseTo(844);
  });

  it('multiplies a decoded frame into the canonical desktop paper', () => {
    const compositions: string[] = [];
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      setTransform: vi.fn()
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(context, 'globalCompositeOperation', {
      get: () => compositions.at(-1) ?? 'source-over',
      set: (value: string) => compositions.push(value)
    });
    const canvas = {
      width: 0,
      height: 0,
      clientWidth: 390,
      clientHeight: 844,
      dataset: {} as DOMStringMap,
      getBoundingClientRect: () => ({ width: 390, height: 844 }),
      getContext: vi.fn(() => context)
    } as unknown as HTMLCanvasElement;
    const video = {
      readyState: 2,
      videoWidth: 1280,
      videoHeight: 720
    } as unknown as HTMLVideoElement;

    expect(paintPhoneFigure3PaperFrame(video, canvas)).toBe(true);
    expect(context.fillStyle).toBe(PHONE_FIGURE3_PAPER_COLOR);
    expect(compositions).toContain('multiply');
    expect(context.drawImage).toHaveBeenCalledWith(
      video,
      0,
      expect.any(Number),
      expect.any(Number),
      844
    );
    expect(canvas.dataset.phoneFigure3PaperFrame).toBe('ready');
  });

  it('releases the canvas backing store after retirement', () => {
    const canvas = {
      width: 780,
      height: 1688,
      dataset: { phoneFigure3PaperFrame: 'ready' }
    } as unknown as HTMLCanvasElement;

    releasePhoneFigure3PaperCanvas(canvas);

    expect(canvas.width).toBe(1);
    expect(canvas.height).toBe(1);
    expect(canvas.dataset.phoneFigure3PaperFrame).toBeUndefined();
  });
});
