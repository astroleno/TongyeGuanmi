import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import {
  parkPhMedia,
  phAnimationScene,
  renderPhAnimationProgress,
  renderPhHold,
  type PhMediaRun
} from '..';
import { PH_PLAYBACK_MS } from '../../../story/timings';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../../../production/phone/types';
import './PhonePh.css';

const PROGRESS_EPSILON = 0.0001;

type PhonePhPlaybackDirection = 1 | -1;

type PhonePhAutoplay = Readonly<{
  start(direction: PhonePhPlaybackDirection): void;
  stop(): void;
  dispose(): void;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function rootFor(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="ph-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]') ?? null;
}

/**
 * PH follows the production auto-play policy: scrolling chooses an entry or
 * reverse run, while the canonical scene owns its media clock. Hero is the
 * only phone scene that remains a scrub interaction.
 */
function createPhonePhAutoplay(
  render: (progress: number, direction: PhonePhPlaybackDirection) => void,
  onComplete: (direction: PhonePhPlaybackDirection) => void
): PhonePhAutoplay {
  let active = false;
  let disposed = false;
  let frame = 0;
  let startedAt = 0;
  let direction: PhonePhPlaybackDirection = 1;

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
    const elapsed = Math.min(1, Math.max(0, (now - startedAt) / PH_PLAYBACK_MS));
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

/**
 * Reduced motion still keeps PH in the canonical order, but has no in-between
 * camera state to animate.
 */
export function phonePhPresentationProgress(
  rawProgress: number,
  reducedMotion = false
): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
}

/**
 * PH retains its authored paper and still layers if alpha playback fails.
 * The caller can then continue to the canonical Education endpoint.
 */
export function applyPhonePhMediaFallback(
  root: HTMLElement | null | undefined
): void {
  const section = rootFor(root);
  const video = section?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
  video?.pause();
  section?.setAttribute('data-phone-ph-media', 'fallback');
  video?.setAttribute('data-phone-ph-media', 'fallback');
  renderPhHold(section);
}

export function parkPhonePhMedia(root: HTMLElement | null | undefined): void {
  const section = rootFor(root);
  parkPhMedia(section);
  if (section?.dataset.phonePhMedia !== 'fallback') {
    section?.setAttribute('data-phone-ph-media', 'parked');
  }
}

/** One canonical PH media root with phone-owned lifecycle and cleanup. */
export const PhonePh = forwardRef<PhoneSceneAdapterHandle, PhoneSceneAdapterProps>(
  function PhonePh({ active, onReady, reducedMotion }, forwardedRef) {
    const rootRef = useRef<HTMLElement | null>(null);
    const autoplayRef = useRef<PhonePhAutoplay | null>(null);
    const requestedAutoplayDirectionRef = useRef<PhonePhPlaybackDirection | null>(null);
    const lastProgressRef = useRef(0);
    const directionRef = useRef<PhonePhPlaybackDirection>(1);
    const runRevisionRef = useRef(0);

    const render = useCallback((
      rawProgress: number,
      requestedDirection?: PhonePhPlaybackDirection
    ) => {
      const root = rootRef.current;
      const progress = phonePhPresentationProgress(rawProgress, reducedMotion);
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
      const mediaRun: PhMediaRun = {
        runId: `phone-ph:${directionRef.current}:${runRevisionRef.current}`,
        direction: directionRef.current,
        reducedMotion
      };
      renderPhAnimationProgress(root, progress, { mediaRun });
      root?.setAttribute('data-phone-ph-progress', progress.toFixed(4));
      root?.setAttribute('data-phone-ph-clock', requestedDirection ? 'autoplay' : 'endpoint');
    }, [reducedMotion]);

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      const video = root.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
      const onMediaError = () => applyPhonePhMediaFallback(root);
      renderPhHold(root);
      const autoplay = createPhonePhAutoplay(render, (direction) => {
        requestedAutoplayDirectionRef.current = null;
        root.dataset.phonePhAutoplay = direction === 1
          ? 'complete-forward'
          : 'complete-reverse';
      });
      autoplayRef.current = autoplay;
      root.dataset.phonePhLifecycle = 'ready';
      const requestedDirection = requestedAutoplayDirectionRef.current;
      if (requestedDirection !== null) {
        if (reducedMotion) {
          render(requestedDirection === 1 ? 1 : 0, requestedDirection);
          root.dataset.phonePhAutoplay = requestedDirection === 1
            ? 'complete-forward'
            : 'complete-reverse';
        } else {
          autoplay.start(requestedDirection);
        }
      }
      video?.addEventListener('error', onMediaError);
      onReady?.();
      return () => {
        video?.removeEventListener('error', onMediaError);
        autoplay.dispose();
        if (autoplayRef.current === autoplay) autoplayRef.current = null;
        parkPhonePhMedia(root);
        delete root.dataset.phonePhLifecycle;
        delete root.dataset.phonePhAutoplay;
      };
    }, [onReady, reducedMotion, render]);

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      root.dataset.phonePhActive = String(active);
    }, [active]);

    useImperativeHandle(forwardedRef, () => ({
      root: () => rootRef.current,
      update(progress) {
        requestedAutoplayDirectionRef.current = null;
        autoplayRef.current?.stop();
        render(progress);
      },
      enter() {
        const root = rootRef.current;
        requestedAutoplayDirectionRef.current = 1;
        root?.removeAttribute('aria-hidden');
        root?.setAttribute('data-phone-ph-state', 'entered');
        root?.setAttribute('data-phone-ph-autoplay', 'starting-forward');
        if (reducedMotion) {
          render(1, 1);
          root?.setAttribute('data-phone-ph-autoplay', 'complete-forward');
          return;
        }
        autoplayRef.current?.start(1);
      },
      leave() {
        requestedAutoplayDirectionRef.current = null;
        autoplayRef.current?.stop();
        parkPhonePhMedia(rootRef.current);
        rootRef.current?.setAttribute('data-phone-ph-state', 'parked');
      },
      reverse() {
        const root = rootRef.current;
        requestedAutoplayDirectionRef.current = -1;
        root?.setAttribute('data-phone-ph-state', 'reversing');
        root?.setAttribute('data-phone-ph-autoplay', 'starting-reverse');
        if (reducedMotion) {
          render(0, -1);
          root?.setAttribute('data-phone-ph-autoplay', 'complete-reverse');
          return;
        }
        autoplayRef.current?.start(-1);
      },
      dispose() {
        requestedAutoplayDirectionRef.current = null;
        autoplayRef.current?.dispose();
        parkPhonePhMedia(rootRef.current);
      }
    }), [reducedMotion, render]);

    const PhSurface = phAnimationScene.Component;
    return (
      <div
        className="phone-ph"
        data-phone-scene="ph-animation"
        data-phone-input-owner="none"
        aria-hidden="true"
      >
        <PhSurface
          scene={phAnimationScene.id}
          hidden={false}
          registerHandle={(name, element) => {
            if (name === 'field') rootRef.current = element;
          }}
        />
      </div>
    );
  }
);

export default PhonePh;
