import { describe, expect, it } from 'vitest';
import {
  phoneScenePresentationTuple,
  phoneScenePresentationProofKind,
  phoneSegmentPresentationContract,
  phoneSegmentPresentationTuple
} from './phone-story/manifest';
import { canonicalSceneIds } from '../../story/canonical-spine';
import type { SceneId } from '../../story/types';
import {
  phoneRun,
  type PhoneRunId
} from './phone-story-runs';
import type { PhoneStoryCursor } from './phone-story/machine';
import {
  createPhoneStoryHold,
  reducePhoneStoryCursor,
  startPhoneStoryRun,
  type PhoneStoryLegacyCursor
} from './phone-story-cursor-test-support';

type SnapshotView = Readonly<{
  authorityId: string;
  revision: number;
  status: 'stable' | 'scroll-run' | 'transaction';
  scene?: string;
  run?: string;
  session: Readonly<{
    sessionId: string;
    generation: number;
    operation: Readonly<{
      trigger: string;
      run: string | null;
      direction: number;
      legIndex: number;
      from: string;
      to: string;
    }>;
    phase: string;
    progress: number;
    anchor: Readonly<{ y: number | null }>;
    alignment: unknown;
    presentationRevision: number;
  }> | null;
  input: Readonly<{ completedEpoch: number | null }>;
  diagnostics: Readonly<{
    lastRollback: Readonly<{ generation: number }> | null;
  }>;
  projection: Readonly<{
    commitState: 'transition' | 'candidate' | 'stable';
    semanticScene: string;
    edge: string;
  }>;
}>;

type SnapshotApi = Readonly<{
  createPhoneStorySnapshot(input: Readonly<{
    authorityId: string;
    scene: SceneId;
    actualY: number;
  }>): SnapshotView;
  reducePhoneStorySnapshot(
    state: SnapshotView,
    event: Readonly<Record<string, unknown>>
  ): Readonly<{ snapshot: SnapshotView; effects: readonly unknown[] }>;
  selectPhoneStoryCursor(snapshot: SnapshotView): PhoneStoryCursor;
}>;

async function snapshotApi(): Promise<SnapshotApi> {
  const state = await import('./phone-story/machine') as unknown as Partial<SnapshotApi>;
  expect(state.createPhoneStorySnapshot).toBeTypeOf('function');
  expect(state.reducePhoneStorySnapshot).toBeTypeOf('function');
  expect(state.selectPhoneStoryCursor).toBeTypeOf('function');
  return state as SnapshotApi;
}

const snapshotIdentity = {
  authorityId: 'authority-a',
  sessionId: 'snapshot-session-1',
  generation: 7,
  leg: 0,
  direction: 1
} as const;

/** Build the exact manifest-scoped physical-frame fact for the active leg. */
function presentedFrame(
  snapshot: SnapshotView,
  identity: Readonly<Record<string, unknown>>
) {
  const session = snapshot.session;
  if (!session?.operation.run) {
    throw new Error('Expected an active cinematic session');
  }
  const leg = phoneRun(session.operation.run as PhoneRunId)
    .legs[session.operation.legIndex];
  if (!leg) throw new Error('Expected an active cinematic leg');
  const frame = phoneSegmentPresentationContract(leg.segment).firstFrame;
  const contract = phoneSegmentPresentationTuple(leg.segment);
  return {
    type: 'PRESENTATION_PROOF_REPORTED',
    ...identity,
    proof: {
      token: {
        authorityId: snapshot.authorityId,
        sessionId: session.sessionId,
        generation: session.generation,
        leg: session.operation.legIndex,
        revision: session.presentationRevision,
        subject: frame.subject,
        kind: frame.kind
      },
      frameSequence: 1,
      observedAt: 1,
      connected: true,
      visible: true,
      coverageComplete: true,
      edge: phoneScenePresentationTuple(contract[3])[1]
    }
  };
}

/** Build current target coverage/content evidence for normal and rollback legs. */
function targetEvidence(
  snapshot: SnapshotView,
  identity: Readonly<Record<string, unknown>>,
  kind: 'coverage' | 'direct-entry',
  observedAt: number
) {
  const session = snapshot.session;
  if (!session) throw new Error('Expected an active presentation transaction');
  const scene = session.phase.startsWith('rollback-')
    ? session.operation.from
    : session.operation.to;
  const token = {
    authorityId: snapshot.authorityId,
    sessionId: session.sessionId,
    generation: session.generation,
    leg: session.operation.legIndex,
    revision: session.presentationRevision,
    subject: phoneScenePresentationTuple(scene as SceneId)[4],
    kind: phoneScenePresentationProofKind(scene as SceneId)
  } as const;
  if (kind === 'coverage') {
    return {
      type: 'PRESENTATION_READY_REPORTED',
      ...identity,
      readiness: {
        token,
        observedAt,
        connected: true,
        visible: true,
        coverageComplete: true
      }
    };
  }
  return {
    type: 'PRESENTATION_PROOF_REPORTED',
    ...identity,
    proof: {
      token,
      frameSequence: 1,
      observedAt,
      connected: true,
      visible: true,
      coverageComplete: true,
      edge: phoneScenePresentationTuple(scene as SceneId)[1]
    }
  };
}

