import { describe, expect, it } from 'vitest';
import { canonicalSceneIds } from '../../../story/canonical-spine';
import type { SceneId } from '../../../story/types';
import { phoneRunLegTuple } from '../phone-story-runs';
import {
  phoneScenePresentationProofKind,
  phoneScenePresentationTuple,
  phoneSegmentPresentationTuple
} from './manifest';
import {
  canCommitPresentation,
  createPhoneStorySnapshot,
  reducePhoneStorySnapshot,
  type PhoneStorySnapshot
} from './machine';

type Proof = Readonly<{
  token: Readonly<{
    authorityId: string;
    sessionId: string | null;
    generation: number;
    leg: number | null;
    revision: number;
    subject: string;
    kind: string;
  }>;
  frameSequence: number;
  observedAt: number;
  connected: boolean;
  visible: boolean;
  coverageComplete: boolean;
  edge: string;
}>;

function proofKind(scene: SceneId): string {
  return phoneScenePresentationProofKind(scene);
}

function directCandidate(target: SceneId): PhoneStorySnapshot {
  const fallback = target === 'hero' ? 'contact' : 'hero';
  const initial = createPhoneStorySnapshot({
    authorityId: 'proof-authority',
    scene: fallback,
    actualY: 100
  });
  const next = reducePhoneStorySnapshot(initial, {
    type: 'DIRECT_ENTRY_REQUESTED',
    authorityId: initial.authorityId,
    target,
    source: 'menu',
    fallbackScene: fallback,
    cinematic: null
  }).snapshot;
  if (next.status !== 'transaction') {
    throw new Error('Expected a presentation candidate');
  }
  return next;
}

function sceneProof(
  candidate: PhoneStorySnapshot,
  scene: SceneId,
  kind = proofKind(scene)
): Proof {
  if (candidate.status !== 'transaction') {
    throw new Error('Expected an active presentation candidate');
  }
  const { session } = candidate;
  const [, edge, , , subject] = phoneScenePresentationTuple(scene);
  return {
    token: {
      authorityId: candidate.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: session.operation.legIndex,
      revision: session.presentationRevision,
      subject,
      kind
    },
    frameSequence: 1,
    observedAt: 100,
    connected: true,
    visible: true,
    coverageComplete: true,
    edge
  };
}

function targetProof(candidate: PhoneStorySnapshot): Proof {
  if (candidate.status !== 'transaction') {
    throw new Error('Expected an active presentation candidate');
  }
  const { operation } = candidate.session;
  return sceneProof(candidate, operation.to);
}

function activeSegmentProof(candidate: PhoneStorySnapshot): Proof {
  if (
    candidate.status !== 'transaction'
    || !candidate.session.operation.run
  ) throw new Error('Expected an active cinematic candidate');
  const { session } = candidate;
  const run = session.operation.run;
  if (!run) throw new Error('Expected an active cinematic run');
  const leg = phoneRunLegTuple(
    run,
    session.operation.legIndex
  );
  if (!leg) throw new Error('Expected an active cinematic leg');
  const frame = phoneSegmentPresentationTuple(leg[0]);
  return {
    token: {
      authorityId: candidate.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: session.operation.legIndex,
      revision: session.presentationRevision,
      subject: frame[9],
      kind: frame[8]
    },
    frameSequence: 1,
    observedAt: 100,
    connected: true,
    visible: true,
    coverageComplete: true,
    edge: phoneScenePresentationTuple(frame[3])[1]
  };
}

function reduceOwned(
  candidate: PhoneStorySnapshot,
  type: string,
  detail: Readonly<Record<string, unknown>> = {}
): PhoneStorySnapshot {
  if (candidate.status !== 'transaction') {
    throw new Error('Expected an active presentation candidate');
  }
  const { session } = candidate;
  return reducePhoneStorySnapshot(candidate, {
    type,
    authorityId: candidate.authorityId,
    sessionId: session.sessionId,
    generation: session.generation,
    leg: session.operation.legIndex,
    direction: session.operation.direction,
    ...detail
  } as never).snapshot;
}

function settleCinematic(candidate: PhoneStorySnapshot): PhoneStorySnapshot {
  let current = candidate;
  while (
    current.status === 'transaction'
    && current.session.phase === 'preparing'
  ) {
    current = reportProof(current, activeSegmentProof(current));
    current = reduceOwned(current, 'LEG_COMPLETED');
  }
  if (
    current.status !== 'transaction'
    || current.session.phase !== 'verifying-target'
  ) throw new Error('Expected terminal target verification');
  current = reportProof(current, targetProof(current));
  current = reduceOwned(current, 'TARGET_PRESENTED');
  current = reduceOwned(current, 'LAYOUT_RELEASED');
  current = reduceOwned(current, 'LANDING_MEASURED', {
    targetY: current.scroll.actualY,
    geometryRevision: 0,
    visualViewportOffsetTop: 0
  });
  current = reduceOwned(current, 'SCROLL_COMMANDED', { commandId: 1 });
  current = reduceOwned(current, 'SCROLL_CONFIRMED', {
    commandId: 1,
    actualY: current.scroll.actualY
  });
  current = reduceOwned(current, 'PRESENTATION_COMMITTED', { now: 100 });
  return current;
}

function reportProof(
  candidate: PhoneStorySnapshot,
  proof: Proof
): PhoneStorySnapshot {
  if (candidate.status !== 'transaction') {
    throw new Error('Expected an active presentation candidate');
  }
  const { session } = candidate;
  return reducePhoneStorySnapshot(candidate, {
    type: 'PRESENTATION_PROOF_REPORTED',
    authorityId: proof.token.authorityId,
    sessionId: session.sessionId,
    generation: session.generation,
    leg: session.operation.legIndex,
    direction: session.operation.direction,
    proof
  } as never).snapshot;
}

