import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  group67PhoneAdapterIds,
  group67PhoneSceneIds,
  group67PhoneTransitionIds
} from './group6-7';

const groupSource = readFileSync(new URL('./group6-7.ts', import.meta.url), 'utf8');

describe('Unit 6/7 phone adapter registry', () => {
  it('registers only the PH through Contact canonical batch', () => {
    expect(group67PhoneSceneIds).toEqual([
      'ph-animation',
      'education',
      'crane-animation',
      'contact'
    ]);
    expect(group67PhoneTransitionIds).toEqual([
      'lab-ph',
      'ph-education',
      'education-crane',
      'crane-contact'
    ]);
    expect(group67PhoneAdapterIds).toEqual([
      ...group67PhoneSceneIds,
      ...group67PhoneTransitionIds
    ]);
  });

  it('does not eagerly import a preceding story scene for direct Contact entry', () => {
    expect(groupSource).not.toMatch(/Phone(?:Ph|Education|Crane|Contact)/);
    expect(groupSource).not.toMatch(/\bimport\s*\(/);
  });
});
