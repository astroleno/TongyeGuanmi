import { describe, expect, it } from 'vitest';
import {
  phoneLabContactAdapterScene,
  phoneLabContactMediaProgress,
  phoneLabContactRunForVisual,
  phoneLabContactVisualExecution,
  phoneLabContactVisualProjection,
  phoneLabContactVisualPrewarm
} from './phone-lab-contact-runtime';
import {
  createPhoneStorySnapshot,
  reducePhoneStorySnapshot,
  type PhoneStorySnapshot
} from './phone-story-state';
import { phoneSegmentPresentationContract } from './phone-presentation-contract';
import { phoneRun } from './phone-story-runs';
import { selectPhoneCinematicSnapshot } from './phone-story-runtime';

const cinematic = (snapshot: PhoneStorySnapshot) => (
  selectPhoneCinematicSnapshot(snapshot)
);

function start(
  scene: 'lab' | 'education',
  run: 'lab-education' | 'education-contact',
  direction: 1 | -1
): PhoneStorySnapshot {
  const snapshot = createPhoneStorySnapshot({
    authorityId: 'phone-lab-contact-runtime',
    scene
  });
  return reducePhoneStorySnapshot(snapshot, {
    type: 'RUN_STARTED',
    authorityId: snapshot.authorityId,
    sessionId: 'phone-group67-session',
    generation: 9,
    leg: direction === 1 ? 0 : 1,
    direction,
    run,
    anchorY: 0,
    inputEpoch: 4
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

function executionToken(snapshot: PhoneStorySnapshot) {
  const value = identity(snapshot);
  return [
    value.authorityId,
    value.sessionId,
    value.generation,
    value.leg,
    value.direction
  ] as const;
}

function presented(snapshot: PhoneStorySnapshot): PhoneStorySnapshot {
  if (snapshot.status !== 'transaction' || !snapshot.session.operation.run) {
    throw new Error('Expected an active cinematic transaction');
  }
  const leg = phoneRun(snapshot.session.operation.run)
    .legs[snapshot.session.operation.legIndex];
  if (!leg) throw new Error('Expected an active cinematic leg');
  const frame = phoneSegmentPresentationContract(leg.segment).firstFrame;
  return reducePhoneStorySnapshot(snapshot, {
    ...identity(snapshot),
    type: 'PRESENTED_FRAME',
    kind: frame.kind,
    subject: frame.subject,
    revision: snapshot.session.presentation[0],
    observedAt: snapshot.session.presentation[0]
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

describe('canonical Lab through Contact runtime projection', () => {
  it('maps PH and Crane to their complete composite runs', () => {
    expect(phoneLabContactRunForVisual('ph-animation')).toBe('lab-education');
    expect(phoneLabContactRunForVisual('crane-animation')).toBe(
      'education-contact'
    );
  });

  it('derives Group67 adapter focus, frames, and media identity from one snapshot', () => {
    const lab = createPhoneStorySnapshot({
      authorityId: 'phone-lab-contact-runtime',
      scene: 'lab'
    });
    expect(phoneLabContactAdapterScene(cinematic(lab))).toBe('lab');

    const entry = progress(
      presented(start('lab', 'lab-education', 1)),
      .6
    );
    expect(phoneLabContactAdapterScene(cinematic(entry))).toBe('ph-animation');
    expect(phoneLabContactMediaProgress(
      cinematic(entry),
      'ph-animation'
    )).toBe(0);
    expect(phoneLabContactVisualExecution(
      cinematic(entry),
      'ph-animation'
    )).toBeNull();
    expect(phoneLabContactVisualPrewarm(
      cinematic(entry),
      'ph-animation'
    )).toBe(true);

    const media = progress(presented(completeLeg(entry)), .4);
    expect(phoneLabContactMediaProgress(
      cinematic(media),
      'ph-animation'
    )).toBe(.4);
    expect(phoneLabContactVisualExecution(
      cinematic(media),
      'ph-animation'
    )).toEqual(executionToken(media));
    expect(phoneLabContactVisualProjection(
      cinematic(media),
      'ph-animation'
    )).toEqual([executionToken(media), true, .4]);
  });
});
