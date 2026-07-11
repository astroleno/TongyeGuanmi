import { describe, expect, it } from 'vitest';
import { canScrollNatively } from './input-controller';

function readingRoot(scrollTop: number) {
  const scrollport = { clientHeight: 600, scrollHeight: 1600, scrollTop } as HTMLElement;
  const root = {
    matches: () => false,
    querySelector: () => scrollport
  } as unknown as HTMLElement;
  return { root, scrollport };
}

describe('production input reading handoff', () => {
  it('leaves forward and reverse deltas with the native scrollport before its edges', () => {
    const { root } = readingRoot(500);
    expect(canScrollNatively(root, 0.05)).toBe(true);
    expect(canScrollNatively(root, -0.05)).toBe(true);
  });

  it('hands input to Director only after the matching edge', () => {
    expect(canScrollNatively(readingRoot(1000).root, 0.05)).toBe(false);
    expect(canScrollNatively(readingRoot(0).root, -0.05)).toBe(false);
  });
});
