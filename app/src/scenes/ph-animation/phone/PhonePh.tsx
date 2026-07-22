import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef
} from 'react';
import {
  driveTimelineVideo,
  type TimelineVideoDriveInput
} from '../../../media/timeline-video-driver';
import { browserPrefersHevcAlpha } from '../../../media/alpha-video-sources';
import {
  PH_FIGURE_END_SECONDS,
  parkPhMedia,
  phPlaybackProgress,
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
const PH_VIDEO_DURATION_FALLBACK_SECONDS = 1.533;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function rootFor(root: HTMLElement | null | undefined): HTMLElement | null {
  return root?.matches('[data-r4-scene="ph-animation"]')
    ? root
    : root?.querySelector<HTMLElement>('[data-r4-scene="ph-animation"]') ?? null;
}

/** Phone scroll always owns the PH frame; desktop keeps its native playback. */
export function phonePhMediaInput(
  rawProgress: number,
  mediaRun: PhMediaRun
): TimelineVideoDriveInput {
  return {
    runId: mediaRun.runId,
    direction: mediaRun.direction,
    progress: phPlaybackProgress(rawProgress),
    durationFallbackSeconds: PH_VIDEO_DURATION_FALLBACK_SECONDS,
    startSeconds: 0,
    endSeconds: PH_FIGURE_END_SECONDS,
    timelineDurationMs: PH_PLAYBACK_MS,
    mode: 'timeline',
    nativePlaybackDirection: 1,
    allowSeekedFrameFallback: browserPrefersHevcAlpha(),
    ...(mediaRun.reducedMotion !== undefined ? { reducedMotion: mediaRun.reducedMotion } : {}),
    ...(mediaRun.signal ? { signal: mediaRun.signal } : {})
  };
}

/** Preserves canonical PH layers while the phone Adapter owns video seeking. */
export function renderPhonePhAnimationProgress(
  root: HTMLElement | null | undefined,
  rawProgress: number,
  mediaRun: PhMediaRun
): void {
  const section = rootFor(root);
  const raw = clamp(rawProgress);
  renderPhAnimationProgress(section, raw);
  const video = section?.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
  const snapshot = driveTimelineVideo(video, phonePhMediaInput(raw, mediaRun));
  section?.setAttribute('data-ph-playback-direction', String(mediaRun.direction));
  section?.setAttribute('data-ph-playback-run', mediaRun.runId);
  section?.setAttribute('data-ph-raw-progress', raw.toFixed(4));
  section?.setAttribute('data-ph-playback-active', String(raw > 0.001 && raw < 0.999));
  section?.setAttribute('data-ph-playback-fallback', String(snapshot?.nativeFallback ?? false));
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
    const lastProgressRef = useRef(0);
    const directionRef = useRef<1 | -1>(1);
    const runRevisionRef = useRef(0);

    const render = useCallback((rawProgress: number) => {
      const root = rootRef.current;
      const progress = phonePhPresentationProgress(rawProgress, reducedMotion);
      const previous = lastProgressRef.current;
      if (progress > previous + PROGRESS_EPSILON && directionRef.current !== 1) {
        directionRef.current = 1;
        runRevisionRef.current += 1;
      } else if (progress < previous - PROGRESS_EPSILON && directionRef.current !== -1) {
        directionRef.current = -1;
        runRevisionRef.current += 1;
      }
      lastProgressRef.current = progress;
      const mediaRun: PhMediaRun = {
        runId: `phone-ph:${directionRef.current}:${runRevisionRef.current}`,
        direction: directionRef.current,
        reducedMotion
      };
      renderPhonePhAnimationProgress(root, progress, mediaRun);
      root?.setAttribute('data-phone-ph-progress', progress.toFixed(4));
    }, [reducedMotion]);

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      const video = root.querySelector<HTMLVideoElement>('[data-ph-alpha-video]');
      const onMediaError = () => applyPhonePhMediaFallback(root);
      renderPhHold(root);
      root.dataset.phonePhLifecycle = 'ready';
      video?.addEventListener('error', onMediaError);
      onReady?.();
      return () => {
        video?.removeEventListener('error', onMediaError);
        parkPhonePhMedia(root);
        delete root.dataset.phonePhLifecycle;
      };
    }, [onReady]);

    useEffect(() => {
      const root = rootRef.current;
      if (!root) return;
      root.dataset.phonePhActive = String(active);
    }, [active]);

    useImperativeHandle(forwardedRef, () => ({
      root: () => rootRef.current,
      update: render,
      enter() {
        const root = rootRef.current;
        root?.removeAttribute('aria-hidden');
        root?.setAttribute('data-phone-ph-state', 'entered');
      },
      leave() {
        parkPhonePhMedia(rootRef.current);
        rootRef.current?.setAttribute('data-phone-ph-state', 'parked');
      },
      reverse() {
        rootRef.current?.setAttribute('data-phone-ph-state', 'reversing');
      },
      dispose() {
        parkPhonePhMedia(rootRef.current);
      }
    }), [render]);

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
