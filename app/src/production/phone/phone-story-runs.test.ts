import { describe, expect, it } from 'vitest';
import { canonicalSegments } from '../../story/canonical-spine';
import {
  phoneEntryPlan,
  phoneRunForHold,
  phoneStoryRuns
} from './phone-story-runs';

describe('canonical phone story runs', () => {
  it('groups only real adjacent canonical segments into the eight phone runs', () => {
    expect(phoneStoryRuns.map(({ id, legs }) => ({
      id,
      legs: legs.map(({ segment }) => segment)
    }))).toEqual([
      { id: 'aod-method', legs: ['aod-method-top'] },
      { id: 'method-figure2', legs: ['method-bottom-figure2'] },
      { id: 'figure2-proof', legs: ['figure2-distance-expand'] },
      { id: 'proof-brand', legs: ['figure2-proof-brand'] },
      {
        id: 'brand-services',
        legs: ['brand-figure3', 'figure3-services']
      },
      {
        id: 'services-lab',
        legs: ['services-ttg', 'ttg-lab']
      },
      {
        id: 'lab-education',
        legs: ['lab-ph', 'ph-education']
      },
      {
        id: 'education-contact',
        legs: ['education-crane', 'crane-contact']
      }
    ]);

    for (const run of phoneStoryRuns) {
      for (const leg of run.legs) {
        const canonical = canonicalSegments.find((candidate) => (
          candidate.id === leg.segment
        ));
        expect(canonical).toBeDefined();
        expect(leg).toMatchObject({
          from: canonical?.from,
          to: canonical?.to
        });
      }
    }
  });

  it('maps each stable hold and direction to at most one adjacent run', () => {
    expect(phoneRunForHold('brand', 1)?.id).toBe('brand-services');
    expect(phoneRunForHold('services', -1)?.id).toBe('brand-services');
    expect(phoneRunForHold('services', 1)?.id).toBe('services-lab');
    expect(phoneRunForHold('lab', -1)?.id).toBe('services-lab');
    expect(phoneRunForHold('education', -1)?.id).toBe('lab-education');
    expect(phoneRunForHold('contact', -1)?.id).toBe('education-contact');
    expect(phoneRunForHold('figure3-animation', 1)).toBeUndefined();
    expect(phoneRunForHold('ttg-animation', -1)).toBeUndefined();
  });

  it('defines complete immutable dependency closures beside each run', () => {
    expect(phoneRunForHold('brand', 1)?.dependencies).toEqual({
      scenes: ['brand', 'figure3-animation', 'services'],
      transitions: ['brand-figure3', 'figure3-services']
    });
    expect(phoneRunForHold('lab', 1)?.dependencies).toEqual({
      scenes: ['lab', 'ph-animation', 'education'],
      transitions: ['lab-ph', 'ph-education']
    });
    expect(phoneRunForHold('education', 1)?.dependencies).toEqual({
      scenes: ['education', 'crane-animation', 'contact'],
      transitions: ['education-crane', 'crane-contact']
    });
  });

  it('initializes cinematic direct entries at their real media leg', () => {
    expect(phoneEntryPlan('figure3-animation')).toEqual({
      kind: 'cinematic',
      scene: 'figure3-animation',
      run: 'brand-services',
      legIndex: 1,
      direction: 1,
      target: 'services'
    });
    expect(phoneEntryPlan('ttg-animation')).toEqual({
      kind: 'cinematic',
      scene: 'ttg-animation',
      run: 'services-lab',
      legIndex: 1,
      direction: 1,
      target: 'lab'
    });
    expect(phoneEntryPlan('ph-animation')).toEqual({
      kind: 'cinematic',
      scene: 'ph-animation',
      run: 'lab-education',
      legIndex: 1,
      direction: 1,
      target: 'education'
    });
    expect(phoneEntryPlan('crane-animation')).toEqual({
      kind: 'cinematic',
      scene: 'crane-animation',
      run: 'education-contact',
      legIndex: 1,
      direction: 1,
      target: 'contact'
    });
    expect(phoneEntryPlan('brand')).toEqual({
      kind: 'hold',
      scene: 'brand'
    });
  });
});
