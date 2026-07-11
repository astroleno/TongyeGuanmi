import { isVisuallyVisible } from './visibility-predicate';
import type { SegmentPolicy, SegmentTimelineHandle } from './types';

export type SegmentTimelineVerification = {
  labels: readonly string[];
  sampledProgress: readonly number[];
  maxVisibleLayers: number;
  copyCueCrossed: boolean;
  stagedPauses: readonly string[];
  stableSceneIdentity: boolean;
  reverseSymmetric: boolean;
  presentationSymmetric: boolean;
  disposeInvariant: boolean;
  disposedEndpoints: readonly number[];
  effectOnlyCanvas: boolean;
};

export type DisposeEndpointTimelines = Readonly<{
  start: SegmentTimelineHandle;
  end: SegmentTimelineHandle;
}>;

export type VerifySegmentTimelineOptions = {
  policy?: SegmentPolicy;
  copyCueAtProgress?: number;
  reducedMotion?: boolean;
  requireStableSceneIdentity?: boolean;
  requirePresentation?: boolean;
  disposeEndpointTimelines?: DisposeEndpointTimelines;
  requireEffectOnlyCanvas?: boolean;
};

type StyleDeclarationLike = {
  readonly length?: number;
  item?(index: number): string;
  getPropertyValue?(name: string): string;
  [key: string]: unknown;
};

const PRESENTATION_STYLE_PROPERTIES = [
  'opacity',
  'visibility',
  'display',
  'transform',
  'filter',
  'backdrop-filter',
  'mix-blend-mode',
  'clip-path',
  '-webkit-clip-path',
  'mask-image',
  '-webkit-mask-image',
  'background',
  'background-color',
  'background-image',
  'color',
  'left',
  'top',
  'right',
  'bottom',
  'width',
  'height'
] as const;

