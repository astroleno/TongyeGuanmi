import { describe, expect, it } from 'vitest';
import {
  phoneBrandLabAdapterScene,
  phoneBrandLabCompositeFrame,
  phoneBrandLabRunForVisual,
  phoneBrandLabVisualExecution
} from './phone-brand-lab-runtime';
import {
  createPhoneStorySnapshot,
  reducePhoneStorySnapshot,
  type PhoneStorySnapshot
} from './phone-story-state';
import { selectPhoneCinematicSnapshot } from './phone-story-runtime';

const cinematic = (snapshot: PhoneStorySnapshot) => (
  selectPhoneCinematicSnapshot(snapshot)
);

function start(
  scene: 'brand' | 'services',
  run: 'brand-services' | 'services-lab',
  direction: 1 | -1
): PhoneStorySnapshot {
  const snapshot = createPhoneStorySnapshot({
    authorityId: 'phone-brand-lab-runtime',
    scene
  });
  return reducePhoneStorySnapshot(snapshot, {
    type: 'RUN_STARTED',
    authorityId: snapshot.authorityId,
    sessionId: 'phone-group45-session',
    generation: 7,
    leg: direction === 1 ? 0 : 1,
    direction,
    run,
    anchorY: 0,
    inputEpoch: 3
  }).snapshot;
}

function identity(snapshot: PhoneStorySnapshot) {
  if (snapshot.status !== 'transaction') throw new Error('Expected transaction');
  return {
    authorityId: snapshot.authorityId,
    sessionId: snapshot.session.sessionId,
    generation: snapshot.session.generation,
    leg: snapshot.session.operation.legIndex,
    direction: snapshot.session.operation.direction
  } as const;
}

function presented(snapshot: PhoneStorySnapshot): PhoneStorySnapshot {
  return reducePhoneStorySnapshot(snapshot, {
    ...identity(snapshot),
    type: 'PRESENTED_FRAME'
  }).snapshot;
}

function progress(
  snapshot: PhoneStorySnapshot,
  value: number
): PhoneStorySnapshot {
  return reducePhoneStorySnapshot(snapshot, {
    ...identity(snapshot),
    type: 'PROGRESS_REPORTED',
    progress: value
  }).snapshot;
}

function completeLeg(snapshot: PhoneStorySnapshot): PhoneStorySnapshot {
  return reducePhoneStorySnapshot(snapshot, {
    ...identity(snapshot),
    type: 'LEG_COMPLETED'
  }).snapshot;
}

describe('canonical Brand through Lab snapshot projection', () => {
  it('maps one cinematic scene to one composite run', () => {
    expect(phoneBrandLabRunForVisual('figure3-animation')).toBe(
      'brand-services'
    );
    expect(phoneBrandLabRunForVisual('ttg-animation')).toBe('services-lab');
  });

  it('derives completion from stable canonical snapshots', () => {
    const brand = createPhoneStorySnapshot({
      authorityId: 'a',
      scene: 'brand'
    });
    const services = createPhoneStorySnapshot({
      authorityId: 'a',
      scene: 'services'
    });
    const lab = createPhoneStorySnapshot({
      authorityId: 'a',
      scene: 'lab'
    });
    expect(
      phoneBrandLabCompositeFrame(
        cinematic(brand),
        'figure3-animation'
      ).entryProgress
    ).toBe(0);
    expect(
      phoneBrandLabCompositeFrame(
        cinematic(services),
        'figure3-animation'
      ).entryProgress
    ).toBe(1);
    expect(phoneBrandLabCompositeFrame(
      cinematic(lab),
      'ttg-animation'
    ).entryProgress)
      .toBe(1);
  });

  it('projects entry ink and media from one forward snapshot session', () => {
    const entry = progress(
      presented(start('brand', 'brand-services', 1)),
      .6
    );
    expect(phoneBrandLabCompositeFrame(
      cinematic(entry),
      'figure3-animation'
    )).toEqual({
      entryProgress: .6,
      mediaProgress: 0
    });

    const media = progress(
      presented(completeLeg(entry)),
      .4
    );
    expect(phoneBrandLabCompositeFrame(
      cinematic(media),
      'figure3-animation'
    )).toEqual({
      entryProgress: 1,
      mediaProgress: .4
    });
    expect(phoneBrandLabAdapterScene(cinematic(media))).toBe('figure3-animation');
    expect(phoneBrandLabVisualExecution(
      cinematic(media),
      'figure3-animation'
    )).toEqual(
      identity(media)
    );
  });

  it('projects reverse media before reverse entry ink without a legacy cursor', () => {
    const media = progress(
      presented(start('services', 'brand-services', -1)),
      .4
    );
    expect(phoneBrandLabCompositeFrame(
      cinematic(media),
      'figure3-animation'
    )).toEqual({
      entryProgress: 1,
      mediaProgress: .4
    });

    const reverseEntry = completeLeg(media);
    expect(phoneBrandLabCompositeFrame(
      cinematic(reverseEntry),
      'figure3-animation'
    )).toEqual({
      entryProgress: 1,
      mediaProgress: 0
    });
    expect(phoneBrandLabVisualExecution(
      cinematic(reverseEntry),
      'figure3-animation'
    ))
      .toBeNull();
  });
});