const activeRun = () => startPhoneStoryRun(
  createPhoneStoryHold('brand'),
  'brand-services',
  1,
  { sessionId: 'phone-session-1', generation: 1 }
);

function priorSceneFor(target: SceneId): SceneId {
  return target === 'hero' ? 'pattern' : 'hero';
}

function readyToAnimate(
  cursor: PhoneStoryLegacyCursor,
  sessionId = 'phone-session-1',
  generation = 1
) {
  return reducePhoneStoryCursor(
    reducePhoneStoryCursor(cursor, {
      type: 'PHASE',
      phase: 'presented-frame-ready',
      sessionId,
      generation
    }),
    { type: 'PHASE', phase: 'animating', sessionId, generation }
  );
}

describe('canonical phone story cursor', () => {
  it('stores composite identity while advancing individual forward legs', () => {
    const first = activeRun();
    expect(first).toMatchObject({
      kind: 'transition',
      run: 'brand-services',
      legIndex: 0,
      runSource: 'brand',
      runTarget: 'services',
      segment: 'brand-figure3',
      from: 'brand',
      to: 'figure3-animation',
      direction: 1,
      phase: 'preparing',
      progress: 0
    });

    const second = reducePhoneStoryCursor(readyToAnimate(first), {
      type: 'ADVANCE_LEG',
      sessionId: 'phone-session-1',
      generation: 1
    });
    expect(second).toMatchObject({
      kind: 'transition',
      run: 'brand-services',
      legIndex: 1,
      runSource: 'brand',
      runTarget: 'services',
      segment: 'figure3-services',
      progress: 0
    });
  });

  it('uses canonical forward-domain progress while reversing leg order', () => {
    const first = startPhoneStoryRun(
      createPhoneStoryHold('services'),
      'brand-services',
      -1,
      { sessionId: 'phone-session-2', generation: 2 }
    );
    expect(first).toMatchObject({
      legIndex: 1,
      segment: 'figure3-services',
      runSource: 'services',
      runTarget: 'brand',
      direction: -1,
      progress: 1
    });

    const second = reducePhoneStoryCursor(readyToAnimate(
      first,
      'phone-session-2',
      2
    ), {
      type: 'ADVANCE_LEG',
      sessionId: 'phone-session-2',
      generation: 2
    });
    expect(second).toMatchObject({
      legIndex: 0,
      segment: 'brand-figure3',
      progress: 1
    });
  });

  it('rejects stale generations and non-monotonic progress callbacks', () => {
    const active = activeRun();
    const progressed = reducePhoneStoryCursor(active, {
      type: 'PROGRESS',
      sessionId: 'phone-session-1',
      generation: 1,
      progress: 0.7
    });
    expect(progressed).toMatchObject({ progress: 0.7 });
    expect(reducePhoneStoryCursor(progressed, {
      type: 'PROGRESS',
      sessionId: 'phone-session-1',
      generation: 1,
      progress: 0.3
    })).toBe(progressed);
    expect(reducePhoneStoryCursor(progressed, {
      type: 'PHASE',
      sessionId: 'phone-session-1',
      generation: 0,
      phase: 'animating'
    })).toBe(progressed);
  });

  it('rolls a second-leg forward failure back to the composite source', () => {
    const secondLeg = reducePhoneStoryCursor(readyToAnimate(activeRun()), {
      type: 'ADVANCE_LEG',
      sessionId: 'phone-session-1',
      generation: 1
    });
    const rollingBack = reducePhoneStoryCursor(secondLeg, {
      type: 'FAIL',
      sessionId: 'phone-session-1',
      generation: 1
    });
    expect(rollingBack).toMatchObject({
      kind: 'transition',
      phase: 'rolling-back',
      runSource: 'brand',
      legIndex: 1
    });
    expect(reducePhoneStoryCursor(rollingBack, {
      type: 'ROLLBACK_COMMITTED',
      sessionId: 'phone-session-1',
      generation: 1
    })).toEqual({
      kind: 'hold',
      scene: 'brand',
      revision: 1
    });
  });

  it('commits only from the terminal leg to the direction-specific target', () => {
    const first = activeRun();
    expect(reducePhoneStoryCursor(first, {
      type: 'COMMIT',
      sessionId: 'phone-session-1',
      generation: 1
    })).toBe(first);

    const second = reducePhoneStoryCursor(readyToAnimate(first), {
      type: 'ADVANCE_LEG',
      sessionId: 'phone-session-1',
      generation: 1
    });
    const readyToCommit = readyToAnimate(second);
    expect(reducePhoneStoryCursor(readyToCommit, {
      type: 'COMMIT',
      sessionId: 'phone-session-1',
      generation: 1
    })).toMatchObject({ kind: 'transition', phase: 'committing' });
  });

  it('does not publish a stable hold until commit, landing, and release complete', () => {
    const identity = { sessionId: 'phone-session-1', generation: 1 };
    const animating = readyToAnimate(
      reducePhoneStoryCursor(readyToAnimate(activeRun()), {
        type: 'ADVANCE_LEG',
        ...identity
      })
    );
    const committing = reducePhoneStoryCursor(animating, {
      type: 'COMMIT',
      ...identity
    });
    expect(committing).toMatchObject({
      kind: 'transition',
      phase: 'committing'
    });

    const landing = reducePhoneStoryCursor(committing, {
      type: 'LAND',
      ...identity
    });
    expect(landing).toMatchObject({
      kind: 'transition',
      phase: 'landing'
    });

    const releasing = reducePhoneStoryCursor(landing, {
      type: 'RELEASE',
      ...identity
    });
    expect(releasing).toMatchObject({
      kind: 'transition',
      phase: 'releasing'
    });

    expect(reducePhoneStoryCursor(releasing, {
      type: 'SETTLE',
      ...identity
    })).toEqual({
      kind: 'hold',
      scene: 'services',
      revision: 1
    });
  });
});

