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
} from './phone-story/machine';
import {
  phoneScenePresentationTuple,
  phoneSegmentPresentationContract,
  phoneSegmentPresentationTuple
} from './phone-story/manifest';
import { phoneRun, phoneRunLegTuple } from './phone-story-runs';
import { selectPhoneCinematicSnapshot } from './phone-story/runtime';

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
  if (snapshot.status !== 'transaction' || !snapshot.session.operation.run) {
    throw new Error('Expected an active cinematic transaction');
  }
  const leg = phoneRunLegTuple(
    snapshot.session.operation.run,
    snapshot.session.operation.legIndex
  );
  if (!leg) throw new Error('Expected an active cinematic leg');
  const frame = phoneSegmentPresentationTuple(leg[0]);
  return [
    value.authorityId,
    value.sessionId,
    value.generation,
    value.leg,
    value.direction,
    {
      authorityId: value.authorityId,
      sessionId: value.sessionId,
      generation: value.generation,
      leg: value.leg,
      revision: snapshot.session.presentationRevision,
      subject: frame[9],
      kind: frame[8]
    }
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
  const contract = phoneSegmentPresentationTuple(leg.segment);
  return reducePhoneStorySnapshot(snapshot, {
    ...identity(snapshot),
    type: 'PRESENTATION_PROOF_REPORTED',
    proof: {
      token: {
        authorityId: snapshot.authorityId,
        sessionId: snapshot.session.sessionId,
        generation: snapshot.session.generation,
        leg: snapshot.session.operation.legIndex,
        revision: snapshot.session.presentationRevision,
        subject: frame.subject,
        kind: contract[8]
      },
      frameSequence: 1,
      observedAt: 1,
      connected: true,
      visible: true,
      coverageComplete: true,
      edge: phoneScenePresentationTuple(contract[3])[1]
    }
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

  it('[Education direct-entry cutover] retains Education as the lazy focus throughout its candidate', () => {
    const stable = createPhoneStorySnapshot({
      authorityId: 'phone-group67-entry',
      scene: 'education'
    });
    const candidate = reducePhoneStorySnapshot(stable, {
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: stable.authorityId,
      target: 'education',
      source: 'initial',
      fallbackScene: 'education',
      cinematic: null
    }).snapshot;

    expect(candidate.status).toBe('transaction');
    expect(phoneLabContactAdapterScene(cinematic(candidate))).toBe('education');
  });

  it('[Crane direct-entry cutover] keeps the projected packed surface active during entry admission', () => {
    const stable = createPhoneStorySnapshot({
      authorityId: 'phone-group67-crane-entry',
      scene: 'hero'
    });
    const candidate = reducePhoneStorySnapshot(stable, {
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: stable.authorityId,
      target: 'crane-animation',
      source: 'initial',
      fallbackScene: 'crane-animation',
      cinematic: null
    }).snapshot;

    expect(candidate.status).toBe('transaction');
    expect(phoneLabContactAdapterScene(cinematic(candidate))).toBe('crane-animation');
    expect(phoneLabContactVisualPrewarm(
      cinematic(candidate),
      'crane-animation'
    )).toBe(true);
  });
});
