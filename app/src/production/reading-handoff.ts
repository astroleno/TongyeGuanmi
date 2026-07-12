import {
  isReadingLayer,
  READING_EDGE_TOLERANCE_PX,
  readingScrollMetrics,
  readingScrollport
} from '../stage/reading';
import type { Direction } from '../story/types';

export type ReadingHandoffInput = Readonly<{
  root: HTMLElement | null | undefined;
  pixels: number;
  tolerancePx?: number;
}>;

export type ReadingHandoffResult = Readonly<{
  owned: boolean;
  direction: Direction;
  contentPixels: number;
  residualPixels: number;
}>;

function directionFor(pixels: number): Direction {
  return pixels >= 0 ? 1 : -1;
}

function signedPixels(magnitude: number, direction: Direction): number {
  return magnitude === 0 ? 0 : magnitude * direction;
}

/**
 * Consume physical pixels in a reading scrollport and return only the pixels
 * left after the directional content edge. Gesture commitment intentionally
 * lives in gesture-intent-gate.ts so this adapter retains no cross-event state.
 */
export function consumeReadingPixels(input: ReadingHandoffInput): ReadingHandoffResult {
  const direction = directionFor(input.pixels);
  const unowned = (): ReadingHandoffResult => ({
    owned: false,
    direction,
    contentPixels: 0,
    residualPixels: input.pixels
  });
  if (input.pixels === 0 || !isReadingLayer(input.root)) {
    return unowned();
  }
  const scrollport = readingScrollport(input.root);
  const metrics = readingScrollMetrics(input.root);
  if (!scrollport || !metrics) {
    return unowned();
  }

  const tolerance = Math.max(0, input.tolerancePx ?? READING_EDGE_TOLERANCE_PX);
  const rawAvailable = direction === 1
    ? Math.max(0, metrics.maxScrollTop - metrics.scrollTop)
    : Math.max(0, metrics.scrollTop);
  const availableContent = rawAvailable <= tolerance ? 0 : rawAvailable;
  if (availableContent === 0) {
    scrollport.scrollTop = direction === 1 ? metrics.maxScrollTop : 0;
  }
  const magnitude = Math.abs(input.pixels);
  const contentMagnitude = Math.min(magnitude, availableContent);
  const contentPixels = signedPixels(contentMagnitude, direction);
  if (contentMagnitude > 0) {
    const target = metrics.scrollTop + contentPixels;
    const remaining = direction === 1
      ? metrics.maxScrollTop - target
      : target;
    scrollport.scrollTop = remaining <= tolerance
      ? direction === 1 ? metrics.maxScrollTop : 0
      : target;
  }
  const residualPixels = signedPixels(magnitude - contentMagnitude, direction);

  return {
    owned: true,
    direction,
    contentPixels,
    residualPixels
  };
}
