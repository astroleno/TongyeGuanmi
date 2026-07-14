import { describe, expect, it, vi } from 'vitest';

import { storyManifest } from '../story/manifest';
import { HandleRegistry } from '../story/registry';
import type { SpineSegmentNode } from '../story/types';
import { requiredMediaKeys, waitForRequiredMediaReady } from './media-ready';

function segment(id: SpineSegmentNode['id']): SpineSegmentNode {
  const found = storyManifest.nodes.find(
    (node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id
  );
  if (!found) {
    throw new Error(`${id} segment missing`);
  }
  return structuredClone(found);
}

describe('production media readiness', () => {
  it('requires the same canonical Figure2 pair in both directions', () => {
    const expected = ['figure2-left-motion', 'figure2-right-motion'];

    expect(requiredMediaKeys(segment('figure2-distance-expand'), 1)).toEqual(expected);
    expect(requiredMediaKeys(segment('figure2-distance-expand'), -1)).toEqual(expected);
  });

  it('requires the one TTG surface in both directions', () => {
    expect(requiredMediaKeys(segment('ttg-lab'), 1)).toEqual(['ttg-figure-motion']);
    expect(requiredMediaKeys(segment('ttg-lab'), -1)).toEqual(['ttg-figure-motion']);
  });

  it('does not wait for a removed directional surface during a canonical TTG prepare', async () => {
    const video = { readyState: 3, preload: 'metadata', load: vi.fn() } as unknown as HTMLMediaElement;

    await expect(waitForRequiredMediaReady({
      segment: segment('ttg-lab'),
      direction: -1,
      prepareToken: 'media-ready:prepare:1',
      registry: new HandleRegistry(),
      getMediaElement: (key) => key === 'ttg-figure-motion' ? video : null,
      pollIntervalMs: 1,
      timeoutMs: 8
    })).resolves.toBeUndefined();

    expect(video.load).not.toHaveBeenCalled();
  });

  it('promotes each required canonical Figure2 surface exactly once', async () => {
    let leftReadyState = 1;
    let rightReadyState = 1;
    const leftLoad = vi.fn(() => { leftReadyState = 3; });
    const rightLoad = vi.fn(() => { rightReadyState = 3; });
    const left = {
      get readyState() { return leftReadyState; },
      preload: 'metadata',
      load: leftLoad
    } as unknown as HTMLMediaElement;
    const right = {
      get readyState() { return rightReadyState; },
      preload: 'metadata',
      load: rightLoad
    } as unknown as HTMLMediaElement;
    const media = new Map([
      ['figure2-left-motion', left],
      ['figure2-right-motion', right]
    ]);

    await expect(waitForRequiredMediaReady({
      segment: segment('figure2-distance-expand'),
      direction: -1,
      prepareToken: 'media-ready:prepare:2',
      registry: new HandleRegistry(),
      getMediaElement: (key) => media.get(key) ?? null,
      pollIntervalMs: 1,
      timeoutMs: 20
    })).resolves.toBeUndefined();

    expect(left.preload).toBe('auto');
    expect(right.preload).toBe('auto');
    expect(leftLoad).toHaveBeenCalledOnce();
    expect(rightLoad).toHaveBeenCalledOnce();
  });
});
