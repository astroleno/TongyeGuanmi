import { describe, expect, it } from 'vitest';
import { storyManifest } from './manifest';
import { assertFixtureStaticFallbackText, fixtureStaticFallbackText } from './copy-baseline';

describe('copy baseline fixture', () => {
  it('checks placeholder static fallback text against the R-1 baseline', () => {
    const staticFallbackScenes = storyManifest.nodes
      .flatMap((node) => (node.kind === 'hold' && node.staticFallback ? [node.scene] : []));

    expect(staticFallbackScenes).toContain('hero');
    for (const scene of staticFallbackScenes) {
      expect(() => assertFixtureStaticFallbackText(scene)).not.toThrow();
    }
  });

  it('keeps the hero baseline extractable without runtime JS', () => {
    expect(fixtureStaticFallbackText('hero')).toEqual([
      '同',
      '野',
      '观',
      '幂',
      '你的同行不是更聪明，只是更早把 AI 用进了生意里。'
    ]);
  });
});
