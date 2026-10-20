import { canonicalSegments } from '../story/canonical-spine';
import { positionForScrollAnchor, type ScrollAnchor, type ScrollPosition, type ScrollSpine } from '../story/scroll-spine';
import { figure2ProofPanelFromHash, sceneFromHash } from './navigation';

export function remapScrollAnchor(index: ScrollSpine, anchor: ScrollAnchor): number {
  if (index.ranges.some(({ id }) => id === anchor.rangeId)) return positionForScrollAnchor(index, anchor);
  const segment = canonicalSegments.find(({ id }) => id === anchor.rangeId);
  return segment ? positionForScrollAnchor(index, {
    rangeId: `hold:${anchor.progress < .5 ? segment.from : segment.to}`, progress: 0
  }) : 0;
}

export function scrollPositionForHash(index: ScrollSpine, hash: string, root: HTMLElement): number {
  const scene = sceneFromHash(hash) ?? 'hero';
  const range = index.ranges.find(({ id }) => id === `hold:${scene}`);
  if (!range) return 0;
  const panel = figure2ProofPanelFromHash(hash);
  const surface = root.querySelector<HTMLElement>(`[data-scroll-content="${scene}"]`);
  const element = panel && surface?.querySelector<HTMLElement>(`[data-r4-proof-panel="${panel}"]`);
  const offset = element && surface
    ? element.getBoundingClientRect().top - surface.getBoundingClientRect().top + surface.scrollTop : 0;
  const target = Math.min(range.end, range.start + Math.max(0, offset));
  // Native scrolling can round fractional coordinates into the preceding
  // transition. Keep positive holds inside their half-open interval, including
  // Proof aliases whose text anchor lies beyond the last readable pixel.
  const firstPixel = Math.ceil(range.start);
  const lastPixel = Math.ceil(range.end) - 1;
  return lastPixel >= firstPixel
    ? Math.max(firstPixel, Math.min(lastPixel, Math.round(target)))
    : target; // Preserve zero-length landmarks and subpixel-only holds.
}

export type ScrollTextBookmark = Readonly<{ rangeId: string; node: HTMLElement; viewportTop: number }>;

/** Captured only when the reading position changes, never in media wake frames. */
export function captureScrollTextBookmark(surface: HTMLElement | null, position: ScrollPosition, viewportHeight: number): ScrollTextBookmark | null {
  if (!surface || position.kind !== 'hold') return null;
  for (const node of surface.querySelectorAll<HTMLElement>('h1,h2,h3,p,li,blockquote,[data-r4-proof-panel]')) {
    const rect = node.getBoundingClientRect();
    if (rect.height > 0 && rect.bottom > Math.min(100, viewportHeight * .15) && rect.top < viewportHeight) {
      return { rangeId: position.rangeId, node, viewportTop: rect.top };
    }
  }
  return null;
}

export function restoreScrollTextBookmark(bookmark: ScrollTextBookmark | null, surface: HTMLElement | null, index: ScrollSpine): number | null {
  if (!bookmark || !surface?.contains(bookmark.node)) return null;
  const range = index.ranges.find(({ id }) => id === bookmark.rangeId);
  if (!range) return null;
  const offset = bookmark.node.getBoundingClientRect().top - surface.getBoundingClientRect().top - bookmark.viewportTop;
  return Math.max(range.start, Math.min(range.end, range.start + offset));
}

export function readSavedScrollAnchor(value: unknown): ScrollAnchor | null {
  if (!value || typeof value !== 'object') return null;
  const anchor = value as Partial<ScrollAnchor>;
  if (typeof anchor.rangeId !== 'string' || !Number.isFinite(anchor.progress)) return null;
  return { rangeId: anchor.rangeId, progress: anchor.progress!,
    ...(Number.isFinite(anchor.readingOffset) ? { readingOffset: anchor.readingOffset! } : {}) };
}
