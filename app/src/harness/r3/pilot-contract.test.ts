import { describe, expect, it, vi } from 'vitest';
import { HandleRegistry } from '../../story/registry';
import { storyManifest } from '../../story/manifest';
import { verifySegmentTimeline } from '../../story/verifySegmentTimeline';
import type { LayerHandle, LayerVisibilityState, SegmentId, SpineSegmentNode, TransitionContext } from '../../story/types';
import { createStarMapAodTransition } from '../../transitions/star-map-aod';
import { AOD_METHOD_COPY_CUE, createAodMethodTopTransition } from '../../transitions/aod-method-top';
import { AOD_MEDIA_KEY } from '../../transitions/aod-method-top/media';
import { shouldWaitForPilotMediaReady } from './mediaGate';

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
  if (!found) {
    throw new Error(`missing segment ${id}`);
  }
  return found;
}

function layer(scene: LayerHandle['scene'], role: LayerHandle['role']): LayerHandle {
  let visibility: LayerVisibilityState = {
    mounted: true,
    visible: role === 'current',
    inert: role !== 'current',
    opacity: role === 'current' ? 1 : 0,
    pointerEvents: role === 'current' ? 'auto' : 'none'
  };
  return {
    scene,
    role,
    element: null,
    get visibility() {
      return visibility;
    },
    setVisibility(next) {
      visibility = next;
    },
    dispose() {
      visibility = {
        mounted: false,
        visible: false,
        inert: true,
        opacity: 0,
        pointerEvents: 'none'
      };
    }
  };
}

function context(id: SegmentId): TransitionContext {
  const node = segment(id);
  return {
    segment: node,
    from: layer(node.from, 'current'),
    to: layer(node.to, 'next'),
    stage: {
      getLayer: () => undefined,
      ensureLayer: (scene, role) => layer(scene, role),
      releaseLayer: () => undefined,
      snapshot: () => []
    },
    direction: 1,
    runId: 'r3-pilot:1',
    prepareToken: 'r3-pilot:prepare:1',
    prefersReducedMotion: false,
    reportMilestone: () => undefined
  };
}

