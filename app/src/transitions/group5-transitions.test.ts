import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ttgAnimationScene, ttgMediaSnapshot } from '../scenes/ttg-animation';
import { storyManifest } from '../story/manifest';
import type { SegmentId, SegmentTimelineHandle, SpineSegmentNode, StagedLegPreparation } from '../story/types';
import { createBackHalfDomContext, FakeVideo } from './__fixtures__/back-half.fixture';
import { createTtgLabTransition, TTG_LAB_ANIMATION_STOP } from './ttg-lab';

const stylesheet = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

function segment(id: SegmentId): SpineSegmentNode {
  const found = storyManifest.nodes.find(
    (node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id
  );
  if (!found) {
    throw new Error(`${id} segment missing`);
  }
  return structuredClone(found);
}

function connectTtgMedia(root: ReturnType<typeof createBackHalfDomContext>['fromRoot'], video: FakeVideo): void {
  root.connect('[data-ttg-figure-video]', video);
}

function leg(
  runId: `${string}:${number}`,
  direction: 1 | -1,
  legIndex: number,
  from: number,
  to: number
): StagedLegPreparation {
  return {
    runId,
    segment: 'ttg-lab',
    direction,
    legIndex,
    from,
    to,
    durationMs: legIndex === 0 ? 2500 : 600,
    ...(legIndex > 0 ? { resumedStageIndex: 0 } : {}),
    signal: new AbortController().signal
  };
}

async function prepareAndCommit(
  timeline: SegmentTimelineHandle,
  nextLeg: StagedLegPreparation
): Promise<void> {
  await timeline.prepareLeg?.(nextLeg);
  timeline.commitLeg?.(nextLeg);
}

describe('TTG canonical directional media', () => {
  it('renders one canonical surface and gates it on a prepared frame', () => {
    const markup = renderToStaticMarkup(createElement(ttgAnimationScene.Component, {
      scene: 'ttg-animation',
      hidden: false
    }));

    expect(ttgAnimationScene.requiredHandles).toEqual(['field', 'figure-video']);
    expect(markup.match(/data-ttg-figure-video=/g)).toHaveLength(1);
    expect(markup).toContain('data-media-key="ttg-figure-motion"');
    expect(markup).toContain('ttg-figure-motion.webm');
    expect(markup).toContain('ttg-background.webp');
    expect(markup).toContain('ttg-middle.webp');
    expect(markup).toContain('ttg-foreground.webp');
    expect(markup).not.toContain('reverse');
    expect(markup).not.toContain('poster');
    expect(markup).not.toContain('terminal');
    expect(stylesheet).toContain('video.ttg-layer--figure[data-timeline-video-frame-ready="true"]');
  });

  it('declares one shared canonical key with native forward and timeline reverse contracts', () => {
    const playback = segment('ttg-lab').mediaPlayback?.[0];

    expect(playback).toMatchObject({
      media: ['ttg-figure-motion'],
      forward: { mode: 'play', required: true, media: ['ttg-figure-motion'] },
      reverse: { mode: 'timeline', required: true, media: ['ttg-figure-motion'] }
    });
  });

  it('holds the prepared first TTG frame, then uses native forward playback and pauses at the terminal frame', async () => {
    const fixture = createBackHalfDomContext('ttg-lab', 'ttg-animation', 'lab');
    const video = new FakeVideo();
    connectTtgMedia(fixture.fromRoot, video);
    const timeline = await createTtgLabTransition().buildTimeline(fixture.context);

    await prepareAndCommit(timeline, leg(fixture.context.runId, 1, 0, 0, TTG_LAB_ANIMATION_STOP));
    await Promise.resolve();
    expect(video.dataset.timelineVideoFrameReady).toBe('true');
    expect(video.playCalls).toBe(0);
    expect(video.paused).toBe(true);

    timeline.progress(TTG_LAB_ANIMATION_STOP * 0.45);
    await Promise.resolve();
    expect(video.playCalls).toBe(1);
    expect(video.paused).toBe(false);

    timeline.progress(TTG_LAB_ANIMATION_STOP);
    expect(video.paused).toBe(true);
    expect(video.currentTime).toBeCloseTo(2.467, 3);
    expect(ttgMediaSnapshot(fixture.fromRoot as unknown as HTMLElement)).toMatchObject({
      activeDirection: 1,
      activeRunId: fixture.context.runId,
      video: { frameReady: true }
    });
    timeline.dispose();
  });

  it('reverses that same TTG element through descending timeline seeks without negative playback', async () => {
    const fixture = createBackHalfDomContext('ttg-lab', 'ttg-animation', 'lab');
    const video = new FakeVideo();
    connectTtgMedia(fixture.fromRoot, video);
    const reverseContext = {
      ...fixture.context,
      direction: -1 as const,
      runId: 'ttg-reverse:1' as const,
      prepareToken: 'ttg-reverse:prepare:1' as const
    };
    const timeline = await createTtgLabTransition().buildTimeline(reverseContext);

    await prepareAndCommit(timeline, leg(reverseContext.runId, -1, 0, TTG_LAB_ANIMATION_STOP, 0));
    timeline.progress(TTG_LAB_ANIMATION_STOP * 0.45);

    expect(video.playCalls).toBe(0);
    expect(video.playbackRate).toBeGreaterThan(0);
    expect(video.dataset.timelineVideoDirection).toBe('-1');
    expect(video.currentTime).toBeLessThan(2.467);
    expect(ttgMediaSnapshot(fixture.fromRoot as unknown as HTMLElement)).toMatchObject({
      activeDirection: -1,
      activeRunId: reverseContext.runId
    });
    timeline.dispose();
  });

  it('keeps the staged TTG dissolve and reduced-motion endpoint contracts intact', async () => {
    const fixture = createBackHalfDomContext('ttg-lab', 'ttg-animation', 'lab');
    const video = new FakeVideo();
    connectTtgMedia(fixture.fromRoot, video);
    const transition = createTtgLabTransition();
    const timeline = await transition.buildTimeline(fixture.context);

    expect(transition.requiredMilestones).toEqual(['targetReady', 'mediaReady', 'buildReady']);
    expect(timeline.pauses).toEqual(['stage:0']);
    timeline.progress((TTG_LAB_ANIMATION_STOP + 1) / 2);
    expect(fixture.fromLayer.visibility.opacity + fixture.toLayer.visibility.opacity).toBeCloseTo(1, 6);
    expect(transition.reducedMotionFallback).toBeTypeOf('function');
    timeline.dispose();
  });
});
