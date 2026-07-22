import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { disposeTimelineVideoDriver } from '../../../media/timeline-video-driver';
import {
  parkPhMedia,
  PH_FIGURE_END_SECONDS,
  phAnimationScene,
  renderPhAnimationProgress,
  renderPhHold
} from '..';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../../../production/phone/types';
import {
  createPhoneNativeAutoplay,
  type PhoneNativeAutoplay
} from '../../../production/phone/phone-native-autoplay';
import { dispatchPhoneLabContactAutoplay } from '../../../production/phone/phone-lab-contact-timeline';
import './PhonePh.css';

const PHONE_PH_REVERSE_DISSOLVE_MS = 520;

type PhonePhPlaybackDirection = 1 | -1;

type PhonePhReverseDissolve = Readonly<{
  start(): void;
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
 * PH has no approved reverse media source. Its Grade-B reverse decision is a
 * stable terminal frame dissolving to the stable opening camera; it never
 * seeks the forward source backwards on Safari.
 */
function createPhonePhReverseDissolve(
  render: (progress: number, direction: PhonePhPlaybackDirection) => void,
  onComplete: () => void
): PhonePhReverseDissolve {
  let disposed = false;
  let active = false;
  let frame = 0;
  let startedAt = 0;

  const cancel = () => {
    if (!frame) return;
    window.cancelAnimationFrame(frame);
    frame = 0;
  };
  const tick: FrameRequestCallback = (now) => {
    frame = 0;
    if (!active || disposed) return;
    const elapsed = clamp((now - startedAt) / PHONE_PH_REVERSE_DISSOLVE_MS);
    render(1 - elapsed, -1);
    if (elapsed >= 1) {
      active = false;
      onComplete();
      return;
    }
    frame = window.requestAnimationFrame(tick);
  };

  return {
    start() {
      if (disposed || active) return;
      cancel();
      active = true;
      startedAt = performance.now();
      render(1, -1);
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

export function phonePhPresentationProgress(
  rawProgress: number,
  reducedMotion = false
): number {
  const progress = clamp(rawProgress);
  return reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
}

/**
 * Native playback reports media time, while the canonical desktop renderer
 * expects its pre-retiming timeline progress. Invert phPlaybackProgress's
 * 0.78p + 0.22p² curve so every camera layer stays on the authored frame.
 */
export function phonePhTimelineProgressForMediaProgress(
  rawMediaProgress: number
): number {
  const mediaProgress = clamp(rawMediaProgress);
  return clamp(
    (-0.78 + Math.sqrt(0.78 * 0.78 + 0.88 * mediaProgress)) / 0.44
  );
}

/** Figure2-style stable surface: media failure cannot remove the PH camera. */
export function applyPhonePhMediaFallback(
  root: HTMLElement | null | undefined
): void {
  const section = rootFor(root);
  const video = section?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
  if (video) {
    disposeTimelineVideoDriver(video);
    video.pause();
  }
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

/**
 * Figure2 supplies the stable phone composition; AOD supplies time ownership.
 * The canonical PH video remains the only media element and native currentTime
 * drives every forward presentation sample after the scroll snap begins.
 */
export const PhonePh = forwardRef<PhoneSceneAdapterHandle, PhoneSceneAdapterProps>(
  function PhonePh({ active, onReady, reducedMotion }, forwardedRef) {
    const rootRef = useRef<HTMLElement | null>(null);
    const nativeAutoplayRef = useRef<PhoneNativeAutoplay | null>(null);
    const reverseDissolveRef = useRef<PhonePhReverseDissolve | null>(null);
    const requestedDirectionRef = useRef<PhonePhPlaybackDirection | null>(null);

    const render = useCallback((
      rawProgress: number,
      direction: PhonePhPlaybackDirection = 1
    ) => {
      const root = rootRef.current;
      const progress = phonePhPresentationProgress(rawProgress, reducedMotion);
      renderPhAnimationProgress(root, progress);
      root?.style.setProperty(
        '--ph-video-opacity',
        direction === -1 ? progress.toFixed(4) : '1'
      );
      root?.setAttribute('data-phone-ph-progress', progress.toFixed(4));
      root?.setAttribute('data-phone-ph-clock', direction === 1 ? 'native' : 'endpoint-dissolve');
    }, [reducedMotion]);

    const completeRun = useCallback((direction: PhonePhPlaybackDirection) => {
      const root = rootRef.current;
      requestedDirectionRef.current = null;
      root?.setAttribute(
        'data-phone-ph-autoplay',
        direction === 1 ? 'complete-forward' : 'complete-reverse'
      );
      if (root) {
        dispatchPhoneLabContactAutoplay(root, {
          scene: 'ph-animation',
          phase: 'complete',
          direction
        });
      }
    }, []);

    const startRun = useCallback((direction: PhonePhPlaybackDirection) => {
      const root = rootRef.current;
      if (!root) return;
      requestedDirectionRef.current = direction;
      root.setAttribute(
        'data-phone-ph-autoplay',
        direction === 1 ? 'starting-forward' : 'starting-reverse'
      );
      dispatchPhoneLabContactAutoplay(root, {
        scene: 'ph-animation',
        phase: 'start',
        direction
      });
      if (reducedMotion) {
        render(direction === 1 ? 1 : 0, direction);
        completeRun(direction);
        return;
      }
      if (direction === 1) {
        reverseDissolveRef.current?.stop();
        root.style.setProperty('--ph-video-opacity', '1');
        nativeAutoplayRef.current?.start();
      } else {
        nativeAutoplayRef.current?.stop();
        root.querySelector<HTMLVideoElement>('[data-ph-alpha-video]')?.pause();
        reverseDissolveRef.current?.start();
      }
    }, [completeRun, reducedMotion, render]);

    useEffect(() => {
      const root = rootRef.current;
      const video = root?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
      if (!root || !video) return;

      // Retire the canonical cold-frame driver before native Route-B playback
      // takes ownership. This is the same one-owner boundary used by AOD.
      disposeTimelineVideoDriver(video);
      renderPhHold(root);
      const nativeAutoplay = createPhoneNativeAutoplay(video, {
        durationSeconds: PH_FIGURE_END_SECONDS,
        onProgress: (progress) => render(
          phonePhTimelineProgressForMediaProgress(progress),
          1
        ),
        onComplete: () => completeRun(1),
        onFailure: () => {
          applyPhonePhMediaFallback(root);
          completeRun(1);
        },
        onFrameReady: () => {
          video.dataset.timelineVideoFrameReady = 'true';
          root.dataset.phonePhMedia = 'playing';
          root.dataset.phPlaybackActive = 'true';
        }
      });
      const reverseDissolve = createPhonePhReverseDissolve(
        render,
        () => completeRun(-1)
      );
      nativeAutoplayRef.current = nativeAutoplay;
      reverseDissolveRef.current = reverseDissolve;
      root.dataset.phonePhLifecycle = 'ready';
      const requestedDirection = requestedDirectionRef.current;
      if (requestedDirection !== null) startRun(requestedDirection);
      onReady?.();

      return () => {
        nativeAutoplay.dispose();
        reverseDissolve.dispose();
        if (nativeAutoplayRef.current === nativeAutoplay) nativeAutoplayRef.current = null;
        if (reverseDissolveRef.current === reverseDissolve) reverseDissolveRef.current = null;
        parkPhonePhMedia(root);
        delete video.dataset.timelineVideoFrameReady;
        delete root.dataset.phonePhLifecycle;
        delete root.dataset.phonePhAutoplay;
      };
    }, [completeRun, onReady, render, startRun]);

    useEffect(() => {
      const root = rootRef.current;
      if (root) root.dataset.phonePhActive = String(active);
    }, [active]);

    useImperativeHandle(forwardedRef, () => ({
      root: () => rootRef.current,
      update(progress) {
        requestedDirectionRef.current = null;
        nativeAutoplayRef.current?.stop();
        reverseDissolveRef.current?.stop();
        render(progress);
      },
      enter() {
        rootRef.current?.removeAttribute('aria-hidden');
        rootRef.current?.setAttribute('data-phone-ph-state', 'entered');
        startRun(1);
      },
      leave() {
        requestedDirectionRef.current = null;
        nativeAutoplayRef.current?.stop();
        reverseDissolveRef.current?.stop();
        parkPhonePhMedia(rootRef.current);
        rootRef.current?.setAttribute('data-phone-ph-state', 'parked');
      },
      reverse() {
        rootRef.current?.setAttribute('data-phone-ph-state', 'reversing');
        startRun(-1);
      },
      dispose() {
        requestedDirectionRef.current = null;
        nativeAutoplayRef.current?.dispose();
        reverseDissolveRef.current?.dispose();
        parkPhonePhMedia(rootRef.current);
      }
    }), [render, startRun]);

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
