import { normalizeInputDelta, type RawInput } from '../runtime/input-normalizer';
import { readingCanScroll } from '../stage/reading';
import type { createDirectorRuntime } from '../runtime/director.actor';
import type { Direction, SceneId } from '../story/types';
import { createReadingHandoff } from './reading-handoff';

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

export function attachStoryInput(options: StoryInputControllerOptions): () => void {
  let previousTouchY: number | undefined;
  let observedScene = options.getCurrentScene();
  const readingHandoff = createReadingHandoff();

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
    if (ownsReadingInput && currentScene) {
      const handoff = readingHandoff.consume({
        scene: currentScene,
        root: currentLayer,
        pixels: normalized.pixels,
        viewportHeight: normalized.viewportHeight,
        now: Date.now()
      });
      if (handoff.owned) {
        if (event.cancelable) {
          event.preventDefault();
        }
        if (handoff.directorDelta === 0) {
          return;
        }
        options.runtime.send({
          type: 'INPUT_DELTA',
          delta: handoff.directorDelta,
          source: normalized.source,
          now: Date.now()
        });
        return;
      }
    }
    if (event.cancelable) {
      event.preventDefault();
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
    readingHandoff.reset('gesture-idle');
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

  const resetForViewport = () => readingHandoff.reset('viewport-change');
  const resetForEntry = () => readingHandoff.reset('entry-position');
  window.addEventListener('resize', resetForViewport);
  window.addEventListener('orientationchange', resetForViewport);
  window.addEventListener('story-reading-entry', resetForEntry);
  window.visualViewport?.addEventListener('resize', resetForViewport);
  const unsubscribeRuntime = options.runtime.subscribe(() => {
    const next = options.getCurrentScene();
    if (next !== observedScene) {
      observedScene = next;
      readingHandoff.reset('scene-change');
    }
    if (options.runtime.getState().state === 'seeking') {
      readingHandoff.reset('seek');
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
    readingHandoff.reset('dispose');
  };
}
