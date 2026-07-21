import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { disposeTimelineVideoDriver } from '../../../media/timeline-video-driver';
import {
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

export function phoneCranePresentationProgress(
  rawProgress: number,
  reducedMotion = false
): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
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
>(function PhoneCrane({ active, onReady, reducedMotion }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const lastProgressRef = useRef(0);
  const directionRef = useRef<1 | -1>(1);
  const runRevisionRef = useRef(0);

  const render = useCallback((rawProgress: number) => {
    const root = rootRef.current;
    const progress = phoneCranePresentationProgress(rawProgress, reducedMotion);
    const previous = lastProgressRef.current;
    if (progress > previous + PROGRESS_EPSILON && directionRef.current !== 1) {
      directionRef.current = 1;
      runRevisionRef.current += 1;
    } else if (progress < previous - PROGRESS_EPSILON && directionRef.current !== -1) {
      directionRef.current = -1;
      runRevisionRef.current += 1;
    }
    lastProgressRef.current = progress;
    const mediaRun: CraneMediaRun = {
      runId: `phone-crane:${directionRef.current}:${runRevisionRef.current}`,
      direction: directionRef.current,
      nativePlayback: false,
      reducedMotion
    };
    renderCraneAnimationProgress(root, progress, { mediaRun });
    root?.setAttribute('data-phone-crane-progress', progress.toFixed(4));
  }, [reducedMotion]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const videos = craneVideos(root);
    const onMediaError = () => applyPhoneCraneMediaFallback(root);
    renderCraneHold(root);
    root.dataset.phoneCraneLifecycle = 'ready';
    for (const video of videos) video.addEventListener('error', onMediaError);
    onReady?.();
    return () => {
      for (const video of videos) video.removeEventListener('error', onMediaError);
      parkPhoneCraneMedia(root);
      delete root.dataset.phoneCraneLifecycle;
    };
  }, [onReady]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !active || reducedMotion) return;
    const controller = new AbortController();
    void prepareCraneAnimationFrame(root, 0, {
      runId: 'phone-crane:adjacent-prewarm',
      direction: 1,
      reducedMotion,
      signal: controller.signal
    }).catch(() => {
      if (!controller.signal.aborted) applyPhoneCraneMediaFallback(root);
    });
    return () => controller.abort();
  }, [active, reducedMotion]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update: render,
    enter() {
      rootRef.current?.removeAttribute('aria-hidden');
      rootRef.current?.setAttribute('data-phone-crane-state', 'entered');
    },
    leave() {
      parkPhoneCraneMedia(rootRef.current);
      rootRef.current?.setAttribute('data-phone-crane-state', 'parked');
    },
    reverse() {
      rootRef.current?.setAttribute('data-phone-crane-state', 'reversing');
    },
    dispose() {
      parkPhoneCraneMedia(rootRef.current);
    }
  }), [render]);

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