function camelCaseProperty(property: string): string {
  return property.replace(/^-/, '').replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

function stylePropertyNames(style: StyleDeclarationLike | null | undefined): string[] {
  if (!style) {
    return [];
  }
  const names: string[] = [];
  const length = typeof style.length === 'number' ? style.length : 0;
  for (let index = 0; index < length; index += 1) {
    const name = style.item?.(index) ?? String(style[index] ?? '');
    if (name.startsWith('--')) {
      names.push(name);
    }
  }
  return names;
}

function readStyleProperty(
  property: string,
  computed: StyleDeclarationLike | null,
  inline: StyleDeclarationLike | null
): string {
  const computedValue = computed?.getPropertyValue?.(property)?.trim() ?? '';
  if (computedValue) {
    return computedValue;
  }
  const inlineValue = inline?.getPropertyValue?.(property)?.trim() ?? '';
  if (inlineValue) {
    return inlineValue;
  }
  const key = camelCaseProperty(property);
  const direct = inline?.[key] ?? inline?.[property];
  return typeof direct === 'string' ? direct.trim() : '';
}

function computedStyleFor(element: HTMLElement): StyleDeclarationLike | null {
  const view = element.ownerDocument?.defaultView
    ?? (typeof window === 'undefined' ? null : window);
  try {
    const style = view?.getComputedStyle?.(element);
    return (style as unknown as StyleDeclarationLike | undefined) ?? null;
  } catch {
    return null;
  }
}

function presentationDataset(element: HTMLElement): Record<string, string> {
  return Object.fromEntries(
    Object.entries(element.dataset ?? {})
      .filter(([key]) => {
        if (key === 'mediaKey' || key === 'r3Scene' || key === 'r4Scene') {
          return true;
        }
        if (!/progress/i.test(key)) {
          return false;
        }
        return !/^r4/i.test(key)
          && !/(?:transition|reveal|mask)progress/i.test(key);
      })
      .map(([key, value]) => [key, value ?? ''] as const)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function mediaPresentation(element: HTMLElement): Record<string, string | number | boolean | null> | null {
  const candidate = element as HTMLElement & {
    currentSrc?: string;
    src?: string;
    currentTime?: number;
    paused?: boolean;
    playbackRate?: number;
    loop?: boolean;
    poster?: string;
  };
  if (typeof candidate.currentTime !== 'number') {
    return null;
  }
  return {
    src: candidate.currentSrc || candidate.src || '',
    currentTime: Number.isFinite(candidate.currentTime) ? Number(candidate.currentTime.toFixed(4)) : -1,
    paused: typeof candidate.paused === 'boolean' ? candidate.paused : null,
    playbackRate: typeof candidate.playbackRate === 'number' ? candidate.playbackRate : null,
    loop: typeof candidate.loop === 'boolean' ? candidate.loop : null,
    poster: candidate.poster ?? ''
  };
}

function scenePresentation(root: HTMLElement): unknown {
  let descendants: HTMLElement[] = [];
  try {
    descendants = Array.from(root.querySelectorAll<HTMLElement>('*'));
  } catch {
    descendants = [];
  }
  const nodes = [root, ...descendants];
  return {
    text: (root.textContent ?? '').replace(/\s+/g, ' ').trim(),
    canvasCount: nodes.filter((node) => String(node.tagName ?? '').toLowerCase() === 'canvas').length,
    nodes: nodes.map((node, index) => {
      const inline = node.style as unknown as StyleDeclarationLike | null;
      const computed = computedStyleFor(node);
      const propertyNames = [...new Set([
        ...PRESENTATION_STYLE_PROPERTIES,
        ...stylePropertyNames(inline),
        ...stylePropertyNames(computed)
      ])].sort();
      const styles = Object.fromEntries(
        propertyNames
          .map((property) => [property, readStyleProperty(property, computed, inline)] as const)
          .filter(([, value]) => value !== '')
      );
      return {
        index,
        tag: String(node.tagName ?? '').toLowerCase(),
        className: typeof node.className === 'string' ? node.className : '',
        dataset: presentationDataset(node),
        styles,
        media: mediaPresentation(node)
      };
    })
  };
}

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

function sampleSignature(sample: ReturnType<NonNullable<SegmentTimelineHandle['sample']>>): string {
  return JSON.stringify({
    from: sample.from,
    to: sample.to,
    copyCueActive: sample.copyCueActive ?? null
  });
}

function presentationSignature(
  timeline: SegmentTimelineHandle,
  sample: ReturnType<NonNullable<SegmentTimelineHandle['sample']>>
): string {
  const roots = timeline.rootIdentity?.();
  if (!roots?.from || !roots.to) {
    throw new Error('Segment timeline must expose mounted from/to roots for presentation verification');
  }
  return JSON.stringify({
    from: isVisuallyVisible(sample.from) ? scenePresentation(roots.from) : null,
    to: isVisuallyVisible(sample.to) ? scenePresentation(roots.to) : null
  });
}

function firstPresentationDifference(expected: unknown, actual: unknown, path = '$'): string {
  if (Object.is(expected, actual)) {
    return '';
  }
  if (typeof expected !== 'object' || expected === null || typeof actual !== 'object' || actual === null) {
    return `${path}: ${JSON.stringify(expected)} !== ${JSON.stringify(actual)}`;
  }
  const expectedRecord = expected as Record<string, unknown>;
  const actualRecord = actual as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(expectedRecord), ...Object.keys(actualRecord)])].sort();
  for (const key of keys) {
    const difference = firstPresentationDifference(expectedRecord[key], actualRecord[key], `${path}.${key}`);
    if (difference) {
      return difference;
    }
  }
  return '';
}

function presentationDifference(expected: string, actual: string): string {
  try {
    return firstPresentationDifference(JSON.parse(expected), JSON.parse(actual));
  } catch {
    return 'presentation serialization differs';
  }
}

function isEffectOnlyCanvas(canvas: HTMLCanvasElement): boolean {
  return canvas.dataset.r4InkEffectOnly === 'true'
    && canvas.dataset.r4InkTargetReady === undefined
    && canvas.dataset.r4InkTextureUploads === undefined
    && canvas.dataset.r4InkSnapshotCaptures === undefined
    && canvas.dataset.inkTextureReady === undefined;
}

