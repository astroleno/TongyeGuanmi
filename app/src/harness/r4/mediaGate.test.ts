import { describe, expect, it } from 'vitest';
import { storyManifest } from '../../story/manifest';
import { HandleRegistry } from '../../story/registry';
import type { SpineSegmentNode } from '../../story/types';
import {
  findMediaElementByKey,
  prepareTimeoutForManifest,
  requiredMediaKeys,
  waitForRequiredMediaReady
} from './mediaGate';

type FakeMedia = HTMLMediaElement & { readyState: number };

function segment(id: SpineSegmentNode['id']): SpineSegmentNode {
  const found = storyManifest.nodes.find(
    (node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id
  );
  if (!found) {
    throw new Error(`${id} segment missing`);
  }
  return structuredClone(found);
}

function fakeMedia(key: string, readyState = 0): FakeMedia {
  return {
    readyState,
    dataset: { mediaKey: key }
  } as unknown as FakeMedia;
}

describe('R4 contract-driven media readiness gate', () => {
  it('keeps the Director preparation window longer than the slowest media contract', () => {
    const slowestMediaTimeout = Math.max(
      ...storyManifest.nodes.flatMap((node) =>
        node.kind === 'segment'
          ? (node.mediaPlayback ?? []).map((contract) => contract.preparingTimeoutMs)
          : []
      )
    );

    expect(prepareTimeoutForManifest(storyManifest)).toBeGreaterThan(slowestMediaTimeout);
  });

  it('derives required keys from the active playback direction', () => {
    expect(requiredMediaKeys(segment('figure2-distance-expand'), 1)).toEqual([
      'figure2-left-alpha',
      'figure2-right-alpha'
    ]);
    expect(requiredMediaKeys(segment('figure2-distance-expand'), -1)).toEqual([
      'figure2-left-alpha',
      'figure2-right-alpha'
    ]);
    expect(requiredMediaKeys(segment('aod-method-top'), -1)).toEqual([]);
  });

  it('does not resolve until every required video has decoded future data', async () => {
    const registry = new HandleRegistry();
    const left = fakeMedia('figure2-left-alpha');
    const right = fakeMedia('figure2-right-alpha');
    const byKey = new Map([
      ['figure2-left-alpha', left],
      ['figure2-right-alpha', right]
    ]);
    let settled = false;
    const ready = waitForRequiredMediaReady({
      segment: segment('figure2-distance-expand'),
      direction: 1,
      prepareToken: 'r4-media:prepare:1',
      registry,
      getMediaElement: (key) => byKey.get(key) ?? null,
      pollIntervalMs: 1,
      timeoutMs: 200
    }).then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 4));
    expect(settled).toBe(false);
    left.readyState = 3;
    await new Promise((resolve) => setTimeout(resolve, 4));
    expect(settled).toBe(false);
    right.readyState = 3;
    await ready;

    expect(registry.snapshot().mediaReady).toEqual([
      'figure2-left-alpha:r4-media:prepare:1:-',
      'figure2-right-alpha:r4-media:prepare:1:-'
    ]);
  });

  it('finds a media element by its declared key without interpolating selectors', () => {
    const expected = fakeMedia('ph_figure-alpha-scrub', 3);
    const other = fakeMedia('other', 3);
    const root = {
      querySelectorAll: () => [other, expected]
    } as unknown as HTMLElement;

    expect(findMediaElementByKey([root], 'ph_figure-alpha-scrub')).toBe(expected);
  });

  it('fails closed when a required media element never becomes ready', async () => {
    await expect(waitForRequiredMediaReady({
      segment: segment('ph-education'),
      direction: 1,
      prepareToken: 'r4-media:prepare:2',
      registry: new HandleRegistry(),
      getMediaElement: () => null,
      pollIntervalMs: 1,
      timeoutMs: 8
    })).rejects.toThrow(/ph_figure-alpha-scrub.*timed out/);
  });
});
