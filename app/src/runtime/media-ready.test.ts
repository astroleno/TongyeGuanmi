import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prepareTimelineVideoFrame } from '../media/timeline-video-driver';

import { storyManifest } from '../story/manifest';
import { HandleRegistry } from '../story/registry';
import type { SpineSegmentNode } from '../story/types';
import { requiredMediaKeys, waitForRequiredMediaReady } from './media-ready';

vi.mock('../media/timeline-video-driver', () => ({ prepareTimelineVideoFrame: vi.fn() }));

beforeEach(() => {
  vi.mocked(prepareTimelineVideoFrame).mockReset().mockResolvedValue({
    status: 'ready', runId: 'admission', direction: 1, generation: 1, targetTime: 0
  });
});

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

  it('delegates Figure2 decoder admission to the shared exact-frame proof even without future buffering', async () => {
    const readyState = 2;
    const load = vi.fn();
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

    expect(load).not.toHaveBeenCalled();
    expect(prepareTimelineVideoFrame).toHaveBeenCalledOnce();
    expect(prepareTimelineVideoFrame).toHaveBeenCalledWith(video, expect.objectContaining({
      progress: 0, signal: expect.any(AbortSignal)
    }));
  });

  it('never treats readyState alone as proof and preserves the decoder failure', async () => {
    const failure = new Error('decoder stalled');
    vi.mocked(prepareTimelineVideoFrame).mockRejectedValueOnce(failure);
    const video = { readyState: 4, duration: 2 } as HTMLMediaElement;
    await expect(waitForRequiredMediaReady({
      segment: segment('lab-ph'), direction: 1, prepareToken: 'proof:prepare:1',
      registry: new HandleRegistry(), getMediaElement: () => video
    })).rejects.toBe(failure);
  });

  it('cancels a missing element promptly instead of consuming its deadline', async () => {
    const controller = new AbortController();
    const pending = waitForRequiredMediaReady({
      segment: segment('lab-ph'), direction: 1, prepareToken: 'proof:prepare:2',
      registry: new HandleRegistry(), getMediaElement: () => null, signal: controller.signal
    });
    const failure = new Error('left segment');
    controller.abort(failure);
    await expect(pending).rejects.toBe(failure);
    expect(prepareTimelineVideoFrame).not.toHaveBeenCalled();
  });

  it('cancels sibling decoder admission when one required surface fails', async () => {
    const failure = new Error('first surface failed');
    let siblingSignal: AbortSignal | undefined;
    vi.mocked(prepareTimelineVideoFrame)
      .mockRejectedValueOnce(failure)
      .mockImplementationOnce((_video, input) => {
        siblingSignal = input.signal;
        return new Promise((_resolve, reject) => input.signal?.addEventListener('abort', () => reject(input.signal?.reason)));
      });
    await expect(waitForRequiredMediaReady({
      segment: segment('education-crane'), direction: 1, prepareToken: 'proof:prepare:4',
      registry: new HandleRegistry(), getMediaElement: () => ({ readyState: 2, duration: 2 }) as HTMLMediaElement
    })).rejects.toBe(failure);
    expect(siblingSignal?.aborted).toBe(true);
  });

  it('reports a source error without waiting for the preparation deadline', async () => {
    const video = { error: { code: 3, message: 'decode failed' } } as HTMLMediaElement;
    await expect(waitForRequiredMediaReady({
      segment: segment('lab-ph'), direction: 1, prepareToken: 'proof:prepare:3',
      registry: new HandleRegistry(), getMediaElement: () => video
    })).rejects.toMatchObject({ code: 'MEDIA_ELEMENT_ERROR', cause: video.error });
  });
});
