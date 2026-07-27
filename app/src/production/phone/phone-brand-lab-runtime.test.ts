import { describe, expect, it } from 'vitest';
import {
  createPhoneStoryHold,
  reducePhoneStoryCursor,
  startPhoneStoryRun
} from './phone-story-cursor-test-support';
import {
  phoneBrandLabCompositeFrame,
  phoneBrandLabRunForVisual
} from './phone-brand-lab-runtime';

describe('canonical Brand through Lab runtime projection', () => {
  it('maps one cinematic scene to one composite run', () => {
    expect(phoneBrandLabRunForVisual('figure3-animation')).toBe(
      'brand-services'
    );
    expect(phoneBrandLabRunForVisual('ttg-animation')).toBe('services-lab');
  });

  it('derives completion from stable canonical holds', () => {
    expect(phoneBrandLabCompositeFrame(
      createPhoneStoryHold('brand'),
      'figure3-animation'
    ).entryProgress).toBe(0);
    expect(phoneBrandLabCompositeFrame(
      createPhoneStoryHold('services'),
      'figure3-animation'
    ).entryProgress).toBe(1);
    expect(phoneBrandLabCompositeFrame(
      createPhoneStoryHold('lab'),
      'ttg-animation'
    ).entryProgress).toBe(1);
  });

  it('keeps canonical reverse progress in the same 1 to 0 domain', () => {
    const reverse = startPhoneStoryRun(
      createPhoneStoryHold('services'),
      'brand-services',
      -1,
      { sessionId: 'phone-session-1', generation: 1 }
    );
    expect(phoneBrandLabCompositeFrame(
      reverse,
      'figure3-animation'
    ).entryProgress).toBe(1);
  });

  it('projects entry ink and media without resetting the entry endpoint', () => {
    const started = startPhoneStoryRun(
      createPhoneStoryHold('brand'),
      'brand-services',
      1,
      { sessionId: 'phone-session-2', generation: 2 }
    );
    const presented = reducePhoneStoryCursor(started, {
      type: 'PHASE',
      sessionId: 'phone-session-2',
      generation: 2,
      phase: 'presented-frame-ready'
    });
    const entry = reducePhoneStoryCursor(presented, {
      type: 'PHASE',
      sessionId: 'phone-session-2',
      generation: 2,
      phase: 'animating'
    });
    const progressedEntry = reducePhoneStoryCursor(entry, {
      type: 'PROGRESS',
      sessionId: 'phone-session-2',
      generation: 2,
      progress: .6
    });
    expect(phoneBrandLabCompositeFrame(
      progressedEntry,
      'figure3-animation'
    )).toMatchObject({
      entryProgress: .6,
      mediaProgress: 0
    });

    const mediaStart = reducePhoneStoryCursor(progressedEntry, {
      type: 'ADVANCE_LEG',
      sessionId: 'phone-session-2',
      generation: 2
    });
    const media = reducePhoneStoryCursor(mediaStart, {
      type: 'PROGRESS',
      sessionId: 'phone-session-2',
      generation: 2,
      progress: .4
    });
    expect(phoneBrandLabCompositeFrame(
      media,
      'figure3-animation'
    )).toMatchObject({
      entryProgress: 1,
      mediaProgress: .4
    });
  });

  it('projects reverse media before reverse entry ink', () => {
    const started = startPhoneStoryRun(
      createPhoneStoryHold('services'),
      'brand-services',
      -1,
      { sessionId: 'phone-session-3', generation: 3 }
    );
    const presented = reducePhoneStoryCursor(started, {
      type: 'PHASE',
      sessionId: 'phone-session-3',
      generation: 3,
      phase: 'presented-frame-ready'
    });
    const animating = reducePhoneStoryCursor(presented, {
      type: 'PHASE',
      sessionId: 'phone-session-3',
      generation: 3,
      phase: 'animating'
    });
    const media = reducePhoneStoryCursor(animating, {
      type: 'PROGRESS',
      sessionId: 'phone-session-3',
      generation: 3,
      progress: .4
    });
    expect(phoneBrandLabCompositeFrame(
      media,
      'figure3-animation'
    )).toMatchObject({
      entryProgress: 1,
      mediaProgress: .4
    });

    const entryStart = reducePhoneStoryCursor(media, {
      type: 'ADVANCE_LEG',
      sessionId: 'phone-session-3',
      generation: 3
    });
    expect(phoneBrandLabCompositeFrame(
      entryStart,
      'figure3-animation'
    )).toMatchObject({
      entryProgress: 1,
      mediaProgress: 0
    });
  });

});
