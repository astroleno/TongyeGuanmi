import {
  isReadingLayer,
  readingScrollMetrics,
  readingScrollport
} from '../stage/reading';
import type { Direction, SceneId } from '../story/types';

export type ReadingHandoffResetReason =
  | 'gesture-idle'
  | 'direction-reversal'
  | 'scene-change'
  | 'seek'
  | 'entry-position'
  | 'viewport-change'
  | 'dispose';

export type ReadingHandoffInput = Readonly<{
  scene: SceneId;
  root: HTMLElement | null | undefined;
  pixels: number;
  viewportHeight: number;
  now: number;
}>;

export type ReadingHandoffResult = Readonly<{
  owned: boolean;
  direction: Direction;
  contentPixels: number;
  commitmentPixels: number;
  residualPixels: number;
  directorDelta: number;
  committed: boolean;
}>;

export type ReadingHandoffSnapshot = Readonly<{
  scene: SceneId | undefined;
  direction: Direction | undefined;
  accumulatedPixels: number;
  commitmentPixels: number;
  committed: boolean;
  lastResetReason: ReadingHandoffResetReason | undefined;
}>;

export type ReadingHandoff = Readonly<{
  consume(input: ReadingHandoffInput): ReadingHandoffResult;
  reset(reason: ReadingHandoffResetReason): void;
  snapshot(): ReadingHandoffSnapshot;
}>;

const DEFAULT_COMMITMENT_VIEWPORT_FRACTION = 0.1;
const DEFAULT_IDLE_MS = 220;

function directionFor(pixels: number): Direction {
  return pixels >= 0 ? 1 : -1;
}

function safeViewportHeight(value: number): number {
  return Math.max(1, Number.isFinite(value) ? value : 1);
}

function signedPixels(magnitude: number, direction: Direction): number {
  return magnitude === 0 ? 0 : magnitude * direction;
}

export function createReadingHandoff(options: {
  commitmentViewportFraction?: number;
  idleMs?: number;
} = {}): ReadingHandoff {
  const commitmentViewportFraction = Math.max(
    0,
    options.commitmentViewportFraction ?? DEFAULT_COMMITMENT_VIEWPORT_FRACTION
  );
  const idleMs = Math.max(0, options.idleMs ?? DEFAULT_IDLE_MS);
  let scene: SceneId | undefined;
  let direction: Direction | undefined;
  let accumulatedPixels = 0;
  let viewportHeight = 0;
  let lastAt: number | undefined;
  let released = false;
  let lastResetReason: ReadingHandoffResetReason | undefined;
  let diagnosticsRoot: HTMLElement | null = null;

  const clearDiagnostics = () => {
    diagnosticsRoot?.removeAttribute?.('data-reading-commitment-direction');
    diagnosticsRoot?.removeAttribute?.('data-reading-commitment-progress');
    diagnosticsRoot?.removeAttribute?.('data-reading-commitment-committed');
    diagnosticsRoot = null;
  };

  const reset = (reason: ReadingHandoffResetReason) => {
    clearDiagnostics();
    scene = undefined;
    direction = undefined;
    accumulatedPixels = 0;
    viewportHeight = 0;
    lastAt = undefined;
    released = false;
    lastResetReason = reason;
  };

  const consume = (input: ReadingHandoffInput): ReadingHandoffResult => {
    const inputDirection = directionFor(input.pixels);
    const height = safeViewportHeight(input.viewportHeight);
    const unownedResult = (): ReadingHandoffResult => ({
      owned: false,
      direction: inputDirection,
      contentPixels: 0,
      commitmentPixels: 0,
      residualPixels: input.pixels,
      directorDelta: input.pixels / height,
      committed: false
    });
    if (input.pixels === 0 || !isReadingLayer(input.root)) {
      return unownedResult();
    }
    const scrollport = readingScrollport(input.root);
    const metrics = readingScrollMetrics(input.root);
    if (!scrollport || !metrics) {
      return unownedResult();
    }

    if (scene !== undefined && scene !== input.scene) {
      reset('scene-change');
    } else if (viewportHeight > 0 && Math.abs(viewportHeight - height) > 0.5) {
      reset('viewport-change');
    } else if (
      lastAt !== undefined
      && input.now - lastAt > idleMs
    ) {
      reset('gesture-idle');
    } else if (direction !== undefined && direction !== inputDirection) {
      reset('direction-reversal');
    }

    scene = input.scene;
    direction = inputDirection;
    viewportHeight = height;
    lastAt = input.now;
    diagnosticsRoot = scrollport;

    if (released) {
      return unownedResult();
    }

    const magnitude = Math.abs(input.pixels);
    const availableContent = inputDirection === 1
      ? Math.max(0, metrics.maxScrollTop - metrics.scrollTop)
      : Math.max(0, metrics.scrollTop);
    const contentMagnitude = Math.min(magnitude, availableContent);
    const contentPixels = signedPixels(contentMagnitude, inputDirection);
    if (contentMagnitude > 0) {
      scrollport.scrollTop = metrics.scrollTop + contentPixels;
      accumulatedPixels = 0;
    }

    const postContentMagnitude = magnitude - contentMagnitude;
    const commitmentBudget = height * commitmentViewportFraction;
    const neededCommitment = Math.max(0, commitmentBudget - accumulatedPixels);
    const commitmentMagnitude = Math.min(postContentMagnitude, neededCommitment);
    accumulatedPixels = Math.min(commitmentBudget, accumulatedPixels + commitmentMagnitude);
    const residualMagnitude = Math.max(0, postContentMagnitude - commitmentMagnitude);
    const committed = commitmentBudget === 0 || accumulatedPixels >= commitmentBudget - 0.001;
    const commitmentPixels = signedPixels(commitmentMagnitude, inputDirection);
    const residualPixels = signedPixels(residualMagnitude, inputDirection);
    const releaseNow = committed && !released;
    if (releaseNow) {
      released = true;
    }
    const directorMagnitude = releaseNow
      ? commitmentBudget + residualMagnitude
      : 0;

    scrollport.dataset.readingCommitmentDirection = String(inputDirection);
    scrollport.dataset.readingCommitmentProgress = commitmentBudget > 0
      ? Math.min(1, accumulatedPixels / commitmentBudget).toFixed(4)
      : '1.0000';
    scrollport.dataset.readingCommitmentCommitted = String(committed);

    return {
      owned: true,
      direction: inputDirection,
      contentPixels,
      commitmentPixels,
      residualPixels,
      directorDelta: signedPixels(directorMagnitude / height, inputDirection),
      committed
    };
  };

  return {
    consume,
    reset,
    snapshot: () => {
      const commitmentPixels = viewportHeight * commitmentViewportFraction;
      return {
        scene,
        direction,
        accumulatedPixels,
        commitmentPixels,
        committed: commitmentPixels > 0 && accumulatedPixels >= commitmentPixels - 0.001,
        lastResetReason
      };
    }
  };
}
