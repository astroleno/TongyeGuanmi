import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phoneSegmentChoreographyFrame } from '../../production/phone-story/manifest';

describe('Phone Crane → Contact transition', () => {
  it('keeps the 80% copy cue in choreography and endpoint mutation out of the effect leaf', () => {
    expect(phoneSegmentChoreographyFrame('crane-contact', .79).targetProgress).toBe(0);
    expect(phoneSegmentChoreographyFrame('crane-contact', .9).targetProgress).toBeCloseTo(.5);
    expect(phoneSegmentChoreographyFrame('crane-contact', 1)).toMatchObject({
      sourceOpacity: 0, targetProgress: 1, targetOpacity: 1
    });
    const source = readFileSync(new URL('./phone.ts', import.meta.url), 'utf8');
    expect(source).toContain('createPhoneProgressLeaf');
    expect(source).not.toMatch(/renderContact|style\.opacity|inert/);
  });
});