describe('PhoneStorySnapshot reducer', () => {
  it('keeps stable and scroll-run snapshots sessionless while a transaction has one identity and anchor', async () => {
    const api = await snapshotApi();
    const stable = api.createPhoneStorySnapshot({
      authorityId: snapshotIdentity.authorityId,
      scene: 'brand',
      actualY: 120
    });

    expect(stable).toMatchObject({
      status: 'stable',
      scene: 'brand',
      session: null,
      authorityId: snapshotIdentity.authorityId
    });

    const started = api.reducePhoneStorySnapshot(stable, {
      type: 'RUN_STARTED',
      ...snapshotIdentity,
      run: 'brand-services',
      direction: 1,
      anchorY: 240,
      inputEpoch: 9
    }).snapshot;

    expect(started).toMatchObject({
      status: 'transaction',
      session: {
        sessionId: snapshotIdentity.sessionId,
        generation: snapshotIdentity.generation,
        operation: {
          trigger: 'input',
          run: 'brand-services',
          direction: 1,
          legIndex: 0,
          from: 'brand',
          to: 'services'
        },
        phase: 'preparing',
        progress: 0,
        anchor: { y: 240 }
      },
      input: { completedEpoch: 9 }
    });
  });

  it('accepts only the legal transaction table and settles through one stable publication', async () => {
    const api = await snapshotApi();
    const stable = api.createPhoneStorySnapshot({
      authorityId: snapshotIdentity.authorityId,
      scene: 'brand',
      actualY: 0
    });
    let current = api.reducePhoneStorySnapshot(stable, {
      type: 'RUN_STARTED',
      ...snapshotIdentity,
      run: 'brand-services',
      direction: 1,
      anchorY: 100,
      inputEpoch: 1
    }).snapshot;

    const illegal = api.reducePhoneStorySnapshot(current, {
      type: 'PRESENTATION_COMMITTED',
      ...snapshotIdentity,
      now: 1
    });
    expect(illegal.snapshot).toBe(current);
    expect(illegal.effects).toEqual([]);

    current = api.reducePhoneStorySnapshot(
      current,
      presentedFrame(current, snapshotIdentity)
    ).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LEG_COMPLETED',
      ...snapshotIdentity
    }).snapshot;
    const terminalIdentity = { ...snapshotIdentity, leg: 1 } as const;

    current = api.reducePhoneStorySnapshot(
      current,
      presentedFrame(current, terminalIdentity)
    ).snapshot;
    const prematureTarget = api.reducePhoneStorySnapshot(current, {
      type: 'TARGET_PRESENTED',
      ...terminalIdentity
    });
    expect(prematureTarget.snapshot).toBe(current);
    expect(prematureTarget.effects).toEqual([]);

    current = api.reducePhoneStorySnapshot(current, {
      type: 'LEG_COMPLETED',
      ...terminalIdentity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(
      current,
      targetEvidence(current, terminalIdentity, 'coverage', 10)
    ).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'TARGET_PRESENTED',
      ...terminalIdentity,
      now: 10
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LAYOUT_RELEASED',
      ...terminalIdentity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LANDING_MEASURED',
      ...terminalIdentity,
      targetY: 100,
      geometryRevision: 1
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'SCROLL_COMMANDED',
      ...terminalIdentity,
      commandId: 3
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'SCROLL_CONFIRMED',
      ...terminalIdentity,
      commandId: 3,
      actualY: 100
    }).snapshot;
    current = api.reducePhoneStorySnapshot(
      current,
      targetEvidence(current, terminalIdentity, 'direct-entry', 11)
    ).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'PRESENTATION_COMMITTED',
      ...terminalIdentity,
      now: 11
    }).snapshot;

    expect(current).toMatchObject({
      status: 'stable',
      scene: 'services',
      session: null
    });
  });

  it('rejects stale authority, session, generation, leg, and scroll command evidence without effects', async () => {
    const api = await snapshotApi();
    const stable = api.createPhoneStorySnapshot({
      authorityId: snapshotIdentity.authorityId,
      scene: 'brand',
      actualY: 0
    });
    const active = api.reducePhoneStorySnapshot(stable, {
      type: 'RUN_STARTED',
      ...snapshotIdentity,
      run: 'brand-services',
      direction: 1,
      anchorY: 100,
      inputEpoch: 1
    }).snapshot;

    for (const stale of [
      { ...snapshotIdentity, authorityId: 'authority-old' },
      { ...snapshotIdentity, sessionId: 'session-old' },
      { ...snapshotIdentity, generation: 6 },
      { ...snapshotIdentity, leg: 1 },
      { ...snapshotIdentity, commandId: 999 }
    ]) {
      const result = api.reducePhoneStorySnapshot(active, {
        type: 'PROGRESS_REPORTED',
        ...stale,
        progress: 0.5
      });
      expect(result.snapshot).toBe(active);
      expect(result.effects).toEqual([]);
    }
  });

  it('[Task 2] retains a candidate target through one correction and rolls back on the second miss', async () => {
    const api = await snapshotApi();
    const stable = api.createPhoneStorySnapshot({
      authorityId: snapshotIdentity.authorityId,
      scene: 'brand',
      actualY: 0
    });
    let current = api.reducePhoneStorySnapshot(stable, {
      type: 'RUN_STARTED',
      ...snapshotIdentity,
      run: 'brand-services',
      direction: 1,
      anchorY: 100,
      inputEpoch: 1
    }).snapshot;
    current = api.reducePhoneStorySnapshot(
      current,
      presentedFrame(current, snapshotIdentity)
    ).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LEG_COMPLETED',
      ...snapshotIdentity
    }).snapshot;
    const terminalIdentity = { ...snapshotIdentity, leg: 1 } as const;
    current = api.reducePhoneStorySnapshot(
      current,
      presentedFrame(current, terminalIdentity)
    ).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LEG_COMPLETED',
      ...terminalIdentity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(
      current,
      targetEvidence(current, terminalIdentity, 'coverage', 10)
    ).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'TARGET_PRESENTED',
      ...terminalIdentity,
      now: 10
    }).snapshot;

    expect(current).toMatchObject({
      status: 'transaction',
      session: { phase: 'releasing-layout' },
      projection: {
        commitState: 'candidate',
        semanticScene: 'services',
        edge: 'services'
      }
    });

    current = api.reducePhoneStorySnapshot(current, {
      type: 'LAYOUT_RELEASED',
      ...terminalIdentity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LANDING_MEASURED',
      ...terminalIdentity,
      targetY: 100,
      geometryRevision: 2
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'SCROLL_COMMANDED',
      ...terminalIdentity,
      commandId: 10
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'SCROLL_CONFIRMED',
      ...terminalIdentity,
      commandId: 10,
      actualY: 84
    }).snapshot;

    expect(current).toMatchObject({
      status: 'transaction',
      session: {
        phase: 'aligning-scroll',
        alignment: { correctionCount: 1, confirmedY: null }
      }
    });

    current = api.reducePhoneStorySnapshot(current, {
      type: 'SCROLL_COMMANDED',
      ...terminalIdentity,
      commandId: 11
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'SCROLL_CONFIRMED',
      ...terminalIdentity,
      commandId: 11,
      actualY: 86
    }).snapshot;

    expect(current).toMatchObject({
      status: 'transaction',
      session: { phase: 'rollback-rendering' },
      diagnostics: {
        lastRollback: { reason: 'scroll-confirmation-failed' }
      }
    });
  });

  it('keeps progress monotonic across one multi-leg session and invalidates the old generation on rollback', async () => {
    const api = await snapshotApi();
    const stable = api.createPhoneStorySnapshot({
      authorityId: snapshotIdentity.authorityId,
      scene: 'brand',
      actualY: 0
    });
    let current = api.reducePhoneStorySnapshot(stable, {
      type: 'RUN_STARTED',
      ...snapshotIdentity,
      run: 'brand-services',
      direction: 1,
      anchorY: 100,
      inputEpoch: 1
    }).snapshot;
    current = api.reducePhoneStorySnapshot(
      current,
      presentedFrame(current, snapshotIdentity)
    ).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'PROGRESS_REPORTED',
      ...snapshotIdentity,
      progress: 0.7
    }).snapshot;
    const nonMonotonic = api.reducePhoneStorySnapshot(current, {
      type: 'PROGRESS_REPORTED',
      ...snapshotIdentity,
      progress: 0.2
    });
    expect(nonMonotonic.snapshot).toBe(current);

    current = api.reducePhoneStorySnapshot(current, {
      type: 'LEG_COMPLETED',
      ...snapshotIdentity
    }).snapshot;
    expect(current.session).toMatchObject({
      sessionId: snapshotIdentity.sessionId,
      generation: snapshotIdentity.generation,
      operation: { legIndex: 1 }
    });
    const secondLegIdentity = { ...snapshotIdentity, leg: 1 } as const;

    const rolledBack = api.reducePhoneStorySnapshot(current, {
      type: 'FAILED',
      ...secondLegIdentity,
      reason: 'dependency-timeout'
    }).snapshot;
    expect(rolledBack.session).toMatchObject({
      generation: snapshotIdentity.generation + 1,
      phase: 'rollback-rendering'
    });
    expect(api.reducePhoneStorySnapshot(rolledBack, {
      type: 'PROGRESS_REPORTED',
      ...snapshotIdentity,
      progress: 1
    }).snapshot).toBe(rolledBack);

    const rollbackIdentity = {
      ...secondLegIdentity,
      generation: snapshotIdentity.generation + 1
    } as const;
    let rollbackCurrent = api.reducePhoneStorySnapshot(rolledBack, {
      type: 'ROLLBACK_RENDERED',
      ...rollbackIdentity
    }).snapshot;
    rollbackCurrent = api.reducePhoneStorySnapshot(rollbackCurrent, {
      type: 'ROLLBACK_LAYOUT_RELEASED',
      ...rollbackIdentity
    }).snapshot;
    rollbackCurrent = api.reducePhoneStorySnapshot(rollbackCurrent, {
      type: 'ROLLBACK_LANDING_MEASURED',
      ...rollbackIdentity,
      targetY: 0,
      geometryRevision: 1
    }).snapshot;
    rollbackCurrent = api.reducePhoneStorySnapshot(rollbackCurrent, {
      type: 'ROLLBACK_SCROLL_COMMANDED',
      ...rollbackIdentity,
      commandId: 4
    }).snapshot;
    rollbackCurrent = api.reducePhoneStorySnapshot(rollbackCurrent, {
      type: 'ROLLBACK_SCROLL_CONFIRMED',
      ...rollbackIdentity,
      commandId: 4,
      actualY: 0
    }).snapshot;
    rollbackCurrent = api.reducePhoneStorySnapshot(
      rollbackCurrent,
      targetEvidence(rollbackCurrent, rollbackIdentity, 'coverage', 20)
    ).snapshot;
    rollbackCurrent = api.reducePhoneStorySnapshot(
      rollbackCurrent,
      targetEvidence(rollbackCurrent, rollbackIdentity, 'direct-entry', 21)
    ).snapshot;
    const settled = api.reducePhoneStorySnapshot(rollbackCurrent, {
      type: 'PRESENTATION_COMMITTED',
      ...rollbackIdentity,
      now: 21
    }).snapshot;
    expect(settled).toMatchObject({
      status: 'stable',
      scene: 'brand',
      session: null,
      diagnostics: {
        lastRollback: { generation: snapshotIdentity.generation + 1 }
      }
    });
  });

  it('[Task 3] claims a crossed input boundary immediately and never stores a free pending intent', async () => {
    const api = await snapshotApi();
    const stable = api.createPhoneStorySnapshot({
      authorityId: snapshotIdentity.authorityId,
      scene: 'brand',
      actualY: 64
    });
    const claimed = api.reducePhoneStorySnapshot(stable, {
      type: 'INTENT_RESOLVED',
      authorityId: snapshotIdentity.authorityId,
      inputEpoch: 19,
      direction: 1,
      run: 'brand-services',
      anchorY: 480,
      boundaryKnown: true,
      crossedBoundary: true
    });

    expect(claimed).toMatchObject({ inputDisposition: 'claim-boundary' });
    expect(claimed.snapshot).toMatchObject({
      status: 'transaction',
      session: {
        operation: {
          trigger: 'input',
          run: 'brand-services',
          direction: 1,
          from: 'brand',
          to: 'services'
        },
        phase: 'preparing',
        anchor: { y: 480 }
      },
      input: { completedEpoch: 19 }
    });
    expect(api.reducePhoneStorySnapshot(claimed.snapshot, {
      type: 'INTENT_RESOLVED',
      authorityId: snapshotIdentity.authorityId,
      inputEpoch: 20,
      direction: 1,
      run: 'brand-services',
      anchorY: 480,
      boundaryKnown: true,
      crossedBoundary: true
    })).toMatchObject({ inputDisposition: 'block-active-session' });
    expect(api.reducePhoneStorySnapshot(stable, {
      type: 'INTENT_RESOLVED',
      authorityId: snapshotIdentity.authorityId,
      inputEpoch: 20,
      direction: 1,
      run: null,
      anchorY: null,
      boundaryKnown: false,
      crossedBoundary: false
    })).toMatchObject({ inputDisposition: 'pass-native' });
  });

  it('[Task 3] starts a static direct entry as one locked precommit transaction', async () => {
    const api = await snapshotApi();
    const stable = api.createPhoneStorySnapshot({
      authorityId: snapshotIdentity.authorityId,
      scene: 'brand',
      actualY: 64
    });
    let current = api.reducePhoneStorySnapshot(stable, {
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: snapshotIdentity.authorityId,
      target: 'services',
      source: 'menu',
      fallbackScene: 'brand',
      cinematic: null
    }).snapshot;

    expect(current).toMatchObject({
      status: 'transaction',
      session: {
        operation: {
          trigger: 'entry',
          run: null,
          direction: 1,
          legIndex: 0,
          from: 'brand',
          to: 'services'
        },
        phase: 'verifying-target',
        anchor: { y: null }
      },
      projection: { commitState: 'candidate' }
    });
    const session = current.session;
    if (!session) throw new Error('Expected direct entry session');
    const identity = {
      authorityId: snapshotIdentity.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: 0,
      direction: 1
    } as const;
    const reportDirectEvidence = (kind: 'coverage' | 'direct-entry', observedAt: number) => {
      if (current.status !== 'transaction') throw new Error('Expected direct transaction');
      current = api.reducePhoneStorySnapshot(
        current,
        targetEvidence(current, identity, kind, observedAt)
      ).snapshot;
    };
    reportDirectEvidence('coverage', 1);
    current = api.reducePhoneStorySnapshot(current, {
      type: 'TARGET_PRESENTED',
      ...identity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LAYOUT_RELEASED',
      ...identity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LANDING_MEASURED',
      ...identity,
      targetY: 720,
      geometryRevision: 2
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'SCROLL_COMMANDED',
      ...identity,
      commandId: 1
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'SCROLL_CONFIRMED',
      ...identity,
      commandId: 1,
      actualY: 720
    }).snapshot;
    reportDirectEvidence('direct-entry', 2);
    current = api.reducePhoneStorySnapshot(current, {
      type: 'PRESENTATION_COMMITTED',
      ...identity,
      now: 2
    }).snapshot;

    expect(current).toMatchObject({
      status: 'stable',
      scene: 'services',
      session: null
    });
  });

  it('[convergence] never publishes a reading direct entry with coverage alone', async () => {
    const api = await snapshotApi();
    const initial = api.createPhoneStorySnapshot({
      authorityId: snapshotIdentity.authorityId,
      scene: 'brand',
      actualY: 64
    });
    let current = api.reducePhoneStorySnapshot(initial, {
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: snapshotIdentity.authorityId,
      target: 'services',
      source: 'menu',
      fallbackScene: 'brand',
      cinematic: null
    }).snapshot;
    const session = current.session;
    if (!session) throw new Error('Expected direct entry session');
    const identity = {
      authorityId: snapshotIdentity.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: 0,
      direction: 1
    } as const;
    const reportCoverage = () => {
      if (current.status !== 'transaction') throw new Error('Expected direct transaction');
      current = api.reducePhoneStorySnapshot(
        current,
        targetEvidence(current, identity, 'coverage', 1)
      ).snapshot;
    };

    reportCoverage();
    for (const event of [
      { type: 'TARGET_PRESENTED' },
      { type: 'LAYOUT_RELEASED' },
      { type: 'LANDING_MEASURED', targetY: 720, geometryRevision: 2 },
      { type: 'SCROLL_COMMANDED', commandId: 1 },
      { type: 'SCROLL_CONFIRMED', commandId: 1, actualY: 720 },
      { type: 'PRESENTATION_COMMITTED', now: 1 }
    ]) {
      current = api.reducePhoneStorySnapshot(current, {
        ...event,
        ...identity
      }).snapshot;
    }

    expect(current).toMatchObject({
      status: 'transaction',
      projection: { commitState: 'candidate' }
    });
  });

  it('[convergence] publishes a proofed candidate only through PRESENTATION_COMMITTED', async () => {
    const api = await snapshotApi();
    const initial = api.createPhoneStorySnapshot({
      authorityId: snapshotIdentity.authorityId,
      scene: 'brand',
      actualY: 64
    });
    let current = api.reducePhoneStorySnapshot(initial, {
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: snapshotIdentity.authorityId,
      target: 'services',
      source: 'menu',
      fallbackScene: 'brand',
      cinematic: null
    }).snapshot;
    const session = current.session;
    if (!session) throw new Error('Expected direct entry session');
    const identity = {
      authorityId: snapshotIdentity.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: 0,
      direction: 1
    } as const;
    const evidence = (kind: 'coverage' | 'direct-entry', observedAt: number) => {
      if (current.status !== 'transaction') throw new Error('Expected direct transaction');
      current = api.reducePhoneStorySnapshot(
        current,
        targetEvidence(current, identity, kind, observedAt)
      ).snapshot;
    };

    evidence('coverage', 1);
    current = api.reducePhoneStorySnapshot(current, {
      type: 'TARGET_PRESENTED',
      ...identity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LAYOUT_RELEASED',
      ...identity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LANDING_MEASURED',
      ...identity,
      targetY: 720,
      geometryRevision: 2
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'SCROLL_COMMANDED',
      ...identity,
      commandId: 1
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'SCROLL_CONFIRMED',
      ...identity,
      commandId: 1,
      actualY: 720
    }).snapshot;
    evidence('direct-entry', 2);

    const legacy = api.reducePhoneStorySnapshot(current, {
      type: 'STABLE_PRESENTATION_VERIFIED',
      ...identity,
      now: 2
    });
    expect(legacy.snapshot).toBe(current);

    current = api.reducePhoneStorySnapshot(current, {
      type: 'PRESENTATION_COMMITTED',
      ...identity,
      now: 2
    }).snapshot;
    expect(current).toMatchObject({
      status: 'stable',
      scene: 'services',
      session: null
    });
  });

  it('[convergence] expires direct-entry proof against monotonic verification time', async () => {
    const api = await snapshotApi();
    const initial = api.createPhoneStorySnapshot({
      authorityId: snapshotIdentity.authorityId,
      scene: 'brand',
      actualY: 64
    });
    let current = api.reducePhoneStorySnapshot(initial, {
      type: 'DIRECT_ENTRY_REQUESTED',
      authorityId: snapshotIdentity.authorityId,
      target: 'services',
      source: 'menu',
      fallbackScene: 'brand',
      cinematic: null
    }).snapshot;
    const session = current.session;
    if (!session) throw new Error('Expected direct entry session');
    const identity = {
      authorityId: snapshotIdentity.authorityId,
      sessionId: session.sessionId,
      generation: session.generation,
      leg: 0,
      direction: 1
    } as const;
    const reportEvidence = (kind: 'coverage' | 'direct-entry', observedAt: number) => {
      if (current.status !== 'transaction') throw new Error('Expected direct transaction');
      current = api.reducePhoneStorySnapshot(
        current,
        targetEvidence(current, identity, kind, observedAt)
      ).snapshot;
    };

    reportEvidence('coverage', 1);
    current = api.reducePhoneStorySnapshot(current, {
      type: 'TARGET_PRESENTED',
      ...identity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LAYOUT_RELEASED',
      ...identity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LANDING_MEASURED',
      ...identity,
      targetY: 720,
      geometryRevision: 2
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'SCROLL_COMMANDED',
      ...identity,
      commandId: 1
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'SCROLL_CONFIRMED',
      ...identity,
      commandId: 1,
      actualY: 720
    }).snapshot;
    reportEvidence('direct-entry', 2);
    current = api.reducePhoneStorySnapshot(current, {
      type: 'PRESENTATION_COMMITTED',
      ...identity,
      now: 3_003
    }).snapshot;

    expect(current).toMatchObject({
      status: 'transaction',
      projection: { commitState: 'candidate' }
    });
  });

  it('[Task 4] derives front holds and scroll-runs from one corridor sample', async () => {
    const api = await snapshotApi();
    const stable = api.createPhoneStorySnapshot({
      authorityId: snapshotIdentity.authorityId,
      scene: 'hero',
      actualY: 0
    });
    const scrolling = api.reducePhoneStorySnapshot(stable, {
      type: 'SCROLL_SAMPLED',
      authorityId: snapshotIdentity.authorityId,
      actualY: 180,
      corridor: 'front-rail',
      run: 'hero-pattern-scroll',
      progress: 0.5,
      direction: 1
    }).snapshot;

    expect(scrolling).toMatchObject({
      status: 'scroll-run',
      run: 'hero-pattern-scroll',
      session: null,
      scroll: {
        actualY: 180,
        corridor: 'front-rail',
        progress: 0.5,
        direction: 1
      }
    });

    const settled = api.reducePhoneStorySnapshot(scrolling, {
      type: 'SCROLL_SAMPLED',
      authorityId: snapshotIdentity.authorityId,
      actualY: 240,
      corridor: 'front-rail',
      scene: 'pattern',
      progress: 1,
      direction: 1
    }).snapshot;
    expect(settled).toMatchObject({
      status: 'transaction',
      session: {
        operation: {
          trigger: 'auto',
          run: null,
          from: 'hero',
          to: 'pattern'
        },
        phase: 'verifying-target'
      },
      projection: {
        commitState: 'candidate',
        edge: 'hero'
      },
      scroll: {
        actualY: 240,
        corridor: 'front-rail',
        progress: 1,
        direction: 1
      }
    });
  });

  it('[convergence] never makes an unproved scroll-sampled hold stable', async () => {
    const api = await snapshotApi();

    for (const [index, target] of canonicalSceneIds.entries()) {
      const prior = priorSceneFor(target);
      const sampled = api.reducePhoneStorySnapshot(
        api.createPhoneStorySnapshot({
          authorityId: snapshotIdentity.authorityId,
          scene: prior,
          actualY: index * 100
        }),
        {
          type: 'SCROLL_SAMPLED',
          authorityId: snapshotIdentity.authorityId,
          actualY: (index + 1) * 100,
          corridor: 'front-rail',
          scene: target,
          progress: 1,
          direction: target === 'hero' ? -1 : 1
        }
      ).snapshot;

      expect(sampled).toMatchObject({
        status: 'transaction',
        projection: {
          commitState: 'candidate',
          edge: phoneScenePresentationTuple(prior)[1]
        }
      });
    }
  });

  it('[convergence] never makes an unproved reconciled hold stable', async () => {
    const api = await snapshotApi();

    for (const [index, target] of canonicalSceneIds.entries()) {
      const prior = priorSceneFor(target);
      const reconciled = api.reducePhoneStorySnapshot(
        api.createPhoneStorySnapshot({
          authorityId: snapshotIdentity.authorityId,
          scene: prior,
          actualY: index * 100
        }),
        {
          type: 'HOLD_RECONCILED',
          authorityId: snapshotIdentity.authorityId,
          scene: target,
          actualY: (index + 1) * 100
        }
      ).snapshot;

      expect(reconciled).toMatchObject({
        status: 'transaction',
        projection: {
          commitState: 'candidate',
          edge: phoneScenePresentationTuple(prior)[1]
        }
      });
    }
  });

  it('[Task 4] keeps an active transaction authoritative over later rail samples', async () => {
    const api = await snapshotApi();
    const stable = api.createPhoneStorySnapshot({
      authorityId: snapshotIdentity.authorityId,
      scene: 'aod-animation',
      actualY: 800
    });
    const transaction = api.reducePhoneStorySnapshot(stable, {
      type: 'RUN_STARTED',
      ...snapshotIdentity,
      run: 'aod-method',
      direction: 1,
      anchorY: 800,
      inputEpoch: 8
    }).snapshot;
    const sampled = api.reducePhoneStorySnapshot(transaction, {
      type: 'SCROLL_SAMPLED',
      authorityId: snapshotIdentity.authorityId,
      actualY: 760,
      corridor: 'front-rail',
      scene: 'aod-animation',
      progress: 0.9,
      direction: -1
    }).snapshot;

    expect(sampled).toMatchObject({
      status: 'transaction',
      session: { operation: { run: 'aod-method' } },
      scroll: { actualY: 760, corridor: 'front-rail' }
    });
  });

  it('[R5] keeps a cinematic AOD transaction in preparing until matching compositor evidence arrives', async () => {
    const api = await snapshotApi();
    const stable = api.createPhoneStorySnapshot({
      authorityId: snapshotIdentity.authorityId,
      scene: 'aod-animation',
      actualY: 480
    });
    let current = api.reducePhoneStorySnapshot(stable, {
      type: 'RUN_STARTED',
      ...snapshotIdentity,
      run: 'aod-method',
      direction: 1,
      anchorY: 480,
      inputEpoch: 4
    }).snapshot;

    const withoutFrame = api.reducePhoneStorySnapshot(current, {
      type: 'PRESENTATION_PROOF_REPORTED',
      ...snapshotIdentity
    });
    expect(withoutFrame.snapshot).toBe(current);

    current = api.reducePhoneStorySnapshot(
      current,
      presentedFrame(current, snapshotIdentity)
    ).snapshot;

    expect(current).toMatchObject({
      session: { phase: 'animating' }
    });
  });
});
