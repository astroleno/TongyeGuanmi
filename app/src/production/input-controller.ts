import { normalizeInputDelta, type RawInput } from '../runtime/input-normalizer';
import { readingCanScroll } from '../stage/reading';
import type { createDirectorRuntime } from '../runtime/director.actor';
import type { Direction, SceneId } from '../story/types';
import { createGestureIntentGate } from './gesture-intent-gate';
import { createReadingEdgeLatch } from './reading-edge-latch';
import { consumeReadingPixels } from './reading-handoff';

type Runtime = ReturnType<typeof createDirectorRuntime>;

export type StoryInputControllerOptions = {
  runtime: Runtime;
  getCurrentScene(): SceneId | undefined;
  getLayerElement(scene: SceneId): HTMLElement | null;
};

function direction(delta: number): Direction {
  return delta >= 0 ? 1 : -1;
}

export function canScrollNatively(root: HTMLElement | null | undefined, delta: number): boolean {
  if (delta === 0) {
    return false;
  }
  return readingCanScroll(root, direction(delta));
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}

function storyViewportHeight(): number {
  const storyHeight = typeof document === 'undefined'
    ? 0
    : document.querySelector<HTMLElement>('[data-production-story-app="true"]')?.clientHeight ?? 0;
  return storyHeight > 0 ? storyHeight : window.innerHeight;
}

function interactionScope(snapshot: ReturnType<Runtime['getState']>): string {
  if (snapshot.state === 'hold' && snapshot.context.cursor.status === 'hold') {
    return `hold:${snapshot.context.cursor.scene}`;
  }
  if (snapshot.state === 'staged-paused') {
    return [
      'stage',
      snapshot.context.activeSegment ?? 'unknown',
      snapshot.context.activeRunId ?? 'unknown',
      snapshot.context.pausePoint?.stageIndex ?? 'unknown'
    ].join(':');
  }
  return `${String(snapshot.state)}:${snapshot.context.activeRunId ?? 'idle'}`;
}

function shouldUsePhysicalCommitment(
  snapshot: ReturnType<Runtime['getState']>,
  direction: Direction
): boolean {
  if (snapshot.state === 'staged-paused') {
    return true;
  }
  if (snapshot.state === 'playing' || snapshot.state === 'settling') {
    return true;
  }
  const cursor = snapshot.context.cursor;
  if (snapshot.state !== 'hold' || cursor.status !== 'hold') {
    return false;
  }
  const nodes = snapshot.context.manifest?.nodes;
  if (!nodes) {
    return true;
  }
  const holdIndex = nodes.findIndex(
    (node) => node.kind === 'hold' && node.scene === cursor.scene
  );
  const segment = nodes[holdIndex + direction];
  return segment?.kind !== 'segment' || segment.policy.kind !== 'scrub';
}

function shouldForwardRawInput(
  snapshot: ReturnType<Runtime['getState']>,
  direction: Direction
): boolean {
  if (snapshot.state === 'preparing' || snapshot.state === 'scrubbing') {
    return true;
  }
  const cursor = snapshot.context.cursor;
  if (snapshot.state !== 'hold' || cursor.status !== 'hold') {
    return false;
  }
  const nodes = snapshot.context.manifest?.nodes;
  if (!nodes) {
    return false;
  }
  const holdIndex = nodes.findIndex(
    (node) => node.kind === 'hold' && node.scene === cursor.scene
  );
  const segment = nodes[holdIndex + direction];
  return segment?.kind === 'segment' && segment.policy.kind === 'scrub';
}