describe('R3 pilot contract on real segments', () => {
  it('passes R2 timeline invariants for star-map-aod', async () => {
    const transition = createStarMapAodTransition();
    const timeline = await transition.buildTimeline(context('star-map-aod'));

    expect(verifySegmentTimeline(timeline)).toMatchObject({
      maxVisibleLayers: 2,
      copyCueCrossed: false
    });
    expect(timeline.sample?.(0.5)).toMatchObject({
      from: { opacity: 1 },
      to: { opacity: 1 }
    });
  });

  it('passes R2 copyCue invariants for aod-method-top at 80%', async () => {
    const transition = createAodMethodTopTransition();
    const timeline = await transition.buildTimeline(context('aod-method-top'));

    expect(verifySegmentTimeline(timeline, { copyCueAtProgress: AOD_METHOD_COPY_CUE.atProgress })).toMatchObject({
      maxVisibleLayers: 2,
      copyCueCrossed: true
    });
  });

  it('keeps copyCue enter idempotent across 0 to 1 to 0 to 1 on the real pilot transition', async () => {
    const transition = createAodMethodTopTransition();
    const timeline = await transition.buildTimeline(context('aod-method-top'));
    const sampled = timeline as typeof timeline & { snapshot: { copyCueActive: boolean; copyCueActivations: number } };

    timeline.progress(0);
    timeline.progress(1);
    expect(sampled.snapshot.copyCueActive).toBe(true);
    timeline.progress(0);
    expect(sampled.snapshot.copyCueActive).toBe(false);
    timeline.progress(1);

    expect(sampled.snapshot.copyCueActive).toBe(true);
    expect(sampled.snapshot.copyCueActivations).toBe(1);
  });

  it('keeps aod-method-top visual playback scrub-only without starting video playback', async () => {
    const video = {
      playbackRate: 16,
      pause: vi.fn(),
      play: vi.fn()
    } as unknown as HTMLVideoElement;
    const transition = createAodMethodTopTransition({ getVideo: () => video });
    const timeline = await transition.buildTimeline({ ...context('aod-method-top'), prefersReducedMotion: true });

    await timeline.play(1);

    expect(video.pause).toHaveBeenCalled();
    expect(video.play).not.toHaveBeenCalled();
    expect(video.playbackRate).toBe(1);
  });

  it('positions Method at its top edge whenever AOD enters it again', async () => {
    const scrollport = {
      clientHeight: 400,
      dataset: {},
      scrollHeight: 800,
      scrollTop: 400
    };
    const methodRoot = {
      dataset: {},
      inert: false,
      matches: () => false,
      querySelector: (selector: string) => selector === '[data-reading-scrollport="true"]' ? scrollport : null,
      querySelectorAll: () => [],
      removeAttribute: () => undefined,
      setAttribute: () => undefined,
      style: {
        clipPath: '',
        opacity: '',
        pointerEvents: '',
        visibility: '',
        removeProperty: () => undefined
      }
    } as unknown as HTMLElement;
    const base = context('aod-method-top');
    const transitionContext: TransitionContext = {
      ...base,
      prefersReducedMotion: true,
      to: { ...base.to, element: methodRoot }
    };
    const timeline = await createAodMethodTopTransition().buildTimeline(transitionContext);

    await timeline.play(1);

    expect(scrollport.scrollTop).toBe(0);
    expect(scrollport.dataset).toMatchObject({ readingEdge: 'top' });
  });

  it('retries the Method top positioning after its reading scrollport mounts', async () => {
    const scrollport = {
      clientHeight: 400,
      dataset: {},
      scrollHeight: 800,
      scrollTop: 400
    };
    let mounted = false;
    const methodRoot = {
      dataset: {},
      inert: false,
      matches: () => false,
      querySelector: (selector: string) => mounted && selector === '[data-reading-scrollport="true"]' ? scrollport : null,
      querySelectorAll: () => [],
      removeAttribute: () => undefined,
      setAttribute: () => undefined,
      style: {
        clipPath: '',
        opacity: '',
        pointerEvents: '',
        visibility: '',
        removeProperty: () => undefined
      }
    } as unknown as HTMLElement;
    const base = context('aod-method-top');
    const timeline = await createAodMethodTopTransition().buildTimeline({
      ...base,
      to: { ...base.to, element: methodRoot }
    });

    mounted = true;
    timeline.progress(0.5);

    expect(scrollport.scrollTop).toBe(0);
    expect(scrollport.dataset).toMatchObject({ readingEdge: 'top' });
  });

  it('reasserts the Method top edge after the target layer settles', async () => {
    const scrollport = {
      clientHeight: 400,
      dataset: {},
      scrollHeight: 800,
      scrollTop: 400
    };
    let opacity = '';
    const style = {
      clipPath: '',
      pointerEvents: '',
      visibility: '',
      get opacity() {
        return opacity;
      },
      set opacity(value: string) {
        opacity = value;
        scrollport.scrollTop = 400;
      },
      removeProperty: () => undefined
    };
    const methodRoot = {
      dataset: {},
      inert: false,
      matches: () => false,
      querySelector: (selector: string) => selector === '[data-reading-scrollport="true"]' ? scrollport : null,
      querySelectorAll: () => [],
      removeAttribute: () => undefined,
      setAttribute: () => undefined,
      style
    } as unknown as HTMLElement;
    const base = context('aod-method-top');
    const timeline = await createAodMethodTopTransition().buildTimeline({
      ...base,
      prefersReducedMotion: true,
      to: { ...base.to, element: methodRoot }
    });

    await timeline.play(1);

    expect(scrollport.scrollTop).toBe(0);
    expect(scrollport.dataset).toMatchObject({ readingEdge: 'top' });
  });

  it('dedupes StrictMode-style duplicate mediaReady and rejects stale pilot media events', () => {
    const registry = new HandleRegistry();
    registry.beginMediaGate(AOD_MEDIA_KEY, { prepareToken: 'r3-pilot:prepare:1' });

    const first = registry.reportMediaReady(AOD_MEDIA_KEY, { prepareToken: 'r3-pilot:prepare:1' });
    const duplicate = registry.reportMediaReady(AOD_MEDIA_KEY, { prepareToken: 'r3-pilot:prepare:1' });
    const stale = registry.reportMediaReady(AOD_MEDIA_KEY, { prepareToken: 'r3-pilot:prepare:2' });

    expect(first.accepted).toBe(true);
    expect(duplicate).toMatchObject({ accepted: false, reason: 'duplicate' });
    expect(stale).toMatchObject({ accepted: false, reason: 'stale' });
  });

  it('requires mediaReady only for forward aod-method-top playback', () => {
    const mediaSegment = segment('aod-method-top');
    const inkSegment = segment('star-map-aod');

    expect(shouldWaitForPilotMediaReady(mediaSegment, 1)).toBe(true);
    expect(shouldWaitForPilotMediaReady(mediaSegment, -1)).toBe(false);
    expect(shouldWaitForPilotMediaReady(inkSegment, 1)).toBe(false);
  });
});
