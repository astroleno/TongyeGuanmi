import { normalizeInputDelta, type RawInput } from '../runtime/input-normalizer';
import { readingScrollport } from '../stage/reading';
import type { createDirectorRuntime } from '../runtime/director.actor';
import type { Direction, SceneId } from '../story/types';

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
  const scrollport = readingScrollport(root);
  if (!scrollport || delta === 0) {
    return false;
  }
  const maxScrollTop = Math.max(0, scrollport.scrollHeight - scrollport.clientHeight);
  if (maxScrollTop <= 1) {
    return false;
  }
  return direction(delta) === 1
    ? scrollport.scrollTop < maxScrollTop - 1
    : scrollport.scrollTop > 1;
}

function isEditableTarget(target: EventTarget | null): boolean {
  const element = target instanceof HTMLElement ? target : null;
  return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'));
}

export function attachStoryInput(options: StoryInputControllerOptions): () => void {
  let previousTouchY: number | undefined;

  const dispatch = (raw: RawInput, event: Event) => {
    const normalized = normalizeInputDelta(raw);
    if (normalized.delta === 0) {
      return;
    }
    const currentScene = options.getCurrentScene();
    const currentLayer = currentScene ? options.getLayerElement(currentScene) : null;
    if (canScrollNatively(currentLayer, normalized.delta)) {
      if (raw.type === 'key') {
        event.preventDefault();
        const scrollport = readingScrollport(currentLayer);
        scrollport?.scrollBy({
          top: normalized.delta * window.innerHeight,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
        });
      }
      return;
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
      viewportHeight: window.innerHeight
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
      viewportHeight: window.innerHeight
    }, event);
  };

  const onTouchEnd = () => {
    previousTouchY = undefined;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditableTarget(event.target)) {
      return;
    }
    dispatch({ type: 'key', key: event.key, viewportHeight: window.innerHeight }, event);
  };

  window.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('touchstart', onTouchStart, { passive: true });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd, { passive: true });
  window.addEventListener('touchcancel', onTouchEnd, { passive: true });
  window.addEventListener('keydown', onKeyDown);

  return () => {
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('touchstart', onTouchStart);
    window.removeEventListener('touchmove', onTouchMove);
    window.removeEventListener('touchend', onTouchEnd);
    window.removeEventListener('touchcancel', onTouchEnd);
    window.removeEventListener('keydown', onKeyDown);
  };
}
