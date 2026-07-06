import { describe, expect, it } from 'vitest';
import { advanceLayerWindow, createLayerWindow, fallbackLayerWindow } from './layer-window';

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
});
