import { describe, expect, it } from 'vitest';
import {
  LayerWindow,
  advanceLayerWindow,
  assertLayerWindowInvariants,
  createLayerWindow,
  fallbackLayerWindow,
  releaseRetiringLayers
} from './LayerWindow';

describe('LayerWindow snapshot', () => {
  it('tracks prev/current/next members around a hold', () => {
    expect(createLayerWindow('pattern')).toEqual({
      prev: 'hero',
      current: 'pattern',
      next: 'star-map',
      retiring: []
    });
  });

  it('marks members outside the new window as retiring', () => {
    const hero = createLayerWindow('hero');
    const starMap = advanceLayerWindow(hero, 'star-map');

    expect(starMap.current).toBe('star-map');
    expect(starMap.retiring).toContain('hero');
  });

  it('uses hero as the static fallback window', () => {
    expect(fallbackLayerWindow().current).toBe('hero');
  });

  it('keeps active and transient mounted layer counts inside the R2 window budget', () => {
    const hero = createLayerWindow('hero');
    const starMap = advanceLayerWindow(hero, 'star-map');

    expect(() => assertLayerWindowInvariants(starMap)).not.toThrow();
    expect([starMap.prev, starMap.current, starMap.next].filter(Boolean)).toHaveLength(3);
    expect([starMap.prev, starMap.current, starMap.next, ...starMap.retiring].filter(Boolean)).toHaveLength(4);
  });

  it('releases retiring layers after the next frame before the following hold', () => {
    const starMap = advanceLayerWindow(createLayerWindow('hero'), 'star-map');
    expect(starMap.retiring).toContain('hero');

    const released = releaseRetiringLayers(starMap);
    expect(released.retiring).toEqual([]);
    expect(() => assertLayerWindowInvariants(released)).not.toThrow();
  });

  it('changes roles without remounting existing window members', () => {
    const window = new LayerWindow('hero');
    const patternMount = window.mountId('pattern');

    window.commitHold('pattern');

    expect(window.mountId('pattern')).toBe(patternMount);
    expect(window.members()).toContainEqual({ scene: 'pattern', role: 'current', mountId: patternMount });
  });

  it('fails fast when a retiring layer survives into the next hold', () => {
    const window = new LayerWindow('hero');
    window.commitHold('star-map');

    expect(() => window.commitHold('aod-animation')).toThrow(/retiring layer survived/);
  });
});
