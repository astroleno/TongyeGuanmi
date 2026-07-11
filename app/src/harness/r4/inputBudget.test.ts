import { describe, expect, it } from 'vitest';
import { createR4BackHalfManifest } from './backHalfManifest';
import { createR4Group5Manifest } from './group5Manifest';
import { createR4Group6Manifest } from './group6Manifest';
import { adjacentHoldScene, inputBudgetBetweenScenes } from './inputBudget';

describe('R4 harness input budgets', () => {
  it('derives the back-half budget from segment legs in both directions', () => {
    const manifest = createR4BackHalfManifest();

    expect(inputBudgetBetweenScenes(manifest, 'services', 'contact')).toBe(8);
    expect(inputBudgetBetweenScenes(manifest, 'contact', 'services')).toBe(8);
  });

  it('counts staged TTG and PH segments as two independent inputs', () => {
    const group5 = createR4Group5Manifest('ttg-lab');
    const group6 = createR4Group6Manifest('ph-education');

    expect(adjacentHoldScene(group5, 'ttg-animation', 1)).toBe('lab');
    expect(inputBudgetBetweenScenes(group5, 'ttg-animation', 'lab')).toBe(2);
    expect(adjacentHoldScene(group6, 'ph-animation', 1)).toBe('education');
    expect(inputBudgetBetweenScenes(group6, 'ph-animation', 'education')).toBe(2);
  });

  it('keeps ordinary snap segments at one input', () => {
    const manifest = createR4Group5Manifest('services-ttg');

    expect(inputBudgetBetweenScenes(manifest, 'services', 'ttg-animation')).toBe(1);
  });
});
