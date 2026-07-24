import { describe, expect, it } from 'vitest';
import {
  phoneGroup67EntryPlanFromHash,
  phoneGroup67SceneFromHash
} from './phone-entry-plan';

describe('formal Group6–7 phone direct-entry plan', () => {
  it.each([
    ['#ph-animation', 'ph-animation', 'ph', 'ph-stage'],
    ['#education', 'education', 'education', 'education-reading'],
    ['#crane-animation', 'crane-animation', 'crane', 'crane-stage'],
    ['#contact', 'contact', 'contact', 'contact-stable']
  ] as const)(
    'maps %s to one downstream scene and its edge/checkpoint',
    (hash, scene, edgeScene, checkpoint) => {
      expect(phoneGroup67EntryPlanFromHash(hash)).toEqual({
        scene,
        edgeScene,
        checkpoint
      });
    }
  );

  it('does not classify the front half or malformed hashes as Group6–7', () => {
    expect(phoneGroup67SceneFromHash('#home')).toBeUndefined();
    expect(phoneGroup67SceneFromHash('#lab')).toBeUndefined();
    expect(phoneGroup67SceneFromHash('#%E0%A4%A')).toBeUndefined();
  });
});
