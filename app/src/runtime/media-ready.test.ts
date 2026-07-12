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
  it('requires only the Figure2 pair used by the active native direction', () => {
    expect(requiredMediaKeys(segment('figure2-distance-expand'), 1)).toEqual([
      'figure2-left-alpha',
      'figure2-right-alpha'
    ]);
    expect(requiredMediaKeys(segment('figure2-distance-expand'), -1)).toEqual([
      'figure2-left-alpha-reverse',
      'figure2-right-alpha-reverse'
    ]);
  });

  it('requires only the TTG asset used by the active playback direction', () => {
    expect(requiredMediaKeys(segment('ttg-lab'), 1)).toEqual([
      'ttg_figure-alpha-scrub'
    ]);
    expect(requiredMediaKeys(segment('ttg-lab'), -1)).toEqual([
      'ttg_figure-alpha-scrub-reverse'
    ]);
  });

  it('does not block forward preparation on the unused reverse surface', async () => {
    const forward = { readyState: 3 } as HTMLMediaElement;
    const reverse = { readyState: 0 } as HTMLMediaElement;
    const media = new Map([
      ['ttg_figure-alpha-scrub', forward],
      ['ttg_figure-alpha-scrub-reverse', reverse]
    ]);

    await expect(waitForRequiredMediaReady({
      segment: segment('ttg-lab'),
      direction: 1,
      prepareToken: 'media-ready:prepare:1',
      registry: new HandleRegistry(),
      getMediaElement: (key) => media.get(key) ?? null,
      pollIntervalMs: 1,
      timeoutMs: 8
    })).resolves.toBeUndefined();
  });

  it('promotes only the required parked direction to decoded readiness', async () => {
    let reverseReadyState = 1;
    const forwardLoad = vi.fn();
    const reverseLoad = vi.fn(() => {
      reverseReadyState = 3;
    });
    const forward = {
      readyState: 1,
      preload: 'metadata',
      load: forwardLoad
    } as unknown as HTMLMediaElement;
    const reverse = {
      get readyState() { return reverseReadyState; },
      preload: 'metadata',
      load: reverseLoad
    } as unknown as HTMLMediaElement;
    const media = new Map([
      ['ttg_figure-alpha-scrub', forward],
      ['ttg_figure-alpha-scrub-reverse', reverse]
    ]);

    await expect(waitForRequiredMediaReady({
      segment: segment('ttg-lab'),
      direction: -1,
      prepareToken: 'media-ready:prepare:2',
      registry: new HandleRegistry(),
      getMediaElement: (key) => media.get(key) ?? null,
      pollIntervalMs: 1,
      timeoutMs: 20
    })).resolves.toBeUndefined();

    expect(reverse.preload).toBe('auto');
    expect(reverseLoad).toHaveBeenCalledTimes(1);
    expect(forward.preload).toBe('metadata');
    expect(forwardLoad).not.toHaveBeenCalled();
  });

  it('leaves the parked Figure2 forward pair at metadata during reverse preparation', async () => {
    const load = vi.fn();
    const media = new Map<string, HTMLMediaElement>([
      ['figure2-left-alpha', { readyState: 1, preload: 'metadata', load } as unknown as HTMLMediaElement],
      ['figure2-right-alpha', { readyState: 1, preload: 'metadata', load } as unknown as HTMLMediaElement],
      ['figure2-left-alpha-reverse', { readyState: 3, preload: 'metadata' } as HTMLMediaElement],
      ['figure2-right-alpha-reverse', { readyState: 3, preload: 'metadata' } as HTMLMediaElement]
    ]);

    await expect(waitForRequiredMediaReady({
      segment: segment('figure2-distance-expand'),
      direction: -1,
      prepareToken: 'media-ready:prepare:3',
      registry: new HandleRegistry(),
      getMediaElement: (key) => media.get(key) ?? null,
      pollIntervalMs: 1,
      timeoutMs: 8
    })).resolves.toBeUndefined();

    expect(media.get('figure2-left-alpha')?.preload).toBe('metadata');
    expect(media.get('figure2-right-alpha')?.preload).toBe('metadata');
    expect(load).not.toHaveBeenCalled();
  });
});
