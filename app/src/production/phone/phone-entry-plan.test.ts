import { describe, expect, it, vi } from 'vitest';
import {
  phoneContinuationEntryPlanFromHash,
  phoneGroup67EntryPlanFromHash,
  phoneGroup67SceneFromHash,
  phoneStoryEntryPlanFromHash,
  phoneStoryEntryTarget,
  phoneStoryEntryTargetId
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

  it.each([
    ['#brand', 'brand', 'brand', 'brand-reading'],
    ['#figure3-animation', 'figure3-animation', 'figure3', 'figure3-stage'],
    ['#services', 'services', 'services', 'services-reading'],
    ['#ttg-animation', 'ttg-animation', 'ttg', 'ttg-stage'],
    ['#lab', 'lab', 'lab', 'lab-stable']
  ] as const)(
    'maps %s to the shared continuation entry contract',
    (hash, scene, edgeScene, checkpoint) => {
      expect(phoneContinuationEntryPlanFromHash(hash)).toEqual({
        group: 'group45',
        scene,
        edgeScene,
        checkpoint
      });
    }
  );

  it('tags Group6–7 without changing its frozen scene presentation', () => {
    expect(phoneContinuationEntryPlanFromHash('#ph-animation')).toEqual({
      group: 'group67',
      scene: 'ph-animation',
      edgeScene: 'ph',
      checkpoint: 'ph-stage'
    });
  });

  it.each([
    ['#method', 'method-top', 'method', 'method-intro'],
    ['#figure2-animation', 'figure2-animation', 'figure2', 'figure2-stage'],
    ['#figure2-proof', 'figure2-proof', 'proof', 'figure2-proof-opening']
  ] as const)(
    'maps %s into the shell-owned Grade A direct-entry lifecycle',
    (hash, scene, edgeScene, checkpoint) => {
      expect(phoneStoryEntryPlanFromHash(hash)).toMatchObject({
        scene,
        edgeScene,
        checkpoint
      });
    }
  );

  it('keeps proof panel positioning in the shell plan', () => {
    expect(phoneStoryEntryPlanFromHash('#figure2-proof-cards'))
      .toMatchObject({ scene: 'figure2-proof', proofPanelIndex: 1 });
    expect(phoneStoryEntryPlanFromHash('#figure2-proof-closing'))
      .toMatchObject({ scene: 'figure2-proof', proofPanelIndex: 2 });
  });

  it('maps canonical scenes to their real document target ids', () => {
    expect(phoneStoryEntryTargetId('method-top')).toBe('method');
    expect(phoneStoryEntryTargetId('figure2-animation'))
      .toBe('figure2-animation');
  });

  it('resolves direct-entry targets only inside the live phone shell', () => {
    const target = {} as HTMLElement;
    const querySelector = vi.fn(() => target);

    expect(phoneStoryEntryTarget(
      'method-top',
      { querySelector } as unknown as Pick<Document, 'querySelector'>
    )).toBe(target);
    expect(querySelector).toHaveBeenCalledWith(
      '.portrait-scroll-spike #method'
    );
  });
});
