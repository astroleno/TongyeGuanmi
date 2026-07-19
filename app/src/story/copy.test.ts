import { describe, expect, it } from 'vitest';
import { BELIEF_COPY, HOME_COPY, METHOD_COPY, STAR_MAP_TITLE, productCopyFor } from './copy';

describe('shared product copy', () => {
  it('reads phone and desktop copy from the canonical inventory', () => {
    expect(productCopyFor('home')).toBe(HOME_COPY);
    expect(productCopyFor('belief')).toBe(BELIEF_COPY);
    expect(productCopyFor('method')).toBe(METHOD_COPY);
    expect(HOME_COPY.length).toBeGreaterThan(4);
    expect(BELIEF_COPY.length).toBeGreaterThan(3);
    expect(METHOD_COPY.length).toBeGreaterThan(22);
    expect(STAR_MAP_TITLE).toBe('让 AI 成为真利器');
  });
});
