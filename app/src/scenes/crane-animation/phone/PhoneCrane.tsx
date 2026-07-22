import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import { disposeTimelineVideoDriver } from '../../../media/timeline-video-driver';
import { craneAnimationScene, prepareCraneAnimationFrame } from '..';
import type {
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
} from '../../../production/phone/types';
import { dispatchPhoneLabContactAutoplay } from '../../../production/phone/phone-lab-contact-timeline';
import {
  createPhoneCraneForwardRun,
  createPhoneCraneReverseDissolve,
  phoneCraneVideos,
  type PhoneCraneForwardRun,
  type PhoneCraneReverseDissolve
} from './PhoneCrane.autoplay';
import {
  PHONE_CRANE_STABLE_HOLD_PROGRESS,
  phoneCranePresentationProgress,
  renderPhoneCranePresentation,
  type PhoneCranePlaybackDirection
} from './PhoneCrane.motion';
import './PhoneCrane.css';

export {
  PHONE_CRANE_STABLE_HOLD_PROGRESS,
  phoneCranePresentationProgress,
  renderPhoneCranePresentation
} from './PhoneCrane.motion';

function rootFor(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="crane-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="crane-animation"]') ?? null;
}

export function parkPhoneCraneMedia(root: HTMLElement | null | undefined): void {
  const section = rootFor(root);
  for (const video of phoneCraneVideos(section)) {
    if (!video) continue;
    disposeTimelineVideoDriver(video);
    video.pause();
  }
  if (section?.dataset.phoneCraneMedia !== 'fallback') {
    section?.setAttribute('data-phone-crane-media', 'parked');
  }
}

export function applyPhoneCraneMediaFallback(
  root: HTMLElement | null | undefined
): void {
  const section = rootFor(root);
  renderPhoneCranePresentation(section, 0);
  for (const video of phoneCraneVideos(section)) {
    if (!video) continue;
    disposeTimelineVideoDriver(video);
    video.pause();
    video.setAttribute('data-phone-crane-media', 'fallback');
  }
  section?.setAttribute('data-phone-crane-media', 'fallback');
}

/** Crane reuses AOD's native-clock/snap policy with two staggered owners. */
export const PhoneCrane = forwardRef<
  PhoneSceneAdapterHandle,
  PhoneSceneAdapterProps
