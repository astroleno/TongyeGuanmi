import type { Direction, DirectorInputSource } from '../story/types';

export const READING_WHEEL_GESTURE_BUDGET_VIEWPORT = 0.64;
export const READING_WHEEL_DAMPING = 0.75;
export const READING_WHEEL_EVENT_CAP_VIEWPORT = 0.18;
export const READING_WHEEL_EDGE_CONFIRMATION_PX = 16;

export type ReadingMotionGovernorInput = Readonly<{
  scope: string;
  source: DirectorInputSource;
  pixels: number;
  viewportHeight: number;
  newGesture: boolean;
}>;

export type ReadingMotionGovernorResult = Readonly<{
  pixels: number;
  absorbed: boolean;
  budgetPixels: number;
  remainingPixels: number;
}>;

export type ReadingMotionGovernor = Readonly<{
  consume(input: ReadingMotionGovernorInput): ReadingMotionGovernorResult;
  reset(): void;
}>;

function directionFor(pixels: number): Direction {
  return pixels >= 0 ? 1 : -1;
}

function viewportPixels(value: number): number {
  return Math.max(1, Number.isFinite(value) ? value : 1);
}

/**
 * Governs wheel momentum only while a physical gesture owns a reading
 * scrollport. It has no RAF or deferred work: exhausted momentum is simply
 * absorbed before reading-handoff can turn it into an edge charge.
 */
export function createReadingMotionGovernor(): ReadingMotionGovernor {
  let scope = '';
  let direction: Direction | undefined;
  let budgetPixels = 0;
  let remainingPixels = 0;

  const reset = () => {
    scope = '';
    direction = undefined;
    budgetPixels = 0;
    remainingPixels = 0;
  };

  return {
    consume(input) {
      if (input.source !== 'wheel' || input.pixels === 0) {
        return {
          pixels: input.pixels,
          absorbed: false,
          budgetPixels,
          remainingPixels
        };
      }

      const height = viewportPixels(input.viewportHeight);
      const nextDirection = directionFor(input.pixels);
      const newScope = scope !== input.scope || direction !== nextDirection;
      if (input.newGesture || newScope) {
        scope = input.scope;
        direction = nextDirection;
        budgetPixels = height * READING_WHEEL_GESTURE_BUDGET_VIEWPORT;
        remainingPixels = budgetPixels;
      }

      const magnitude = Math.abs(input.pixels);
      const dampedMagnitude = Math.min(
        magnitude,
        Math.max(
          READING_WHEEL_EDGE_CONFIRMATION_PX,
          magnitude * READING_WHEEL_DAMPING
        ),
        height * READING_WHEEL_EVENT_CAP_VIEWPORT
      );
      const effectiveMagnitude = Math.min(dampedMagnitude, remainingPixels);
      remainingPixels = Math.max(0, remainingPixels - effectiveMagnitude);
      const pixels = effectiveMagnitude * nextDirection;

      return {
        pixels,
        absorbed: effectiveMagnitude === 0,
        budgetPixels,
        remainingPixels
      };
    },
    reset
  };
}
