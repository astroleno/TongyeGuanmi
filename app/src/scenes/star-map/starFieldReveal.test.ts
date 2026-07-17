import { afterEach, describe, expect, it, vi } from 'vitest';
import { initStarFieldReveal } from './starFieldReveal';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StarFieldReveal', () => {
  it('enables anonymous CORS before requesting a canvas-readable CDN image', () => {
    const assignments: string[] = [];
    class FakeImage {
      decoding: 'async' | 'auto' | 'sync' = 'auto';

      addEventListener(): void {}

      set crossOrigin(value: string) {
        assignments.push(`crossOrigin:${value}`);
      }

      set src(value: string) {
        assignments.push(`src:${value}`);
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const canvas = {
      getContext: () => ({})
    } as unknown as HTMLCanvasElement;

    initStarFieldReveal({
      canvas,
      sourceUrl: 'https://assets.tongye.me/releases/test/assets/back2.webp',
      autoplay: false
    });

    expect(assignments).toEqual([
      'crossOrigin:anonymous',
      'src:https://assets.tongye.me/releases/test/assets/back2.webp'
    ]);
  });
});
