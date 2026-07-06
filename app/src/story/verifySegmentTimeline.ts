import { isVisuallyVisible } from './visibility-predicate';
import type { SegmentPolicy, SegmentTimelineHandle } from './types';

export type SegmentTimelineVerification = {
  labels: readonly string[];
  sampledProgress: readonly number[];
  maxVisibleLayers: number;
  copyCueCrossed: boolean;
  stagedPauses: readonly string[];
};

export type VerifySegmentTimelineOptions = {
  policy?: SegmentPolicy;
  copyCueAtProgress?: number;
  reducedMotion?: boolean;
};

function assertLabel(timeline: SegmentTimelineHandle, label: string): void {
  if (!timeline.labels || timeline.labels[label] === undefined) {
    throw new Error(`Segment timeline is missing required label: ${label}`);
  }
}

function samplePoints(options: VerifySegmentTimelineOptions): number[] {
  const points = new Set([0, 0.001, 0.25, 0.5, 0.75, 0.999, 1]);
  if (options.copyCueAtProgress !== undefined) {
    points.add(Math.max(0, options.copyCueAtProgress - 0.001));
    points.add(options.copyCueAtProgress);
    points.add(Math.min(1, options.copyCueAtProgress + 0.001));
  }
  if (options.policy?.kind === 'stagedSnap') {
    for (const stop of options.policy.stops) {
      points.add(Math.max(0, stop - 0.001));
      points.add(stop);
      points.add(Math.min(1, stop + 0.001));
    }
  }
  return [...points].sort((left, right) => left - right);
}

export function verifySegmentTimeline(
  timeline: SegmentTimelineHandle,
  options: VerifySegmentTimelineOptions = {}
): SegmentTimelineVerification {
  assertLabel(timeline, 'start');
  assertLabel(timeline, 'end');
  if (!timeline.sample) {
    throw new Error('Segment timeline must expose sample(progress) for R2 verification');
  }

  const sampledProgress = samplePoints(options);
  let maxVisibleLayers = 0;
  let copyCueCrossed = false;

  for (const progress of sampledProgress) {
    const sample = timeline.sample(progress);
    const visibleCount = [sample.from, sample.to].filter(isVisuallyVisible).length;
    maxVisibleLayers = Math.max(maxVisibleLayers, visibleCount);
    if (visibleCount === 0) {
      throw new Error(`Segment timeline produced a blank frame at progress ${progress}`);
    }
    if (visibleCount > 2) {
      throw new Error(`Segment timeline exceeded two visible layers at progress ${progress}`);
    }
    if (options.copyCueAtProgress !== undefined && progress >= options.copyCueAtProgress && sample.copyCueActive) {
      copyCueCrossed = true;
    }
  }

  const start = timeline.sample(0);
  const end = timeline.sample(1);
  if (!isVisuallyVisible(start.from) || isVisuallyVisible(start.to)) {
    throw new Error('Segment timeline start state must show from and hide to');
  }
  if (!isVisuallyVisible(end.to)) {
    throw new Error('Segment timeline end state must show to');
  }

  const stagedPauses = options.policy?.kind === 'stagedSnap' ? options.policy.stops.map((_, index) => `stage:${index}`) : [];
  for (const pause of stagedPauses) {
    if (!timeline.pauses?.includes(pause) || timeline.labels?.[pause] === undefined) {
      throw new Error(`Segment timeline is missing stagedSnap pause label: ${pause}`);
    }
  }
  if (options.policy?.kind === 'stagedSnap' && options.policy.playMs.length !== options.policy.stops.length + 1) {
    throw new Error('stagedSnap playMs must have stops.length + 1 entries');
  }

  if (options.copyCueAtProgress !== undefined && !copyCueCrossed) {
    throw new Error('Segment timeline did not activate copyCue at the declared progress');
  }

  return {
    labels: Object.keys(timeline.labels ?? {}).sort(),
    sampledProgress,
    maxVisibleLayers,
    copyCueCrossed,
    stagedPauses
  };
}
