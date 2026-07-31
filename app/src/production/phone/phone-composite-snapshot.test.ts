import { describe, expect, it } from 'vitest';
import {
  phoneCompositeAdapterScene,
  phoneClampDocumentLanding,
  phoneCompositeMediaProgress,
  phoneCompositeVisualExecution,
  phoneCompositeVisualProjection,
  phoneCompositeVisualSpec,
  phoneReadingLandingTarget
} from './phone-composite-snapshot';
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

type VisualScene = 'figure3-animation' | 'ttg-animation';

function visualRun(scene: VisualScene) {
  return phoneCompositeVisualSpec(scene)[0];
}

function visualProgress(
  snapshot: ReturnType<typeof cinematic>,
  scene: VisualScene
): number {
  const [run, , target] = phoneCompositeVisualSpec(scene);
  return phoneCompositeMediaProgress(snapshot, run, target);
}

function visualProjection(
  snapshot: ReturnType<typeof cinematic>,
  scene: VisualScene
) {
  const [run, surface, target] = phoneCompositeVisualSpec(scene);
  return phoneCompositeVisualProjection(snapshot, run, surface, target);
}

function visualExecution(
  snapshot: ReturnType<typeof cinematic>,
  scene: VisualScene
) {
  return phoneCompositeVisualExecution(snapshot, visualRun(scene));
}

function group45AdapterScene(snapshot: ReturnType<typeof cinematic>) {
  const activeVisual = snapshot[6] === 'brand-services'
    ? 'figure3-animation'
    : snapshot[6] === 'services-lab' ? 'ttg-animation' : null;
  return phoneCompositeAdapterScene(
    snapshot,
    'brand',
    'brand',
    'lab',
    activeVisual
  );
}

function start(
  scene: 'brand' | 'services',
  run: 'brand-services' | 'services-lab',
  direction: 1 | -1
): PhoneStorySnapshot {
  const snapshot = createPhoneStorySnapshot({
    authorityId: 'phone-composite-snapshot',
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

describe('canonical composite snapshot projection', () => {
  it('maps one cinematic scene to one composite run', () => {
    expect(visualRun('figure3-animation')).toBe(
      'brand-services'
    );
    expect(visualRun('ttg-animation')).toBe('services-lab');
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
      visualProgress(
        cinematic(brand),
        'figure3-animation'
      )
    ).toBe(0);
    expect(
      visualProgress(
        cinematic(services),
        'figure3-animation'
      )
    ).toBe(1);
    expect(visualProgress(
      cinematic(lab),
      'ttg-animation'
    ))
      .toBe(1);
  });

  it('projects media from one forward snapshot session', () => {
    const entry = progress(
      presented(start('brand', 'brand-services', 1)),
      .6
    );
    expect(visualProgress(
      cinematic(entry),
      'figure3-animation'
    )).toBe(0);

    const media = progress(
      presented(completeLeg(entry)),
      .4
    );
    expect(visualProgress(
      cinematic(media),
      'figure3-animation'
    )).toBe(.4);
    expect(group45AdapterScene(cinematic(media))).toBe('figure3-animation');
    expect(visualExecution(
      cinematic(media),
      'figure3-animation'
    )).toEqual(
      executionToken(media)
    );
    expect(visualProjection(
      cinematic(media),
      'figure3-animation'
    )).toEqual([executionToken(media), true, .4]);
  });

  it('projects reverse media without a legacy cursor', () => {
    const media = progress(
      presented(start('services', 'brand-services', -1)),
      .4
    );
    expect(visualProgress(
      cinematic(media),
      'figure3-animation'
    )).toBe(.4);

    const reverseEntry = completeLeg(media);
    expect(visualProgress(
      cinematic(reverseEntry),
      'figure3-animation'
    )).toBe(0);
    expect(visualExecution(
      cinematic(reverseEntry),
      'figure3-animation'
    ))
      .toBeNull();
  });
});

describe('manifest-directed native reading landing', () => {
  it('[R5] lands on the manifest-declared reading anchor before its document root', () => {
    const heading = {} as HTMLElement;
    const calls: string[] = [];
    const root = {
      querySelector(selector: string) {
        calls.push(selector);
        return selector === '.r4-education__vertical h2' ? heading : null;
      }
    } as unknown as HTMLElement;

    expect(phoneReadingLandingTarget(root, [
      '.r4-education__vertical h2',
      '.r4-education__lead p'
    ])).toBe(heading);
    expect(calls).toEqual(['.r4-education__vertical h2']);
  });

  it('[R5] clamps a terminal reading anchor to the last legal document scroll coordinate', () => {
    expect(phoneClampDocumentLanding(
      16_021.28125,
      16_713.84375,
      844
    )).toBe(15_869.84375);
  });

  it('[R5] retains the document root only when its declared reading anchors are absent', () => {
    const root = {
      querySelector: () => null
    } as unknown as HTMLElement;

    expect(phoneReadingLandingTarget(root, ['.missing'])).toBe(root);
    expect(phoneReadingLandingTarget(null, ['.missing'])).toBeNull();
  });
});
