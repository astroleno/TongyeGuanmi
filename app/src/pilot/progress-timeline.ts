import { applyLayerVisibility } from './visibility';
import type {
  CopyCue,
  Direction,
  LayerHandle,
  LayerVisibilityState,
  SegmentTimelineHandle
} from '../story/types';

export type PilotTimelineSample = {
  from: LayerVisibilityState;
  to: LayerVisibilityState;
  copyCueActive?: boolean;
};

export type PilotProgressTimelineOptions = {
  from: LayerHandle;
  to: LayerHandle;
  durationMs: number;
  copyCue?: CopyCue;
  sample(progress: number): PilotTimelineSample;
  render?(progress: number): void;
};

export class PilotProgressTimeline implements SegmentTimelineHandle {
  readonly labels = { start: 0, end: 1 } as const;
  readonly pauses: readonly string[] = [];

  private readonly from: LayerHandle;
  private readonly to: LayerHandle;
  private readonly durationMs: number;
  private readonly copyCue: CopyCue | undefined;
  private readonly sampleAt: (progress: number) => PilotTimelineSample;
  private readonly renderAt: ((progress: number) => void) | undefined;
  private progressValue = 0;
  private disposed = false;
  private copyCueActive = false;
  private copyCueEverActivated = false;
  private copyCueActivations = 0;
  private animationFrame = 0;

  constructor(options: PilotProgressTimelineOptions) {
    this.from = options.from;
    this.to = options.to;
    this.durationMs = options.durationMs;
    this.copyCue = options.copyCue;
    this.sampleAt = options.sample;
    this.renderAt = options.render;
    this.progress(0);
  }

  get snapshot() {
    return {
      progress: this.progressValue,
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
    const sample = this.sampleAt(clamped);
    this.progressValue = clamped;
    this.updateCopyCue(clamped, sample.copyCueActive);
    applyLayerVisibility(this.from, sample.from);
    applyLayerVisibility(this.to, sample.to);
    this.renderAt?.(clamped);
  }

  jumpToEnd(direction: Direction): void {
    this.progress(direction === 1 ? 1 : 0);
  }

  sample(progress: number): PilotTimelineSample {
    const clamped = Math.min(1, Math.max(0, progress));
    const sample = this.sampleAt(clamped);
    const copyCueActive = this.copyCue ? clamped >= this.copyCue.atProgress : sample.copyCueActive;
    return copyCueActive === undefined ? sample : { ...sample, copyCueActive };
  }

  dispose(): void {
    this.disposed = true;
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
  }

  private updateCopyCue(progress: number, explicitActive: boolean | undefined): void {
    const nextActive = this.copyCue ? progress >= this.copyCue.atProgress : Boolean(explicitActive);
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
    if (delta === 0 || this.durationMs <= 0) {
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
        this.animationFrame = requestAnimationFrame(tick);
      };
      this.animationFrame = requestAnimationFrame(tick);
    });
  }
}
