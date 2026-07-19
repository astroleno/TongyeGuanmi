import { describe, expect, it } from 'vitest';
import { HERO_COPY } from '../scenes/hero';
import { PATTERN_COPY } from '../scenes/pattern';
import { METHOD_COPY as desktopMethodCopy } from '../scenes/method-top';
import { BELIEF_COPY, HOME_COPY, METHOD_COPY } from './copy';

describe('shared product copy consumers', () => {
  it('keeps desktop and phone front-half adapters on the canonical copy inventory', () => {
    expect(HERO_COPY).toBe(HOME_COPY);
    expect(PATTERN_COPY).toEqual(BELIEF_COPY.slice(0, 3));
    expect(desktopMethodCopy).toEqual(METHOD_COPY.slice(0, 23));
  });
});
