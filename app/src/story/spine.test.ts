import { describe, expect, it } from 'vitest';
import { storyManifest } from './manifest';
import { StorySpine } from './spine';

describe('StorySpine', () => {
  it('indexes scene and segment labels on the virtual timeline', () => {
    const spine = new StorySpine(storyManifest);

    expect(spine.labelOf('scene:hero')).toBe(0);
    expect(spine.labelOf('segment:hero-pattern:start')).toBe(0);
    expect(spine.labelOf('segment:hero-pattern:end')).toBeGreaterThan(0);
    expect(spine.labelOf('scene:pattern')).toBe(spine.labelOf('segment:hero-pattern:end'));
  });

  it('keeps cursor on either a hold, one segment, or settling boundary', () => {
    const spine = new StorySpine(storyManifest);

    expect(spine.cursor).toEqual({ status: 'hold', scene: 'hero' });
    expect(spine.enterSegment('hero-pattern')).toEqual({
      status: 'segment',
      segment: 'hero-pattern',
      from: 'hero',
      to: 'pattern'
    });
    expect(spine.enterSettling('hero-pattern', 'pattern')).toEqual({
      status: 'settling',
      segment: 'hero-pattern',
      from: 'hero',
      to: 'pattern',
      target: 'pattern'
    });
    expect(spine.enterHold('pattern')).toEqual({ status: 'hold', scene: 'pattern' });
  });

  it('resolves directional segments from hold endpoints', () => {
    const spine = new StorySpine(storyManifest);

    expect(spine.segmentForDirection('hero', -1)).toBeNull();
    expect(spine.segmentForDirection('hero', 1)?.id).toBe('hero-pattern');
    expect(spine.segmentForDirection('pattern', -1)?.id).toBe('hero-pattern');
    expect(spine.segmentForDirection('pattern', 1)?.id).toBe('pattern-star-map');
  });

  it('rejects settling outside segment endpoints', () => {
    const spine = new StorySpine(storyManifest);

    expect(() => spine.enterSettling('hero-pattern', 'brand')).toThrow(/not an endpoint/);
  });
});
