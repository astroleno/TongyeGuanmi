import { normalizeInputDelta, type RawInput } from '../runtime/input-normalizer';
import { readingCanScroll, readingScrollport } from '../stage/reading';
import type { createDirectorRuntime } from '../runtime/director.actor';
import type { Direction, ReadingEntryIntent, SceneId } from '../story/types';
import { createGestureIntentGate } from './gesture-intent-gate';
import { createPhysicalGestureTracker } from './physical-gesture-tracker';
import { createReadingEdgeLatch } from './reading-edge-latch';
import { consumeReadingPixels } from './reading-handoff';
import { unlockStoryMedia } from './mobile-media-unlock';
import { createReadingSmoothMotion } from './reading-smooth-motion';

const portraitSpikeEnabled = import.meta.env.DEV || import.meta.env.VITE_ENABLE_PORTRAIT_SPIKE === '1';

type Runtime = ReturnType<typeof createDirectorRuntime>;

export type StoryInputControllerOptions = {
  runtime: Runtime;
  getCurrentScene(): SceneId | undefined;
  getLayerElement(scene: SceneId): HTMLElement | null;
  unlockMedia?(): void;
  /** Route A spike only: leave in-bounds portrait reading to the browser. */
  portraitNativeReading?: boolean;
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
  const element = typeof HTMLElement !== 'undefined' && target instanceof HTMLElement ? target : null;
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

function requiresFreshPhysicalGesture(
  snapshot: ReturnType<Runtime['getState']>
): boolean {
  if (snapshot.state === 'staged-paused') {
    return true;
  }
  if (snapshot.state !== 'hold' || snapshot.context.cursor.status !== 'hold') {
    return false;
  }
  const scene = snapshot.context.cursor.scene;
  return snapshot.context.manifest?.nodes.some((node) => (
    node.kind === 'hold'
    && node.scene === scene
    && node.freshInput === true
  )) ?? false;
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
  const physicalGesture = createPhysicalGestureTracker();
  const readingEdgeLatch = createReadingEdgeLatch();
  const smooth = createReadingSmoothMotion({
    requestFrame: (callback) => window.requestAnimationFrame(callback),
    cancelFrame: (handle) => window.cancelAnimationFrame(handle)
  });
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let observedScope = interactionScope(options.runtime.getState());
  let admittedPhysicalScope: string | undefined;

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
    const allowNativePortraitReading = portraitSpikeEnabled
      && options.portraitNativeReading
      && normalized.source === 'touch'
      && ownsReadingInput
      && Boolean(readingScrollport(currentLayer))
      && readingCanScroll(currentLayer, direction(normalized.pixels));
    if (allowNativePortraitReading) {
      if (currentLayer) {
        currentLayer.dataset.portraitSpikeInputOwner = 'native-reading';
      }
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    if (portraitSpikeEnabled && options.portraitNativeReading && normalized.source === 'touch' && currentLayer) {
      currentLayer.dataset.portraitSpikeInputOwner = 'cinematic';
    }
    const nextDirection = direction(normalized.pixels);
    if (shouldUsePhysicalCommitment(runtimeSnapshot, nextDirection)) {
      const scope = interactionScope(runtimeSnapshot);
      const gesture = physicalGesture.consume({
        source: normalized.source,
        pixels: normalized.pixels,
        now: Date.now(),
        explicitStart: normalized.source === 'touch' && touchStartsNewReadingGesture
      });
      if (normalized.source === 'touch') {
        touchStartsNewReadingGesture = false;
      }
      if (requiresFreshPhysicalGesture(runtimeSnapshot)) {
        if (gesture.newGesture) {
          admittedPhysicalScope = scope;
        }
        if (admittedPhysicalScope !== scope) {
          return;
        }
      }
      const gateSnapshot = gestureGate.snapshot();
      if (gateSnapshot.direction !== undefined && gateSnapshot.direction !== nextDirection) {
        gestureGate.reset('direction-reversal');
      }
      const hasReadingScrollport = ownsReadingInput && Boolean(readingScrollport(currentLayer));
      const smoothWheel = normalized.source === 'wheel' && !reducedMotion?.matches
        && typeof window.requestAnimationFrame === 'function';
      if (smoothWheel && hasReadingScrollport && readingCanScroll(currentLayer, nextDirection)) {
        const port = readingScrollport(currentLayer)!;
        smooth.bind({ ownerKey: port, readPosition: () => port.scrollTop,
          readMax: () => Math.max(0, port.scrollHeight - port.clientHeight),
          writePosition: (position) => { port.scrollTop = position; } });
        smooth.push({ deltaPx: normalized.pixels, now: performance.now() });
        readingEdgeLatch.reset();
        return;
      }
      smooth.cancel();
      const reading = ownsReadingInput
        ? consumeReadingPixels({ root: currentLayer, pixels: normalized.pixels })
        : {
            owned: false,
            direction: nextDirection,
            contentPixels: 0,
            residualPixels: normalized.pixels,
            startedAtEdge: false,
            reachedEdgeDuringInput: false,
            atEdge: false
          };
      if (reading.owned) {
        const edge = readingEdgeLatch.consume({
          scope: `reading:${currentScene}:${nextDirection === 1 ? 'bottom' : 'top'}`,
          pixels: normalized.pixels,
          startedAtEdge: reading.startedAtEdge,
          reachedEdgeDuringInput: reading.reachedEdgeDuringInput,
          newGesture: gesture.newGesture
        });
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
        scope
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
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || isEditableTarget(event.target)) return;
    dispatch({
      type: 'wheel',
      deltaY: event.deltaY,
      deltaMode: event.deltaMode as 0 | 1 | 2,
      viewportHeight: storyViewportHeight()
    }, event);
  };

  const onTouchStart = (event: TouchEvent) => {
    smooth.cancel();
    (options.unlockMedia ?? unlockStoryMedia)();
    previousTouchY = event.touches[0]?.clientY;
    touchStartsNewReadingGesture = true;
  };

  const onTouchMove = (event: TouchEvent) => {
    // A transition can mount its next video after touchstart. Retrying inside
    // the still-active physical gesture lets iOS grant playback activation to
    // that newly mounted media before WebKit starts preparing its first frame.
    (options.unlockMedia ?? unlockStoryMedia)();
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
    physicalGesture.end();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditableTarget(event.target)) {
      return;
    }
    smooth.cancel();
    dispatch({ type: 'key', key: event.key, viewportHeight: storyViewportHeight() }, event);
  };

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('keydown', onKeyDown);

  const resetForViewport = () => {
    smooth.cancel();
    gestureGate.reset('viewport-change');
    readingEdgeLatch.reset();
    physicalGesture.reset();
  };
  const applyReadingEntry = (entry: ReadingEntryIntent | undefined) => {
    smooth.cancel();
    gestureGate.reset('entry-position');
    readingEdgeLatch.reset();
    physicalGesture.reset();
    if (!entry) {
      return;
    }
    const root = options.getLayerElement(entry.scene);
    if (!readingScrollport(root)) {
      return;
    }
    readingEdgeLatch.mountAtEdge(
      `reading:${entry.scene}:${entry.edge}`
    );
  };
  const resetForEntry = (event: Event) => {
    applyReadingEntry((event as CustomEvent<ReadingEntryIntent>).detail);
  };
  window.addEventListener('resize', resetForViewport);
  window.addEventListener('orientationchange', resetForViewport);
  window.addEventListener('story-reading-entry', resetForEntry);
  window.addEventListener('blur', resetForViewport);
  window.addEventListener('pagehide', resetForViewport);
  window.addEventListener('visibilitychange', resetForViewport);
  reducedMotion?.addEventListener('change', resetForViewport);
  window.visualViewport?.addEventListener('resize', resetForViewport);
  const unsubscribeRuntime = options.runtime.subscribe(() => {
    const snapshot = options.runtime.getState();
    const nextScope = interactionScope(snapshot);
    if (nextScope !== observedScope) {
      smooth.cancel();
      observedScope = nextScope;
      admittedPhysicalScope = undefined;
      gestureGate.reset('scope-change');
      readingEdgeLatch.reset();
    }
    if (snapshot.state === 'seeking') {
      smooth.cancel();
      gestureGate.reset('seek');
      readingEdgeLatch.reset();
      physicalGesture.reset();
    }
  });

  const initialSnapshot = options.runtime.getState();
  if (initialSnapshot.state === 'hold' && initialSnapshot.context.cursor.status === 'hold') {
    applyReadingEntry(initialSnapshot.context.holdEntry);
  }

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
    window.removeEventListener('blur', resetForViewport);
    window.removeEventListener('pagehide', resetForViewport);
    window.removeEventListener('visibilitychange', resetForViewport);
    reducedMotion?.removeEventListener('change', resetForViewport);
    window.visualViewport?.removeEventListener('resize', resetForViewport);
    unsubscribeRuntime();
    gestureGate.reset('dispose');
    readingEdgeLatch.reset();
    physicalGesture.reset();
    smooth.dispose();
  };
}
