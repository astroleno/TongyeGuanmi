import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class WarmImage {
  static instances: WarmImage[] = [];
  src = '';
  crossOrigin = '';
  decoding = '';
  fetchPriority = '';
  naturalWidth = 100;
  naturalHeight = 100;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  decode = vi.fn(async (): Promise<void> => undefined);
  constructor() { WarmImage.instances.push(this); }
}

beforeEach(() => {
  vi.resetModules();
  WarmImage.instances = [];
  vi.stubGlobal('Image', WarmImage);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

async function imageAt(index: number): Promise<WarmImage> {
  await vi.waitFor(() => expect(WarmImage.instances[index]).toBeDefined());
  return WarmImage.instances[index]!;
}

describe('adjacent image warming', () => {
  it('shares an anonymous-CORS decode across concurrent callers', async () => {
    const { prewarmImages } = await import('./image-prewarm');
    const first = prewarmImages(['/next.webp']);
    const second = prewarmImages(['/next.webp']);
    const image = await imageAt(0);
    expect(WarmImage.instances).toHaveLength(1);
    expect(image.crossOrigin).toBe('anonymous');
    expect(image.decoding).toBe('async');
    expect(image.fetchPriority).toBe('low');
    image.onload?.();
    await Promise.all([first, second]);
    expect(image.decode).toHaveBeenCalledOnce();
  });

  it('allows retry after load or decode failure', async () => {
    const { prewarmImages } = await import('./image-prewarm');
    const failed = prewarmImages(['/retry.webp']);
    (await imageAt(0)).onerror?.();
    await failed;
    const decoded = prewarmImages(['/retry.webp']);
    (await imageAt(1)).decode.mockRejectedValueOnce(new Error('decode'));
    WarmImage.instances[1]!.onload?.();
    await decoded;
    const retry = prewarmImages(['/retry.webp']);
    await imageAt(2);
    expect(WarmImage.instances).toHaveLength(3);
    WarmImage.instances[2]!.onload?.();
    await retry;
  });

  it('releases old decoded references after twelve adjacent artworks', async () => {
    const { prewarmImages } = await import('./image-prewarm');
    for (let i = 0; i < 13; i++) {
      const ready = prewarmImages([`/${i}.webp`]);
      (await imageAt(i)).onload?.();
      await ready;
    }
    await prewarmImages(['/12.webp']);
    expect(WarmImage.instances).toHaveLength(13);
    const reloaded = prewarmImages(['/0.webp']);
    await imageAt(13);
    expect(WarmImage.instances).toHaveLength(14);
    WarmImage.instances[13]!.onload?.();
    await reloaded;
  });

  it('serializes requests and decoding instead of competing with the visible scene', async () => {
    const { prewarmImages } = await import('./image-prewarm');
    const complete = prewarmImages(['/a.webp', '/b.webp']);
    const first = await imageAt(0);
    let decoded!: () => void;
    first.decode.mockImplementationOnce(() => new Promise<void>((resolve) => { decoded = resolve; }));
    first.onload?.();
    await vi.waitFor(() => expect(first.decode).toHaveBeenCalled());
    expect(WarmImage.instances).toHaveLength(1);
    decoded();
    (await imageAt(1)).onload?.();
    await complete;
  });

  it('releases a stalled request so later artwork and a retry can load', async () => {
    vi.useFakeTimers();
    const { prewarmImages } = await import('./image-prewarm');
    const complete = prewarmImages(['/stalled.webp', '/next.webp']);
    await vi.advanceTimersByTimeAsync(6000);
    expect(WarmImage.instances[0]!.src).toBe('');
    expect(WarmImage.instances[0]!.onload).toBeNull();
    WarmImage.instances[1]!.onload?.();
    await complete;
    const retry = prewarmImages(['/stalled.webp']);
    await vi.advanceTimersByTimeAsync(0);
    WarmImage.instances[2]!.onload?.();
    await retry;
  });

  it('evicts decoded pixels above 24 MiB even with fewer than twelve images', async () => {
    const { prewarmImages } = await import('./image-prewarm');
    for (let i = 0; i < 2; i++) {
      const ready = prewarmImages([`/large-${i}.webp`]);
      const image = await imageAt(i);
      image.naturalWidth = image.naturalHeight = 2048;
      image.onload?.();
      await ready;
    }
    await prewarmImages(['/large-1.webp']);
    expect(WarmImage.instances).toHaveLength(2);
    const reload = prewarmImages(['/large-0.webp']);
    (await imageAt(2)).onload?.();
    await reload;
  });

  it.each([{ saveData: true }, { effectiveType: '3g' }, { downlink: 1 }])(
    'does not start optional requests on constrained connections: %o', async (connection) => {
      vi.stubGlobal('navigator', { connection });
      const { prewarmImages } = await import('./image-prewarm');
      await prewarmImages(['/optional.webp']);
      expect(WarmImage.instances).toHaveLength(0);
    }
  );
});
