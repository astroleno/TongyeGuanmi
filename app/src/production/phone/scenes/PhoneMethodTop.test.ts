import { describe, expect, it } from 'vitest';
import {
  phoneMethodRequestsGradeAAtMount,
  phoneMethodStaticPresentationFrame
} from './PhoneMethodTop';

describe('PhoneMethodTop direct entry', () => {
  it.each([
    '#method',
    '#figure2-animation',
    '#figure2-proof-opening',
    '#brand',
    '#figure3-animation',
    '#services',
    '#ttg-animation',
    '#lab',
    '#ph-animation',
    '#education',
    '#crane-animation',
    '#contact'
  ])('requests Grade A during the first mount for %s', (hash) => {
    expect(phoneMethodRequestsGradeAAtMount(hash)).toBe(true);
  });

  it.each([
    '#home',
    '#aod-animation'
  ])('keeps Grade A lazy for non-Grade-A entry %s', (hash) => {
    expect(phoneMethodRequestsGradeAAtMount(hash)).toBe(false);
  });

  it('returns the original immutable token only as a static leaf frame', () => {
    const token = {
      authorityId: 'method-authority',
      sessionId: 'method-session',
      generation: 6,
      leg: 0,
      revision: 12,
      subject: 'native:method',
      kind: 'static-poster' as const
    };

    expect(phoneMethodStaticPresentationFrame(token, 1, 84)).toEqual({
      token,
      frameSequence: 1,
      observedAt: 84,
      origin: 'leaf-static-poster'
    });
  });
});
