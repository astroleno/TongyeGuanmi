import { fromSyntheticVisibility } from './visibility-predicate';
import type {
  CopyCue,
  Direction,
  LayerHandle,
  LayerVisibilityState,
  SceneComponentProps,
  SceneModule,
  SegmentTimelineHandle,
  TransitionContext,
  TransitionModule
} from './types';

export type SyntheticSceneModule = SceneModule & {
  fixture: 'source' | 'target' | 'retiring-sentinel';
};

export type SyntheticTimelineOptions = {
  copyCue?: CopyCue;
  durationMs?: number;
  reducedMotion?: boolean;
  stagedStops?: readonly number[];
};

export type SyntheticTimelineSnapshot = {
  progress: number;
  from: LayerVisibilityState;
  to: LayerVisibilityState;
  copyCueActive: boolean;
  copyCueActivations: number;
};

function SyntheticSceneComponent({ scene, hidden, copyCueActive = false, registerHandle }: SceneComponentProps) {
  const label =
    scene === 'hero'
      ? { kicker: 'Synthetic source', title: 'Source copy fixture' }
      : scene === 'pattern'
        ? { kicker: 'Synthetic target', title: 'Target copy fixture' }
        : { kicker: 'Synthetic sentinel', title: 'Retiring path fixture' };

  return (
    <div className="synthetic-scene" data-synthetic-scene={scene} data-hidden={hidden}>
      <p className="synthetic-scene__kicker">{label.kicker}</p>
      <h2 ref={(element) => registerHandle?.('copy', element)} data-copy-cue={copyCueActive}>
        {label.title}
      </h2>
      <div ref={(element) => registerHandle?.('media', element)} className="synthetic-scene__media" aria-hidden="true" />
    </div>
  );
}

export const syntheticSourceScene: SyntheticSceneModule = {
  id: 'hero',
  fixture: 'source',
  Component: SyntheticSceneComponent,
  requiredHandles: ['copy', 'media'],
  preload: () => ({ milestones: ['targetReady'] })
};

export const syntheticTargetScene: SyntheticSceneModule = {
  id: 'pattern',
  fixture: 'target',
  Component: SyntheticSceneComponent,
  requiredHandles: ['copy', 'media'],
  preload: () => ({ milestones: ['targetReady', 'mediaReady'] })
};

export const syntheticRetiringSentinelScene: SyntheticSceneModule = {
  id: 'star-map',
  fixture: 'retiring-sentinel',
  Component: SyntheticSceneComponent,
  requiredHandles: ['copy', 'media'],
  preload: () => ({ milestones: ['targetReady'] })
};

export const syntheticCopyCue: CopyCue = {
  targetScene: 'pattern',
  atProgress: 0.5
};

export const syntheticRetiringCopyCue: CopyCue = {
  targetScene: 'star-map',
  atProgress: 0.5
};

function visibility(progress: number, side: 'from' | 'to'): LayerVisibilityState {
  const clamped = Math.min(1, Math.max(0, progress));
  const opacity = side === 'from' ? 1 - clamped : clamped;
  return fromSyntheticVisibility({
    mounted: true,
    opacity,
    visibility: opacity > 0.001 ? 'visible' : 'hidden',
    inert: true,
    pointerEvents: 'none'
  });
}

function applyVisibility(layer: LayerHandle, state: LayerVisibilityState): void {
  layer.setVisibility(state);
  const element = layer.element;
  if (!element) {
    return;
  }
  element.style.opacity = String(state.opacity);
  element.style.visibility = state.visible ? 'visible' : 'hidden';
  element.style.pointerEvents = state.pointerEvents;
  element.inert = state.inert;
  element.setAttribute('aria-hidden', state.inert ? 'true' : 'false');
  element.dataset.visible = String(state.visible);
  element.dataset.interactable = String(!state.inert && state.pointerEvents === 'auto');
}

export class SyntheticSegmentTimeline implements SegmentTimelineHandle {
  readonly labels: Readonly<Record<string, number>>;
  readonly pauses: readonly string[];

  private readonly from: LayerHandle;
  private readonly to: LayerHandle;
  private readonly copyCue: CopyCue | undefined;
  private readonly durationMs: number;
  private progressValue = 0;
  private copyCueActive = false;
  private copyCueEverActivated = false;
  private copyCueActivations = 0;
  private disposed = false;

