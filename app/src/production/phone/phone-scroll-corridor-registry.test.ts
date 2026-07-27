import { describe, expect, it } from 'vitest';
import {
  createPhoneScrollCorridorRegistry,
  type PhoneScrollCorridor
} from './phone-scroll-corridor-registry';
import { createPhoneStorySnapshot } from './phone-story-state';

function corridor(
  id: string,
  scenes: readonly ('hero' | 'brand' | 'services')[]
): PhoneScrollCorridor {
  return {
    id,
    scenes,
    sample: (viewport) => ({
      actualY: viewport.actualY,
      direction: 1,
      progress: .5
    }),
    boundary: () => id === 'brand' ? 480 : 120,
    landing: () => id === 'brand' ? 600 : 160
  };
}

describe('phone scroll corridor registry', () => {
  it('selects exactly one corridor from the current snapshot scene', () => {
    const registry = createPhoneScrollCorridorRegistry();
    registry.register(corridor('hero', ['hero']));
    registry.register(corridor('brand', ['brand', 'services']));
    const brand = createPhoneStorySnapshot({ authorityId: 'a', scene: 'brand' });

    expect(registry.sample(brand, {
      actualY: 320,
      viewportHeight: 844,
      viewportWidth: 390,
      visualViewportOffsetTop: 0
    })).toEqual({
      corridor: 'brand',
      sample: { actualY: 320, direction: 1, progress: .5 }
    });
    expect(registry.boundary(brand, 'brand-services', 1)).toBe(480);
    expect(registry.landing(brand, 'services', 'forward', 1)).toBe(600);
  });

  it('falls back to the current selected corridor only when the target has no corridor', () => {
    const registry = createPhoneScrollCorridorRegistry();
    registry.register(corridor('hero', ['hero']));
    const hero = createPhoneStorySnapshot({ authorityId: 'a', scene: 'hero' });

    expect(registry.landing(hero, 'services', 'direct-entry', 1)).toBe(160);
    expect(registry.boundary(hero, 'brand-services', 1)).toBe(120);
  });

  it('removes a corridor synchronously without leaving a stale selection', () => {
    const registry = createPhoneScrollCorridorRegistry();
    const lease = registry.register(corridor('hero', ['hero']));
    const hero = createPhoneStorySnapshot({ authorityId: 'a', scene: 'hero' });

    lease.dispose();

    expect(registry.sample(hero, {
      actualY: 0,
      viewportHeight: 844,
      viewportWidth: 390,
      visualViewportOffsetTop: 0
    })).toBeNull();
    expect(registry.boundary(hero, 'brand-services', 1)).toBeNull();
  });

  it.each([
    ['front', 'aod-animation', 'method-top', 'aod-method', 180, 220],
    ['method-grade-a', 'method-top', 'figure2-animation', 'method-figure2', 320, 360],
    ['group45', 'brand', 'services', 'brand-services', 480, 512],
    ['group67', 'lab', 'education', 'lab-education', 640, 688]
  ] as const)(
    'serves %s boundary and landing geometry through one registered corridor',
    (id, source, target, run, boundary, landing) => {
      const registry = createPhoneScrollCorridorRegistry();
      const snapshot = createPhoneStorySnapshot({ authorityId: 'a', scene: source });
      registry.register({
        id,
        scenes: [source, target],
        sample: () => null,
        boundary: (requestedRun) => requestedRun === run ? boundary : null,
        landing: (requestedScene) => requestedScene === target ? landing : null
      });

      expect(registry.boundary(snapshot, run, 1)).toBe(boundary);
      expect(registry.landing(snapshot, target, 'forward', 1)).toBe(landing);
    }
  );
});
