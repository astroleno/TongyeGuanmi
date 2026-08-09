import { describe, expect, it, vi } from 'vitest';
import {
  PHONE_FIGURE3_PAPER_COLOR,
  createPhoneFigure3PaperCompositor,
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
    const drawImage = vi.fn();
    const context = {
      clearRect: vi.fn(),
      drawImage,
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
      dataset: { phoneFigure3PaperScale: '1.05' } as DOMStringMap,
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
    expect(drawImage).toHaveBeenCalledWith(
      video,
      0,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    );
    expect(drawImage.mock.calls[0]?.[3] as number)
      .toBeGreaterThan(phoneFigure3PaperCoverRect(1280, 720, 390, 844).width);
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

  it('publishes every painted paused frame as Safari endpoint evidence', () => {
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: '',
      globalCompositeOperation: 'source-over',
      setTransform: vi.fn()
    } as unknown as CanvasRenderingContext2D;
    const video = {
      addEventListener: vi.fn(),
      cancelVideoFrameCallback: vi.fn(),
      currentTime: 0,
      ended: false,
      paused: true,
      readyState: 2,
      removeEventListener: vi.fn(),
      videoHeight: 720,
      videoWidth: 1280
    } as unknown as HTMLVideoElement;
    const canvas = {
      width: 0,
      height: 0,
      clientWidth: 390,
      clientHeight: 844,
      dataset: {} as DOMStringMap,
      getBoundingClientRect: () => ({ width: 390, height: 844 }),
      getContext: vi.fn(() => context)
    } as unknown as HTMLCanvasElement;
    const onFrame = vi.fn();
    const onPresentedFrame = vi.fn();

    const compositor = createPhoneFigure3PaperCompositor({
      video,
      canvas,
      onFrame,
      onPresentedFrame
    });
    expect(onFrame).toHaveBeenCalledOnce();
    expect(onPresentedFrame).toHaveBeenCalledOnce();

    expect(compositor.paint()).toBe(true);
    expect(onFrame).toHaveBeenCalledOnce();
    expect(onPresentedFrame).toHaveBeenCalledTimes(2);
    compositor.dispose();
  });
});
