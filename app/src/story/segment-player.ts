import { storyManifest } from './manifest';
import type {
  Direction,
  DirectorEvent,
  LayerHandle,
  LayerVisibilityState,
  MilestoneReport,
  PrepareToken,
  SegmentId,
  SegmentResult,
  SegmentRunId,
  SegmentTimelineHandle,
  SpineSegmentNode,
  StageHandle,
  StoryManifest,
  TransitionModule
} from './types';

export type SegmentRunSnapshot = {
  runId: SegmentRunId;
  segmentId: SegmentId;
  direction: Direction;
  progress: number;
  pausedAt?: string;
};

export type SegmentPlayerMailbox = {
  send(event: DirectorEvent): void;
};

export type EnsureBuiltOptions = {
  runId?: SegmentRunId;
  prepareToken?: PrepareToken;
  timeoutMs?: number;
  direction?: Direction;
};

export type PlayOptions = {
  runId?: SegmentRunId;
  prepareToken?: PrepareToken;
  timeoutMs?: number;
};

export type SegmentPlayerOptions = {
  manifest?: StoryManifest;
  transitions: Partial<Record<SegmentId, TransitionModule>>;
  transitionLoader?: (id: SegmentId) => Promise<TransitionModule> | TransitionModule;
  stage?: StageHandle;
  mailbox?: SegmentPlayerMailbox;
  actorEpoch?: string;
  prefersReducedMotion?: boolean | (() => boolean);
};

type ScheduledFrame =
  | { kind: 'animation-frame'; id: number }
  | { kind: 'timeout'; id: ReturnType<typeof setTimeout> };

type ActiveRun = {
  runId: SegmentRunId;
  segmentId: SegmentId;
  direction: Direction;
  progress: number;
  pausedAt?: string;
  timeline?: SegmentTimelineHandle;
  staged?: {
    boundaries: readonly number[];
    playMs: readonly number[];
    legIndex: number;
    pausedStageIndex?: number;
    pendingResumeStageIndex?: number;
    preparationGeneration: number;
    frame?: ScheduledFrame;
  };
  scrub?: {
    generation: number;
    idleTimer?: ReturnType<typeof setTimeout>;
    frame?: ScheduledFrame;
  };
  settled: boolean;
  resolve(result: SegmentResult): void;
};

const MAX_STAGED_FRAME_DELTA_MS = 64;

export class BuildTimeoutError extends Error {
  readonly segment: SegmentId;

  constructor(segment: SegmentId, timeoutMs: number) {
    super(`ensureBuilt timed out for ${segment} after ${timeoutMs}ms`);
    this.name = 'BuildTimeoutError';
    this.segment = segment;
  }
}

class BuildCancelledError extends Error {
  constructor(segment: SegmentId) {
    super(`ensureBuilt cancelled for ${segment}`);
    this.name = 'BuildCancelledError';
  }
}

type PendingBuild = {
  generation: number;
  promise: Promise<SegmentTimelineHandle>;
};

function scheduleFrame(callback: () => void, fallbackDelayMs: number): ScheduledFrame {
  if (typeof requestAnimationFrame === 'function') {
    return { kind: 'animation-frame', id: requestAnimationFrame(callback) };
  }
  return { kind: 'timeout', id: setTimeout(callback, fallbackDelayMs) };
}

function cancelScheduledFrame(frame: ScheduledFrame): void {
  if (frame.kind === 'animation-frame') {
    cancelAnimationFrame(frame.id);
    return;
  }
  clearTimeout(frame.id);
}

function asError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }
  return new Error(String(error));
}

function queueMailbox(mailbox: SegmentPlayerMailbox | undefined, event: DirectorEvent): void {
  if (!mailbox) {
    return;
  }
  queueMicrotask(() => mailbox.send(event));
}

function createLayer(scene: LayerHandle['scene'], role: LayerHandle['role']): LayerHandle {
  let visibility: LayerVisibilityState = {
    mounted: true,
    visible: role === 'current',
    inert: role !== 'current',
    opacity: role === 'current' ? 1 : 0,
    pointerEvents: role === 'current' ? 'auto' : 'none'
  };

  return {
    scene,
    role,
    element: null,
    get visibility() {
      return visibility;
    },
    setVisibility(next) {
      visibility = next;
    },
    dispose() {
      visibility = {
        mounted: false,
        visible: false,
        inert: true,
        opacity: 0,
        pointerEvents: 'none'
      };
    }
  };
}

