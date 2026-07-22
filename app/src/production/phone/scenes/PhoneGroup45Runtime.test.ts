import { describe, expect, it } from 'vitest';
import {
  group45PhoneSceneIds,
  group45PhoneTransitionIds
} from '../adapter-groups/group4-5';
import {
  loadGroup45PhoneSceneAdapter,
  loadGroup45PhoneTransitionAdapter,
  resolvedGroup45PhoneSceneAdapter,
  resolvedGroup45PhoneTransitionAdapter
} from './PhoneGroup45Runtime';

describe('Unit 5 focused phone runtime', () => {
  it('keeps every Brand → Lab adapter in a distinct lazy module cache', async () => {
    const scenes = await Promise.all(group45PhoneSceneIds.map(loadGroup45PhoneSceneAdapter));
    const transitions = await Promise.all(
      group45PhoneTransitionIds.map(loadGroup45PhoneTransitionAdapter)
    );

    expect(scenes.map(({ id }) => id)).toEqual(group45PhoneSceneIds);
    expect(transitions.map(({ id }) => id)).toEqual(group45PhoneTransitionIds);
    expect(resolvedGroup45PhoneSceneAdapter('brand')).toBe(scenes[0]);
    expect(resolvedGroup45PhoneTransitionAdapter('ttg-lab')).toBe(transitions[3]);
  });
});
