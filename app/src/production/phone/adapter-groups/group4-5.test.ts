import { describe, expect, it } from 'vitest';
import {
  group45PhoneAdapterIds,
  group45PhoneAdapterRegistrations,
  group45NextAdapterByScene,
  group45PhoneSceneIds,
  group45PhoneTransitionIds
} from './group4-5';

describe('Unit 5 phone adapter group', () => {
  it('owns exactly Brand through Lab and their four bridges', () => {
    expect(group45PhoneSceneIds).toEqual([
      'brand',
      'figure3-animation',
      'services',
      'ttg-animation',
      'lab'
    ]);
    expect(group45PhoneTransitionIds).toEqual([
      'brand-figure3',
      'figure3-services',
      'services-ttg',
      'ttg-lab'
    ]);
    expect(group45PhoneAdapterIds).toHaveLength(9);
  });

  it('records one independent dynamic-import target per adapter', () => {
    expect(group45PhoneAdapterRegistrations).toHaveLength(9);
    expect(group45PhoneAdapterRegistrations).toContainEqual({
      id: 'services',
      sourceModule: 'app/src/scenes/services/phone/PhoneServices',
      exportName: 'PhoneServices'
    });
    expect(group45PhoneAdapterRegistrations).toContainEqual({
      id: 'services-ttg',
      sourceModule: 'app/src/transitions/services-ttg/phone',
      exportName: 'PhoneServicesTtgTransition'
    });
  });

  it('limits prewarm registration to the immediate next Unit 5 pair', () => {
    expect(group45NextAdapterByScene.brand).toEqual({
      scene: 'figure3-animation',
      transition: 'brand-figure3'
    });
    expect(group45NextAdapterByScene.lab).toBeUndefined();
  });
});
