import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { phoneSegmentChoreographyFrame } from '../../production/phone-story/manifest';

describe('Phone PH → Education transition', () => {
  it('leaves media, opacity, and copy ownership in the canonical choreography frame', () => {
    const midpoint = phoneSegmentChoreographyFrame('ph-education', .5);
    expect(midpoint).toMatchObject({ mediaClockOwner: 'source', foregroundOwner: 'target' });
    const source = readFileSync(new URL('./phone.ts', import.meta.url), 'utf8');
    expect(source).toContain('createPhoneProgressLeaf');
    expect(source).not.toMatch(/renderPhonePh|renderEducation|style\.opacity|inert/);
  });
});