>(function PhoneCrane({ onReady, reducedMotion }, forwardedRef) {
  const rootRef = useRef<HTMLElement | null>(null);
  const forwardRunRef = useRef<PhoneCraneForwardRun | null>(null);
  const reverseDissolveRef = useRef<PhoneCraneReverseDissolve | null>(null);
  const endpointControllerRef = useRef<AbortController | null>(null);
  const requestedDirectionRef = useRef<PhoneCranePlaybackDirection | null>(null);

  const render = useCallback((
    rawProgress: number,
    direction: PhoneCranePlaybackDirection = 1
  ) => {
    renderPhoneCranePresentation(
      rootRef.current,
      phoneCranePresentationProgress(rawProgress, reducedMotion),
      direction
    );
  }, [reducedMotion]);

  const completeRun = useCallback((direction: PhoneCranePlaybackDirection) => {
    const root = rootRef.current;
    requestedDirectionRef.current = null;
    root?.setAttribute(
      'data-phone-crane-autoplay',
      direction === 1 ? 'complete-forward' : 'complete-reverse'
    );
    if (root) {
      dispatchPhoneLabContactAutoplay(root, {
        scene: 'crane-animation',
        phase: 'complete',
        direction
      });
    }
  }, []);

  const startRun = useCallback((direction: PhoneCranePlaybackDirection) => {
    const root = rootRef.current;
    if (!root) return;
    requestedDirectionRef.current = direction;
    root.setAttribute(
      'data-phone-crane-autoplay',
      direction === 1 ? 'starting-forward' : 'starting-reverse'
    );
    dispatchPhoneLabContactAutoplay(root, {
      scene: 'crane-animation',
      phase: 'start',
      direction
    });
    if (reducedMotion) {
      render(
        direction === 1 ? PHONE_CRANE_STABLE_HOLD_PROGRESS : 0,
        direction
      );
      completeRun(direction);
      return;
    }
    if (direction === 1) {
      endpointControllerRef.current?.abort();
      reverseDissolveRef.current?.stop();
      forwardRunRef.current?.start();
    } else {
      forwardRunRef.current?.stop();
      reverseDissolveRef.current?.start();
    }
  }, [completeRun, reducedMotion, render]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    render(0);
    const forwardRun = createPhoneCraneForwardRun(
      root,
      render,
      () => {
        const controller = new AbortController();
        endpointControllerRef.current?.abort();
        endpointControllerRef.current = controller;
        root.dataset.phoneCraneMedia = 'settling-endpoint';
        void prepareCraneAnimationFrame(
          root,
          PHONE_CRANE_STABLE_HOLD_PROGRESS,
          {
            runId: 'phone-crane:stable-endpoint',
            direction: -1,
            reducedMotion,
            signal: controller.signal
          }
        ).then(() => {
          if (controller.signal.aborted) return;
          render(PHONE_CRANE_STABLE_HOLD_PROGRESS, 1);
          root.dataset.phoneCraneMedia = 'stable-endpoint';
          completeRun(1);
        }).catch(() => {
          if (controller.signal.aborted) return;
          applyPhoneCraneMediaFallback(root);
          completeRun(1);
        });
      },
      () => {
        applyPhoneCraneMediaFallback(root);
        completeRun(1);
      }
    );
    if (!forwardRun) {
      applyPhoneCraneMediaFallback(root);
      onReady?.();
      return;
    }
    const reverseDissolve = createPhoneCraneReverseDissolve(
      render,
      () => completeRun(-1)
    );
    forwardRunRef.current = forwardRun;
    reverseDissolveRef.current = reverseDissolve;
    root.dataset.phoneCraneLifecycle = 'ready';
    const requestedDirection = requestedDirectionRef.current;
    if (requestedDirection !== null) startRun(requestedDirection);
    onReady?.();

    return () => {
      endpointControllerRef.current?.abort();
      forwardRun.dispose();
      reverseDissolve.dispose();
      if (forwardRunRef.current === forwardRun) forwardRunRef.current = null;
      if (reverseDissolveRef.current === reverseDissolve) reverseDissolveRef.current = null;
      parkPhoneCraneMedia(root);
      delete root.dataset.phoneCraneLifecycle;
      delete root.dataset.phoneCraneAutoplay;
    };
  }, [completeRun, onReady, reducedMotion, render, startRun]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    update(progress) {
      requestedDirectionRef.current = null;
      endpointControllerRef.current?.abort();
      forwardRunRef.current?.stop();
      reverseDissolveRef.current?.stop();
      render(progress);
    },
    enter() {
      rootRef.current?.removeAttribute('aria-hidden');
      rootRef.current?.setAttribute('data-phone-crane-state', 'entered');
      startRun(1);
    },
    leave() {
      requestedDirectionRef.current = null;
      endpointControllerRef.current?.abort();
      forwardRunRef.current?.stop();
      reverseDissolveRef.current?.stop();
      parkPhoneCraneMedia(rootRef.current);
      rootRef.current?.setAttribute('data-phone-crane-state', 'parked');
    },
    reverse() {
      rootRef.current?.setAttribute('data-phone-crane-state', 'reversing');
      startRun(-1);
    },
    dispose() {
      requestedDirectionRef.current = null;
      endpointControllerRef.current?.abort();
      forwardRunRef.current?.dispose();
      reverseDissolveRef.current?.dispose();
      parkPhoneCraneMedia(rootRef.current);
    }
  }), [render, startRun]);

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
