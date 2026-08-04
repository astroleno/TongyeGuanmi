import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { storyManifest } from '../../story/manifest';
import { verifySegmentTimeline } from '../../story/verifySegmentTimeline';
import { patternScene, renderPatternHold } from '../../scenes/pattern';
import { starMapMotionEnabled } from '../../scenes/star-map';
import {
  createPatternStarMapTransition,
  PATTERN_COLLAPSE_MS,
  PATTERN_COLLAPSE_STOP,
  PATTERN_STAR_MAP_INK_MS
} from './index';
import { createBackHalfDomContext, FakeCanvas } from '../__fixtures__/back-half.fixture';
import type { SpineSegmentNode } from '../../story/types';

const transitionSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
});

function segment(): SpineSegmentNode {
  const found = storyManifest.nodes.find(
    (node): node is SpineSegmentNode => node.kind === 'segment' && node.id === 'pattern-star-map'
  );
  if (!found) {
    throw new Error('pattern-star-map segment missing');
  }
  return structuredClone(found);
}

function fixture() {
  const result = createBackHalfDomContext('pattern-star-map', 'pattern', 'star-map');
  Object.assign(result.fromRoot, { clientWidth: 1440 });
  const canvas = new FakeCanvas();
  vi.stubGlobal('document', { createElement: () => canvas });
  return { ...result, canvas };
}

