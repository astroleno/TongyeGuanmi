import { describe, expect, it, vi } from 'vitest';
import {
  PHONE_AOD_PREPARE_TIMEOUT_MS,
  PHONE_AOD_PROGRESS_WATCHDOG_MS,
  registerPhoneRuntimeAodCapability,
  type PhoneAodExecution
} from '../runtime';
import type { PhoneAodRunnerStage } from '../machine';
import type {
  PhoneAodRunSession,
  PhoneRunCapability,
  PhoneStoryRuntimePort
} from './types';

type Harness = Readonly<{
  token: PhoneAodExecution[0];
  staticToken: PhoneAodExecution[0];
  execution: PhoneAodExecution;
  events: string[];
  start: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  presentStaticTarget: ReturnType<typeof vi.fn>;
  disposeStaticTarget: ReturnType<typeof vi.fn>;
  requestReducedTargetLayout: ReturnType<typeof vi.fn>;
  session: PhoneAodRunSession & Readonly<{
    frame: ReturnType<typeof vi.fn>;
    progress: ReturnType<typeof vi.fn>;
    complete: ReturnType<typeof vi.fn>;
    fail: ReturnType<typeof vi.fn>;
  }>;
  runner: ReturnType<typeof registerPhoneRuntimeAodCapability>;
  startRun(): boolean | void;
  settleStart(result: 'playing' | 'blocked' | 'error'): void;
  reducedStrategy(): boolean | undefined;
  stage(): PhoneAodRunnerStage;
  progress(): number;
}>;

function createHarness(
  direction: 1 | -1 = 1,
  startResult: 'playing' | 'blocked' | 'error' | 'pending' = 'playing',
  reducedMotion = false,
  reducedTargetPosition: (direction: 1 | -1) => number | null = () => 100
): Harness {
  const token = {
    authorityId: 'aod-authority',
    sessionId: 'aod-session',
    generation: 3,
    leg: 0,
    revision: 11,
    subject: 'front:aod',
    kind: 'packed-canvas-frame' as const
  };
  const staticToken = {
    authorityId: token.authorityId,
    sessionId: token.sessionId,
    generation: token.generation,
    leg: token.leg,
    revision: token.revision,
    subject: direction === 1 ? 'native:method' : 'front:aod',
    kind: 'static-poster' as const
  };
  let execution = [token, direction] as PhoneAodExecution;
  const events: string[] = [];
  let active = true;
  let settled = false;
  let stage: PhoneAodRunnerStage = 'admission';
  let progress = direction === 1 ? 0 : 1;
  let capability: PhoneRunCapability | undefined;
  const snapshot = () => settled
    ? {
        authorityId: token.authorityId,
        status: 'stable' as const,
        scene: direction === 1 ? 'method-top' as const : 'aod-animation' as const
      }
    : {
        authorityId: token.authorityId,
        status: 'transaction' as const,
        session: {
          sessionId: token.sessionId!,
          generation: token.generation,
          operation: {
            run: 'aod-method' as const,
            direction,
            legIndex: 0
          },
          phase: stage === 'admission'
            ? 'preparing'
            : stage === 'playback' ? 'animating' : 'verifying-target',
          progress,
          aod: {
            stage
          },
          reducedMotion
        }
      };
  const frame = vi.fn((value) => {
    if (reducedMotion) {
      if (
        stage !== 'admission'
        || value.origin !== 'leaf-static-poster'
        || value.token !== staticToken
      ) return false;
      settled = true;
      events.push('static-proof-accepted');
      return true;
    }
    if (
      stage !== 'admission'
      || value.origin !== 'segment-first-frame'
      || value.token !== token
    ) return false;
    stage = 'playback';
    events.push('proof-accepted');
    return true;
  });
  const reportProgress = vi.fn((next: number) => {
    if (stage !== 'playback') return;
    progress = next;
    events.push(`progress:${next}`);
  });
  const complete = vi.fn(() => {
    stage = 'settling';
    events.push('settle');
  });
  const fail = vi.fn((reason) => {
    active = false;
    stage = 'settling';
    events.push(`fail:${reason}`);
  });
  const session = Object.assign({
    authorityId: token.authorityId,
    sessionId: token.sessionId!,
    generation: token.generation,
    leg: 0,
    direction,
    valid: () => active,
    presentationProofToken: vi.fn(() => token),
    presentationFrameToken: vi.fn((kind, subject) => (
      kind === 'static-poster' && subject === staticToken.subject
        ? staticToken
        : null
    )),
    requestReducedTargetLayout: vi.fn(() => true),
    reportPresentationFrame: frame,
    reportProgress,
    reportEndpointCommit: complete,
    reportFailure: fail
  }, {
    frame,
    progress: reportProgress,
    complete,
    fail
  }) as unknown as PhoneAodRunSession & Readonly<{
    frame: typeof frame;
    progress: typeof reportProgress;
    complete: typeof complete;
    fail: typeof fail;
  }>;
  const port = {
    getSnapshot: snapshot,
    registerRunCapability(
      _run: 'aod-method',
      _owner: string,
      next: PhoneRunCapability
    ) {
      capability = next;
      return { dispose: () => undefined };
    }
  } as unknown as PhoneStoryRuntimePort;
  let attempts = 0;
  const pendingStartResolvers: Array<
    (result: 'playing' | 'blocked' | 'error') => void
  > = [];
  const start = vi.fn((startedExecution: PhoneAodExecution) => {
    execution = startedExecution;
    events.push('start');
    const result = startResult === 'blocked' && attempts++ > 0
      ? 'playing'
      : startResult;
    if (result === 'pending') {
      return new Promise<'playing' | 'blocked' | 'error'>((resolve) => {
        pendingStartResolvers.push(resolve);
      });
    }
    return Promise.resolve(result);
  });
  const settleStart = (result: 'playing' | 'blocked' | 'error') => {
    const resolve = pendingStartResolvers.shift();
    if (!resolve) throw new Error('Expected a pending AOD autoplay attempt');
    resolve(result);
  };
  const release = vi.fn(() => events.push('release-playback'));
  const reset = vi.fn(() => events.push('reset-leaf'));
  const presentStaticTarget = vi.fn(() => true);
  const disposeStaticTarget = vi.fn(() => undefined);
  const runner = registerPhoneRuntimeAodCapability(
    port,
    () => 100,
    () => true,
    start,
    release,
    reset,
    reducedMotion,
    {
      position: reducedTargetPosition,
      present: presentStaticTarget,
      dispose: disposeStaticTarget
    }
  );
  return {
    token,
    staticToken,
    get execution() {
      return execution;
    },
    events,
    start,
    release,
    reset,
    presentStaticTarget,
    disposeStaticTarget,
    requestReducedTargetLayout: session.requestReducedTargetLayout as ReturnType<typeof vi.fn>,
    session,
    runner,
    startRun: () => capability?.start(direction, session),
    settleStart,
    reducedStrategy: () => capability?.reducedMotion,
    stage: () => stage,
    progress: () => progress
  };
}

