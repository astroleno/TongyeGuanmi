import { describe, expect, it } from 'vitest';
import { canonicalSegments } from '../../story/canonical-spine';
import { phoneScrollChoreographyFrame } from './scroll-choreography';
import { phoneSegmentChoreographyFrame } from './manifest';

describe('absolute authored scroll poses', () => {
  it.each(canonicalSegments.map(({ id }) => id))('%s has identical cold, forward and reverse samples', (id) => {
    const samples = [0, .25, .5, .75, 1];
    const expected = samples.map((progress) => phoneScrollChoreographyFrame(id, progress));
    for (const progress of [...samples, ...[...samples].reverse(), .8, .2, .65]) {
      const frame = phoneScrollChoreographyFrame(id, progress);
      if (samples.includes(progress)) expect(frame).toEqual(expected[samples.indexOf(progress)]);
      for (const key of ['sourceProgress', 'targetProgress', 'effectProgress', 'sourceOpacity', 'targetOpacity'] as const) {
        expect(frame[key]).toBeGreaterThanOrEqual(0); expect(frame[key]).toBeLessThanOrEqual(1);
      }
    }
  });
  it('keeps Crane motion and Contact reveal on the same original clock', () => {
    for (const progress of [0, .25, .5, .75, .8, 3000 / 3400, .9, 1]) {
      expect(phoneScrollChoreographyFrame('crane-contact', progress))
        .toEqual(phoneSegmentChoreographyFrame('crane-contact', progress));
    }
    expect(phoneScrollChoreographyFrame('crane-contact', .8)).toMatchObject({
      sourceProgress: .8 / (3000 / 3400), effectProgress: 0
    });
    expect(phoneScrollChoreographyFrame('crane-contact', 3000 / 3400).sourceProgress).toBe(1);
  });
  it('reaches Figure2 media completion at the original active-time split', () => {
    const boundary = 2600 / 4100;
    expect(phoneScrollChoreographyFrame('figure2-distance-expand', boundary)).toMatchObject({
      sourceProgress: 1, effectProgress: 0
    });
    expect(phoneScrollChoreographyFrame('figure2-distance-expand', 3350 / 4100))
      .toEqual(phoneSegmentChoreographyFrame('figure2-distance-expand', .86));
  });
});
