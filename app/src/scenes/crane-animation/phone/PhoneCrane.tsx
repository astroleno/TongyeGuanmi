import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { disposeTimelineVideoDriver } from '../../../media/timeline-video-driver';
import {
  CRANE_PLAYBACK_MS,
  craneAnimationScene,
  prepareCraneAnimationFrame,
  renderCraneAnimationProgress,
  renderCraneHold,
  type CraneMediaRun
} from '..';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../../../production/phone/types';
import './PhoneCrane.css';

const PROGRESS_EPSILON = 0.0001;

/**
 * The desktop Crane timeline exits its paper layers into Contact at 100%.
 * Contact is a native document chapter on phone, so keep the approved mid-run
 * Crane camera after auto playback rather than exposing an empty exit frame.
 */
export const PHONE_CRANE_STABLE_HOLD_PROGRESS = 0.42;

type PhoneCranePlaybackDirection = 1 | -1;

type PhoneCraneAutoplay = Readonly<{
  start(direction: PhoneCranePlaybackDirection): void;
  stop(): void;
  dispose(): void;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function rootFor(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="crane-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="crane-animation"]') ?? null;
}

function craneVideos(root: HTMLElement | null): HTMLVideoElement[] {
  return [
    root?.querySelector<HTMLVideoElement>('[data-crane-figure-video]'),
    root?.querySelector<HTMLVideoElement>('[data-crane-figure-front-video]')
  ].filter((video): video is HTMLVideoElement => video !== null && video !== undefined);
}

/**
 * Like the canonical Crane → Contact segment, phone scroll selects the run
 * boundary while this adapter advances its presentation clock. It never
 * retargets a playing video from each physical scroll sample.
 */
function createPhoneCraneAutoplay(
  render: (progress: number, direction: PhoneCranePlaybackDirection) => void,
  onComplete: (direction: PhoneCranePlaybackDirection) => void
): PhoneCraneAutoplay {
  let active = false;
  let disposed = false;
  let frame = 0;
  let startedAt = 0;
  let direction: PhoneCranePlaybackDirection = 1;

  const cancel = () => {
    if (frame) {
      window.cancelAnimationFrame(frame);
      frame = 0;
    }
  };

  const complete = () => {
    if (!active || disposed) return;
    active = false;
    frame = 0;
    render(direction === 1 ? 1 : 0, direction);
    onComplete(direction);
  };

  const tick = (now: number) => {
    frame = 0;
    if (!active || disposed) return;
    const elapsed = Math.min(1, Math.max(0, (now - startedAt) / CRANE_PLAYBACK_MS));
    render(direction === 1 ? elapsed : 1 - elapsed, direction);
    if (elapsed >= 1) {
      complete();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  return {
    start(nextDirection) {
      if (disposed || (active && direction === nextDirection)) return;
      cancel();
      direction = nextDirection;
      active = true;
      startedAt = performance.now();
      render(direction === 1 ? 0 : 1, direction);
      frame = window.requestAnimationFrame(tick);
    },
    stop() {
      active = false;
      cancel();
    },
    dispose() {
      active = false;
      disposed = true;
      cancel();
    }
  };
}

export function phoneCranePresentationProgress(
  rawProgress: number,
  reducedMotion = false
): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
}

/** A superseded seek is normal while scroll sampling takes ownership. */
export function isStaleCraneFramePreparation(error: unknown): boolean {
  return error instanceof Error && error.message === 'Crane media stale';
}

export function parkPhoneCraneMedia(root: HTMLElement | null | undefined): void {
  const section = rootFor(root);
  for (const video of craneVideos(section)) {
    disposeTimelineVideoDriver(video);
    video.pause();
  }
  if (section?.dataset.phoneCraneMedia !== 'fallback') {
    section?.setAttribute('data-phone-crane-media', 'parked');
  }
}

/**
 * Keep the canonical paper, cloud, and arch layers visible if either alpha
 * source fails. This is intentionally a stable endpoint, never a blank stage.
 */
export function applyPhoneCraneMediaFallback(
  root: HTMLElement | null | undefined
): void {
  const section = rootFor(root);
  renderCraneHold(section);
  for (const video of craneVideos(section)) {
    disposeTimelineVideoDriver(video);
    video.pause();
    video.setAttribute('data-phone-crane-media', 'fallback');
  }
  section?.setAttribute('data-phone-crane-media', 'fallback');
}

/** One canonical Crane root with bounded prewarm and explicit retirement. */
export const PhoneCrane = forwardRef<
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
>(function PhoneCrane({ onReady, reducedMotion }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const autoplayRef = useRef<PhoneCraneAutoplay | null>(null);
  const requestedAutoplayDirectionRef = useRef<PhoneCranePlaybackDirection | null>(null);
  const prewarmControllerRef = useRef<AbortController | null>(null);
  const lastProgressRef = useRef(0);
  const directionRef = useRef<PhoneCranePlaybackDirection>(1);
  const runRevisionRef = useRef(0);

  const render = useCallback((
    rawProgress: number,
    requestedDirection?: PhoneCranePlaybackDirection
  ) => {
    const root = rootRef.current;
    const progress = phoneCranePresentationProgress(rawProgress, reducedMotion);
    const previous = lastProgressRef.current;
    const nextDirection = requestedDirection
      ?? (progress > previous + PROGRESS_EPSILON ? 1
        : progress < previous - PROGRESS_EPSILON ? -1
          : directionRef.current);
    if (directionRef.current !== nextDirection) {
      directionRef.current = nextDirection;
      runRevisionRef.current += 1;
    }
    lastProgressRef.current = progress;
    const mediaRun: CraneMediaRun = {
      runId: `phone-crane:${directionRef.current}:${runRevisionRef.current}`,
      direction: directionRef.current,
      nativePlayback: directionRef.current === 1,
      reducedMotion
    };
    renderCraneAnimationProgress(root, progress, { mediaRun });
    root?.setAttribute('data-phone-crane-progress', progress.toFixed(4));
    root?.setAttribute('data-phone-crane-clock', requestedDirection ? 'autoplay' : 'endpoint');
  }, [reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const videos = craneVideos(root);
    const onMediaError = () => applyPhoneCraneMediaFallback(root);
    renderCraneHold(root);
    const autoplay = createPhoneCraneAutoplay(render, (direction) => {
      requestedAutoplayDirectionRef.current = null;
      if (direction === 1) {
        // Seek one verified in-scene endpoint for the native document handoff.
        // This is a stable camera, not a second media owner or hidden hold.
        render(PHONE_CRANE_STABLE_HOLD_PROGRESS, -1);
      }
      root.dataset.phoneCraneAutoplay = direction === 1
        ? 'complete-forward'
        : 'complete-reverse';
    });
    autoplayRef.current = autoplay;
    root.dataset.phoneCraneLifecycle = 'ready';
    const requestedDirection = requestedAutoplayDirectionRef.current;
    if (requestedDirection !== null) {
      if (reducedMotion) {
        render(requestedDirection === 1 ? 1 : 0, requestedDirection);
        root.dataset.phoneCraneAutoplay = requestedDirection === 1
          ? 'complete-forward'
          : 'complete-reverse';
      } else {
        autoplay.start(requestedDirection);
      }
    }
    for (const video of videos) video.addEventListener('error', onMediaError);
    onReady?.();
    return () => {
      for (const video of videos) video.removeEventListener('error', onMediaError);
      autoplay.dispose();
      if (autoplayRef.current === autoplay) autoplayRef.current = null;
      parkPhoneCraneMedia(root);
      delete root.dataset.phoneCraneLifecycle;
      delete root.dataset.phoneCraneAutoplay;
    };
  }, [onReady, reducedMotion, render]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || reducedMotion || requestedAutoplayDirectionRef.current !== null) return;
    const controller = new AbortController();
    prewarmControllerRef.current = controller;
    void prepareCraneAnimationFrame(root, 0, {
      runId: 'phone-crane:adjacent-prewarm',
      direction: 1,
      reducedMotion,
      signal: controller.signal
    }).catch((error: unknown) => {
      if (!controller.signal.aborted && !isStaleCraneFramePreparation(error)) {
        applyPhoneCraneMediaFallback(root);
      }
    });
    return () => {
      controller.abort();
      if (prewarmControllerRef.current === controller) {
        prewarmControllerRef.current = null;
      }
    };
  }, [reducedMotion]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update(progress) {
      requestedAutoplayDirectionRef.current = null;
      prewarmControllerRef.current?.abort();
      autoplayRef.current?.stop();
      render(progress);
    },
    enter() {
      const root = rootRef.current;
      requestedAutoplayDirectionRef.current = 1;
      prewarmControllerRef.current?.abort();
      root?.removeAttribute('aria-hidden');
      root?.setAttribute('data-phone-crane-state', 'entered');
      root?.setAttribute('data-phone-crane-autoplay', 'starting-forward');
      if (reducedMotion) {
        render(1, 1);
        root?.setAttribute('data-phone-crane-autoplay', 'complete-forward');
        return;
      }
      autoplayRef.current?.start(1);
    },
    leave() {
      requestedAutoplayDirectionRef.current = null;
      prewarmControllerRef.current?.abort();
      autoplayRef.current?.stop();
      parkPhoneCraneMedia(rootRef.current);
      rootRef.current?.setAttribute('data-phone-crane-state', 'parked');
    },
    reverse() {
      const root = rootRef.current;
      requestedAutoplayDirectionRef.current = -1;
      prewarmControllerRef.current?.abort();
      root?.setAttribute('data-phone-crane-state', 'reversing');
      root?.setAttribute('data-phone-crane-autoplay', 'starting-reverse');
      if (reducedMotion) {
        render(0, -1);
        root?.setAttribute('data-phone-crane-autoplay', 'complete-reverse');
        return;
      }
      autoplayRef.current?.start(-1);
    },
    dispose() {
      requestedAutoplayDirectionRef.current = null;
      prewarmControllerRef.current?.abort();
      autoplayRef.current?.dispose();
      parkPhoneCraneMedia(rootRef.current);
    }
  }), [reducedMotion, render]);

  const CraneSurface = craneAnimationScene.Component;
  return (
    <div
      className="phone-crane"
      data-phone-scene="crane-animation"
      data-phone-input-owner="none"
      aria-hidden="true"
    >
      <CraneSurface
        scene={craneAnimationScene.id}
        hidden={false}
        registerHandle={(name, element) => {
          if (name === 'stage') rootRef.current = element;
        }}
      />
    </div>
  );
});

export default PhoneCrane;