describe('pattern-star-map transition', () => {
  it('uses the canonical Pattern center and one authored Canvas composition', () => {
    const markup = renderToStaticMarkup(createElement(patternScene.Component, {
      scene: 'pattern',
      hidden: false
    }));

    expect(transitionSource).toContain('readPatternCenter(from)');
    expect(transitionSource).toContain("kind: 'radial'");
    expect(transitionSource).not.toContain('PATTERN_STAR_MAP_ORIGIN');
    expect(transitionSource).not.toContain('PATTERN_STAR_MAP_INK_TARGET_IMAGE');
    expect(transitionSource).not.toContain('back2.png');
    expect(transitionSource).not.toContain('pauseStarMapTransitionMotion');
    expect(markup.match(/data-pattern-rotor=/g)).toBeNull();
    expect(markup.match(/data-pattern-canvas/g)).toHaveLength(1);
    expect(transitionSource).toContain('copyProgress: copyProgress(progress)');
    expect(transitionSource).toContain('rotationProgress: collapseProgress(progress)');
    expect(transitionSource).not.toContain('freezeMotion');
  });

  it('uses the live Star canvas with the canonical .92 grade and active Perlin owner', () => {
    expect(stylesheet).toMatch(/\.r3-star-map__canvas\s*\{[^}]*brightness\(\.92\)/s);
    expect(stylesheet).not.toContain('data-star-map-transition-motion="paused"');
    expect(starMapMotionEnabled(false, false)).toBe(true);
    expect(starMapMotionEnabled(true, false)).toBe(false);
    expect(starMapMotionEnabled(false, true)).toBe(false);
    expect(starMapMotionEnabled(false, false, 'next')).toBe(false);
    expect(starMapMotionEnabled(false, false, 'next', true)).toBe(true);
  });

  it('collapses Pattern and reveals copy together at the only checkpoint', async () => {
    const setup = fixture();
    const timeline = await createPatternStarMapTransition().buildTimeline(setup.context);

    timeline.progress(PATTERN_COLLAPSE_STOP);

    expect(timeline.pauses).toEqual(['stage:0']);
    expect(setup.fromRoot.dataset.patternProgress).toBe('1.0000');
    expect(setup.fromRoot.style.getPropertyValue('--r4-pattern-copy-opacity')).toBe('0.9600');
    expect(setup.fromLayer.visibility.visible).toBe(true);
    expect(setup.toLayer.visibility.visible).toBe(false);
    expect(setup.canvas.dataset.r4InkActive).toBeUndefined();
    expect(setup.fromRoot.dataset.sceneMotionActive).toBe('true');
    expect(setup.fromRoot.dataset.sceneMotionLeaseCount).toBe('1');
    expect(setup.toRoot.dataset.sceneMotionActive).toBe('false');
    expect(setup.toRoot.dataset.sceneMotionLeaseCount).toBe('0');
    expect(timeline.sample?.(PATTERN_COLLAPSE_STOP)).toMatchObject({
      from: { visible: true, opacity: 1 },
      to: { visible: false, opacity: 0 }
    });
  });

  it('preserves the authored 120-degree Pattern hold across build, reverse settle, and disposal', async () => {
    const setup = fixture();
    renderPatternHold(setup.fromRoot as unknown as HTMLElement);
    const incomingHoldRotation = setup.fromRoot.style.getPropertyValue('--r4-pattern-field-rotation');

    const timeline = await createPatternStarMapTransition().buildTimeline(setup.context);
    expect(incomingHoldRotation).toBe('120.00deg');
    expect(setup.fromRoot.style.getPropertyValue('--r4-pattern-field-rotation')).toBe(incomingHoldRotation);

    timeline.progress(1);
    timeline.progress(0);
    expect(setup.fromRoot.style.getPropertyValue('--r4-pattern-field-rotation')).toBe(incomingHoldRotation);

    timeline.dispose();
    expect(setup.fromRoot.style.getPropertyValue('--r4-pattern-field-rotation')).toBe(incomingHoldRotation);
  });

  it('advances geometry and copy on the same first leg', async () => {
    const setup = fixture();
    const timeline = await createPatternStarMapTransition().buildTimeline(setup.context);

    timeline.progress(PATTERN_COLLAPSE_STOP / 2);

    expect(setup.fromRoot.dataset.patternProgress).toBe('0.5000');
    expect(setup.fromRoot.style.getPropertyValue('--r4-pattern-copy-opacity')).toBe('0.4800');
    expect(setup.fromLayer.visibility.visible).toBe(true);
    expect(setup.toLayer.visibility.visible).toBe(false);
    expect(setup.canvas.dataset.r4InkActive).toBeUndefined();
  });

  it('starts radial Ink only after the compact-copy checkpoint and shares the Pattern origin', async () => {
    const setup = fixture();
    const timeline = await createPatternStarMapTransition().buildTimeline(setup.context);
    const receiver = setup.stage.children[1]!;

    timeline.progress(0.75);

    expect(setup.fromRoot.dataset.patternProgress).toBe('1.0000');
    expect(setup.toLayer.visibility.visible).toBe(true);
    expect(receiver.style.clipPath).toMatch(/^polygon\(/);
    expect(receiver.style.clipPath).not.toContain('circle(');
    expect(receiver.dataset.r4InkBoundaryKind).toBe('radial');
    expect(receiver.dataset.r4InkBoundaryOrigin).toBe('0.2400,0.5500');
    expect(receiver.dataset.r4InkBoundaryRevision).toBeUndefined();
    expect(setup.canvas.dataset.r4InkBoundaryRevision).toBeUndefined();
    expect(setup.fromRoot.dataset.sceneMotionActive).toBe('true');
    expect(setup.toRoot.dataset.sceneMotionActive).toBe('true');
    expect(setup.toRoot.dataset.sceneMotionLeaseCount).toBe('1');
  });

  it('transfers motion ownership across endpoints and releases both run leases on dispose', async () => {
    const setup = fixture();
    const timeline = await createPatternStarMapTransition().buildTimeline(setup.context);

    timeline.progress(0.75);
    expect(setup.fromRoot.dataset.sceneMotionActive).toBe('true');
    expect(setup.toRoot.dataset.sceneMotionActive).toBe('true');

    timeline.progress(1);
    expect(setup.fromRoot.dataset.sceneMotionActive).toBe('false');
    expect(setup.toRoot.dataset.sceneMotionActive).toBe('true');

    timeline.dispose();
    timeline.dispose();
    expect(setup.fromRoot.dataset.sceneMotionActive).toBe('false');
    expect(setup.toRoot.dataset.sceneMotionActive).toBe('false');
    expect(setup.fromRoot.dataset.sceneMotionLeaseCount).toBe('0');
    expect(setup.toRoot.dataset.sceneMotionLeaseCount).toBe('0');
  });

  it('uses one collapse-copy leg and one Ink leg separated by a gesture checkpoint', async () => {
    const setup = fixture();
    const transition = createPatternStarMapTransition();
    const timeline = await transition.buildTimeline(setup.context);

    expect(PATTERN_COLLAPSE_MS).toBe(1800);
    expect(PATTERN_STAR_MAP_INK_MS).toBe(1800);
    expect(segment()).toMatchObject({
      policy: {
        kind: 'stagedSnap',
        stops: [PATTERN_COLLAPSE_STOP],
        playMs: [PATTERN_COLLAPSE_MS, PATTERN_STAR_MAP_INK_MS],
        advance: [{ kind: 'gesture' }]
      },
      virtualDuration: PATTERN_COLLAPSE_MS + PATTERN_STAR_MAP_INK_MS
    });
    expect(verifySegmentTimeline(timeline, { policy: segment().policy })).toMatchObject({
      maxVisibleLayers: 2,
      reverseSymmetric: true
    });
  });

  it('reverses through compact Pattern before restoring its expanded hold', async () => {
    const setup = fixture();
    const timeline = await createPatternStarMapTransition().buildTimeline(setup.context);

    timeline.progress(1);
    timeline.progress(PATTERN_COLLAPSE_STOP);
    expect(setup.fromRoot.dataset.patternProgress).toBe('1.0000');
    expect(setup.fromRoot.style.getPropertyValue('--r4-pattern-copy-opacity')).toBe('0.9600');
    expect(setup.fromLayer.visibility.visible).toBe(true);
    expect(setup.toLayer.visibility.visible).toBe(false);

    timeline.progress(PATTERN_COLLAPSE_STOP / 2);
    expect(setup.fromRoot.dataset.patternProgress).toBe('0.5000');
    expect(setup.fromRoot.style.getPropertyValue('--r4-pattern-copy-opacity')).toBe('0.4800');
    expect(setup.fromLayer.visibility.visible).toBe(true);
    expect(setup.toLayer.visibility.visible).toBe(false);

    timeline.progress(0);
    expect(setup.fromRoot.dataset.patternProgress).toBe('0.0000');
    expect(setup.fromLayer.visibility.visible).toBe(true);
    expect(setup.toLayer.visibility.visible).toBe(false);
  });
});
