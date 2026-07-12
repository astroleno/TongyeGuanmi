import type { Direction } from '../story/types';

export type GestureIntentResetReason =
  | 'gesture-idle'
  | 'direction-reversal'
  | 'scope-change'
  | 'seek'
  | 'entry-position'
  | 'viewport-change'
  | 'dispose';

export type GestureIntentInput = Readonly<{
  pixels: number;
  viewportHeight: number;
  now: number;
  scope: string;
}>;

export type GestureIntentResult = Readonly<{
  direction: Direction;
  accumulatedPixels: number;
  commitmentPixels: number;
  committed: boolean;
  fired: boolean;
  lastResetReason: GestureIntentResetReason | undefined;
}>;

export type GestureIntentSnapshot = Readonly<{
  scope: string | undefined;
  direction: Direction | undefined;
  accumulatedPixels: number;
  commitmentPixels: number;
  committed: boolean;
  lastResetReason: GestureIntentResetReason | undefined;
}>;

export type GestureIntentGate = Readonly<{
  consume(input: GestureIntentInput): GestureIntentResult;
  reset(reason: GestureIntentResetReason): void;
  snapshot(): GestureIntentSnapshot;
}>;

const DEFAULT_COMMITMENT_VIEWPORT_FRACTION = 0.1;
const DEFAULT_IDLE_MS = 220;

function directionFor(pixels: number): Direction {
  return pixels >= 0 ? 1 : -1;
}

function safeViewportHeight(value: number): number {
  return Math.max(1, Number.isFinite(value) ? value : 1);
}

export function createGestureIntentGate(options: {
  commitmentViewportFraction?: number;
  idleMs?: number;
} = {}): GestureIntentGate {
  const commitmentViewportFraction = Math.max(
    0,
    options.commitmentViewportFraction ?? DEFAULT_COMMITMENT_VIEWPORT_FRACTION
  );
  const idleMs = Math.max(0, options.idleMs ?? DEFAULT_IDLE_MS);
  let scope: string | undefined;
  let direction: Direction | undefined;
  let accumulatedPixels = 0;
  let viewportHeight = 0;
  let lastAt: number | undefined;
  let committed = false;
  let lastResetReason: GestureIntentResetReason | undefined;

  const reset = (reason: GestureIntentResetReason) => {
    scope = undefined;
    direction = undefined;
    accumulatedPixels = 0;
    viewportHeight = 0;
    lastAt = undefined;
    committed = false;
    lastResetReason = reason;
  };

  const consume = (input: GestureIntentInput): GestureIntentResult => {
    const nextDirection = directionFor(input.pixels);
    const nextViewportHeight = safeViewportHeight(input.viewportHeight);
    if (scope !== undefined && scope !== input.scope) {
      reset('scope-change');
    } else if (viewportHeight > 0 && Math.abs(viewportHeight - nextViewportHeight) > 0.5) {
      reset('viewport-change');
    } else if (lastAt !== undefined && input.now - lastAt > idleMs) {
      reset('gesture-idle');
    } else if (direction !== undefined && direction !== nextDirection) {
      reset('direction-reversal');
    }

    scope = input.scope;
    direction = nextDirection;
    viewportHeight = nextViewportHeight;
    lastAt = input.now;
    const commitmentPixels = nextViewportHeight * commitmentViewportFraction;
    let fired = false;
    if (!committed && input.pixels !== 0) {
      accumulatedPixels = Math.min(
        commitmentPixels,
        accumulatedPixels + Math.abs(input.pixels)
      );
      if (commitmentPixels === 0 || accumulatedPixels >= commitmentPixels - 0.001) {
        committed = true;
        fired = true;
      }
    }

    return {
      direction: nextDirection,
      accumulatedPixels,
      commitmentPixels,
      committed,
      fired,
      lastResetReason
    };
  };

  return {
    consume,
    reset,
    snapshot: () => ({
      scope,
      direction,
      accumulatedPixels,
      commitmentPixels: viewportHeight * commitmentViewportFraction,
      committed,
      lastResetReason
    })
  };
}
