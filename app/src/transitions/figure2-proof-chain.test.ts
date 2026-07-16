import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { figure2AnimationScene, FIGURE2_INTRO_PLAYBACK_MS } from '../scenes/figure2-animation';
import { storyManifest } from '../story/manifest';
import type { SegmentId, SpineSegmentNode, TransitionModule } from '../story/types';
import {
  createFigure2DistanceExpandTransition,
  FIGURE2_INTRO_END,
  figure2IntroProgress,
  figure2ProofRevealProgress,
  figure2VideoModeForProofTransition
} from './figure2-distance-expand';
import { createFigure2ProofBrandTransition } from './figure2-proof-brand';
import { createBackHalfDomContext } from './__fixtures__/back-half.fixture';

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find(
    (node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id
  );
  if (!found) {
    throw new Error(`${id} segment missing`);
  }
  return structuredClone(found);
}

const cases: readonly {
  id: SegmentId;
  from: Parameters<typeof createBackHalfDomContext>[1];
  to: Parameters<typeof createBackHalfDomContext>[2];
  create: () => TransitionModule;
}[] = [
  {
    id: 'figure2-proof-brand',
    from: 'figure2-proof',
    to: 'brand',
    create: createFigure2ProofBrandTransition
  }
];

describe('Figure2 proof chain transitions', () => {
  it('declares one bidirectional Figure2 surface and preserves the staged media gate', () => {
    const markup = renderToStaticMarkup(createElement(figure2AnimationScene.Component, {
      scene: 'figure2-animation',
      hidden: false
    }));
    const playback = segment('figure2-distance-expand').mediaPlayback?.[0];

    expect(figure2AnimationScene.requiredHandles).toEqual(['stage', 'figures', 'combined-video']);
    expect(figure2AnimationScene.preload()).toEqual({ milestones: ['targetReady', 'mediaReady'] });
    expect(markup).toContain('data-media-key="figure2-pair-motion"');
    expect(markup).toContain('data-figure2-ownership-surface="true"');
    expect(markup).not.toContain('poster');
    expect(markup).not.toContain('bridge');
    expect(playback).toMatchObject({
      media: ['figure2-pair-motion'],
      forward: { mode: 'play', required: true, media: ['figure2-pair-motion'] },
      reverse: {
        mode: 'play',
        required: true,
        media: ['figure2-pair-motion']
      },
      preparingTimeoutMs: 4000
    });
  });

  it('keeps the authored 2.6s intro and maps the proof reveal after that media leg', () => {
    expect(FIGURE2_INTRO_PLAYBACK_MS).toBe(2600);
    expect(FIGURE2_INTRO_END).toBe(0.72);
    expect(figure2IntroProgress(0)).toBe(0);
    expect(figure2IntroProgress(FIGURE2_INTRO_END)).toBe(1);
    expect(figure2ProofRevealProgress(FIGURE2_INTRO_END)).toBe(0);
    expect(figure2ProofRevealProgress(1)).toBe(1);
    expect(figure2VideoModeForProofTransition(0, 1)).toBe('native');
    expect(figure2VideoModeForProofTransition(0, -1)).toBe('native');
    expect(figure2VideoModeForProofTransition(0.02, -1)).toBe('none');
  });

  it('keeps the Figure2 transition media and timeline contracts equal to the manifest', () => {
    const transition = createFigure2DistanceExpandTransition();

    expect(transition.requiredMilestones).toEqual(['targetReady', 'mediaReady', 'buildReady', 'timelineReady']);
    expect(transition.mediaPlayback).toEqual(segment('figure2-distance-expand').mediaPlayback);
  });

  for (const item of cases) {
    it(`keeps ${item.id} idempotent through forward/reverse endpoint sampling`, async () => {
      const fixture = createBackHalfDomContext(item.id, item.from, item.to);
      const timeline = await item.create().buildTimeline(fixture.context);

      timeline.progress(0);
      const start = timeline.sample?.(0);
      timeline.progress(1);
      const end = timeline.sample?.(1);
      timeline.progress(0);
      expect(timeline.sample?.(0)).toEqual(start);
      timeline.progress(1);
      expect(timeline.sample?.(1)).toEqual(end);
      timeline.dispose();
    });

    it(`exposes a reduced-motion fallback for ${item.id}`, async () => {
      const fixture = createBackHalfDomContext(item.id, item.from, item.to);
      const transition = item.create();

      expect(transition.reducedMotionFallback).toBeTypeOf('function');
      await Promise.resolve(transition.reducedMotionFallback?.({
        ...fixture.context,
        prefersReducedMotion: true
      }));
    });
  }
});
