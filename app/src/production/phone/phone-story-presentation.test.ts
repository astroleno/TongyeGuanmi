import { describe, expect, it } from 'vitest';
import { canonicalSceneIds } from '../../story/canonical-spine';
import {
  phoneRunForHold
} from './phone-story-runs';
import {
  createPhoneStoryHold,
  reducePhoneStoryCursor,
  startPhoneStoryRun
} from './phone-story-state';
import {
  phoneStoryPresentation
} from './phone-story-presentation';

const identity = {
  sessionId: 'phone-presentation-session',
  generation: 3
} as const;

describe('canonical phone presentation projection', () => {
  it('defines one complete checkpoint and edge for every stable hold', () => {
    for (const scene of canonicalSceneIds) {
      expect(phoneStoryPresentation(createPhoneStoryHold(scene))).toEqual(
        expect.objectContaining({
          scene,
          checkpoint: expect.any(String),
          edge: expect.any(String)
        })
      );
    }
  });

  it.fails('[Task 1] defines the full execution projection for all canonical scenes', () => {
    for (const scene of canonicalSceneIds) {
      const projection = phoneStoryPresentation(
        createPhoneStoryHold(scene)
      ) as unknown as Record<string, unknown>;

      for (const field of [
        'commitState',
        'semanticScene',
        'navigationScene',
        'stageOwner',
        'stageScene',
        'sourceSurface',
        'receiverSurface',
        'coverageSurface',
        'landingResolver'
      ]) {
        expect(projection).toHaveProperty(field);
      }
    }
  });

  it('keeps every forward run on its source edge until endpoint coverage', () => {
    for (const scene of canonicalSceneIds) {
      const run = phoneRunForHold(scene, 1);
      if (!run) continue;
      const started = startPhoneStoryRun(
        createPhoneStoryHold(scene),
        run.id,
        1,
        identity
      );
      const opening = phoneStoryPresentation(started);
      const progressed = phoneStoryPresentation(reducePhoneStoryCursor(
        started,
        { ...identity, type: 'PROGRESS', progress: 0.5 }
      ));

      expect(opening.scene).toBe(started.from);
      expect(progressed.scene).toBe(started.to);
      expect(opening.edge).toBe(progressed.edge);
    }
  });

  it('does not switch the Safari edge owner on the first visible transition sample', () => {
    const started = startPhoneStoryRun(
      createPhoneStoryHold('figure2-animation'),
      'figure2-proof',
      1,
      identity
    );
    const opening = reducePhoneStoryCursor(started, {
      ...identity,
      type: 'PROGRESS',
      progress: 0.002
    });
    const completed = reducePhoneStoryCursor(opening, {
      ...identity,
      type: 'PROGRESS',
      progress: 1
    });

    expect(phoneStoryPresentation(opening)).toMatchObject({
      scene: 'figure2-proof',
      edge: 'figure2'
    });
    expect(phoneStoryPresentation(completed).edge).toBe('proof');
  });

  it('keeps AOD autoplay until Method has a presented progress sample', () => {
    const started = startPhoneStoryRun(
      createPhoneStoryHold('aod-animation'),
      'aod-method',
      1,
      identity
    );

    expect(phoneStoryPresentation(started)).toMatchObject({
      scene: 'aod-animation',
      checkpoint: 'aod-autoplay',
      edge: 'aod'
    });
  });

  it('projects reverse progress through the same canonical endpoints', () => {
    const started = startPhoneStoryRun(
      createPhoneStoryHold('brand'),
      'proof-brand',
      -1,
      identity
    );
    const progressed = reducePhoneStoryCursor(started, {
      ...identity,
      type: 'PROGRESS',
      progress: 0.5
    });
    const completed = reducePhoneStoryCursor(progressed, {
      ...identity,
      type: 'PROGRESS',
      progress: 0
    });

    expect(phoneStoryPresentation(started)).toMatchObject({
      scene: 'brand',
      edge: 'brand',
      checkpoint: 'proof-to-brand'
    });
    expect(phoneStoryPresentation(progressed)).toMatchObject({
      scene: 'brand',
      edge: 'brand'
    });
    expect(phoneStoryPresentation(completed)).toMatchObject({
      scene: 'figure2-proof',
      edge: 'proof'
    });
  });

  it.fails('[Task 1] uses the active composite leg instead of the composite final hold', () => {
    const started = startPhoneStoryRun(
      createPhoneStoryHold('lab'),
      'lab-education',
      1,
      identity
    );
    const ph = reducePhoneStoryCursor(started, {
      ...identity,
      type: 'PROGRESS',
      progress: 1
    });
    const educationLeg = reducePhoneStoryCursor(ph, {
      ...identity,
      type: 'ADVANCE_LEG'
    });

    expect(phoneStoryPresentation(ph)).toMatchObject({
      scene: 'ph-animation',
      edge: 'ph',
      checkpoint: 'lab-to-ph'
    });
    expect(phoneStoryPresentation(educationLeg)).toMatchObject({
      scene: 'ph-animation',
      edge: 'ph',
      checkpoint: 'ph-to-education'
    });
  });
});