function reportReadiness(candidate: PhoneStorySnapshot): PhoneStorySnapshot {
  if (candidate.status !== 'transaction') {
    throw new Error('Expected an active presentation candidate');
  }
  const { session } = candidate;
  const proof = targetProof(candidate);
  return reducePhoneStorySnapshot(candidate, {
    type: 'PRESENTATION_READY_REPORTED',
    authorityId: proof.token.authorityId,
    sessionId: session.sessionId,
    generation: session.generation,
    leg: session.operation.legIndex,
    direction: session.operation.direction,
    readiness: {
      token: proof.token,
      observedAt: proof.observedAt,
      connected: true,
      visible: true,
      coverageComplete: true
    }
  } as never).snapshot;
}

describe('token-bound phone presentation proofs', () => {
  it('[front staged checkpoint] consumes one gesture per Hero, Pattern collapse, and Pattern→StarMap leg, with a mirrored reverse path', () => {
    const start = createPhoneStorySnapshot({
      authorityId: 'front-staged-authority',
      scene: 'hero',
      actualY: 100
    });
    const intent = (
      snapshot: PhoneStorySnapshot,
      inputEpoch: number,
      direction: 1 | -1,
      run: string
    ) => reducePhoneStorySnapshot(snapshot, {
      type: 'INTENT_RESOLVED',
      authorityId: snapshot.authorityId,
      inputEpoch,
      direction,
      run,
      anchorY: snapshot.scroll.actualY,
      boundaryKnown: true,
      crossedBoundary: true,
      claimReason: 'crossed-boundary'
    } as never).snapshot;

    const heroPattern = intent(start, 1, 1, 'hero-pattern');
    const patternExpanded = settleCinematic(heroPattern);
    expect(patternExpanded).toMatchObject({ status: 'stable', scene: 'pattern' });

    // Momentum from the same physical touch sequence cannot cross the
    // Pattern collapse checkpoint after Hero→Pattern has consumed its epoch.
    expect(intent(patternExpanded, 1, 1, 'pattern-collapse')).toBe(patternExpanded);

    const patternCollapse = settleCinematic(intent(
      patternExpanded,
      2,
      1,
      'pattern-collapse'
    ));
    expect(patternCollapse).toMatchObject({
      status: 'stable',
      scene: 'pattern-compact'
    });

    const starMap = settleCinematic(intent(
      patternCollapse,
      3,
      1,
      'pattern-star-map'
    ));
    expect(starMap).toMatchObject({ status: 'stable', scene: 'star-map' });

    const compactAgain = settleCinematic(intent(
      starMap,
      4,
      -1,
      'pattern-star-map'
    ));
    const patternAgain = settleCinematic(intent(
      compactAgain,
      5,
      -1,
      'pattern-collapse'
    ));
    const heroAgain = settleCinematic(intent(
      patternAgain,
      6,
      -1,
      'hero-pattern'
    ));
    expect(compactAgain).toMatchObject({ status: 'stable', scene: 'pattern-compact' });
    expect(patternAgain).toMatchObject({ status: 'stable', scene: 'pattern' });
    expect(heroAgain).toMatchObject({ status: 'stable', scene: 'hero' });
  });

  it('[Star→AOD hard cutover] turns a large rail sample into the ordinary machine transaction', () => {
    const initial = createPhoneStorySnapshot({
      authorityId: 'star-aod-transaction-authority',
      scene: 'star-map',
      actualY: 640
    });
    const candidate = reducePhoneStorySnapshot(initial, {
      type: 'SCROLL_SAMPLED',
      authorityId: initial.authorityId,
      actualY: 1_240,
      corridor: 'front-rail',
      scene: 'aod-animation',
      run: 'star-map-aod',
      progress: 1,
      direction: 1,
      inputEpoch: 9
    }).snapshot;

    expect(candidate).toMatchObject({
      status: 'transaction',
      input: { completedEpoch: 9 },
      session: {
        inputEpoch: 9,
        phase: 'preparing',
        operation: { run: 'star-map-aod', from: 'star-map', to: 'aod-animation' }
      }
    });
    const tail = reducePhoneStorySnapshot(candidate, {
      type: 'SCROLL_SAMPLED',
      authorityId: initial.authorityId,
      actualY: 1_260,
      corridor: 'front-rail',
      run: 'star-map-aod',
      progress: 1,
      direction: 1,
      inputEpoch: 9
    });
    expect(tail.snapshot).toMatchObject({
      status: 'transaction',
      session: { operation: { run: 'star-map-aod' } }
    });
  });

  it('[Task 3] leaves preparing only for an exact active-leg physical frame proof', () => {
    const stable = createPhoneStorySnapshot({
      authorityId: 'first-frame-authority',
      scene: 'brand',
      actualY: 100
    });
    const candidate = reducePhoneStorySnapshot(stable, {
      type: 'RUN_STARTED',
      authorityId: stable.authorityId,
      sessionId: 'first-frame-session',
      generation: 4,
      leg: 0,
      direction: 1,
      run: 'brand-services',
      anchorY: 100,
      inputEpoch: 1
    }).snapshot;
    if (candidate.status !== 'transaction') {
      throw new Error('Expected active cinematic candidate');
    }
    const { session } = candidate;
    const leg = phoneRunLegTuple('brand-services', 0);
    if (!leg) throw new Error('Expected brand first leg');
    const frame = phoneSegmentPresentationTuple(leg[0]);
    const proof: Proof = {
      token: {
        authorityId: candidate.authorityId,
        sessionId: session.sessionId,
        generation: session.generation,
        leg: session.operation.legIndex,
        revision: session.presentationRevision,
        subject: frame[9],
        kind: frame[8]
      },
      frameSequence: 1,
      observedAt: 100,
      connected: true,
      visible: true,
      coverageComplete: true,
      edge: phoneScenePresentationTuple(frame[3])[1]
    };

    const legacy = reducePhoneStorySnapshot(candidate, {
      type: 'PRESENTED_FRAME',
      authorityId: candidate.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: session.operation.legIndex,
      direction: session.operation.direction
    } as never).snapshot;
    expect(legacy).toBe(candidate);

    const wrongEdge = reducePhoneStorySnapshot(candidate, {
      type: 'PRESENTATION_PROOF_REPORTED',
      authorityId: candidate.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: session.operation.legIndex,
      direction: session.operation.direction,
      proof: { ...proof, edge: 'hero' }
    } as never).snapshot;
    expect(wrongEdge).toBe(candidate);

    const animated = reducePhoneStorySnapshot(candidate, {
      type: 'PRESENTATION_PROOF_REPORTED',
      authorityId: candidate.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: session.operation.legIndex,
      direction: session.operation.direction,
      proof
    } as never).snapshot;
    expect(animated).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'animating',
        firstFrameProof: proof
      }
    });
  });

  it('[R5] projects the admitted forward first frame into its target stage before the progress clock advances', () => {
    const stable = createPhoneStorySnapshot({
      authorityId: 'first-frame-stage-authority',
      scene: 'lab',
      actualY: 100
    });
    const candidate = reducePhoneStorySnapshot(stable, {
      type: 'RUN_STARTED',
      authorityId: stable.authorityId,
      sessionId: 'first-frame-stage-session',
      generation: 4,
      leg: 0,
      direction: 1,
      run: 'lab-education',
      anchorY: 100,
      inputEpoch: 1
    }).snapshot;
    if (candidate.status !== 'transaction') {
      throw new Error('Expected active Lab → Education transaction');
    }
    const { session } = candidate;
    const frame = phoneSegmentPresentationTuple('lab-ph');
    const proof: Proof = {
      token: {
        authorityId: candidate.authorityId,
        sessionId: session.sessionId,
        generation: session.generation,
        leg: session.operation.legIndex,
        revision: session.presentationRevision,
        subject: frame[9],
        kind: frame[8]
      },
      frameSequence: 1,
      observedAt: 100,
      connected: true,
      visible: true,
      coverageComplete: true,
      edge: phoneScenePresentationTuple(frame[3])[1]
    };

    const animated = reducePhoneStorySnapshot(candidate, {
      type: 'PRESENTATION_PROOF_REPORTED',
      authorityId: candidate.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: session.operation.legIndex,
      direction: session.operation.direction,
      proof
    } as never).snapshot;

    expect(animated).toMatchObject({
      status: 'transaction',
      session: { phase: 'animating', progress: 0 },
      projection: {
        semanticScene: 'ph-animation',
        stageOwner: 'group67',
        stageScene: 'ph-animation',
        sourceSurface: 'native:lab',
        receiverSurface: 'group67:ph'
      }
    });
  });

  it('[R5] projects a reverse media leg from its active visual segment before its first canvas proof', () => {
    const stable = createPhoneStorySnapshot({
      authorityId: 'reverse-media-stage-authority',
      scene: 'contact',
      actualY: 100
    });
    const candidate = reducePhoneStorySnapshot(stable, {
      type: 'RUN_STARTED',
      authorityId: stable.authorityId,
      sessionId: 'reverse-media-stage-session',
      generation: 6,
      leg: 1,
      direction: -1,
      run: 'education-contact',
      anchorY: 100,
      inputEpoch: 1
    }).snapshot;

    expect(candidate).toMatchObject({
      status: 'transaction',
      session: { phase: 'preparing', progress: 1 },
      projection: {
        semanticScene: 'crane-animation',
        stageOwner: 'group67',
        stageScene: 'crane-animation',
        sourceSurface: 'group67:crane',
        receiverSurface: 'native:contact'
      }
    });
  });

  it('[Task 3] lets a reading candidate align on token-bound coverage without publishing stable', () => {
    const candidate = directCandidate('services');
    const ready = reportReadiness(candidate);
    if (ready.status !== 'transaction') {
      throw new Error('Expected an active presentation candidate');
    }
    const { session } = ready;
    const aligned = reducePhoneStorySnapshot(ready, {
      type: 'TARGET_PRESENTED',
      authorityId: ready.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: session.operation.legIndex,
      direction: session.operation.direction
    }).snapshot;

    expect(aligned).toMatchObject({
      status: 'transaction',
      session: { phase: 'releasing-layout', proof: null }
    });
    expect(canCommitPresentation(aligned, 100)).toBe(false);
  });

  it('[terminal native admission] retains the active leg stage until the target leaf proves its exact token', () => {
    const initial = createPhoneStorySnapshot({
      authorityId: 'method-reverse-admission',
      scene: 'figure2-animation',
      actualY: 5_038
    });
    let candidate = reducePhoneStorySnapshot(initial, {
      type: 'RUN_STARTED',
      authorityId: initial.authorityId,
      sessionId: 'method-reverse-admission-session',
      generation: 1,
      leg: 0,
      direction: -1,
      run: 'method-figure2',
      anchorY: 4_841,
      inputEpoch: 1
    }).snapshot;

    candidate = reportProof(candidate, activeSegmentProof(candidate));
    candidate = reduceOwned(candidate, 'PROGRESS_REPORTED', { progress: 0 });
    candidate = reduceOwned(candidate, 'LEG_COMPLETED');

    expect(candidate).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'verifying-target',
        operation: {
          run: 'method-figure2',
          direction: -1,
          to: 'method-top'
        }
      },
      projection: {
        commitState: 'candidate',
        semanticScene: 'method-top',
        navigationScene: 'method-top',
        stageOwner: 'grade-a',
        stageScene: 'figure2-animation',
        sourceSurface: null,
        receiverSurface: 'native:method',
        coverageSurface: 'native:method'
      }
    });
  });

  it('[AOD first-intent cutover] keeps completed AOD only as coverage until Method proves its target token', () => {
    const initial = createPhoneStorySnapshot({
      authorityId: 'aod-method-terminal-source',
      scene: 'aod-animation',
      actualY: 1_382
    });
    let candidate = reducePhoneStorySnapshot(initial, {
      type: 'RUN_STARTED',
      authorityId: initial.authorityId,
      sessionId: 'aod-method-terminal-source-session',
      generation: 1,
      leg: 0,
      direction: 1,
      run: 'aod-method',
      anchorY: 1_382,
      inputEpoch: 1
    }).snapshot;

    candidate = reduceOwned(candidate, 'AOD_PLAY_CONFIRMED');
    candidate = reduceOwned(candidate, 'AOD_FIRST_FRAME_PRESENTED', {
      proof: activeSegmentProof(candidate)
    });
    candidate = reduceOwned(candidate, 'AOD_PROGRESS_OBSERVED', { progress: .81 });
    expect(candidate).toMatchObject({
      status: 'transaction',
      session: { phase: 'animating' },
      projection: {
        semanticScene: 'method-top',
        stageOwner: 'front',
        stageScene: 'aod-animation',
        sourceSurface: 'front:aod',
        receiverSurface: 'native:method',
        coverageSurface: 'front:aod'
      }
    });
    candidate = reduceOwned(candidate, 'AOD_PROGRESS_OBSERVED', { progress: 1 });
    candidate = reduceOwned(candidate, 'AOD_COMPLETED');

    expect(candidate).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'verifying-target',
        operation: { run: 'aod-method', direction: 1, to: 'method-top' }
      },
      projection: {
        commitState: 'candidate',
        semanticScene: 'method-top',
        stageOwner: 'front',
        stageScene: 'aod-animation',
        sourceSurface: null,
        receiverSurface: 'native:method',
        coverageSurface: 'front:aod'
      }
    });

    const phases = [candidate.status === 'transaction' ? candidate.session.phase : null];
    candidate = reportProof(candidate, targetProof(candidate));
    candidate = reduceOwned(candidate, 'TARGET_PRESENTED');
    phases.push(candidate.status === 'transaction' ? candidate.session.phase : null);
    candidate = reduceOwned(candidate, 'LAYOUT_RELEASED');
    phases.push(candidate.status === 'transaction' ? candidate.session.phase : null);
    candidate = reduceOwned(candidate, 'LANDING_MEASURED', {
      targetY: 1_382,
      geometryRevision: 0,
      visualViewportOffsetTop: 0
    });
    phases.push(candidate.status === 'transaction' ? candidate.session.phase : null);
    candidate = reduceOwned(candidate, 'SCROLL_COMMANDED', { commandId: 1 });
    candidate = reduceOwned(candidate, 'SCROLL_CONFIRMED', {
      commandId: 1,
      actualY: 1_382
    });
    phases.push(candidate.status === 'transaction' ? candidate.session.phase : null);
    candidate = reduceOwned(candidate, 'PRESENTATION_COMMITTED', { now: 100 });

    expect(phases).toEqual([
      'verifying-target',
      'releasing-layout',
      'measuring-landing',
      'aligning-scroll',
      'verifying-stable'
    ]);
    expect(candidate).toMatchObject({
      status: 'stable',
      scene: 'method-top',
      projection: {
        commitState: 'stable',
        sourceSurface: null,
        receiverSurface: 'native:method'
      }
    });
  });

  it.each(canonicalSceneIds)(
    '[Task 1] accepts a same-revision real proof for %s',
    (scene) => {
      const candidate = directCandidate(scene);
      const proved = reportProof(candidate, targetProof(candidate));

      expect(canCommitPresentation(proved, 100)).toBe(true);
    }
  );

  it.each([
    ['pattern', 'star-map', 1, .61],
    ['star-map', 'pattern', -1, .47]
  ] as const)(
    '[Pattern↔StarMap reduced cutover] admits %s → %s only through an exact static leaf proof',
    (source, target, direction, progress) => {
      const initial = createPhoneStorySnapshot({
        authorityId: `front-reduced-${source}`,
        scene: source,
        actualY: 100
      });
      const candidate = reducePhoneStorySnapshot(initial, {
        type: 'SCROLL_SAMPLED',
        authorityId: initial.authorityId,
        actualY: 200,
        corridor: 'front-rail',
        scene: target,
        progress,
        direction,
        // The document sampler carries this as a positional fact; the reducer
        // must not reinterpret this as a direct-entry or ordinary stable hold.
        reducedMotion: true
      } as never).snapshot;
      if (candidate.status !== 'transaction') {
        throw new Error('Expected a reduced front candidate');
      }

      expect(candidate).toMatchObject({
        status: 'transaction',
        projection: {
          semanticScene: target,
          edge: phoneScenePresentationTuple(target)[1],
          commitState: 'candidate'
        },
        session: {
          operation: { trigger: 'auto', run: null, from: source, to: target, direction },
          phase: 'preparing',
          reducedMotion: true,
          progress: direction === 1 ? 0 : 1
        }
      });
      expect(reduceOwned(candidate, 'PROGRESS_REPORTED', { progress: .5 }))
        .toBe(candidate);
      expect(reduceOwned(candidate, 'LEG_COMPLETED')).toBe(candidate);

      const stale = reduceOwned(candidate, 'PRESENTATION_PROOF_REPORTED', {
        proof: {
          ...targetProof(candidate),
          token: {
            ...targetProof(candidate).token,
            revision: candidate.session.presentationRevision + 1
          }
        }
      });
      expect(stale).toBe(candidate);

      const stable = reduceOwned(candidate, 'PRESENTATION_PROOF_REPORTED', {
        proof: targetProof(candidate)
      });
      expect(stable).toMatchObject({
        status: 'stable',
        scene: target,
        session: null,
        projection: { commitState: 'stable' }
      });
    }
  );

  it('[Group45 reduced cutover] commits a short candidate only from its exact static target proof', () => {
    const initial = createPhoneStorySnapshot({
      authorityId: 'group45-reduced-authority',
      scene: 'brand',
      actualY: 100
    });
    const candidate = reducePhoneStorySnapshot(initial, {
      type: 'RUN_STARTED',
      authorityId: initial.authorityId,
      sessionId: 'group45-reduced-session',
      generation: 11,
      leg: 0,
      direction: 1,
      run: 'brand-services',
      anchorY: 100,
      inputEpoch: 4,
      reducedMotion: true
    } as never).snapshot;
    if (candidate.status !== 'transaction') {
      throw new Error('Expected a reduced Group45 candidate');
    }

    expect(candidate).toMatchObject({
      projection: { commitState: 'candidate' },
      session: { phase: 'preparing', reducedMotion: true }
    });
    expect(reduceOwned(candidate, 'PROGRESS_REPORTED', { progress: .5 }))
      .toBe(candidate);
    expect(reduceOwned(candidate, 'LEG_COMPLETED')).toBe(candidate);
    expect(reduceOwned(candidate, 'PRESENTATION_PROOF_REPORTED')).toBe(candidate);

    const proof = {
      token: {
        authorityId: candidate.authorityId,
        sessionId: candidate.session.sessionId,
        generation: candidate.session.generation,
        leg: candidate.session.operation.legIndex,
        revision: candidate.session.presentationRevision,
        subject: 'native:services',
        kind: 'static-poster'
      },
      frameSequence: 1,
      observedAt: 100,
      connected: true,
      visible: true,
      coverageComplete: true,
      edge: 'services'
    } as const;
    const wrongKind = reducePhoneStorySnapshot(candidate, {
      type: 'PRESENTATION_PROOF_REPORTED',
      authorityId: candidate.authorityId,
      sessionId: candidate.session.sessionId,
      generation: candidate.session.generation,
      leg: candidate.session.operation.legIndex,
      direction: candidate.session.operation.direction,
      proof: {
        ...proof,
        token: { ...proof.token, kind: 'packed-canvas-frame' }
      }
    } as never).snapshot;
    expect(wrongKind).toBe(candidate);
    const stale = reducePhoneStorySnapshot(candidate, {
      type: 'PRESENTATION_PROOF_REPORTED',
      authorityId: candidate.authorityId,
      sessionId: candidate.session.sessionId,
      generation: candidate.session.generation,
      leg: candidate.session.operation.legIndex,
      direction: candidate.session.operation.direction,
      proof: {
        ...proof,
        token: { ...proof.token, revision: proof.token.revision + 1 }
      }
    } as never).snapshot;
    expect(stale).toBe(candidate);

    const stable = reducePhoneStorySnapshot(candidate, {
      type: 'PRESENTATION_PROOF_REPORTED',
      authorityId: candidate.authorityId,
      sessionId: candidate.session.sessionId,
      generation: candidate.session.generation,
      leg: candidate.session.operation.legIndex,
      direction: candidate.session.operation.direction,
      proof
    } as never).snapshot;

    expect(stable).toMatchObject({
      status: 'stable',
      scene: 'services',
      session: null,
      projection: { commitState: 'stable' }
    });
  });

  it('[Group45 reduced cutover] rolls an expired static admission back before accepting a new input', () => {
    const initial = createPhoneStorySnapshot({
      authorityId: 'group45-reduced-retry-authority',
      scene: 'brand',
      actualY: 100
    });
    const candidate = reducePhoneStorySnapshot(initial, {
      type: 'RUN_STARTED',
      authorityId: initial.authorityId,
      sessionId: 'group45-reduced-expired-session',
      generation: 12,
      leg: 0,
      direction: 1,
      run: 'brand-services',
      anchorY: 100,
      inputEpoch: 5,
      reducedMotion: true
    } as never).snapshot;
    if (candidate.status !== 'transaction') {
      throw new Error('Expected a reduced Group45 candidate');
    }

    const expired = reduceOwned(candidate, 'FAILED', {
      reason: 'reduced-proof-timeout'
    });
    if (expired.status !== 'transaction') {
      throw new Error('Expected a reduced rollback transaction');
    }
    expect(expired).toMatchObject({
      session: { phase: 'rollback-rendering' },
      diagnostics: { lastRollback: { reason: 'reduced-proof-timeout' } }
    });

    const oldProof = targetProof(candidate);
    const stale = reducePhoneStorySnapshot(expired, {
      type: 'PRESENTATION_PROOF_REPORTED',
      authorityId: expired.authorityId,
      sessionId: candidate.session.sessionId,
      generation: candidate.session.generation,
      leg: candidate.session.operation.legIndex,
      direction: candidate.session.operation.direction,
      proof: oldProof
    } as never).snapshot;
    expect(stale).toBe(expired);

    let rollback = reduceOwned(expired, 'ROLLBACK_RENDERED');
    rollback = reduceOwned(rollback, 'ROLLBACK_LAYOUT_RELEASED');
    rollback = reduceOwned(rollback, 'ROLLBACK_LANDING_MEASURED', {
      targetY: 100,
      geometryRevision: 0,
      visualViewportOffsetTop: 0
    });
    rollback = reduceOwned(rollback, 'ROLLBACK_SCROLL_COMMANDED', { commandId: 1 });
    rollback = reduceOwned(rollback, 'ROLLBACK_SCROLL_CONFIRMED', {
      commandId: 1,
      actualY: 100
    });
    rollback = reportProof(rollback, sceneProof(rollback, 'brand'));
    const stable = reduceOwned(rollback, 'PRESENTATION_COMMITTED', { now: 100 });
    expect(stable).toMatchObject({
      status: 'stable',
      scene: 'brand',
      session: null
    });

    const retry = reducePhoneStorySnapshot(stable, {
      type: 'INTENT_RESOLVED',
      authorityId: stable.authorityId,
      inputEpoch: 6,
      direction: 1,
      run: 'brand-services',
      anchorY: 100,
      boundaryKnown: true,
      crossedBoundary: true,
      claimReason: 'crossed-boundary',
      reducedMotion: true
    }).snapshot;
    expect(retry).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'preparing',
        reducedMotion: true,
        inputEpoch: 6
      }
    });
  });

  it('[Group45 cutover] completes two same-authority forward/reverse rounds without retaining a transaction', () => {
    let current: PhoneStorySnapshot = createPhoneStorySnapshot({
      authorityId: 'group45-repeat-authority',
      scene: 'brand',
      actualY: 100
    });
    const directions = [1, -1, 1, -1] as const;

    for (const [index, direction] of directions.entries()) {
      const started = reducePhoneStorySnapshot(current, {
        type: 'RUN_STARTED',
        authorityId: current.authorityId,
        sessionId: `group45-repeat-session-${index}`,
        generation: 20 + index,
        leg: direction === 1 ? 0 : 1,
        direction,
        run: 'brand-services',
        anchorY: 100,
        inputEpoch: index + 1
      }).snapshot;
      current = settleCinematic(started);
      expect(current).toMatchObject({
        status: 'stable',
        scene: direction === 1 ? 'services' : 'brand',
        session: null
      });
    }
  });

  it('[Services↔TTG reduced cutover] admits both directions only from their exact static leaf proof', () => {
    for (const [direction, source, target, leg] of [
      [1, 'services', 'lab', 0],
      [-1, 'lab', 'services', 1]
    ] as const) {
      const initial = createPhoneStorySnapshot({
        authorityId: `services-lab-reduced-${source}`,
        scene: source,
        actualY: 100
      });
      const candidate = reducePhoneStorySnapshot(initial, {
        type: 'RUN_STARTED',
        authorityId: initial.authorityId,
        sessionId: `services-lab-reduced-session-${source}`,
        generation: 31 + leg,
        leg,
        direction,
        run: 'services-lab',
        anchorY: 100,
        inputEpoch: leg + 1,
        reducedMotion: true
      } as never).snapshot;
      if (candidate.status !== 'transaction') {
        throw new Error('Expected a reduced Services↔Lab candidate');
      }

      expect(candidate).toMatchObject({
        projection: { commitState: 'candidate' },
        session: { phase: 'preparing', reducedMotion: true }
      });
      expect(reduceOwned(candidate, 'PROGRESS_REPORTED', { progress: .5 }))
        .toBe(candidate);
      expect(reduceOwned(candidate, 'LEG_COMPLETED')).toBe(candidate);

      const proof = {
        token: {
          authorityId: candidate.authorityId,
          sessionId: candidate.session.sessionId,
          generation: candidate.session.generation,
          leg: candidate.session.operation.legIndex,
          revision: candidate.session.presentationRevision,
          subject: `native:${target}`,
          kind: 'static-poster'
        },
        frameSequence: 1,
        observedAt: 100,
        connected: true,
        visible: true,
        coverageComplete: true,
        edge: target
      } as const;
      const stale = reducePhoneStorySnapshot(candidate, {
        type: 'PRESENTATION_PROOF_REPORTED',
        authorityId: candidate.authorityId,
        sessionId: candidate.session.sessionId,
        generation: candidate.session.generation,
        leg: candidate.session.operation.legIndex,
        direction,
        proof: {
          ...proof,
          token: { ...proof.token, revision: proof.token.revision + 1 }
        }
      } as never).snapshot;
      expect(stale).toBe(candidate);

      const stable = reducePhoneStorySnapshot(candidate, {
        type: 'PRESENTATION_PROOF_REPORTED',
        authorityId: candidate.authorityId,
        sessionId: candidate.session.sessionId,
        generation: candidate.session.generation,
        leg: candidate.session.operation.legIndex,
        direction,
        proof
      } as never).snapshot;
      expect(stable).toMatchObject({
        status: 'stable',
        scene: target,
        session: null,
        projection: { commitState: 'stable' }
      });
    }
  });

  it('[Services↔TTG cutover] completes two same-authority forward/reverse rounds without retaining a transaction', () => {
    let current: PhoneStorySnapshot = createPhoneStorySnapshot({
      authorityId: 'services-lab-repeat-authority',
      scene: 'services',
      actualY: 100
    });
    const directions = [1, -1, 1, -1] as const;

    for (const [index, direction] of directions.entries()) {
      const started = reducePhoneStorySnapshot(current, {
        type: 'RUN_STARTED',
        authorityId: current.authorityId,
        sessionId: `services-lab-repeat-session-${index}`,
        generation: 40 + index,
        leg: direction === 1 ? 0 : 1,
        direction,
        run: 'services-lab',
        anchorY: 100,
        inputEpoch: index + 1
      }).snapshot;
      current = settleCinematic(started);
      expect(current).toMatchObject({
        status: 'stable',
        scene: direction === 1 ? 'lab' : 'services',
        session: null
      });
    }
  });

  it('[AOD cutover] records play, frame, progress, completion, and failure as one reducer-owned fact stream', () => {
    const initial = createPhoneStorySnapshot({
      authorityId: 'aod-machine-authority',
      scene: 'aod-animation',
      actualY: 100
    });
    const started = reducePhoneStorySnapshot(initial, {
      type: 'RUN_STARTED',
      authorityId: initial.authorityId,
      sessionId: 'aod-machine-session',
      generation: 5,
      leg: 0,
      direction: 1,
      run: 'aod-method',
      anchorY: 100,
      inputEpoch: 1
    }).snapshot;
    if (started.status !== 'transaction') throw new Error('Expected AOD transaction');
    const identity = {
      authorityId: started.authorityId,
      sessionId: started.session.sessionId,
      generation: started.session.generation,
      leg: started.session.operation.legIndex,
      direction: started.session.operation.direction
    } as const;

    expect(started.session.aod).toMatchObject({
      stage: 'admission',
      playConfirmed: false,
      firstFramePresented: false,
      lastProgress: null,
      completed: false
    });

    // A prepared canvas can report its exact frame before Safari resolves
    // `video.play()`. It is a fact, not permission to enter playback.
    const frameFirst = reducePhoneStorySnapshot(started, {
      ...identity,
      type: 'AOD_FIRST_FRAME_PRESENTED',
      proof: activeSegmentProof(started)
    } as never).snapshot;
    expect(frameFirst).toMatchObject({
      session: {
        phase: 'preparing',
        progress: 0,
        aod: { stage: 'admission', playConfirmed: false, firstFramePresented: true }
      }
    });
    // A duplicated callback cannot become a second admission writer.
    expect(reduceOwned(frameFirst, 'AOD_FIRST_FRAME_PRESENTED', {
      proof: activeSegmentProof(frameFirst)
    })).toBe(frameFirst);

    const earlyProgress = reduceOwned(frameFirst, 'AOD_PROGRESS_OBSERVED', { progress: .45 });
    const earlyCompletion = reduceOwned(earlyProgress, 'AOD_COMPLETED');
    expect(earlyCompletion).toMatchObject({
      session: {
        phase: 'preparing',
        progress: 0,
        aod: { lastProgress: .45, completed: true, stage: 'admission' }
      }
    });

    const animated = reduceOwned(earlyCompletion, 'AOD_PLAY_CONFIRMED');
    expect(animated).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'animating',
        progress: .45,
        aod: { stage: 'playback', playConfirmed: true, firstFramePresented: true }
      }
    });

    const settling = reduceOwned(animated, 'AOD_PROGRESS_OBSERVED', { progress: 1 });
    expect(settling).toMatchObject({
      status: 'transaction',
      session: { phase: 'verifying-target', aod: { stage: 'settling', completed: true } }
    });

    // Generic proof ingress cannot bypass the AOD fact gate.
    expect(reduceOwned(started, 'PRESENTATION_PROOF_REPORTED', {
      proof: activeSegmentProof(started)
    })).toBe(started);

    const expired = reducePhoneStorySnapshot(started, {
      ...identity,
      type: 'AOD_FAILED',
      reason: 'aod-prepare-timeout'
    }).snapshot;
    expect(expired).toMatchObject({
      status: 'transaction',
      diagnostics: { lastRollback: { reason: 'aod-prepare-timeout' } },
      session: {
        phase: 'rollback-rendering',
        aod: { stage: 'settling' }
      }
    });
  });

  it('[AOD cutover] accepts play-first facts only when the later frame has the current immutable token', () => {
    const initial = createPhoneStorySnapshot({
      authorityId: 'aod-play-first-authority',
      scene: 'aod-animation',
      actualY: 100
    });
    const started = reducePhoneStorySnapshot(initial, {
      type: 'RUN_STARTED',
      authorityId: initial.authorityId,
      sessionId: 'aod-play-first-session',
      generation: 7,
      leg: 0,
      direction: 1,
      run: 'aod-method',
      anchorY: 100,
      inputEpoch: 1
    }).snapshot;
    if (started.status !== 'transaction') throw new Error('Expected AOD transaction');

    const playing = reduceOwned(started, 'AOD_PLAY_CONFIRMED');
    expect(playing).toMatchObject({
      session: { phase: 'preparing', aod: { playConfirmed: true, firstFramePresented: false } }
    });
    if (playing.status !== 'transaction') throw new Error('Expected prepared AOD transaction');
    const stale = reduceOwned(playing, 'AOD_FIRST_FRAME_PRESENTED', {
      proof: {
        ...activeSegmentProof(playing),
        token: {
          ...activeSegmentProof(playing).token,
          revision: playing.session.presentationRevision + 1
        }
      }
    });
    expect(stale).toBe(playing);

    const animated = reduceOwned(playing, 'AOD_FIRST_FRAME_PRESENTED', {
      proof: activeSegmentProof(playing)
    });
    expect(animated).toMatchObject({
      session: { phase: 'animating', aod: { stage: 'playback' } }
    });
  });

  it.each([
    [1, 'aod-animation', 'method-top', 'native:method'],
    [-1, 'method-top', 'aod-animation', 'front:aod']
  ] as const)(
    '[AOD reduced cutover] keeps %s → %s in one candidate until its exact target static proof',
    (direction, source, target, subject) => {
      const initial = createPhoneStorySnapshot({
        authorityId: `aod-reduced-${source}`,
        scene: source,
        actualY: 100
      });
      const candidate = reducePhoneStorySnapshot(initial, {
        type: 'RUN_STARTED',
        authorityId: initial.authorityId,
        sessionId: `aod-reduced-session-${source}`,
        generation: direction === 1 ? 61 : 62,
        leg: 0,
        direction,
        run: 'aod-method',
        anchorY: 100,
        inputEpoch: 1,
        reducedMotion: true
      } as never).snapshot;
      if (candidate.status !== 'transaction') {
        throw new Error('Expected a reduced AOD candidate');
      }

      expect(candidate).toMatchObject({
        projection: {
          semanticScene: target,
          commitState: 'candidate'
        },
        session: {
          operation: { from: source, to: target, direction },
          phase: 'preparing',
          reducedMotion: true,
          aod: { stage: 'admission' }
        }
      });
      expect(reduceOwned(candidate, 'PROGRESS_REPORTED', { progress: .5 }))
        .toBe(candidate);
      expect(reduceOwned(candidate, 'LEG_COMPLETED')).toBe(candidate);
      expect(reduceOwned(candidate, 'PRESENTATION_PROOF_REPORTED', {
        proof: activeSegmentProof(candidate)
      })).toBe(candidate);

      const proof = {
        token: {
          authorityId: candidate.authorityId,
          sessionId: candidate.session.sessionId,
          generation: candidate.session.generation,
          leg: candidate.session.operation.legIndex,
          revision: candidate.session.presentationRevision,
          subject,
          kind: 'static-poster'
        },
        frameSequence: 1,
        observedAt: 100,
        connected: true,
        visible: true,
        coverageComplete: true,
        edge: phoneScenePresentationTuple(target)[1]
      } as const;
      const wrongSubject = reduceOwned(candidate, 'PRESENTATION_PROOF_REPORTED', {
        proof: { ...proof, token: { ...proof.token, subject: 'stale:target' } }
      });
      expect(wrongSubject).toBe(candidate);

      const stable = reduceOwned(candidate, 'PRESENTATION_PROOF_REPORTED', { proof });
      expect(stable).toMatchObject({
        status: 'stable',
        scene: target,
        session: null,
        projection: { commitState: 'stable' }
      });
    }
  );

  it('[AOD reduced cutover] expires an unproved static candidate, retires its token, and admits the next input', () => {
    const initial = createPhoneStorySnapshot({
      authorityId: 'aod-reduced-retry-authority',
      scene: 'aod-animation',
      actualY: 100
    });
    const candidate = reducePhoneStorySnapshot(initial, {
      type: 'RUN_STARTED',
      authorityId: initial.authorityId,
      sessionId: 'aod-reduced-expired-session',
      generation: 63,
      leg: 0,
      direction: 1,
      run: 'aod-method',
      anchorY: 100,
      inputEpoch: 5,
      reducedMotion: true
    } as never).snapshot;
    if (candidate.status !== 'transaction') {
      throw new Error('Expected a reduced AOD candidate');
    }

    const expired = reduceOwned(candidate, 'FAILED', {
      reason: 'reduced-proof-timeout'
    });
    if (expired.status !== 'transaction') {
      throw new Error('Expected a reduced AOD rollback transaction');
    }
    expect(expired).toMatchObject({
      session: { phase: 'rollback-rendering', aod: { stage: 'settling' } },
      diagnostics: { lastRollback: { reason: 'reduced-proof-timeout' } }
    });

    const stale = reducePhoneStorySnapshot(expired, {
      type: 'PRESENTATION_PROOF_REPORTED',
      authorityId: expired.authorityId,
      sessionId: candidate.session.sessionId,
      generation: candidate.session.generation,
      leg: candidate.session.operation.legIndex,
      direction: candidate.session.operation.direction,
      proof: targetProof(candidate)
    } as never).snapshot;
    expect(stale).toBe(expired);

    let rollback = reduceOwned(expired, 'ROLLBACK_RENDERED');
    rollback = reduceOwned(rollback, 'ROLLBACK_LAYOUT_RELEASED');
    rollback = reduceOwned(rollback, 'ROLLBACK_LANDING_MEASURED', {
      targetY: 100,
      geometryRevision: 0,
      visualViewportOffsetTop: 0
    });
    rollback = reduceOwned(rollback, 'ROLLBACK_SCROLL_COMMANDED', { commandId: 1 });
    rollback = reduceOwned(rollback, 'ROLLBACK_SCROLL_CONFIRMED', {
      commandId: 1,
      actualY: 100
    });
    rollback = reportProof(rollback, sceneProof(rollback, 'aod-animation'));
    const stable = reduceOwned(rollback, 'PRESENTATION_COMMITTED', { now: 100 });
    expect(stable).toMatchObject({
      status: 'stable',
      scene: 'aod-animation',
      session: null
    });

    const retry = reducePhoneStorySnapshot(stable, {
      type: 'INTENT_RESOLVED',
      authorityId: stable.authorityId,
      inputEpoch: 6,
      direction: 1,
      run: 'aod-method',
      anchorY: 100,
      boundaryKnown: true,
      crossedBoundary: true,
      claimReason: 'crossed-boundary',
      reducedMotion: true
    }).snapshot;
    expect(retry).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'preparing',
        reducedMotion: true,
        inputEpoch: 6,
        aod: { stage: 'admission' }
      }
    });
  });

  const invalidProofs = [
    ['no physical frame', (proof: Proof): Proof => ({ ...proof, frameSequence: 0 })],
    ['disconnected root', (proof: Proof): Proof => ({ ...proof, connected: false })],
    ['hidden root', (proof: Proof): Proof => ({ ...proof, visible: false })],
    ['incomplete coverage', (proof: Proof): Proof => ({ ...proof, coverageComplete: false })],
    ['wrong edge', (proof: Proof): Proof => ({
      ...proof,
      edge: proof.edge === 'hero' ? 'pattern' : 'hero'
    })],
    ['stale observation', (proof: Proof): Proof => ({ ...proof, observedAt: 0 })],
    ['wrong authority', (proof: Proof): Proof => ({
      ...proof,
      token: { ...proof.token, authorityId: 'other-authority' }
    })],
    ['wrong session', (proof: Proof): Proof => ({
      ...proof,
      token: { ...proof.token, sessionId: 'other-session' }
    })],
    ['wrong generation', (proof: Proof): Proof => ({
      ...proof,
      token: { ...proof.token, generation: proof.token.generation + 1 }
    })],
    ['wrong leg', (proof: Proof): Proof => ({
      ...proof,
      token: { ...proof.token, leg: (proof.token.leg ?? 0) + 1 }
    })],
    ['wrong revision', (proof: Proof): Proof => ({
      ...proof,
      token: { ...proof.token, revision: proof.token.revision + 1 }
    })],
    ['wrong subject', (proof: Proof): Proof => ({
      ...proof,
      token: { ...proof.token, subject: 'native:other' }
    })],
    ['wrong proof kind', (proof: Proof): Proof => ({
      ...proof,
      token: { ...proof.token, kind: 'effect-frame' }
    })]
  ] as const;

  for (const scene of canonicalSceneIds) {
    for (const [reason, invalidate] of invalidProofs) {
      it(`[Task 1] retains ${scene} candidate for ${reason}`, () => {
        const candidate = directCandidate(scene);
        const proved = reportProof(candidate, invalidate(targetProof(candidate)));

        expect(canCommitPresentation(proved, 4_001)).toBe(false);
      });
    }
  }
});
