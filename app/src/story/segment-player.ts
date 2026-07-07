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
  stage?: StageHandle;
  mailbox?: SegmentPlayerMailbox;
  actorEpoch?: string;
  prefersReducedMotion?: boolean | (() => boolean);
};

type ActiveRun = {
  runId: SegmentRunId;
  segmentId: SegmentId;
  direction: Direction;
  progress: number;
  timeline?: SegmentTimelineHandle;
  settled: boolean;
  resolve(result: SegmentResult): void;
};

export class BuildTimeoutError extends Error {
  readonly segment: SegmentId;

  constructor(segment: SegmentId, timeoutMs: number) {
    super(`ensureBuilt timed out for ${segment} after ${timeoutMs}ms`);
    this.name = 'BuildTimeoutError';
    this.segment = segment;
  }
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
  private readonly stage: StageHandle;
  private readonly mailbox: SegmentPlayerMailbox | undefined;
  private readonly actorEpoch: string;
  private readonly prefersReducedMotion: () => boolean;
  private readonly built = new Map<SegmentId, SegmentTimelineHandle>();
  private readonly pendingScrubProgress = new Map<SegmentId, number>();
  private active: ActiveRun | null = null;
  private runCounter = 0;

  constructor(options: SegmentPlayerOptions) {
    this.manifest = options.manifest ?? storyManifest;
    this.transitions = options.transitions;
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

    const segment = this.findSegment(id);
    const transition = this.transitions[id];
    if (!transition) {
      return Promise.reject(new Error(`Missing transition module for ${id}`));
    }

    const timeoutMs = options.timeoutMs ?? segment.buildTimeoutMs ?? this.manifest.defaults.buildTimeoutMs;
    const runId = options.runId ?? this.nextRunId();
    const prepareToken = options.prepareToken ?? `${this.actorEpoch}:prepare:0`;
    const direction = options.direction ?? 1;
    const from = this.stage.ensureLayer(segment.from, direction === 1 ? 'current' : 'next');
    const to = this.stage.ensureLayer(segment.to, direction === 1 ? 'next' : 'current');

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const buildPromise = Promise.resolve(
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
    );
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeout = setTimeout(() => reject(new BuildTimeoutError(id, timeoutMs)), timeoutMs);
    });

    return Promise.race([buildPromise, timeoutPromise])
      .then((timeline) => {
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
      });
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
    timeline.progress(clamped);
    if (this.active?.segmentId !== id || this.active.settled) {
      return;
    }
    this.active.progress = clamped;
    if (this.findSegment(id).policy.kind !== 'scrub') {
      return;
    }
    const reachedEnd = this.active.direction === 1 ? clamped >= 0.999 : clamped <= 0.001;
    if (reachedEnd) {
      this.settleRun(this.active, { status: 'completed', runId: this.active.runId, segment: id, direction: this.active.direction }, true);
    }
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
      progress: this.active.progress
    };
  }

  dispose(id: SegmentId): void {
    if (this.active?.segmentId === id) {
      this.abort('dispose');
    }
    this.built.get(id)?.dispose();
    this.built.delete(id);
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
    run.settled = true;
    if (this.active?.runId === run.runId) {
      this.active = null;
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

  private findSegment(id: SegmentId): SpineSegmentNode {
    const segment = this.manifest.nodes.find((node): node is SpineSegmentNode => node.kind === 'segment' && node.id === id);
    if (!segment) {
      throw new Error(`Unknown segment: ${id}`);
    }
    return segment;
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
