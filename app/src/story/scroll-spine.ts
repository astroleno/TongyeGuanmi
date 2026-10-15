import { canonicalSceneIds, canonicalSegments } from './canonical-spine';
import { storyManifest } from './manifest';
import { PHONE_CRANE_CONTACT_DURATION_MS } from './timings';
import type { SpineSegmentNode } from './types';

export type ScrollSceneId = (typeof canonicalSceneIds)[number];
export type ScrollSegmentId = (typeof canonicalSegments)[number]['id'];
export type ScrollPlatform = 'desktop' | 'phone';
// Retain the existing one-screen ink cadence, then scale every active timeline
// by that same ratio. Legacy gesture/delay waits never allocate scroll space.
const SCROLL_MS_PER_SCREEN = 1200;
const segmentTimings = new Map(storyManifest.nodes.filter((node): node is SpineSegmentNode => node.kind === 'segment')
  .map(node => [node.id, node]));
export const scrollSegmentLengths = Object.freeze(Object.fromEntries(canonicalSegments.map(({ id }) =>
  [id, segmentTimings.get(id)!.virtualDuration / SCROLL_MS_PER_SCREEN])) as Record<ScrollSegmentId, number>);
const phoneSegmentLengths = Object.freeze({ ...scrollSegmentLengths,
  'crane-contact': PHONE_CRANE_CONTACT_DURATION_MS / SCROLL_MS_PER_SCREEN });

/** Scroll progress is normalized active time; scene progress keeps the original
 * phase stops. In particular Figure2's 2600/1500 ms split is not a 72/28 split. */
export function scrollAuthoredProgress(id: ScrollSegmentId, rawProgress: number): number {
  const p = Math.min(1, Math.max(0, Number.isNaN(rawProgress) ? 0 : rawProgress));
  const segment = segmentTimings.get(id)!;
  const policy = segment.policy;
  if (policy.kind !== 'stagedSnap' || p === 0 || p === 1) return p;
  let remaining = p * segment.virtualDuration;
  let start = 0;
  for (const [i, duration] of policy.playMs.entries()) {
    const end = policy.stops[i] ?? 1;
    if (remaining <= duration) return start + (end - start) * remaining / duration;
    remaining -= duration; start = end;
  }
  return 1;
}
export const scrollReadingScenes = new Set<ScrollSceneId>([
  'method-top', 'figure2-proof', 'brand', 'services', 'lab', 'education', 'contact'
]);

export type ScrollRange = Readonly<{
  id: string; kind: 'hold' | 'segment'; start: number; end: number;
  scene: ScrollSceneId; target: ScrollSceneId; segment: ScrollSegmentId | null;
  reading: boolean;
}>;
export type ScrollSceneLayout = Readonly<{
  scene: ScrollSceneId; start: number; readingEnd: number; end: number; contentHeight: number;
}>;
export type ScrollSpine = Readonly<{
  ranges: readonly ScrollRange[]; scenes: readonly ScrollSceneLayout[];
  viewportHeight: number; totalHeight: number; maxScroll: number; reducedMotion: boolean;
}>;
export type ScrollPosition = Readonly<{
  rangeId: string; kind: 'hold' | 'segment'; scene: ScrollSceneId; target: ScrollSceneId;
  segment: ScrollSegmentId | null; progress: number; scroll: number; readingOffset: number;
}>;
export type ScrollAnchor = Readonly<{
  rangeId: string; progress: number; readingOffset?: number;
}>;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Layout is rebuilt only on real reflow, never by animation callbacks. */
export function createScrollSpine({ viewportHeight, contentHeights = {}, reducedMotion = false, platform = 'desktop' }: {
  viewportHeight: number;
  contentHeights?: Partial<Record<ScrollSceneId, number>>;
  reducedMotion?: boolean;
  platform?: ScrollPlatform;
}): ScrollSpine {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) throw new Error('Invalid scroll viewport height');
  const ranges: ScrollRange[] = [];
  const scenes: ScrollSceneLayout[] = [];
  let cursor = 0;
  for (const [i, scene] of canonicalSceneIds.entries()) {
    const start = cursor;
    const supplied = contentHeights[scene];
    const contentHeight = Math.max(viewportHeight, supplied && Number.isFinite(supplied) ? supplied : 0);
    const reading = scrollReadingScenes.has(scene);
    const rest = scene === 'hero' || scene === 'pattern' || scene === 'star-map' ? viewportHeight * .5 : 0;
    // Zero-length holds are landmarks, not empty scroll traps. The immediately
    // following transition renders exactly that scene at progress zero.
    cursor += reducedMotion ? contentHeight : reading ? contentHeight - viewportHeight : rest;
    const readingEnd = cursor;
    ranges.push(Object.freeze({ id: `hold:${scene}`, kind: 'hold', start, end: cursor,
      scene, target: scene, segment: null, reading }));
    const segment = canonicalSegments[i];
    if (segment && !reducedMotion) {
      const segmentStart = cursor;
      cursor += (platform === 'phone' ? phoneSegmentLengths : scrollSegmentLengths)[segment.id] * viewportHeight;
      ranges.push(Object.freeze({ id: segment.id, kind: 'segment', start: segmentStart, end: cursor,
        scene, target: segment.to, segment: segment.id, reading: false }));
    }
    scenes.push(Object.freeze({ scene, start, readingEnd, end: cursor, contentHeight }));
  }
  return Object.freeze({ ranges: Object.freeze(ranges), scenes: Object.freeze(scenes),
    viewportHeight, totalHeight: reducedMotion ? cursor : cursor + viewportHeight,
    maxScroll: reducedMotion ? Math.max(0, cursor - viewportHeight) : cursor, reducedMotion });
}

/** Absolute, history-independent lookup; a fast input may skip any number of ranges. */
export function locateScrollPosition(index: ScrollSpine, rawScroll: number): ScrollPosition {
  const scroll = clamp(Number.isNaN(rawScroll) ? 0 : rawScroll, 0, index.maxScroll);
  let lo = 0, hi = index.ranges.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (scroll >= index.ranges[mid]!.end) lo = mid + 1;
    else hi = mid;
  }
  const range = index.ranges[lo]!;
  const length = range.end - range.start;
  const offset = clamp(scroll - range.start, 0, length);
  return Object.freeze({ rangeId: range.id, kind: range.kind, scene: range.scene,
    target: range.target, segment: range.segment, progress: length > 0 ? offset / length : 0,
    scroll, readingOffset: range.reading ? offset : 0 });
}

export function positionForScrollAnchor(index: ScrollSpine, anchor: ScrollAnchor): number {
  const range = index.ranges.find(({ id }) => id === anchor.rangeId);
  if (!range) return 0;
  const length = range.end - range.start;
  const progress = Number.isFinite(anchor.progress) ? clamp(anchor.progress, 0, 1) : 0;
  const offset = range.reading && Number.isFinite(anchor.readingOffset)
    ? clamp(anchor.readingOffset!, 0, length) : progress * length;
  return range.start + offset;
}
