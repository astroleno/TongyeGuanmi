import { describe, expect, it, vi } from 'vitest';

import { storyManifest } from '../story/manifest';
import { HandleRegistry } from '../story/registry';
import type { SpineSegmentNode } from '../story/types';
import {
  prepareTimeoutForManifest,
  requiredMediaKeys,
  waitForRequiredMediaReady
} from './media-ready';

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
  it('keeps the Director deadline above the longest segment build gate', () => {
    expect(prepareTimeoutForManifest(storyManifest)).toBe(16_000);
  });

  it('declares every CDN animation surface needed by an incoming visual hold', () => {
    const expected = new Map<SpineSegmentNode['id'], readonly string[]>([
      ['star-map-aod', ['aod-figure-motion']],
      ['method-bottom-figure2', ['figure2-pair-motion']],
      ['brand-figure3', ['figure3-motion']],
      ['services-ttg', ['ttg-figure-motion']],
      ['lab-ph', ['ph-figure-motion']],
      ['education-crane', ['crane-figure-motion', 'crane-flock-motion']]
    ]);

    for (const [id, media] of expected) {
      expect(requiredMediaKeys(segment(id), 1), id).toEqual(media);
    }
  });

  it('requires the same canonical Figure2 surface for entry and distance in both directions', () => {
    expect(requiredMediaKeys(segment('method-bottom-figure2'), 1)).toEqual(['figure2-pair-motion']);
    expect(requiredMediaKeys(segment('method-bottom-figure2'), -1)).toEqual(['figure2-pair-motion']);
    expect(requiredMediaKeys(segment('figure2-distance-expand'), 1)).toEqual(['figure2-pair-motion']);
    expect(requiredMediaKeys(segment('figure2-distance-expand'), -1)).toEqual(['figure2-pair-motion']);
  });

  it('keeps the PH opening frame ready while building either handoff direction', () => {
    expect(requiredMediaKeys(segment('lab-ph'), 1)).toEqual(['ph-figure-motion']);
    expect(requiredMediaKeys(segment('lab-ph'), -1)).toEqual(['ph-figure-motion']);
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

  it('promotes the canonical Figure2 surface exactly once', async () => {
    let readyState = 1;
    const load = vi.fn(() => { readyState = 3; });
    const video = {
      get readyState() { return readyState; },
      preload: 'metadata',
      load
    } as unknown as HTMLMediaElement;

    await expect(waitForRequiredMediaReady({
      segment: segment('figure2-distance-expand'),
      direction: -1,
      prepareToken: 'media-ready:prepare:2',
      registry: new HandleRegistry(),
      getMediaElement: (key) => key === 'figure2-pair-motion' ? video : null,
      pollIntervalMs: 1,
      timeoutMs: 20
    })).resolves.toBeUndefined();

    expect(video.preload).toBe('auto');
    expect(load).toHaveBeenCalledOnce();
  });
});
