import { describe, expect, it } from 'vitest';
import { canonicalSegments } from '../../story/canonical-spine';
import {
  phoneEntryPlan,
  phoneIntentRuns,
  phoneRunForHold,
  phoneScrollRuns,
  phoneStoryRuns
} from './phone-story-runs';

describe('canonical phone story runs', () => {
  it('groups only real adjacent canonical segments into the eight phone runs', () => {
    expect(phoneIntentRuns.map(({ id, legs }) => ({
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

  it('models every front-half handoff as a scroll-owned canonical run', () => {
    expect(phoneScrollRuns.map(({ id, segment }) => ({
      id,
      segment
    }))).toEqual([
      {
        id: 'hero-pattern-scroll',
        segment: 'hero-pattern'
      },
      {
        id: 'pattern-star-scroll',
        segment: 'pattern-star-map'
      },
      {
        id: 'star-aod-scroll',
        segment: 'star-map-aod'
      }
    ]);
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

  it('treats every canonical hash as a stable direct-entry target', () => {
    for (const scene of [
      'figure3-animation',
      'ttg-animation',
      'ph-animation',
      'crane-animation',
      'brand'
    ] as const) {
      expect(phoneEntryPlan(scene)).toEqual({ kind: 'hold', scene });
    }
  });
});
