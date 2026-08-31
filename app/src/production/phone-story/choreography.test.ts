import { describe, expect, it } from 'vitest';
import { canonicalSegments } from '../../story/canonical-spine';
import { sampleFigure3ServicesChannels } from '../../transitions/figure3-services';
import { PH_EDUCATION_ANIMATION_STOP } from '../../transitions/ph-education';
import { sampleStagedMediaHandoff } from '../../transitions/shared/stagedMediaHandoff';
import { TTG_LAB_ANIMATION_STOP } from '../../transitions/ttg-lab';
import {
  phoneRetainedFigure2ArchOwner,
  phoneSceneStableHold,
  phoneSegmentChoreography,
  phoneSegmentChoreographyFrame,
  type PhoneSceneId,
  type PhoneSegmentId
} from './manifest';

const stableHolds = {
  hero: 0,
  pattern: 0,
  'star-map': 1,
  'aod-animation': 0,
  'method-top': 1,
  'figure2-animation': 0,
  'figure2-proof': 0,
  brand: 1,
  'figure3-animation': 0,
  services: 1,
  'ttg-animation': 0,
  lab: 1,
  'ph-animation': 0,
  education: 1,
  'crane-animation': 0,
  contact: 1
} as const satisfies Readonly<Record<PhoneSceneId, 0 | 1>>;

const mediaClockOwners = {
  'hero-pattern': 'source',
  'pattern-star-map': 'none',
  'star-map-aod': 'none',
  'aod-method-top': 'source',
  'method-bottom-figure2': 'none',
  'figure2-distance-expand': 'source',
  'figure2-proof-brand': 'none',
  'brand-figure3': 'none',
  'figure3-services': 'source',
  'services-ttg': 'none',
  'ttg-lab': 'source',
  'lab-ph': 'none',
  'ph-education': 'source',
  'education-crane': 'none',
  'crane-contact': 'source'
} as const satisfies Readonly<Record<PhoneSegmentId, 'none' | 'source' | 'target'>>;

const mediaClockModes = {
  'hero-pattern': 'frame-lock', 'pattern-star-map': 'none', 'star-map-aod': 'none',
  'aod-method-top': 'frame-lock', 'method-bottom-figure2': 'none',
  'figure2-distance-expand': 'frame-lock', 'figure2-proof-brand': 'none',
  'brand-figure3': 'none', 'figure3-services': 'legacy', 'services-ttg': 'none',
  'ttg-lab': 'legacy', 'lab-ph': 'none', 'ph-education': 'frame-lock',
  'education-crane': 'none', 'crane-contact': 'legacy'
} as const satisfies Readonly<Record<PhoneSegmentId, 'none' | 'legacy' | 'frame-lock'>>;

const activationOwners = {
  'hero-pattern': 'source',
  'pattern-star-map': 'none',
  'star-map-aod': 'none',
  'aod-method-top': 'source',
  'method-bottom-figure2': 'none',
  'figure2-distance-expand': 'source',
  'figure2-proof-brand': 'none',
  'brand-figure3': 'target',
  'figure3-services': 'source',
  'services-ttg': 'target',
  'ttg-lab': 'source',
  'lab-ph': 'target',
  'ph-education': 'source',
  'education-crane': 'target',
  'crane-contact': 'source'
} as const satisfies Readonly<Record<PhoneSegmentId, 'none' | 'source' | 'target'>>;

