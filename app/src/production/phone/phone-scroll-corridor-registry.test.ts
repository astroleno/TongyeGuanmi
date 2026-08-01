import { describe, expect, it } from 'vitest';
import {
  createPhoneScrollCorridorRegistry,
  type PhoneScrollCorridor
} from './phone-scroll-corridor-registry';
import { createPhoneStorySnapshot } from './phone-story/machine';

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

  it('uses the run owner for a reverse boundary without replacing the stable sampling corridor', () => {
    const registry = createPhoneScrollCorridorRegistry();
    const brand = createPhoneStorySnapshot({ authorityId: 'a', scene: 'brand' });
    registry.register({
      id: 'group45',
      scenes: ['brand', 'services'],
      sample: (viewport) => ({
        actualY: viewport.actualY,
        scene: 'brand',
        direction: -1,
        progress: .5
      }),
      boundary: (run) => run === 'brand-services' ? 4_800 : null,
      landing: () => 4_800
    });
    registry.register({
      id: 'method-grade-a',
      scenes: ['method-top', 'figure2-animation', 'figure2-proof'],
      sample: () => null,
      boundary: (run) => run === 'proof-brand' ? 3_900 : null,
      landing: () => null
    });

    expect(registry.sample(brand, {
      actualY: 4_000,
      viewportHeight: 844,
      viewportWidth: 390,
      visualViewportOffsetTop: 0
    })).toMatchObject({ corridor: 'group45' });
    expect(registry.boundary(brand, 'proof-brand', -1)).toBe(3_900);
  });

  it('[AOD→Method execution cutover] uses its boundary owner without claiming Method sampling', () => {
    const registry = createPhoneScrollCorridorRegistry();
    const aod = createPhoneStorySnapshot({ authorityId: 'a', scene: 'aod-animation' });
    registry.register({
      id: 'front-rail',
      scenes: ['hero', 'pattern', 'star-map', 'aod-animation'],
      sample: () => null,
      boundary: (run) => run === 'aod-method' ? 1_382 : null,
      landing: (scene) => scene === 'method-top' ? 1_728 : null
    });
    registry.register({
      id: 'method-grade-a',
      scenes: ['method-top', 'figure2-animation', 'figure2-proof'],
      sample: () => null,
      boundary: () => null,
      landing: () => null
    });

    expect(registry.landing(aod, 'method-top', 'forward', 1, 'aod-method')).toBe(1_728);
  });

  it('[R5] resolves a shared Lab landing by run ownership, not effect registration order', () => {
    const registry = createPhoneScrollCorridorRegistry();
    const services = createPhoneStorySnapshot({ authorityId: 'a', scene: 'services' });
    registry.register({
      id: 'group67',
      scenes: ['lab', 'education'],
      sample: () => null,
      boundary: (run) => run === 'lab-education' ? 13_136 : null,
      landing: () => 13_136
    });
    registry.register({
      id: 'group45',
      scenes: ['services', 'lab'],
      sample: () => null,
      boundary: (run) => run === 'services-lab' ? 11_853 : null,
      landing: () => 11_853
    });

    expect(registry.landing(
      services,
      'lab',
      'forward',
      1,
      'services-lab'
    )).toBe(11_853);
    expect(registry.landing(
      services,
      'education',
      'forward',
      1,
      'lab-education'
    )).toBe(13_136);
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
