import type { Direction, DirectorInputSource } from '../story/types';

export const DEFAULT_PHYSICAL_GESTURE_IDLE_MS = 220;
const REACCELERATION_RATIO = 1.75;
const REACCELERATION_FLOOR_PX = 6;

export type PhysicalGestureInput = Readonly<{
  source: DirectorInputSource;
  pixels: number;
  now: number;
  explicitStart?: boolean;
}>;

export type PhysicalGestureTracker = Readonly<{
  consume(input: PhysicalGestureInput): Readonly<{ newGesture: boolean }>;
  end(): void;
  reset(): void;
}>;

function directionFor(pixels: number): Direction {
  return pixels >= 0 ? 1 : -1;
}

/**
 * Tracks physical input envelopes separately from reading-edge ownership.
 * Wheel momentum has no lifecycle event, so a pause is the fallback while a
 * clear decay-then-reacceleration starts a new gesture without waiting 220ms.
 */
export function createPhysicalGestureTracker(
  idleMs = DEFAULT_PHYSICAL_GESTURE_IDLE_MS
): PhysicalGestureTracker {
  let source: DirectorInputSource | undefined;
  let direction: Direction | undefined;
  let lastAt: number | undefined;
  let lastMagnitude = 0;
  let decaySamples = 0;

  const reset = () => {
    source = undefined;
    direction = undefined;
    lastAt = undefined;
    lastMagnitude = 0;
    decaySamples = 0;
  };

  return {
    consume(input) {
      const nextDirection = directionFor(input.pixels);
      const magnitude = Math.abs(input.pixels);
      const idle = lastAt === undefined || input.now - lastAt > idleMs;
      const lifecycleStart = input.explicitStart || input.source === 'key';
      const changedStream = source !== input.source || direction !== nextDirection;
      const reaccelerated = input.source === 'wheel'
        && decaySamples >= 2
        && magnitude >= REACCELERATION_FLOOR_PX
        && magnitude >= lastMagnitude * REACCELERATION_RATIO;
      const newGesture = Boolean(lifecycleStart || idle || changedStream || reaccelerated);

      if (newGesture) {
        decaySamples = 0;
      } else if (magnitude < lastMagnitude) {
        decaySamples += 1;
      } else if (magnitude > lastMagnitude * 1.1) {
        decaySamples = 0;
      }

      source = input.source;
      direction = nextDirection;
      lastAt = input.now;
      lastMagnitude = magnitude;
      return { newGesture };
    },
    end: reset,
    reset
  };
}