function createNullStage(): StageHandle {
  const layers = new Map<string, LayerHandle>();
  return {
    getLayer(scene) {
      return layers.get(scene);
    },
    ensureLayer(scene, role) {
      const existing = layers.get(scene);
      if (existing) {
        return existing;
      }
      const layer = createLayer(scene, role);
      layers.set(scene, layer);
      return layer;
    },
    releaseLayer(scene) {
      layers.get(scene)?.dispose();
      layers.delete(scene);
    },
    snapshot() {
      return [...layers.values()];
    }
  };
}

function detectPrefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export class SegmentPlayer {
  private readonly manifest: StoryManifest;
  private readonly transitions: Partial<Record<SegmentId, TransitionModule>>;
  private readonly transitionLoader: SegmentPlayerOptions['transitionLoader'];
  private readonly stage: StageHandle;
  private readonly mailbox: SegmentPlayerMailbox | undefined;
  private readonly actorEpoch: string;
  private readonly prefersReducedMotion: () => boolean;
  private readonly built = new Map<SegmentId, SegmentTimelineHandle>();
  private readonly pendingBuilds = new Map<SegmentId, PendingBuild>();
  private readonly buildGenerations = new Map<SegmentId, number>();
  private readonly pendingScrubProgress = new Map<SegmentId, number>();
  private active: ActiveRun | null = null;
  private runCounter = 0;

  constructor(options: SegmentPlayerOptions) {
    this.manifest = options.manifest ?? storyManifest;
    this.transitions = options.transitions;
    this.transitionLoader = options.transitionLoader;
    this.stage = options.stage ?? createNullStage();
    this.mailbox = options.mailbox;
    this.actorEpoch = options.actorEpoch ?? 'segment-player';
    const prefersReducedMotion = options.prefersReducedMotion;
    this.prefersReducedMotion = typeof prefersReducedMotion === 'function'
      ? prefersReducedMotion
      : () => prefersReducedMotion ?? detectPrefersReducedMotion();
  }

  ensureBuilt(id: SegmentId, options: EnsureBuiltOptions = {}): Promise<SegmentTimelineHandle> {
    const cached = this.built.get(id);
    if (cached) {
      return Promise.resolve(cached);
    }
    const pending = this.pendingBuilds.get(id);
    if (pending) {
      return pending.promise;
    }

    const segment = this.findSegment(id);
    const timeoutMs = options.timeoutMs ?? segment.buildTimeoutMs ?? this.manifest.defaults.buildTimeoutMs;
    const runId = options.runId ?? this.nextRunId();
    const prepareToken = options.prepareToken ?? `${this.actorEpoch}:prepare:0`;
    const direction = options.direction ?? 1;
    const generation = this.buildGenerations.get(id) ?? 0;
    const from = this.stage.ensureLayer(segment.from, direction === 1 ? 'current' : 'next');
    const to = this.stage.ensureLayer(segment.to, direction === 1 ? 'next' : 'current');

    let timeout: ReturnType<typeof setTimeout> | undefined;
    let buildExpired = false;
    const buildPromise = this.resolveTransition(id).then((transition) =>
      transition.buildTimeline({
          segment,
          stage: this.stage,
          from,
          to,
          direction,
          runId,
          prepareToken,
          prefersReducedMotion: this.prefersReducedMotion(),
          reportMilestone: (milestone) => this.reportMilestone(milestone)
        })
    ).then((timeline) => {
      if (buildExpired) {
        timeline.dispose();
      } else if ((this.buildGenerations.get(id) ?? 0) !== generation) {
        timeline.dispose();
        throw new BuildCancelledError(id);
      }
      return timeline;
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => {
        buildExpired = true;
        reject(new BuildTimeoutError(id, timeoutMs));
      }, timeoutMs);
    });

    const pendingPromise = Promise.race([buildPromise, timeoutPromise])
      .then((timeline) => {
        if ((this.buildGenerations.get(id) ?? 0) !== generation) {
          timeline.dispose();
          throw new BuildCancelledError(id);
        }
        this.built.set(id, timeline);
        return timeline;
      })
      .catch((error: unknown) => {
        const normalized = asError(error);
        if (normalized instanceof BuildTimeoutError) {
          queueMailbox(this.mailbox, {
            type: 'BUILD_TIMEOUT',
            segment: id,
            runId,
            prepareToken
          });
        }
        throw normalized;
      })
      .finally(() => {
        if (timeout) {
          clearTimeout(timeout);
        }
        if (this.pendingBuilds.get(id)?.generation === generation) {
          this.pendingBuilds.delete(id);
        }
      });
    this.pendingBuilds.set(id, { generation, promise: pendingPromise });
    return pendingPromise;
  }

  play(id: SegmentId, direction: Direction, options: PlayOptions = {}): Promise<SegmentResult> {
    const runId = options.runId ?? this.nextRunId();
    const run = this.createRun(id, runId, direction);
    this.abort('superseded');
    this.active = run;

    void this.ensureBuilt(id, {
      runId,
      ...(options.prepareToken ? { prepareToken: options.prepareToken } : {}),
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      direction
    })
      .then((timeline) => {
        if (this.active?.runId !== runId || run.settled) {
          this.disposeCachedTimeline(id, timeline);
          this.settleRun(run, { status: 'aborted', runId, segment: id, reason: 'superseded' }, false);
          return;
        }

        run.timeline = timeline;
        run.progress = direction === 1 ? 0 : 1;
        const segment = this.findSegment(id);
        if (segment.policy.kind === 'scrub') {
          timeline.progress(run.progress);
          const pendingScrubProgress = this.pendingScrubProgress.get(id);
          if (pendingScrubProgress !== undefined) {
            this.pendingScrubProgress.delete(id);
            this.scrub(id, pendingScrubProgress);
          }
          return;
        }
        if (segment.policy.kind === 'stagedSnap') {
          timeline.progress(run.progress);
          run.staged = {
            boundaries: [0, ...segment.policy.stops, 1],
            playMs: segment.policy.playMs,
            legIndex: direction === 1 ? 0 : segment.policy.playMs.length - 1,
            preparationGeneration: 0
          };
          this.playStagedLeg(run, timeline);
          return;
        }
        const playback = direction === 1 ? (timeline.progress(0), timeline.play(direction)) : (timeline.progress(1), timeline.reverse());
        return Promise.resolve(playback)
          .then(() => {
            if (this.active?.runId !== runId) {
              this.settleRun(run, { status: 'aborted', runId, segment: id, reason: 'superseded' }, false);
              return;
            }
            run.progress = direction === 1 ? 1 : 0;
            this.settleRun(run, { status: 'completed', runId, segment: id, direction }, true);
          })
          .catch((error: unknown) => {
            if (this.active?.runId !== runId) {
              this.settleRun(run, { status: 'aborted', runId, segment: id, reason: 'superseded' }, false);
              return;
            }
            this.settleRun(run, { status: 'failed', runId, segment: id, error: asError(error) }, true);
          });
      })
      .catch((error: unknown) => {
        if (this.active?.runId !== runId) {
          this.settleRun(run, { status: 'aborted', runId, segment: id, reason: 'superseded' }, false);
          return;
        }
        this.settleRun(run, { status: 'failed', runId, segment: id, error: asError(error) }, true);
      });

    return new Promise<SegmentResult>((resolve) => {
      run.resolve = resolve;
    });
  }

  resumeStaged(runId: SegmentRunId, direction?: Direction): boolean {
    const run = this.active;
    const staged = run?.staged;
    const timeline = run?.timeline;
    if (!run || run.runId !== runId || run.settled || !staged || !timeline || staged.pausedStageIndex === undefined) {
      return false;
    }

    const stageIndex = staged.pausedStageIndex;
    const resumeDirection = direction ?? run.direction;
    if (resumeDirection !== run.direction) {
      staged.legIndex = resumeDirection === 1 ? stageIndex + 1 : stageIndex;
      run.direction = resumeDirection;
    }
    delete staged.pausedStageIndex;
    delete run.pausedAt;
    staged.pendingResumeStageIndex = stageIndex;
    this.playStagedLeg(run, timeline);
    return true;
  }

  scrub(id: SegmentId, progress: number): void {
    const clamped = Math.min(1, Math.max(0, progress));
    const timeline = this.built.get(id);
    if (!timeline && this.active?.segmentId === id && !this.active.settled && this.findSegment(id).policy.kind === 'scrub') {
      this.pendingScrubProgress.set(id, clamped);
      this.active.progress = clamped;
      return;
    }
    if (!timeline) {
      throw new Error(`Cannot scrub unbuilt segment: ${id}`);
    }
    const activeRun = this.active?.segmentId === id && !this.active.settled ? this.active : undefined;
    if (activeRun) {
      this.cancelScrubSnap(activeRun);
    }
    timeline.progress(clamped);
    if (this.active?.segmentId !== id || this.active.settled) {
      return;
    }
    this.active.progress = clamped;
    const policy = this.findSegment(id).policy;
    if (policy.kind !== 'scrub') {
      return;
    }
    const reachedEnd = this.active.direction === 1 ? clamped >= 0.999 : clamped <= 0.001;
    if (reachedEnd) {
      this.settleRun(this.active, { status: 'completed', runId: this.active.runId, segment: id, direction: this.active.direction }, true);
      return;
    }
    this.armScrubSnap(this.active, timeline, policy.snapAfterIdleMs);
  }

  jumpToEnd(id: SegmentId, direction: Direction): void {
    const timeline = this.built.get(id);
    if (!timeline) {
      throw new Error(`Cannot jumpToEnd on unbuilt segment: ${id}`);
    }
    timeline.jumpToEnd(direction);
  }

  abort(reason: 'seek' | 'superseded' | 'dispose' | 'recovery'): void {
    const run = this.active;
    if (!run || run.settled) {
      return;
    }
    if (run.timeline) {
      this.disposeCachedTimeline(run.segmentId, run.timeline);
    }
    this.settleRun(run, { status: 'aborted', runId: run.runId, segment: run.segmentId, reason }, true);
  }

  snapshot(): SegmentRunSnapshot | null {
    if (!this.active || this.active.settled) {
      return null;
    }
    return {
      runId: this.active.runId,
      segmentId: this.active.segmentId,
      direction: this.active.direction,
      progress: this.active.progress,
      ...(this.active.pausedAt ? { pausedAt: this.active.pausedAt } : {})
    };
  }

  dispose(id: SegmentId): void {
    if (this.active?.segmentId === id) {
      this.abort('dispose');
    }
    this.built.get(id)?.dispose();
    this.built.delete(id);
    this.buildGenerations.set(id, (this.buildGenerations.get(id) ?? 0) + 1);
    this.pendingBuilds.delete(id);
  }

  disposeAll(): void {
    const ids = new Set<SegmentId>([...this.built.keys(), ...this.pendingBuilds.keys()]);
    if (this.active) {
      ids.add(this.active.segmentId);
    }
    for (const id of ids) {
      this.dispose(id);
    }
  }

  private createRun(segmentId: SegmentId, runId: SegmentRunId, direction: Direction): ActiveRun {
    return {
      runId,
      segmentId,
      direction,
      progress: direction === 1 ? 0 : 1,
      settled: false,
      resolve: () => undefined
    };
  }

  private settleRun(run: ActiveRun, result: SegmentResult, notify: boolean): void {
    if (run.settled) {
      return;
    }
    if (run.staged?.frame) {
      cancelScheduledFrame(run.staged.frame);
      delete run.staged.frame;
    }
    this.cancelScrubSnap(run);
    run.settled = true;
    if (this.active?.runId === run.runId) {
      this.active = null;
    }
    if (run.timeline && this.built.get(run.segmentId) === run.timeline) {
      this.disposeCachedTimeline(run.segmentId, run.timeline);
    }

    if (notify) {
      if (result.status === 'completed') {
        queueMailbox(this.mailbox, { type: 'PLAYBACK_DONE', runId: result.runId });
      } else if (result.status === 'failed') {
        queueMailbox(this.mailbox, { type: 'PLAYBACK_FAILED', runId: result.runId, error: result.error });
      } else {
        queueMailbox(this.mailbox, { type: 'SEGMENT_ABORTED', runId: result.runId, reason: result.reason });
      }
    }
    run.resolve(result);
  }

  private cancelScrubSnap(run: ActiveRun): void {
    const scrub = run.scrub;
    if (!scrub) {
      return;
    }
    scrub.generation += 1;
    if (scrub.idleTimer) {
      clearTimeout(scrub.idleTimer);
      delete scrub.idleTimer;
    }
    if (scrub.frame) {
      cancelScheduledFrame(scrub.frame);
      delete scrub.frame;
    }
  }

  private armScrubSnap(run: ActiveRun, timeline: SegmentTimelineHandle, delayMs: number): void {
    const scrub = run.scrub ?? { generation: 0 };
    run.scrub = scrub;
    const generation = scrub.generation + 1;
    scrub.generation = generation;
    scrub.idleTimer = setTimeout(() => {
      delete scrub.idleTimer;
      if (run.settled || this.active?.runId !== run.runId || scrub.generation !== generation) {
        return;
      }
      const start = run.progress;
      const target = run.direction === 1 ? 1 : 0;
      const distance = Math.abs(target - start);
      const durationMs = Math.min(650, Math.max(280, distance * 650));
      const startedAt = performance.now();
      const tick = () => {
        delete scrub.frame;
        if (run.settled || this.active?.runId !== run.runId || scrub.generation !== generation) {
          return;
        }
        const elapsedRatio = Math.min(1, (performance.now() - startedAt) / durationMs);
        const eased = elapsedRatio * elapsedRatio * (3 - 2 * elapsedRatio);
        const next = start + (target - start) * eased;
        timeline.progress(next);
        run.progress = next;
        if (elapsedRatio >= 1) {
          timeline.progress(target);
          run.progress = target;
          this.settleRun(run, {
            status: 'completed',
            runId: run.runId,
            segment: run.segmentId,
            direction: run.direction
          }, true);
          return;
        }
        scrub.frame = scheduleFrame(tick, 16);
      };
      scrub.frame = scheduleFrame(tick, 16);
    }, Math.max(0, delayMs));
  }

  private playStagedLeg(run: ActiveRun, timeline: SegmentTimelineHandle): void {
    const staged = run.staged;
    if (!staged || run.settled) {
      return;
    }
    const legIndex = staged.legIndex;
    const lower = staged.boundaries[legIndex];
    const upper = staged.boundaries[legIndex + 1];
    if (lower === undefined || upper === undefined) {
      this.settleRun(run, {
        status: 'failed',
        runId: run.runId,
        segment: run.segmentId,
        error: new Error(`Invalid stagedSnap leg ${legIndex} for ${run.segmentId}`)
      }, true);
      return;
    }

    const from = run.direction === 1 ? lower : upper;
    const to = run.direction === 1 ? upper : lower;
    const durationMs = this.prefersReducedMotion() ? 0 : Math.max(0, staged.playMs[legIndex] ?? 0);
    run.progress = from;
    timeline.progress(from);
    const preparationGeneration = staged.preparationGeneration + 1;
    staged.preparationGeneration = preparationGeneration;
    const resumedStageIndex = staged.pendingResumeStageIndex;

    const failPreparation = (error: unknown) => {
      if (
        this.active?.runId !== run.runId
        || run.settled
        || staged.preparationGeneration !== preparationGeneration
      ) {
        return;
      }
      this.settleRun(run, {
        status: 'failed',
        runId: run.runId,
        segment: run.segmentId,
        error: asError(error)
      }, true);
    };

    const startClock = () => {
      if (
        this.active?.runId !== run.runId
        || run.settled
        || staged.preparationGeneration !== preparationGeneration
      ) {
        return;
      }
      if (resumedStageIndex !== undefined && staged.pendingResumeStageIndex === resumedStageIndex) {
        delete staged.pendingResumeStageIndex;
        this.reportMilestone({
          key: 'stageResumed',
          segment: run.segmentId,
          runId: run.runId,
          direction: run.direction,
          progress: run.progress,
          stageIndex: resumedStageIndex
        });
      }
      let elapsedMs = 0;
      let lastFrameAt = Date.now();
      const tick = () => {
        delete staged.frame;
        if (this.active?.runId !== run.runId || run.settled) {
          return;
        }
        const now = Date.now();
        const frameDelta = Math.max(0, now - lastFrameAt);
        lastFrameAt = now;
        elapsedMs += Math.min(frameDelta, MAX_STAGED_FRAME_DELTA_MS);
        const elapsedRatio = durationMs <= 0 ? 1 : Math.min(1, elapsedMs / durationMs);
        const progress = from + (to - from) * elapsedRatio;
        try {
          run.progress = progress;
          timeline.progress(progress);
        } catch (error) {
          this.settleRun(run, {
            status: 'failed',
            runId: run.runId,
            segment: run.segmentId,
            error: asError(error)
          }, true);
          return;
        }

        if (elapsedRatio >= 1) {
          this.finishStagedLeg(run);
          return;
        }
        staged.frame = scheduleFrame(tick, Math.min(16, Math.max(1, durationMs - elapsedMs)));
      };

      if (durationMs <= 0) {
        tick();
        return;
      }
      staged.frame = scheduleFrame(tick, Math.min(16, durationMs));
    };

    let readiness: Promise<void> | void;
    try {
      readiness = timeline.prepareLeg?.({
        runId: run.runId,
        segment: run.segmentId,
        direction: run.direction,
        legIndex,
        from,
        to,
        durationMs,
        ...(resumedStageIndex !== undefined ? { resumedStageIndex } : {})
      });
    } catch (error) {
      failPreparation(error);
      return;
    }
    if (!readiness) {
      startClock();
      return;
    }
    void Promise.resolve(readiness).then(startClock, failPreparation);
  }

  private finishStagedLeg(run: ActiveRun): void {
    const staged = run.staged;
    if (!staged || run.settled) {
      return;
    }
    const boundaryIndex = run.direction === 1 ? staged.legIndex + 1 : staged.legIndex;
    const terminalBoundary = run.direction === 1
      ? boundaryIndex === staged.boundaries.length - 1
      : boundaryIndex === 0;
    if (terminalBoundary) {
      this.settleRun(run, {
        status: 'completed',
        runId: run.runId,
        segment: run.segmentId,
        direction: run.direction
      }, true);
      return;
    }

    const stageIndex = boundaryIndex - 1;
    staged.legIndex += run.direction;
    staged.pausedStageIndex = stageIndex;
    run.pausedAt = `stage:${stageIndex}`;
    this.reportMilestone({
      key: 'stagePaused',
      segment: run.segmentId,
      runId: run.runId,
      direction: run.direction,
      progress: run.progress,
      stageIndex
    });
  }

  private findSegment(id: SegmentId): SpineSegmentNode {
    const segment = this.manifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
    if (!segment) {
      throw new Error(`Unknown segment: ${id}`);
    }
    return segment;
  }

  private async resolveTransition(id: SegmentId): Promise<TransitionModule> {
    const registered = this.transitions[id];
    if (registered) {
      return registered;
    }
    if (!this.transitionLoader) {
      throw new Error(`Missing transition module for ${id}`);
    }
    const loaded = await this.transitionLoader(id);
    if (loaded.id !== id) {
      throw new Error(`Transition loader returned ${loaded.id} for ${id}`);
    }
    this.transitions[id] = loaded;
    return loaded;
  }

  private nextRunId(): SegmentRunId {
    this.runCounter += 1;
    return `${this.actorEpoch}:${this.runCounter}`;
  }

  private disposeCachedTimeline(id: SegmentId, timeline: SegmentTimelineHandle): void {
    timeline.dispose();
    if (this.built.get(id) === timeline) {
      this.built.delete(id);
    }
  }

  private reportMilestone(milestone: MilestoneReport): void {
    if (milestone.key === 'stagePaused') {
      queueMailbox(this.mailbox, {
        type: 'STAGE_PAUSED',
        runId: milestone.runId,
        segment: milestone.segment,
        stageIndex: milestone.stageIndex ?? 0
      });
      return;
    }
    if (milestone.key === 'stageResumed') {
      queueMailbox(this.mailbox, {
        type: 'STAGE_RESUMED',
        runId: milestone.runId,
        segment: milestone.segment,
        stageIndex: milestone.stageIndex ?? 0
      });
      return;
    }
    if (milestone.key === 'mediaReady') {
      queueMailbox(this.mailbox, {
        type: 'MEDIA_READY',
        key: milestone.key,
        runId: milestone.runId
      });
    }
  }
}