describe('phone segment choreography', () => {
  it('owns one exhaustive immutable choreography and stable-hold ledger', () => {
    expect(Object.keys(phoneSegmentChoreography)).toEqual(
      canonicalSegments.map(({ id }) => id)
    );
    expect(Object.isFrozen(phoneSegmentChoreography)).toBe(true);
    expect(Object.fromEntries(Object.keys(stableHolds).map((sceneId) => [
      sceneId,
      phoneSceneStableHold(sceneId as PhoneSceneId)
    ]))).toEqual(stableHolds);
    expect(Object.fromEntries(canonicalSegments.map(({ id }) => [
      id,
      phoneSegmentChoreography[id].mediaClockOwner
    ]))).toEqual(mediaClockOwners);
    expect(Object.fromEntries(canonicalSegments.map(({ id }) => [
      id,
      phoneSegmentChoreography[id].mediaClockMode
    ]))).toEqual(mediaClockModes);
    expect(Object.fromEntries(canonicalSegments.map(({ id }) => [
      id,
      phoneSegmentChoreography[id].activationOwner
    ]))).toEqual(activationOwners);
  });

  it('keeps Hero motion ahead of Ink and lands Pattern on its full-screen hold', () => {
    const beforeInk = phoneSegmentChoreographyFrame('hero-pattern', 0.2);
    const afterMotion = phoneSegmentChoreographyFrame('hero-pattern', 0.9);
    expect(beforeInk).toMatchObject({
      targetProgress: 0,
      effectProgress: 0,
      stableHold: { source: 0, target: 0 },
      mediaClockOwner: 'source'
    });
    expect(beforeInk.sourceProgress).toBeGreaterThan(0.4);
    expect(afterMotion.sourceProgress).toBe(1);
    expect(afterMotion.effectProgress).toBeGreaterThan(0);
    expect(afterMotion.targetProgress).toBe(0);
  });

  it('collapses Pattern before Ink reveals a held Star Map', () => {
    const collapse = phoneSegmentChoreographyFrame('pattern-star-map', 0.4);
    const ink = phoneSegmentChoreographyFrame('pattern-star-map', 0.9);
    expect(collapse).toMatchObject({ targetProgress: 1, effectProgress: 0 });
    expect(collapse.sourceProgress).toBeGreaterThan(0);
    expect(ink.sourceProgress).toBe(1);
    expect(ink.effectProgress).toBeGreaterThan(0);
  });

  it('prepares Star to AOD at a static first frame without owning a media clock', () => {
    for (const progress of [0, 0.5, 1]) {
      expect(phoneSegmentChoreographyFrame('star-map-aod', progress)).toMatchObject({
        sourceProgress: 1,
        targetProgress: 0,
        effectProgress: progress,
        stableHold: { source: 1, target: 0 },
        mediaClockOwner: 'none',
        foregroundOwner: 'target'
      });
    }
  });

  it('gives AOD playback only to the AOD to Method segment', () => {
    const beforeCopy = phoneSegmentChoreographyFrame('aod-method-top', 0.75);
    const afterCopy = phoneSegmentChoreographyFrame('aod-method-top', 0.9);
    expect(beforeCopy).toMatchObject({
      sourceProgress: 0.75,
      targetProgress: 0,
      targetOpacity: 1,
      mediaClockOwner: 'source',
      foregroundOwner: 'source'
    });
    expect(afterCopy.targetProgress).toBe(1);
    expect(afterCopy.sourceOpacity).toBeLessThan(1);
    expect(phoneSegmentChoreographyFrame(
      'aod-method-top', 0.5, 'reverse'
    ).foregroundOwner).toBe('target');
  });

  it('projects Proof to its closing frame before the Brand handoff', () => {
    expect(phoneSegmentChoreographyFrame('figure2-proof-brand', 0)).toMatchObject({
      sourceProgress: 1, targetProgress: 1, mediaClockOwner: 'none'
    });
    expect(phoneSegmentChoreographyFrame('figure2-proof-brand', 1)).toMatchObject({
      sourceProgress: 1, targetProgress: 1
    });
  });

  it('declares retained Figure2 arch projection explicitly in both directions', () => {
    expect(phoneRetainedFigure2ArchOwner('method-bottom-figure2', 'forward')).toBe('target');
    expect(phoneRetainedFigure2ArchOwner('method-bottom-figure2', 'reverse')).toBe('source');
    expect(phoneRetainedFigure2ArchOwner('figure2-distance-expand', 'forward')).toBe('shared');
    expect(phoneRetainedFigure2ArchOwner('figure2-distance-expand', 'reverse')).toBe('shared');
    expect(phoneRetainedFigure2ArchOwner('figure2-proof-brand', 'forward')).toBe('source');
    expect(phoneRetainedFigure2ArchOwner('figure2-proof-brand', 'reverse')).toBe('target');
    expect(phoneRetainedFigure2ArchOwner('brand-figure3', 'forward')).toBe('none');
  });

  it('keeps Brand to Figure3 static until Figure3 to Services owns playback', () => {
    expect(phoneSegmentChoreographyFrame('brand-figure3', 0)).toMatchObject({
      sourceProgress: 1, targetProgress: 0, mediaClockOwner: 'none',
      foregroundOwner: 'source'
    });
    expect(phoneSegmentChoreographyFrame('brand-figure3', .5)).toMatchObject({
      sourceProgress: 1, targetProgress: 0, foregroundOwner: 'source'
    });
    expect(phoneSegmentChoreographyFrame('figure3-services', 0).sourceProgress).toBe(0);
    expect(phoneSegmentChoreographyFrame('figure3-services', 1).sourceProgress)
      .toBeGreaterThan(0);
  });

  it('holds Figure2 at its terminal frame outside the media stage', () => {
    expect(phoneSegmentChoreographyFrame(
      'figure2-distance-expand', .5, 'forward', 0
    ).mediaClockOwner).toBe('source');
    expect(phoneSegmentChoreographyFrame(
      'figure2-distance-expand', .5, 'forward', 1
    )).toMatchObject({ mediaClockOwner: 'none', mediaClockMode: 'none' });
    expect(phoneSegmentChoreographyFrame(
      'figure2-distance-expand', .5, 'reverse', 0
    )).toMatchObject({ mediaClockOwner: 'none', mediaClockMode: 'none' });
    expect(phoneSegmentChoreographyFrame(
      'figure2-distance-expand', .5, 'reverse', 1
    ).mediaClockOwner).toBe('target');
    for (const progress of [.25, .5, .75]) {
      for (const direction of ['forward', 'reverse'] as const) {
        expect(phoneSegmentChoreographyFrame(
          'figure2-distance-expand', progress, direction, direction === 'forward' ? 1 : 0
        )).toMatchObject({ sourceOpacity: 1, targetOpacity: 1 });
      }
    }
  });

  it('reverses canonical time and swaps actual source and target ownership', () => {
    const start = phoneSegmentChoreographyFrame(
      'pattern-star-map', 1, 'reverse'
    );
    const finish = phoneSegmentChoreographyFrame(
      'pattern-star-map', 0, 'reverse'
    );
    expect(start).toMatchObject({
      sourceProgress: 1,
      targetProgress: 1,
      effectProgress: 1,
      stableHold: { source: 1, target: 0 }
    });
    expect(finish).toMatchObject({
      sourceProgress: 1,
      targetProgress: 0,
      effectProgress: 0,
      stableHold: { source: 1, target: 0 }
    });
  });

  it('primes receiver media at frame zero without granting its playback clock', () => {
    expect(phoneSegmentChoreographyFrame('services-ttg', 1)).toMatchObject({
      targetProgress: 0,
      activationOwner: 'target',
      mediaClockOwner: 'none'
    });
    expect(phoneSegmentChoreographyFrame('lab-ph', 1)).toMatchObject({
      targetProgress: 0,
      activationOwner: 'target',
      mediaClockOwner: 'none'
    });
    expect(phoneSegmentChoreographyFrame('education-crane', 1)).toMatchObject({
      targetProgress: 0,
      activationOwner: 'target',
      mediaClockOwner: 'none'
    });
    expect(phoneSegmentChoreographyFrame('ph-education', 0)).toMatchObject({
      activationOwner: 'source', mediaClockOwner: 'source'
    });
    expect(phoneSegmentChoreographyFrame('crane-contact', 0)).toMatchObject({
      activationOwner: 'source', mediaClockOwner: 'source'
    });
  });

  it('holds the authored Crane terminal frame during a bounded 400ms completion tail', () => {
    const authoredStop = 3000 / 3400;
    expect(phoneSegmentChoreographyFrame('crane-contact', .79)).toMatchObject({
      targetProgress: 0, effectProgress: 0, sourceOpacity: 1, targetOpacity: 1
    });
    expect(phoneSegmentChoreographyFrame('crane-contact', authoredStop)).toMatchObject({
      sourceProgress: 1,
      sourceOpacity: 1,
      targetOpacity: 1
    });
    expect(phoneSegmentChoreographyFrame('crane-contact', authoredStop).targetProgress)
      .toBeGreaterThan(0);
    expect(phoneSegmentChoreographyFrame('crane-contact', .95)).toMatchObject({
      sourceProgress: 1,
      sourceOpacity: 1,
      targetOpacity: 1
    });
    expect(phoneSegmentChoreographyFrame('crane-contact', .95).targetProgress)
      .toBeCloseTo(.75, 5);
    expect(phoneSegmentChoreographyFrame('crane-contact', 1)).toMatchObject({
      sourceProgress: 1,
      effectProgress: 1,
      sourceOpacity: 0,
      targetOpacity: 1,
      targetProgress: 1
    });
  });

  it('preserves the Figure3 to Services media, copy, and paper channels', () => {
    for (const progress of [0, 0.8, 0.85, 0.95, 1]) {
      const expected = sampleFigure3ServicesChannels(progress);
      expect(phoneSegmentChoreographyFrame('figure3-services', progress)).toMatchObject({
        sourceProgress: expected.mediaProgress,
        targetProgress: expected.copyProgress,
        sourceOpacity: expected.sourceVisibility,
        targetOpacity: expected.paperAlpha
      });
    }
  });

  it('preserves the staged TTG and PH linear dissolve after media playback', () => {
    for (const [segment, stop] of [
      ['ttg-lab', TTG_LAB_ANIMATION_STOP],
      ['ph-education', PH_EDUCATION_ANIMATION_STOP]
    ] as const) {
      for (const progress of [stop / 2, stop, (stop + 1) / 2, 1]) {
        const expected = sampleStagedMediaHandoff(progress, stop);
        expect(phoneSegmentChoreographyFrame(segment, progress)).toMatchObject({
          sourceProgress: Math.min(1, progress / stop),
          sourceOpacity: expected.from.opacity,
          targetOpacity: expected.to.opacity
        });
      }
    }
  });

  it('keeps every projected channel finite and bounded in both directions', () => {
    for (const { id } of canonicalSegments) {
      for (const progress of [-1, 0, 0.25, 0.5, 0.75, 1, 2]) {
        const frame = phoneSegmentChoreographyFrame(id, progress);
        for (const value of [
          frame.sourceProgress,
          frame.targetProgress,
          frame.effectProgress,
          frame.sourceOpacity,
          frame.targetOpacity
        ]) {
          expect(Number.isFinite(value), `${id}:${progress}`).toBe(true);
          expect(value, `${id}:${progress}`).toBeGreaterThanOrEqual(0);
          expect(value, `${id}:${progress}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});