  constructor(context: Pick<TransitionContext, 'from' | 'to' | 'segment'>, options: SyntheticTimelineOptions = {}) {
    this.from = context.from;
    this.to = context.to;
    this.copyCue = options.copyCue ?? context.segment.copyCue;
    this.durationMs = options.durationMs ?? 120;
    const stops = options.stagedStops ?? (context.segment.policy.kind === 'stagedSnap' ? context.segment.policy.stops : []);
    this.labels = {
      start: 0,
      end: 1,
      ...Object.fromEntries(stops.map((stop, index) => [`stage:${index}`, stop]))
    };
    this.pauses = stops.map((_, index) => `stage:${index}`);
    this.progress(0);
  }

  get snapshot(): SyntheticTimelineSnapshot {
    const sample = this.sample(this.progressValue);
    return {
      progress: this.progressValue,
      from: sample.from,
      to: sample.to,
      copyCueActive: this.copyCueActive,
      copyCueActivations: this.copyCueActivations
    };
  }

  play(): Promise<void> {
    return this.animateTo(1);
  }

  reverse(): Promise<void> {
    return this.animateTo(0);
  }

  progress(value: number): void {
    if (this.disposed) {
      return;
    }
    const clamped = Math.min(1, Math.max(0, value));
    const from = visibility(clamped, 'from');
    const to = visibility(clamped, 'to');
    this.progressValue = clamped;
    this.updateCopyCue(clamped);
    applyVisibility(this.from, from);
    applyVisibility(this.to, to);
  }

  jumpToEnd(direction: Direction): void {
    this.progress(direction === 1 ? 1 : 0);
  }

  dispose(): void {
    this.disposed = true;
  }

  sample(progress: number): SyntheticTimelineSnapshot {
    const clamped = Math.min(1, Math.max(0, progress));
    const cueActive = this.copyCue ? clamped >= this.copyCue.atProgress : false;
    return {
      progress: clamped,
      from: visibility(clamped, 'from'),
      to: visibility(clamped, 'to'),
      copyCueActive: cueActive,
      copyCueActivations: this.copyCueActivations
    };
  }

  private updateCopyCue(progress: number): void {
    if (!this.copyCue) {
      this.copyCueActive = false;
      return;
    }
    const nextActive = progress >= this.copyCue.atProgress;
    if (nextActive && !this.copyCueActive && !this.copyCueEverActivated) {
      this.copyCueActivations += 1;
      this.copyCueEverActivated = true;
    }
    this.copyCueActive = nextActive;
    if (this.to.element) {
      this.to.element.dataset.copyCueActive = String(nextActive);
      this.to.element.dataset.copyCueActivations = String(this.copyCueActivations);
    }
  }

  private animateTo(target: number): Promise<void> {
    const start = this.progressValue;
    const delta = target - start;
    if (delta === 0 || this.durationMs === 0) {
      this.progress(target);
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      const startedAt = performance.now();
      const tick = (now: number) => {
        if (this.disposed) {
          resolve();
          return;
        }
        const elapsed = now - startedAt;
        const progress = Math.min(1, elapsed / this.durationMs);
        this.progress(start + delta * progress);
        if (progress >= 1) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }
}

export function createSyntheticTransitionModule(options: SyntheticTimelineOptions = {}): TransitionModule {
  return {
    id: 'hero-pattern',
    requiredMilestones: ['targetReady', 'mediaReady', 'buildReady'],
    copyCue: options.copyCue ?? syntheticCopyCue,
    buildTimeline: (context) => new SyntheticSegmentTimeline(context, options)
  };
}

export function createSyntheticRetiringTransitionModule(options: SyntheticTimelineOptions = {}): TransitionModule {
  return {
    id: 'pattern-star-map',
    requiredMilestones: ['targetReady', 'buildReady'],
    copyCue: options.copyCue ?? syntheticRetiringCopyCue,
    buildTimeline: (context) => new SyntheticSegmentTimeline(context, {
      ...options,
      copyCue: options.copyCue ?? syntheticRetiringCopyCue
    })
  };
}
