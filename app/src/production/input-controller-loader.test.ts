import { describe, expect, it, vi } from 'vitest';
import { createInputControllerLoader } from './input-controller-loader';

describe('input controller loader', () => {
  it('starts one module request during prewarm and reuses it for interaction attachment', async () => {
    const module = { attachStoryInput: vi.fn() } as unknown as typeof import('./input-controller');
    const importModule = vi.fn(async () => module);
    const loader = createInputControllerLoader(importModule);

    loader.prewarm();
    const loaded = loader.load();

    expect(importModule).toHaveBeenCalledOnce();
    await expect(loaded).resolves.toBe(module);
  });

  it('retries the module request after a failed background prewarm', async () => {
    const module = { attachStoryInput: vi.fn() } as unknown as typeof import('./input-controller');
    const importModule = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(module);
    const loader = createInputControllerLoader(importModule);

    loader.prewarm();
    await Promise.resolve();
    await Promise.resolve();

    await expect(loader.load()).resolves.toBe(module);
    expect(importModule).toHaveBeenCalledTimes(2);
  });
});
