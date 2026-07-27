import { describe, expect, it } from 'vitest';
import {
  createPhoneStoryHold,
  reducePhoneStoryCursor,
  startPhoneStoryRun,
  type PhoneStoryCursor,
  type PhoneStoryLegacyCursor
} from './phone-story-state';

type SnapshotView = Readonly<{
  authorityId: string;
  revision: number;
  status: 'stable' | 'scroll-run' | 'transaction';
  scene?: string;
  session: Readonly<{
    sessionId: string;
    generation: number;
    operation: Readonly<{
      kind: string;
      run?: string;
      direction?: number;
      legIndex?: number;
    }>;
    phase: string;
    progress: number;
    anchor: Readonly<{ y: number | null }>;
    alignment: unknown;
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
    scene: 'brand' | 'services';
    actualY: number;
  }>): SnapshotView;
  reducePhoneStorySnapshot(
    state: SnapshotView,
    event: Readonly<Record<string, unknown>>
  ): Readonly<{ snapshot: SnapshotView; effects: readonly unknown[] }>;
  selectPhoneStoryCursor(snapshot: SnapshotView): PhoneStoryCursor;
}>;

async function snapshotApi(): Promise<SnapshotApi> {
  const state = await import('./phone-story-state') as unknown as Partial<SnapshotApi>;
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

const activeRun = () => startPhoneStoryRun(
  createPhoneStoryHold('brand'),
  'brand-services',
  1,
  { sessionId: 'phone-session-1', generation: 1 }
);

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
          kind: 'run',
          run: 'brand-services',
          direction: 1,
          legIndex: 0
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
      type: 'STABLE_PRESENTATION_VERIFIED',
      ...snapshotIdentity
    });
    expect(illegal.snapshot).toBe(current);
    expect(illegal.effects).toEqual([]);

    current = api.reducePhoneStorySnapshot(current, {
      type: 'PRESENTED_FRAME',
      ...snapshotIdentity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LEG_COMPLETED',
      ...snapshotIdentity
    }).snapshot;
    const terminalIdentity = { ...snapshotIdentity, leg: 1 } as const;

    current = api.reducePhoneStorySnapshot(current, {
      type: 'PRESENTED_FRAME',
      ...terminalIdentity
    }).snapshot;
    const prematureTarget = api.reducePhoneStorySnapshot(current, {
      type: 'TARGET_PRESENTED',
      ...terminalIdentity
    });
    expect(prematureTarget.snapshot).toBe(current);
    expect(prematureTarget.effects).toEqual([]);

    for (const type of [
      'LEG_COMPLETED',
      'TARGET_PRESENTED',
      'LAYOUT_RELEASED',
      'LANDING_MEASURED',
      'SCROLL_COMMANDED',
      'SCROLL_CONFIRMED',
      'STABLE_PRESENTATION_VERIFIED'
    ]) {
      current = api.reducePhoneStorySnapshot(current, {
        type,
        ...terminalIdentity,
        ...(type === 'LANDING_MEASURED'
          ? { targetY: 100, geometryRevision: 1 }
          : {}),
        ...(type === 'SCROLL_COMMANDED' ? { commandId: 3 } : {}),
        ...(type === 'SCROLL_CONFIRMED'
          ? { commandId: 3, actualY: 100 }
          : {})
      }).snapshot;
    }

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
    current = api.reducePhoneStorySnapshot(current, {
      type: 'PRESENTED_FRAME',
      ...snapshotIdentity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LEG_COMPLETED',
      ...snapshotIdentity
    }).snapshot;
    const terminalIdentity = { ...snapshotIdentity, leg: 1 } as const;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'PRESENTED_FRAME',
      ...terminalIdentity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'LEG_COMPLETED',
      ...terminalIdentity
    }).snapshot;
    current = api.reducePhoneStorySnapshot(current, {
      type: 'TARGET_PRESENTED',
      ...terminalIdentity
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
    current = api.reducePhoneStorySnapshot(current, {
      type: 'PRESENTED_FRAME',
      ...snapshotIdentity
    }).snapshot;
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
    const settled = api.reducePhoneStorySnapshot(rollbackCurrent, {
      type: 'ROLLBACK_STABLE_PRESENTATION_VERIFIED',
      ...rollbackIdentity
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
});