export function attachStoryInput(options: StoryInputControllerOptions): () => void {
  let previousTouchY: number | undefined;
  let touchStartsNewReadingGesture = false;
  const gestureGate = createGestureIntentGate();
  const readingEdgeLatch = createReadingEdgeLatch();
  let observedScope = interactionScope(options.runtime.getState());

  const dispatch = (raw: RawInput, event: Event) => {
    const normalized = normalizeInputDelta(raw);
    if (normalized.delta === 0) {
      return;
    }
    const currentScene = options.getCurrentScene();
    const currentLayer = currentScene ? options.getLayerElement(currentScene) : null;
    const runtimeSnapshot = options.runtime.getState();
    const ownsReadingInput = Boolean(
      currentScene
      && runtimeSnapshot.state === 'hold'
      && runtimeSnapshot.context.cursor.status === 'hold'
      && runtimeSnapshot.context.cursor.scene === currentScene
    );
    if (event.cancelable) {
      event.preventDefault();
    }
    const nextDirection = direction(normalized.pixels);
    if (shouldUsePhysicalCommitment(runtimeSnapshot, nextDirection)) {
      const gateSnapshot = gestureGate.snapshot();
      if (gateSnapshot.direction !== undefined && gateSnapshot.direction !== nextDirection) {
        gestureGate.reset('direction-reversal');
      }
      const reading = ownsReadingInput
        ? consumeReadingPixels({ root: currentLayer, pixels: normalized.pixels })
        : {
            owned: false,
            direction: nextDirection,
            contentPixels: 0,
            residualPixels: normalized.pixels,
            atEdge: false
          };
      if (reading.owned) {
        const edge = readingEdgeLatch.consume({
          scope: `reading:${currentScene}:${nextDirection === 1 ? 'bottom' : 'top'}`,
          pixels: normalized.pixels,
          now: Date.now(),
          atEdge: reading.atEdge,
          forceNewGesture: normalized.source === 'key' || (normalized.source === 'touch' && touchStartsNewReadingGesture)
        });
        touchStartsNewReadingGesture = false;
        if (edge.armed) {
          gestureGate.reset('entry-position');
          if (edge.fired) {
            options.runtime.send({
              type: 'CHARGE_FIRED',
              direction: nextDirection,
              now: Date.now()
            });
          }
          return;
        }
      }
      if (reading.residualPixels === 0) {
        return;
      }
      const intent = gestureGate.consume({
        pixels: reading.residualPixels,
        viewportHeight: normalized.viewportHeight,
        now: Date.now(),
        scope: interactionScope(runtimeSnapshot)
      });
      if (!intent.fired) {
        return;
      }
      options.runtime.send({
        type: 'CHARGE_FIRED',
        direction: intent.direction,
        now: Date.now()
      });
      return;
    }
    if (!shouldForwardRawInput(runtimeSnapshot, nextDirection)) {
      return;
    }
    options.runtime.send({
      type: 'INPUT_DELTA',
      delta: normalized.delta,
      source: normalized.source,
      now: Date.now()
    });
  };

  const onWheel = (event: WheelEvent) => {
    dispatch({
      type: 'wheel',
      deltaY: event.deltaY,
      deltaMode: event.deltaMode as 0 | 1 | 2,
      viewportHeight: storyViewportHeight()
    }, event);
  };

  const onTouchStart = (event: TouchEvent) => {
    previousTouchY = event.touches[0]?.clientY;
    touchStartsNewReadingGesture = true;
  };

  const onTouchMove = (event: TouchEvent) => {
    const currentY = event.touches[0]?.clientY;
    if (currentY === undefined || previousTouchY === undefined) {
      previousTouchY = currentY;
      return;
    }
    const before = previousTouchY;
    previousTouchY = currentY;
    dispatch({
      type: 'touch',
      currentY,
      previousY: before,
      viewportHeight: storyViewportHeight()
    }, event);
  };

  const onTouchEnd = () => {
    previousTouchY = undefined;
    gestureGate.reset('gesture-idle');
    readingEdgeLatch.endGesture();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditableTarget(event.target)) {
      return;
    }
    dispatch({ type: 'key', key: event.key, viewportHeight: storyViewportHeight() }, event);
  };

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('keydown', onKeyDown);

  const resetForViewport = () => {
    gestureGate.reset('viewport-change');
    readingEdgeLatch.reset();
  };
  const resetForEntry = () => {
    gestureGate.reset('entry-position');
    readingEdgeLatch.reset();
  };
  window.addEventListener('resize', resetForViewport);
  window.addEventListener('orientationchange', resetForViewport);
  window.addEventListener('story-reading-entry', resetForEntry);
  window.visualViewport?.addEventListener('resize', resetForViewport);
  const unsubscribeRuntime = options.runtime.subscribe(() => {
    const snapshot = options.runtime.getState();
    const nextScope = interactionScope(snapshot);
    if (nextScope !== observedScope) {
      observedScope = nextScope;
      gestureGate.reset('scope-change');
      readingEdgeLatch.reset();
    }
    if (snapshot.state === 'seeking') {
      gestureGate.reset('seek');
      readingEdgeLatch.reset();
    }
  });

  return () => {
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', resetForViewport);
    window.removeEventListener('orientationchange', resetForViewport);
    window.removeEventListener('story-reading-entry', resetForEntry);
    window.visualViewport?.removeEventListener('resize', resetForViewport);
    unsubscribeRuntime();
    gestureGate.reset('dispose');
    readingEdgeLatch.reset();
  };
}