function verifyDisposeEndpoint(timeline: SegmentTimelineHandle, endpoint: 0 | 1): void {
  if (!timeline.sample || !timeline.rootIdentity) {
    throw new Error(`p=${endpoint} dispose invariance requires sample() and rootIdentity()`);
  }
  timeline.progress(endpoint);
  const sampleBefore = timeline.sample(endpoint);
  const sampleBeforeSignature = sampleSignature(sampleBefore);
  const rootsBefore = timeline.rootIdentity();
  if (!rootsBefore.from || !rootsBefore.to) {
    throw new Error(`p=${endpoint} dispose invariance requires mounted from/to roots`);
  }
  const presentationBefore = presentationSignature(timeline, sampleBefore);
  const effectCanvases = timeline.effectCanvases?.() ?? [];
  timeline.dispose();
  const rootsAfter = timeline.rootIdentity();
  if (rootsAfter.from !== rootsBefore.from || rootsAfter.to !== rootsBefore.to) {
    throw new Error(`p=${endpoint} dispose root identity invariance failed`);
  }
  const sampleAfter = timeline.sample(endpoint);
  if (sampleSignature(sampleAfter) !== sampleBeforeSignature) {
    throw new Error(`p=${endpoint} dispose visibility invariance failed`);
  }
  const presentationAfter = presentationSignature(timeline, sampleAfter);
  const disposeDifference = presentationDifference(presentationBefore, presentationAfter);
  if (disposeDifference) {
    throw new Error(
      `p=${endpoint} dispose presentation invariance failed: ${disposeDifference}`
    );
  }
  if (!effectCanvases.every((canvas) => canvas.parentElement === null || canvas.isConnected === false)) {
    throw new Error(`p=${endpoint} dispose effect cleanup invariance failed`);
  }
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
  const verifyRoots = options.requireStableSceneIdentity === true || options.requirePresentation === true;
  const initialRoots = verifyRoots
    ? timeline.rootIdentity?.()
    : undefined;
  const forwardSamples = new Map<number, string>();
  const forwardPresentations = new Map<number, string>();

  if (verifyRoots && (!initialRoots?.from || !initialRoots.to)) {
    throw new Error('Segment timeline must expose mounted from/to root identity for R4 verification');
  }

  for (const progress of sampledProgress) {
    timeline.progress(progress);
    if (verifyRoots) {
      const roots = timeline.rootIdentity?.();
      if (roots?.from !== initialRoots?.from || roots?.to !== initialRoots?.to) {
        throw new Error(`Segment timeline replaced a canonical Scene root at progress ${progress}`);
      }
    }
    const sample = timeline.sample(progress);
    forwardSamples.set(progress, sampleSignature(sample));
    if (options.requirePresentation) {
      forwardPresentations.set(progress, presentationSignature(timeline, sample));
    }
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

  for (const progress of [...sampledProgress].reverse()) {
    timeline.progress(progress);
    if (verifyRoots) {
      const roots = timeline.rootIdentity?.();
      if (roots?.from !== initialRoots?.from || roots?.to !== initialRoots?.to) {
        throw new Error(`Segment timeline replaced a canonical Scene root during reverse traversal at progress ${progress}`);
      }
    }
    const reverseSample = timeline.sample(progress);
    if (sampleSignature(reverseSample) !== forwardSamples.get(progress)) {
      throw new Error(`Segment timeline violated reverse symmetry at progress ${progress}`);
    }
    if (options.requirePresentation) {
      const forwardPresentation = forwardPresentations.get(progress) ?? '';
      const reversePresentation = presentationSignature(timeline, reverseSample);
      const reverseDifference = presentationDifference(forwardPresentation, reversePresentation);
      if (reverseDifference) {
        throw new Error(
          `Segment timeline violated presentation reverse symmetry at progress ${progress}: ${reverseDifference}`
        );
      }
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

  const effectCanvases = timeline.effectCanvases?.() ?? [];
  const effectOnlyCanvas = effectCanvases.every(isEffectOnlyCanvas);
  if (options.requireEffectOnlyCanvas && (effectCanvases.length === 0 || !effectOnlyCanvas)) {
    throw new Error('Segment timeline must expose only effect-only canvases with no Scene texture ownership');
  }

  const disposedEndpoints: number[] = [];
  if (options.disposeEndpointTimelines) {
    if (options.disposeEndpointTimelines.start === options.disposeEndpointTimelines.end) {
      throw new Error('Dispose endpoint verification requires independent p=0 and p=1 timelines');
    }
    if (
      options.disposeEndpointTimelines.start === timeline
      || options.disposeEndpointTimelines.end === timeline
    ) {
      throw new Error('Dispose endpoint verification requires probes independent from the traversal timeline');
    }
    verifyDisposeEndpoint(options.disposeEndpointTimelines.start, 0);
    disposedEndpoints.push(0);
    verifyDisposeEndpoint(options.disposeEndpointTimelines.end, 1);
    disposedEndpoints.push(1);
  }

  return {
    labels: Object.keys(timeline.labels ?? {}).sort(),
    sampledProgress,
    maxVisibleLayers,
    copyCueCrossed,
    stagedPauses,
    stableSceneIdentity: verifyRoots,
    reverseSymmetric: true,
    presentationSymmetric: options.requirePresentation === true,
    disposeInvariant: disposedEndpoints.length === 2,
    disposedEndpoints,
    effectOnlyCanvas
  };
}