function frameFor(
  execution: PhoneAodExecution,
  sequence = 1
) {
  return {
    token: execution[0],
    frameSequence: sequence,
    observedAt: sequence,
    origin: 'segment-first-frame' as const
  };
}

describe('AOD ↔ Method single runner cutover', () => {
  it.each([1, -1] as const)(
    '[AOD reduced cutover] admits %s only through its target static leaf without starting media playback',
    async (direction) => {
      const value = createHarness(direction, 'playing', true);

      expect(value.startRun()).toBe(true);
      await Promise.resolve();

      // A reduced transaction remains one locked machine candidate, but it
      // never enters AOD's media admission/playback branch.
      expect(value.reducedStrategy()).toBe(true);
      expect(value.start).not.toHaveBeenCalled();
      expect(value.requestReducedTargetLayout).toHaveBeenCalledWith(100);
      expect(value.presentStaticTarget).toHaveBeenCalledTimes(1);
      const [execution, report] = value.presentStaticTarget.mock.calls[0]!;
      expect(execution[0]).toBe(value.staticToken);
      expect(execution[0]).toMatchObject({
        subject: direction === 1 ? 'native:method' : 'front:aod',
        kind: 'static-poster'
      });

      value.runner[0](.5, execution);
      value.runner[2](execution);
      expect(value.session.progress).not.toHaveBeenCalled();
      expect(value.session.complete).not.toHaveBeenCalled();

      report({
        token: { ...execution[0], revision: execution[0].revision + 1 },
        frameSequence: 1,
        observedAt: 9,
        origin: 'leaf-static-poster'
      });
      expect(value.session.frame).not.toHaveBeenCalled();

      report({
        token: execution[0],
        frameSequence: 1,
        observedAt: 10,
        origin: 'leaf-static-poster'
      });
      expect(value.session.frame).toHaveBeenCalledWith(expect.objectContaining({
        token: value.staticToken,
        origin: 'leaf-static-poster'
      }));
      expect(value.disposeStaticTarget).toHaveBeenCalledWith(execution);
      value.runner[5]();
    }
  );

  it('[AOD reduced cutover] asks the runner-owned target layout for the static receiver, not its source boundary', async () => {
    const value = createHarness(1, 'playing', true, () => 1_728);

    expect(value.startRun()).toBe(true);
    await Promise.resolve();

    expect(value.requestReducedTargetLayout).toHaveBeenCalledWith(1_728);
    value.runner[5]();
  });

  it('orders admission → accepted proof → playback → settle and suppresses pre-proof progress', async () => {
    const value = createHarness();

    expect(value.startRun()).toBe(true);
    await Promise.resolve();
    value.runner[0](.45, value.execution);
    expect(value.session.progress).not.toHaveBeenCalled();

    value.runner[1](frameFor(value.execution), value.execution);
    expect(value.session.frame).toHaveBeenCalledOnce();
    expect(value.release).toHaveBeenCalledOnce();
    expect(value.stage()).toBe('playback');

    value.runner[0](.45, value.execution);
    value.runner[2](value.execution);
    expect(value.session.complete).not.toHaveBeenCalled();

    value.runner[0](1, value.execution);
    value.runner[2](value.execution);
    expect(value.events).toEqual([
      'start',
      'proof-accepted',
      'release-playback',
      'progress:0.45',
      'progress:1',
      'settle'
    ]);
    value.runner[5]();
  });

  it('uses the exact leaf-supplied token and rejects stale frame identities', async () => {
    const value = createHarness();
    value.startRun();
    await Promise.resolve();
    const stale = [
      { ...value.token, revision: value.token.revision + 1 },
      value.execution[1]
    ] as PhoneAodExecution;

    value.runner[1](frameFor(stale), stale);
    expect(value.session.frame).not.toHaveBeenCalled();
    expect(value.release).not.toHaveBeenCalled();

    value.runner[1](frameFor(value.execution), value.execution);
    expect(value.session.frame).toHaveBeenCalledOnce();
    value.runner[5]();
  });

  it('[P0 AOD admission] does not let an earlier exact frame survive a rejected playback attempt', async () => {
    const value = createHarness(1, 'pending');

    expect(value.startRun()).toBe(true);
    await Promise.resolve();

    // Safari may paint the prepared zero frame before video.play() settles.
    // That fact belongs to the current immutable token, but cannot by itself
    // advance the machine out of admission.
    value.runner[1](frameFor(value.execution), value.execution);
    expect(value.stage()).toBe('admission');
    expect(value.session.frame).not.toHaveBeenCalled();
    expect(value.release).not.toHaveBeenCalled();

    value.settleStart('blocked');
    await Promise.resolve();
    expect(value.stage()).toBe('settling');
    expect(value.session.fail).toHaveBeenCalledWith('aod-autoplay-blocked');
    expect(value.session.frame).not.toHaveBeenCalled();
    expect(value.release).not.toHaveBeenCalled();
    expect(value.reset).toHaveBeenCalledOnce();
    value.runner[5]();
  });

  it('has no private retry writer after an autoplay rejection', async () => {
    const value = createHarness(1, 'blocked');
    value.startRun();
    await Promise.resolve();

    expect(value.stage()).toBe('settling');
    expect(value.session.fail).toHaveBeenCalledWith('aod-autoplay-blocked');
    expect(value.start).toHaveBeenCalledOnce();
    expect(value.runner).toHaveLength(6);
    value.runner[5]();
  });

  it('rolls back when admission receives no compositor frame', async () => {
    vi.useFakeTimers();
    try {
      const value = createHarness();
      value.startRun();
      await Promise.resolve();
      vi.advanceTimersByTime(PHONE_AOD_PREPARE_TIMEOUT_MS);
      expect(value.session.fail).toHaveBeenCalledWith('aod-prepare-timeout');
      value.runner[5]();
    } finally {
      vi.useRealTimers();
    }
  });

  it('requires continued physical progress after proof and reports context loss through the runner', async () => {
    vi.useFakeTimers();
    try {
      const value = createHarness();
      value.startRun();
      await Promise.resolve();
      value.runner[1](frameFor(value.execution), value.execution);
      vi.advanceTimersByTime(PHONE_AOD_PROGRESS_WATCHDOG_MS);
      expect(value.session.fail).toHaveBeenCalledWith('aod-progress-timeout');

      const failure = createHarness();
      failure.startRun();
      await Promise.resolve();
      failure.runner[3](failure.execution, 'aod-context-lost');
      expect(failure.session.fail).toHaveBeenCalledWith('aod-context-lost');
      expect(failure.reset).toHaveBeenCalledOnce();
      failure.runner[5]();
      value.runner[5]();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    'aod-webgl-unavailable',
    'aod-frame-upload-failed',
    'aod-frame-draw-failed',
    'aod-context-lost'
  ] as const)('[P0 AOD compositor contract] retires a typed %s leaf failure through the session owner', async (reason) => {
    const value = createHarness();
    value.startRun();
    await Promise.resolve();

    value.runner[3](value.execution, reason);

    expect(value.session.fail).toHaveBeenCalledExactlyOnceWith(reason);
    expect(value.reset).toHaveBeenCalledOnce();
    expect(value.stage()).toBe('settling');
    value.runner[5]();
  });

  it('[P0 AOD session ownership] routes every terminal admission and playback failure through the session rollback owner', async () => {
    vi.useFakeTimers();
    try {
      const noFrame = createHarness();
      noFrame.startRun();
      await Promise.resolve();
      vi.advanceTimersByTime(PHONE_AOD_PREPARE_TIMEOUT_MS);

      expect(noFrame.session.fail).toHaveBeenCalledWith('aod-prepare-timeout');
      expect(noFrame.reset).toHaveBeenCalledOnce();
      expect(noFrame.stage()).toBe('settling');

      const stalledPlayback = createHarness();
      stalledPlayback.startRun();
      await Promise.resolve();
      stalledPlayback.runner[1](frameFor(stalledPlayback.execution), stalledPlayback.execution);
      vi.advanceTimersByTime(PHONE_AOD_PROGRESS_WATCHDOG_MS);

      expect(stalledPlayback.session.fail).toHaveBeenCalledWith('aod-progress-timeout');
      expect(stalledPlayback.reset).toHaveBeenCalledOnce();

      const rejectedPlay = createHarness(1, 'blocked');
      rejectedPlay.startRun();
      await Promise.resolve();

      expect(rejectedPlay.session.fail).toHaveBeenCalledWith('aod-autoplay-blocked');
      expect(rejectedPlay.reset).toHaveBeenCalledOnce();

      noFrame.runner[5]();
      stalledPlayback.runner[5]();
      rejectedPlay.runner[5]();
    } finally {
      vi.useRealTimers();
    }
  });

  it('suspends a watchdog in the background and rearms the same machine stage on foreground', async () => {
    vi.useFakeTimers();
    const visibilityDocument = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal('document', visibilityDocument);
    try {
      const value = createHarness();
      value.startRun();
      await Promise.resolve();
      visibilityDocument.hidden = true;
      visibilityDocument.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(PHONE_AOD_PREPARE_TIMEOUT_MS * 2);
      expect(value.session.fail).not.toHaveBeenCalled();

      visibilityDocument.hidden = false;
      visibilityDocument.dispatchEvent(new Event('visibilitychange'));
      vi.advanceTimersByTime(PHONE_AOD_PREPARE_TIMEOUT_MS);
      expect(value.session.fail).toHaveBeenCalledWith('aod-prepare-timeout');
      value.runner[5]();
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it('runs the same ordered contract in reverse with decreasing terminal progress', async () => {
    const value = createHarness(-1);
    value.startRun();
    await Promise.resolve();
    value.runner[0](.6, value.execution);
    expect(value.session.progress).not.toHaveBeenCalled();
    value.runner[1](frameFor(value.execution), value.execution);
    value.runner[0](.2, value.execution);
    value.runner[2](value.execution);
    expect(value.session.complete).not.toHaveBeenCalled();
    value.runner[0](0, value.execution);
    value.runner[2](value.execution);
    expect(value.progress()).toBe(0);
    expect(value.session.complete).toHaveBeenCalledOnce();
    value.runner[5]();
  });
});
