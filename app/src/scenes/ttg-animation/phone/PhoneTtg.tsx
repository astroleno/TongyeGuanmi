import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react';
import { browserPrefersHevcAlpha } from '../../../media/alpha-video-sources';
import {
  disposePhoneTimelineVideo,
  preparePhoneTimelineVideoFrame,
  type PhoneTimelineVideoInput
} from '../../../production/phone/phone-timeline-runtime';
import {
  createPhonePresentedReversePlayback,
  type PhonePresentedReversePlayback
} from '../../../production/phone/phone-presented-reverse-playback';
import type { Group45PhoneSceneProps } from '../../../production/phone/adapter-groups/group4-5';
import type {
  PhoneCinematicRequest,
  PhoneCinematicSceneAdapterHandle
} from '../../../production/phone/types';
import {
  phoneRuntimePresentationTokenKey,
  type PhoneExecutionToken,
  type PhoneRenderedPresentationFrame,
  type PresentationToken
} from '../../../production/phone/phone-story/runtime';
import {
  waitForPhonePresentationEvidence
} from '../../../production/phone/phone-transition-readiness';
import {
  createGroup45NativeAutoplay,
  type Group45NativeAutoplay,
  type Group45NativeAutoplayDirection,
  type Group45NativeAutoplayStatus
} from '../../../production/phone/adapter-groups/group4-5-native-autoplay';
import type {
  TargetPresentationRequest
} from '../../../story/presentation';
import {
  TTG_FIGURE_END_SECONDS,
  disposeTtgMedia,
  renderTtgAnimationProgress,
  ttgAnimationScene
} from '..';
import './PhoneTtg.css';
import {
  PHONE_TTG_LAB_DISSOLVE_MS,
  phoneTtgDissolveChapterProgress,
  phoneTtgMediaChapterProgress,
  phoneTtgReverseFrameProgress
} from './motion';

const TtgSurface = ttgAnimationScene.Component;
const PHONE_TTG_INITIAL_DATA_TIMEOUT_MS = 8000;
const PHONE_TTG_ENDPOINT_EVIDENCE_TIMEOUT_MS = 1000;
const PHONE_TTG_INITIAL_PRESENTATION_NUDGE_SECONDS = .0001;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function stableProgress(value: number): number {
  const progress = clamp(value);
  return progress < .002 ? 0 : progress > .998 ? 1 : progress;
}

function acceleratedProgress(value: number): number {
  const progress = stableProgress(value);
  return clamp(.78 * progress + .22 * progress * progress);
}

function viewportHeight(): number {
  return typeof window === 'undefined' ? 800 : Math.max(1, window.innerHeight);
}

export type PhoneTtgFrame = Readonly<{
  progress: number;
  visualProgress: number;
  backgroundY: number;
  backgroundScale: number;
  middleY: number;
  middleScale: number;
  foregroundY: number;
  figureY: number;
  figureScale: number;
  figureOpacity: number;
}>;

export type PhoneTtgMediaAction =
  | 'release'
  | 'static-fallback'
  | 'play-forward'
  | 'play-reverse'
  | 'hold-initial'
  | 'hold-terminal';

/** Immutable media preparation owned by one current machine revision. */
export type PhoneTtgTargetPreparation = Readonly<{
  endpoint: 0 | 1;
  direction: 1 | -1;
  /** The admission token that physically prepared this retained endpoint. */
  token: PresentationToken;
  signal: AbortSignal;
}>;

/** A physical endpoint is reusable only for the token that prepared it. */
export type PhoneTtgPreparedEndpoint = Readonly<{
  endpoint: 0 | 1;
  presentationKey: string;
}>;

type PhoneTtgPresentationBinding = Readonly<{
  token: PresentationToken;
  key: string;
  frameSequence: number;
  reported: boolean;
  report: (frame: PhoneRenderedPresentationFrame) => void;
}>;

type PhoneTtgProps = Group45PhoneSceneProps;

type VideoWithFrameCallbacks = HTMLVideoElement & Readonly<{
  requestVideoFrameCallback?: (
    callback: (now: DOMHighResTimeStamp, metadata: VideoFrameCallbackMetadata) => void
  ) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}>;

function sameExecution(
  left: PhoneExecutionToken | null,
  right: PhoneExecutionToken | null
): boolean {
  return left?.[0] === right?.[0]
    && left?.[1] === right?.[1]
    && left?.[2] === right?.[2]
    && left?.[3] === right?.[3]
    && left?.[4] === right?.[4]
    && (
      left?.[5] === undefined
      || right?.[5] === undefined
      || phoneRuntimePresentationTokenKey(left[5])
        === phoneRuntimePresentationTokenKey(right[5])
    );
}

/** Desktop-authored TTG motion sampled inside the portrait crop. */
export function phoneTtgFrame(
  rawProgress: number,
  reducedMotion = false,
  mediaFailed = false,
  height = viewportHeight()
): PhoneTtgFrame {
  const progress = reducedMotion ? 0 : stableProgress(rawProgress);
  const visualProgress = acceleratedProgress(progress);
  return {
    progress,
    visualProgress,
    backgroundY: visualProgress === 0 ? 0 : -visualProgress * height * .143,
    backgroundScale: 1 + visualProgress * .018,
    middleY: visualProgress * height * .235,
    middleScale: 1 + visualProgress * .012,
    foregroundY: height * .292 + visualProgress * height * .131,
    figureY: -height * .085 + visualProgress * height * .165,
    figureScale: .8,
    figureOpacity: mediaFailed || reducedMotion ? 0 : 1
  };
}

/** Scroll selects the stable endpoint; native media owns a forward run. */
export function phoneTtgMediaAction(
  active: boolean,
  prewarm = false,
  reducedMotion = false,
  mediaFailed = false,
  hasForwardRun = false,
  direction: 1 | -1 = 1
): PhoneTtgMediaAction {
  if (reducedMotion || mediaFailed) return 'static-fallback';
  if (active) return direction === -1 ? 'play-reverse' : 'play-forward';
  if (!prewarm) return 'release';
  return hasForwardRun ? 'hold-terminal' : 'hold-initial';
}

/**
 * Snapshot projection may lag a direct candidate by one render. The candidate
 * retains its media lease until abort, except when its real prepared endpoint
 * belongs to the active runner token or its declared forward successor.
 */
export function phoneTtgTargetPresentationLease(
  target: PhoneTtgTargetPreparation | null,
  fallback: PhoneTtgMediaAction,
  execution: PhoneExecutionToken | null = null,
  prepared: PhoneTtgPreparedEndpoint | null = null
): PhoneTtgMediaAction | 'retain-target-presentation' | 'discard-stale-target' {
  if (!target) return fallback;
  if (target.signal.aborted) return 'discard-stale-target';
  const token = execution?.[5];
  if (!token) return 'retain-target-presentation';
  if (
    token.authorityId !== execution?.[0]
    || token.sessionId !== execution?.[1]
    || token.generation !== execution?.[2]
    || token.leg !== execution?.[3]
    || target.direction !== execution?.[4]
    || target.token.authorityId !== token.authorityId
    || target.token.sessionId !== token.sessionId
    || target.token.generation !== token.generation
  ) return 'discard-stale-target';

  const targetKey = phoneRuntimePresentationTokenKey(target.token);
  if (!phoneTtgHasTokenBoundEndpointFrame(
    prepared,
    target.endpoint,
    targetKey
  )) return 'retain-target-presentation';

  const sameLeg = target.token.leg === token.leg
    && targetKey === phoneRuntimePresentationTokenKey(token);
  const forwardMediaSuccessor = target.direction === 1
    && target.token.leg === 0
    && token.revision > target.token.revision
    && target.token.subject === 'group45:effect'
    && target.token.kind === 'effect-frame'
    && token.leg === 1
    && token.subject === 'group45:ttg'
    && token.kind === 'packed-canvas-frame';
  return sameLeg || forwardMediaSuccessor
    ? fallback
    : 'discard-stale-target';
}

/** Never let an old endpoint or diagnostic marker satisfy a new revision. */
export function phoneTtgHasTokenBoundEndpointFrame(
  prepared: PhoneTtgPreparedEndpoint | null,
  endpoint: 0 | 1,
  presentationKey: string
): boolean {
  return prepared?.endpoint === endpoint
    && prepared.presentationKey === presentationKey;
}

/**
 * WebKit treats a zero-to-zero assignment as no decoder presentation request.
 * An exact, token-bound initial endpoint can move inside its first-frame
 * tolerance to request a new `requestVideoFrameCallback`; stale/terminal
 * endpoints retain the normal backward re-arm and can never prove this token.
 */
export function phoneTtgPresentationProbeTime(
  currentTime: number,
  prepared: PhoneTtgPreparedEndpoint | null,
  presentationKey: string
): number {
  if (phoneTtgHasTokenBoundEndpointFrame(prepared, 0, presentationKey)) {
    return PHONE_TTG_INITIAL_PRESENTATION_NUDGE_SECONDS;
  }
  return Math.max(0, currentTime - .00001);
}

export function phoneTtgHeldEndpoint(
  action: PhoneTtgMediaAction,
  orchestratorTarget: 0 | 1 | null
): 0 | 1 | null {
  if (action !== 'hold-initial' && action !== 'hold-terminal') return null;
  if (orchestratorTarget !== null) return orchestratorTarget;
  return action === 'hold-terminal' ? 1 : 0;
}

/** A live admission owns the bootstrap endpoint until its exact proof lands. */
export function phoneTtgBootstrapEndpoint(
  target: PhoneTtgTargetPreparation | null
): 0 | 1 {
  return target && !target.signal.aborted ? target.endpoint : 0;
}

/** Release the sole video owner and its decoder before TTG retires. */
export function releasePhoneTtgVideo(video: HTMLVideoElement | null): void {
  if (!video) return;
  disposePhoneTimelineVideo(video);
  video.pause();
  delete video.dataset.phoneTtgEndpointReady;
  delete video.dataset.phonePresentationFrame;
  delete video.dataset.phoneTtgPresentationToken;
  delete video.dataset.phoneTtgPresentationFrameToken;
  video.removeAttribute('src');
  for (const source of video.querySelectorAll('source')) {
    source.removeAttribute('src');
  }
  try {
    video.load();
  } catch {
    // Detached/mock media elements can reject a post-dispose load.
  }
}

function playbackLabel(
  status: Group45NativeAutoplayStatus,
  direction: Group45NativeAutoplayDirection
): string {
  if (status === 'idle') return 'stable-initial';
  if (status === 'complete') return direction === 1
    ? 'complete-forward'
    : 'complete-reverse';
  if (status === 'starting') return direction === 1
    ? 'starting-forward'
    : 'starting-reverse';
  if (status === 'playing') return direction === 1
    ? 'playing-forward'
    : 'playing-reverse';
  return status;
}

function ttgReverseMediaInput(
  runId: string,
  progress: number,
  signal: AbortSignal | null = null
): PhoneTimelineVideoInput {
  return [
    runId,
    -1,
    phoneTtgReverseFrameProgress(progress),
    2.5,
    0,
    TTG_FIGURE_END_SECONDS,
    null,
    TTG_FIGURE_END_SECONDS * 1000,
    'timeline',
    1,
    browserPrefersHevcAlpha(),
    signal
  ];
}

function ttgEndpointMediaInput(
  runId: string,
  endpoint: 0 | 1,
  direction: 1 | -1,
  allowSeekedFrameFallback = browserPrefersHevcAlpha(),
  signal: AbortSignal | null = null
): PhoneTimelineVideoInput {
  return [
    runId,
    direction,
    phoneTtgReverseFrameProgress(endpoint),
    2.5,
    0,
    TTG_FIGURE_END_SECONDS,
    null,
    TTG_FIGURE_END_SECONDS * 1000,
    'timeline',
    1,
    allowSeekedFrameFallback,
    signal
  ];
}

type PhoneTtgEndpointVideo = Pick<
  HTMLVideoElement,
  'currentTime' | 'duration' | 'readyState' | 'seeking' | 'dataset'
>;

export function phoneTtgHasReusableEndpointFrame(
  video: PhoneTtgEndpointVideo,
  endpoint: 0 | 1
): boolean {
  const terminal = Number.isFinite(video.duration) && video.duration > 0
    ? Math.min(TTG_FIGURE_END_SECONDS, video.duration)
    : TTG_FIGURE_END_SECONDS;
  const target = endpoint === 1 ? terminal : 0;
  const tolerance = endpoint === 1 ? .08 : .04;
  const endpointLabel = endpoint === 1 ? 'terminal' : 'initial';
  return video.dataset.phoneTtgEndpointReady === endpointLabel
    && video.dataset.phoneGroup45FrameReady === 'true'
    && video.readyState >= 2
    && !video.seeking
    && Math.abs(video.currentTime - target) <= tolerance;
}

/**
 * The timeline driver may verify a paused WebKit endpoint through its strict
 * seeked fallback when WebKit withholds a second rVFC. The leaf may forward
 * that exact decoder frame only after the machine has released and painted
 * its target layout; a stale token, stale endpoint, or unverified decoder
 * state never becomes a presentation proof.
 */
export function phoneTtgPreparedPresentationFrame(
  token: PresentationToken,
  prepared: PhoneTtgPreparedEndpoint | null,
  video: PhoneTtgEndpointVideo | null,
  frameSequence: number,
  observedAt: number
): PhoneRenderedPresentationFrame | null {
  const presentationKey = phoneRuntimePresentationTokenKey(token);
  const evidence = video?.dataset.timelineVideoFrameEvidence;
  if (
    !video
    || !prepared
    || !Number.isInteger(frameSequence)
    || frameSequence <= 0
    || !Number.isFinite(observedAt)
    || !phoneTtgHasTokenBoundEndpointFrame(
      prepared,
      prepared.endpoint,
      presentationKey
    )
    || !phoneTtgHasReusableEndpointFrame(video, prepared.endpoint)
    || video.dataset.timelineVideoFrameReady !== 'true'
    || (
      evidence !== 'video-frame-callback'
      && evidence !== 'seeked-fallback'
      && evidence !== 'playhead-reuse'
    )
  ) return null;
  return {
    token,
    frameSequence,
    observedAt,
    origin: 'leaf-post-paint'
  };
}

export function markPhoneTtgPresentedEndpoint(
  video: HTMLVideoElement,
  mediaTime: number
): void {
  const terminal = Number.isFinite(video.duration) && video.duration > 0
    ? Math.min(TTG_FIGURE_END_SECONDS, video.duration)
    : TTG_FIGURE_END_SECONDS;
  if (Math.abs(mediaTime - terminal) > .08) return;
  video.dataset.phoneGroup45FrameReady = 'true';
  video.dataset.phoneTtgEndpointReady = 'terminal';
}

function waitForPhoneTtgEndpoint(
  presented: () => boolean
): Promise<boolean> {
  return new Promise((resolve) => {
    const startedAt = performance.now();
    const inspect = (now: number) => {
      if (presented()) {
        resolve(true);
        return;
      }
      if (now - startedAt >= PHONE_TTG_ENDPOINT_EVIDENCE_TIMEOUT_MS) {
        resolve(false);
        return;
      }
      window.requestAnimationFrame(inspect);
    };
    window.requestAnimationFrame(inspect);
  });
}

export function waitForPhoneTtgCurrentData(
  video: HTMLVideoElement,
  signal: AbortSignal
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false);
  if (video.readyState >= 2) return Promise.resolve(true);
  return new Promise((resolve) => {
    let timeout = 0;
    let settled = false;
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      if (timeout) window.clearTimeout(timeout);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
      signal.removeEventListener('abort', onAbort);
      resolve(ready);
    };
    const onReady = () => finish(true);
    const onError = () => finish(false);
    const onAbort = () => finish(false);
    video.addEventListener('loadeddata', onReady, { once: true });
    video.addEventListener('canplay', onReady, { once: true });
    video.addEventListener('error', onError, { once: true });
    signal.addEventListener('abort', onAbort, { once: true });
    video.preload = 'auto';
    try {
      video.load();
    } catch {
      // A later current-data event can still settle detached/mock media.
    }
    if (video.readyState >= 2) {
      finish(true);
      return;
    }
    timeout = window.setTimeout(
      () => finish(false),
      PHONE_TTG_INITIAL_DATA_TIMEOUT_MS
    );
  });
}

/**
 * TTG keeps one canonical media owner. Forward playback remains native; the
 * reverse leg prepares its terminal frame before Lab uncovers TTG, then uses
 * the shared coalesced seek driver at the source's authored 30 fps cadence.
 * Both directions reserve the desktop-authored final 600 ms for the Lab
 * dissolve instead of hiding that handoff inside media playback.
 */
export const PhoneTtg = forwardRef<
  PhoneCinematicSceneAdapterHandle,
  PhoneTtgProps
>(function PhoneTtg(
  {
    active,
    direction = 1,
    execution = null,
    prewarm = false,
    reducedMotion,
    onComplete,
    onMediaError,
    onProgress,
    onPresentedFrame,
    onReady
  },
  forwardedRef
) {
  const rootRef = useRef<HTMLElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playbackRef = useRef<Group45NativeAutoplay | null>(null);
  const reversePlaybackRef = useRef<PhonePresentedReversePlayback | null>(null);
  const reverseAbortRef = useRef<AbortController | null>(null);
  const reverseTimelineGenerationRef = useRef<number | null>(null);
  const presentationBindingRef = useRef<PhoneTtgPresentationBinding | null>(null);
  const executionFrameRef = useRef<Readonly<{
    key: string;
    frameSequence: number;
  }> | null>(null);
  const presentationFrameCallbackRef = useRef(0);
  const presentationPaintFrameRef = useRef(0);
  const activeRef = useRef(active);
  const directionRef = useRef<1 | -1>(direction);
  const executionRef = useRef<PhoneExecutionToken | null>(execution);
  const runIdentityRef = useRef<PhoneExecutionToken | null>(execution);
  const prewarmRef = useRef(prewarm);
  const reducedMotionRef = useRef(reducedMotion);
  const mediaMountedRef = useRef((active || prewarm) && !reducedMotion);
  const mediaFailedRef = useRef(false);
  const mediaRetiringRef = useRef(false);
  const hasForwardRunRef = useRef(false);
  const forwardRequestedRef = useRef(false);
  const forwardIntentIdentityRef = useRef<PhoneExecutionToken | null>(null);
  const targetPreparationRef = useRef<PhoneTtgTargetPreparation | null>(null);
  const preparedEndpointRef = useRef<PhoneTtgPreparedEndpoint | null>(null);
  const completionReportedRef = useRef(false);
  const runGenerationRef = useRef(0);
  const initialFrameGenerationRef = useRef(0);
  const initialFramePreparationRef = useRef<Promise<boolean> | null>(null);
  const initialFrameAbortRef = useRef<AbortController | null>(null);
  const initialFrameTokenRef = useRef<string | null>(null);
  const reverseRunIdRef = useRef('phone-ttg-reverse-0');
  const chapterTransitionFrameRef = useRef(0);
  const completionListenerRef = useRef(onComplete);
  const mediaErrorListenerRef = useRef(onMediaError);
  const progressListenerRef = useRef(onProgress);
  const presentedFrameListenerRef = useRef(onPresentedFrame);
  const [mediaMounted, setMediaMounted] = useState(mediaMountedRef.current);
  const [mediaReady, setMediaReady] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  completionListenerRef.current = onComplete;
  mediaErrorListenerRef.current = onMediaError;
  progressListenerRef.current = onProgress;
  presentedFrameListenerRef.current = onPresentedFrame;

  const clearPresentationFrameCallback = useCallback(() => {
    const video = videoRef.current as VideoWithFrameCallbacks | null;
    if (presentationFrameCallbackRef.current) {
      video?.cancelVideoFrameCallback?.(presentationFrameCallbackRef.current);
      presentationFrameCallbackRef.current = 0;
    }
    if (presentationPaintFrameRef.current && typeof window !== 'undefined') {
      window.cancelAnimationFrame(presentationPaintFrameRef.current);
      presentationPaintFrameRef.current = 0;
    }
  }, []);
  const reportPresentationFrame = useCallback((key: string) => {
    const binding = presentationBindingRef.current;
    if (!binding || binding.key !== key || binding.reported) return false;
    const frame = phoneTtgPreparedPresentationFrame(
      binding.token,
      preparedEndpointRef.current,
      videoRef.current,
      binding.frameSequence + 1,
      typeof performance !== 'undefined'
        && typeof performance.now === 'function'
        ? performance.now()
        : 0
    );
    if (!frame) return false;
    const next = {
      ...binding,
      frameSequence: frame.frameSequence,
      reported: true
    };
    presentationBindingRef.current = next;
    clearPresentationFrameCallback();
    next.report(frame);
    return true;
  }, [clearPresentationFrameCallback]);
  const armPreparedPresentationPostPaint = useCallback((key: string) => {
    if (typeof window === 'undefined') return;
    const attempt = () => {
      presentationPaintFrameRef.current = 0;
      const binding = presentationBindingRef.current;
      if (!binding || binding.key !== key || binding.reported) return;
      if (reportPresentationFrame(key)) return;
      presentationPaintFrameRef.current = window.requestAnimationFrame(attempt);
    };
    // The runner has already completed machine-owned landing confirmation.
    // Two browser frames establish that the exact verified decoder endpoint
    // now occupies the candidate plane before the leaf forwards it.
    presentationPaintFrameRef.current = window.requestAnimationFrame(() => {
      presentationPaintFrameRef.current = window.requestAnimationFrame(attempt);
    });
  }, [reportPresentationFrame]);
  const reportExecutionFrame = useCallback(() => {
    const identity = runIdentityRef.current;
    const token = identity?.[5];
    if (
      !identity
      || !token
      || !activeRef.current
      || mediaRetiringRef.current
    ) return;
    const key = phoneRuntimePresentationTokenKey(token);
    const prior = executionFrameRef.current;
    const next = {
      key,
      frameSequence: prior?.key === key ? prior.frameSequence + 1 : 1
    };
    executionFrameRef.current = next;
    presentedFrameListenerRef.current?.('ttg-animation', {
      token,
      frameSequence: next.frameSequence,
      observedAt: typeof performance !== 'undefined'
        && typeof performance.now === 'function'
        ? performance.now()
        : 0,
      origin: 'segment-first-frame'
    });
  }, []);

  const registerHandle = useCallback((name: string, element: HTMLElement | null) => {
    if (name !== 'figure-video') return;
    element?.setAttribute('data-phone-ttg-video', '');
    videoRef.current = element as HTMLVideoElement | null;
  }, []);

  const renderFrame = useCallback((rawProgress: number) => {
    const root = rootRef.current;
    const frame = phoneTtgFrame(
      rawProgress,
      reducedMotionRef.current,
      mediaFailedRef.current
    );
    if (!root) return;
    renderTtgAnimationProgress(root, frame.progress);
    const surface = root.querySelector<HTMLElement>('[data-r4-scene="ttg-animation"]');
    surface?.style.setProperty('--ttg-bg-y', `${frame.backgroundY.toFixed(2)}px`);
    surface?.style.setProperty('--ttg-bg-scale', frame.backgroundScale.toFixed(4));
    surface?.style.setProperty('--ttg-middle-y', `${frame.middleY.toFixed(2)}px`);
    surface?.style.setProperty('--ttg-middle-scale', frame.middleScale.toFixed(4));
    surface?.style.setProperty('--ttg-front-y', `${frame.foregroundY.toFixed(2)}px`);
    surface?.style.setProperty('--ttg-figure-y', `${frame.figureY.toFixed(2)}px`);
    surface?.style.setProperty('--ttg-figure-scale', frame.figureScale.toFixed(4));
    surface?.style.setProperty('--ttg-figure-video-opacity', frame.figureOpacity.toFixed(4));
    surface?.removeAttribute('data-ttg-static-media-fallback');
    root.style.setProperty('--phone-ttg-background-y', `${frame.backgroundY.toFixed(2)}px`);
    root.style.setProperty('--phone-ttg-background-scale', frame.backgroundScale.toFixed(4));
    root.style.setProperty('--phone-ttg-middle-y', `${frame.middleY.toFixed(2)}px`);
    root.style.setProperty('--phone-ttg-middle-scale', frame.middleScale.toFixed(4));
    root.style.setProperty('--phone-ttg-foreground-y', `${frame.foregroundY.toFixed(2)}px`);
    root.style.setProperty('--phone-ttg-figure-y', `${frame.figureY.toFixed(2)}px`);
    root.style.setProperty('--phone-ttg-figure-scale', frame.figureScale.toFixed(4));
    root.style.setProperty('--phone-ttg-figure-opacity', frame.figureOpacity.toFixed(4));
    if (import.meta.env.DEV) {
      root.dataset.phoneTtgProgress = frame.progress.toFixed(4);
      root.dataset.phoneTtgVisualProgress = frame.visualProgress.toFixed(4);
    }
  }, []);

  const cancelChapterTransition = useCallback(() => {
    if (!chapterTransitionFrameRef.current) return;
    window.cancelAnimationFrame(chapterTransitionFrameRef.current);
    chapterTransitionFrameRef.current = 0;
  }, []);

  const publishChapterProgress = useCallback((
    progress: number,
    playbackDirection: Group45NativeAutoplayDirection
  ) => {
    const identity = runIdentityRef.current;
    if (identity?.[4] !== playbackDirection) return;
    progressListenerRef.current?.(
      'ttg-animation',
      identity,
      stableProgress(progress)
    );
  }, []);

  const runChapterDissolve = useCallback((
    playbackDirection: Group45NativeAutoplayDirection,
    generation: number,
    onComplete: () => void
  ) => {
    cancelChapterTransition();
    let startedAt: number | undefined;
    const tick: FrameRequestCallback = (time) => {
      chapterTransitionFrameRef.current = 0;
      if (
        mediaRetiringRef.current
        || generation !== runGenerationRef.current
      ) return;
      if (startedAt === undefined) startedAt = time;
      const progress = clamp(
        (time - startedAt) / PHONE_TTG_LAB_DISSOLVE_MS
      );
      publishChapterProgress(
        phoneTtgDissolveChapterProgress(progress, playbackDirection),
        playbackDirection
      );
      rootRef.current?.setAttribute(
        'data-phone-ttg-playback',
        playbackDirection === 1
          ? 'dissolving-to-lab'
          : 'dissolving-to-ttg'
      );
      if (progress >= 1) {
        onComplete();
        return;
      }
      chapterTransitionFrameRef.current = window.requestAnimationFrame(tick);
    };
    chapterTransitionFrameRef.current = window.requestAnimationFrame(tick);
  }, [cancelChapterTransition, publishChapterProgress]);

  const reportRunCompletion = useCallback((
    playbackDirection: Group45NativeAutoplayDirection,
    generation: number
  ) => {
    const identity = runIdentityRef.current;
    if (
      mediaRetiringRef.current
      || generation !== runGenerationRef.current
      || completionReportedRef.current
      || !identity
      || identity[4] !== playbackDirection
    ) return;
    completionReportedRef.current = true;
    completionListenerRef.current?.('ttg-animation', identity);
  }, []);

  const mountMedia = useCallback(() => {
    if (mediaMountedRef.current) return;
    mediaMountedRef.current = true;
    mediaRetiringRef.current = false;
    setMediaMounted(true);
  }, []);

  const releaseMedia = useCallback(() => {
    runGenerationRef.current += 1;
    initialFrameGenerationRef.current += 1;
    initialFrameAbortRef.current?.abort();
    initialFrameAbortRef.current = null;
    initialFramePreparationRef.current = null;
    reverseAbortRef.current?.abort();
    reverseAbortRef.current = null;
    reverseTimelineGenerationRef.current = null;
    cancelChapterTransition();
    mediaRetiringRef.current = true;
    forwardRequestedRef.current = false;
    forwardIntentIdentityRef.current = null;
    targetPreparationRef.current = null;
    preparedEndpointRef.current = null;
    runIdentityRef.current = null;
    presentationBindingRef.current = null;
    executionFrameRef.current = null;
    clearPresentationFrameCallback();
    playbackRef.current?.dispose();
    playbackRef.current = null;
    reversePlaybackRef.current?.dispose();
    reversePlaybackRef.current = null;
    disposeTtgMedia(rootRef.current);
    delete rootRef.current?.dataset.phonePresentationFrame;
    releasePhoneTtgVideo(videoRef.current);
    mediaMountedRef.current = false;
    setMediaReady(false);
    setMediaMounted(false);
  }, [cancelChapterTransition, clearPresentationFrameCallback]);

  const failMedia = useCallback(() => {
    if (mediaRetiringRef.current || mediaFailedRef.current) return;
    const identity = runIdentityRef.current;
    mediaFailedRef.current = true;
    setMediaFailed(true);
    releaseMedia();
    rootRef.current?.setAttribute(
      'data-phone-media-state',
      'retryable-failure'
    );
    if (identity) mediaErrorListenerRef.current?.('ttg-animation', identity);
  }, [releaseMedia]);

  const ensureInitialFrame = useCallback((
    video: HTMLVideoElement,
    presentationToken?: string
  ) => {
    const tokenMatches = presentationToken === undefined
      || phoneTtgHasTokenBoundEndpointFrame(
        preparedEndpointRef.current,
        0,
        presentationToken
      );
    if (phoneTtgHasReusableEndpointFrame(video, 0) && tokenMatches) {
      setMediaReady(true);
      return Promise.resolve(true);
    }
    const pending = initialFramePreparationRef.current;
    if (pending && initialFrameTokenRef.current === (presentationToken ?? null)) {
      return pending;
    }

    const preparationGeneration = ++initialFrameGenerationRef.current;
    const preparationController = new AbortController();
    initialFrameAbortRef.current?.abort();
    initialFrameAbortRef.current = preparationController;
    initialFrameTokenRef.current = presentationToken ?? null;
    rootRef.current?.setAttribute(
      'data-phone-ttg-playback',
      'preparing-initial-frame'
    );
    const preparation = waitForPhoneTtgCurrentData(
      video,
      preparationController.signal
    ).then((hasCurrentData) => {
      if (
        !hasCurrentData
        || mediaRetiringRef.current
        || preparationGeneration !== initialFrameGenerationRef.current
      ) return null;
      return preparePhoneTimelineVideoFrame(
        video,
        // The prewarmed stage is intentionally visibility-hidden. Chromium
        // can withhold rVFC there, while iOS HEVC already needs the same
        // decoded-current-data fallback. A settled seek plus 120 ms of stable
        // current data is sufficient before the ink contour exposes video.
        ttgEndpointMediaInput(
          `phone-ttg-initial-${preparationGeneration}:${presentationToken ?? 'hold'}`,
          0,
          1,
          true,
          preparationController.signal
        )
      );
    }).then((result) => {
      if (
        mediaRetiringRef.current
        || preparationGeneration !== initialFrameGenerationRef.current
        || videoRef.current !== video
      ) return false;
      if (result?.[0] !== 'ready') return false;
      video.dataset.phoneGroup45FrameReady = 'true';
      video.dataset.phoneTtgEndpointReady = 'initial';
      if (presentationToken !== undefined) {
        video.dataset.phoneTtgPresentationToken = presentationToken;
        preparedEndpointRef.current = {
          endpoint: 0,
          presentationKey: presentationToken
        };
      }
      setMediaReady(true);
      renderFrame(0);
      rootRef.current?.setAttribute(
        'data-phone-ttg-playback',
        'prepared-initial-frame'
      );
      return true;
    }).catch(() => {
      if (
        mediaRetiringRef.current
        || preparationGeneration !== initialFrameGenerationRef.current
      ) return false;
      failMedia();
      return false;
    }).finally(() => {
      if (initialFrameAbortRef.current === preparationController) {
        initialFrameAbortRef.current = null;
      }
      if (initialFramePreparationRef.current === preparation) {
        initialFramePreparationRef.current = null;
      }
      if (initialFrameTokenRef.current === (presentationToken ?? null)) {
        initialFrameTokenRef.current = null;
      }
    });
    initialFramePreparationRef.current = preparation;
    return preparation;
  }, [failMedia, renderFrame]);

  const startRun = useCallback((
    runDirection: 1 | -1,
    identity: PhoneExecutionToken | null = executionRef.current
  ) => {
    if (
      !identity
      || identity[4] !== runDirection
      || reducedMotionRef.current
      || mediaFailedRef.current
    ) return;
    activeRef.current = true;
    directionRef.current = runDirection;
    cancelChapterTransition();
    const generation = ++runGenerationRef.current;
    runIdentityRef.current = identity;
    if (runDirection === -1) {
      reverseRunIdRef.current = `phone-ttg-reverse-${generation}`;
    }
    if (runDirection === 1) hasForwardRunRef.current = true;
    forwardRequestedRef.current = true;
    mountMedia();
    const playback = playbackRef.current;
    const reversePlayback = reversePlaybackRef.current;
    if (!playback || (runDirection === -1 && !reversePlayback)) return;
    completionReportedRef.current = false;
    forwardRequestedRef.current = false;
    if (runDirection === 1) {
      reverseAbortRef.current?.abort();
      reverseAbortRef.current = null;
      reverseTimelineGenerationRef.current = null;
      reversePlayback?.stop();
      const video = videoRef.current;
      if (!video) {
        failMedia();
        return;
      }
      const beginForwardPlayback = () => {
        if (
          mediaRetiringRef.current
          || generation !== runGenerationRef.current
        ) return;
        // The exact initial frame is now physically present. Retire its seek
        // driver before native playback takes sole ownership of the video.
        disposePhoneTimelineVideo(video);
        playback.start(1);
      };
      if (phoneTtgHasReusableEndpointFrame(video, 0)) {
        beginForwardPlayback();
        return;
      }
      void ensureInitialFrame(video).then((ready) => {
        if (
          !ready
          || mediaRetiringRef.current
          || generation !== runGenerationRef.current
        ) return;
        beginForwardPlayback();
      });
      return;
    }

    const video = videoRef.current;
    if (!video) {
      failMedia();
      return;
    }
    const reverseRunId = reverseRunIdRef.current;
    const reverseAbort = new AbortController();
    reverseAbortRef.current?.abort();
    reverseAbortRef.current = reverseAbort;
    reverseTimelineGenerationRef.current = null;
    publishChapterProgress(1, -1);
    rootRef.current?.setAttribute(
      'data-phone-ttg-playback',
      'preparing-reverse-terminal'
    );
    playback.reset(1);
    void preparePhoneTimelineVideoFrame(
      video,
      ttgReverseMediaInput(reverseRunId, 1, reverseAbort.signal)
    ).then(([status, frameRunId, frameDirection, frameGeneration]) => {
      if (
        mediaRetiringRef.current
        || generation !== runGenerationRef.current
        || reverseAbort.signal.aborted
        || reverseRunIdRef.current !== reverseRunId
      ) return;
      if (
        status !== 'ready'
        || frameRunId !== reverseRunId
        || frameDirection !== -1
        || frameGeneration === null
      ) {
        failMedia();
        return;
      }
      reverseTimelineGenerationRef.current = frameGeneration;
      video.dataset.phoneGroup45FrameReady = 'true';
      video.dataset.phoneTtgEndpointReady = 'terminal';
      reportExecutionFrame();
      runChapterDissolve(-1, generation, () => {
        if (
          mediaRetiringRef.current
          || generation !== runGenerationRef.current
          || reverseAbort.signal.aborted
        ) return;
        reversePlayback!.start();
      });
    }).catch(() => {
      if (!reverseAbort.signal.aborted) failMedia();
    });
  }, [
    cancelChapterTransition,
    ensureInitialFrame,
    failMedia,
    mountMedia,
    publishChapterProgress,
    reportExecutionFrame,
    runChapterDissolve
  ]);

  const reconcileMedia = useCallback(() => {
    const root = rootRef.current;
    if (root && import.meta.env.DEV) {
      root.dataset.phoneTtgActive = String(activeRef.current);
    }
    const target = targetPreparationRef.current;
    const fallback = phoneTtgMediaAction(
      activeRef.current,
      prewarmRef.current,
      reducedMotionRef.current,
      mediaFailedRef.current,
      hasForwardRunRef.current,
      directionRef.current
    );
    const targetAction = phoneTtgTargetPresentationLease(
      target,
      fallback,
      executionRef.current,
      preparedEndpointRef.current
    );
    if (targetAction === 'discard-stale-target') {
      targetPreparationRef.current = null;
      if (
        preparedEndpointRef.current?.presentationKey
          === phoneRuntimePresentationTokenKey(target!.token)
      ) preparedEndpointRef.current = null;
    }
    const action = targetAction === 'discard-stale-target'
      ? fallback
      : targetAction;
    if (target && (action === 'play-forward' || action === 'play-reverse')) {
      targetPreparationRef.current = null;
      preparedEndpointRef.current = null;
    }
    if (action === 'retain-target-presentation') {
      mediaRetiringRef.current = false;
      mountMedia();
      return;
    }
    if (action === 'static-fallback') {
      if (!mediaFailedRef.current) renderFrame(0);
      releaseMedia();
      return;
    }
    if (action === 'release') {
      releaseMedia();
      return;
    }
    mediaRetiringRef.current = false;
    mountMedia();
    const playback = playbackRef.current;
    if (!playback) return;
    if (action === 'play-forward' || action === 'play-reverse') {
      const identity = executionRef.current;
      if (
        forwardRequestedRef.current
        && forwardIntentIdentityRef.current
        && identity
        && sameExecution(forwardIntentIdentityRef.current, identity)
      ) {
        const runDirection = action === 'play-forward' ? 1 : -1;
        forwardRequestedRef.current = false;
        forwardIntentIdentityRef.current = null;
        startRun(runDirection, identity);
      }
      return;
    }
    forwardRequestedRef.current = false;
    const endpoint = phoneTtgHeldEndpoint(
      action,
      target?.endpoint ?? null
    );
    if (endpoint === null) return;
    const video = videoRef.current;
    if (video && phoneTtgHasReusableEndpointFrame(video, endpoint)) {
      // The endpoint was physically presented before the shell handoff.
      // Keep it parked instead of resetting currentTime and blanking Safari's
      // hardware video plane for one compositor frame.
      video.pause();
      renderFrame(endpoint);
      root?.setAttribute(
        'data-phone-ttg-playback',
        endpoint === 1 ? 'retained-terminal' : 'retained-initial'
      );
      return;
    }
    // prepareTargetPresentation owns terminal seeking while the source scene
    // remains semantically active. An inactive prewarm pass must not reset
    // that request back to frame zero.
    if (target?.endpoint === 1) return;
    playback.reset(endpoint);
    renderFrame(endpoint);
    if (endpoint === 0 && video) {
      void ensureInitialFrame(video);
    }
  }, [ensureInitialFrame, mountMedia, releaseMedia, renderFrame, startRun]);

  useEffect(() => {
    if (!mediaMounted) return;
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root || !video) return;
    let disposed = false;
    mediaRetiringRef.current = false;
    const handleAssetError = (event: Event) => {
      if (event.target instanceof HTMLImageElement || event.target === video) {
        failMedia();
      }
    };
    root.addEventListener('error', handleAssetError, true);

    // The canonical child prepares a desktop hold frame in its passive effect.
    // Retire that owner after effects flush, then give the same video element
    // directly to the AOD-style phone clock. No two drivers touch the playhead.
    const ownershipFrame = window.requestAnimationFrame(() => {
      if (disposed) return;
      disposeTtgMedia(root);
      disposePhoneTimelineVideo(video);
      const playback = createGroup45NativeAutoplay(video, {
        durationSeconds: TTG_FIGURE_END_SECONDS,
        onProgress: (progress, playbackDirection) => {
          renderFrame(progress);
          publishChapterProgress(
            phoneTtgMediaChapterProgress(progress),
            playbackDirection
          );
        },
        onStatus: (status, playbackDirection) => {
          if (rootRef.current) {
            rootRef.current.dataset.phoneTtgPlayback = playbackLabel(
              status,
              playbackDirection
            );
          }
        },
        onPresentedFrame: (mediaTime) => {
          markPhoneTtgPresentedEndpoint(video, mediaTime);
          video.dataset.phonePresentationFrame = 'ready';
          rootRef.current?.setAttribute('data-phone-presentation-frame', 'ready');
          reportExecutionFrame();
        },
        onComplete: () => {
          const completionGeneration = runGenerationRef.current;
          hasForwardRunRef.current = true;
          forwardRequestedRef.current = false;
          const forwardVideo = videoRef.current;
          if (!forwardVideo) {
            failMedia();
            return;
          }
          void waitForPhoneTtgEndpoint(
            () => phoneTtgHasReusableEndpointFrame(forwardVideo, 1)
          ).then((presented) => {
            if (
              mediaRetiringRef.current
              || completionGeneration !== runGenerationRef.current
            ) return;
            if (!presented) {
              failMedia();
              return;
            }
            runChapterDissolve(1, completionGeneration, () => {
              reportRunCompletion(1, completionGeneration);
            });
          });
        },
        onError: failMedia
      });
      const reversePlayback = createPhonePresentedReversePlayback([
        TTG_FIGURE_END_SECONDS * 1000,
        async (progress) => {
          const reverseRunId = reverseRunIdRef.current;
          const runGeneration = runGenerationRef.current;
          const controller = reverseAbortRef.current;
          if (!controller || controller.signal.aborted) return false;
          const [status, frameRunId, frameDirection, frameGeneration] =
            await preparePhoneTimelineVideoFrame(
              video,
              ttgReverseMediaInput(reverseRunId, progress, controller.signal)
            );
          if (
            controller.signal.aborted
            || mediaRetiringRef.current
            || runGeneration !== runGenerationRef.current
            || reverseRunId !== reverseRunIdRef.current
            || status !== 'ready'
            || frameRunId !== reverseRunId
            || frameDirection !== -1
            || frameGeneration === null
          ) return false;
          const acceptedGeneration = reverseTimelineGenerationRef.current;
          if (
            acceptedGeneration !== null
            && acceptedGeneration !== frameGeneration
          ) return false;
          reverseTimelineGenerationRef.current = frameGeneration;
          video.dataset.phoneGroup45FrameReady = 'true';
          reportExecutionFrame();
          return true;
        },
        (progress) => {
          renderFrame(progress);
          publishChapterProgress(phoneTtgMediaChapterProgress(progress), -1);
        },
        () => {
          const completionGeneration = runGenerationRef.current;
          if (mediaRetiringRef.current) return;
          video.dataset.phoneGroup45FrameReady = 'true';
          video.dataset.phoneTtgEndpointReady = 'initial';
          setMediaReady(true);
          reportRunCompletion(-1, completionGeneration);
        },
        failMedia,
        (status) => {
          if (rootRef.current) {
            rootRef.current.dataset.phoneTtgPlayback = playbackLabel(status, -1);
          }
        },
        null,
        null,
        null
      ]);
      playbackRef.current = playback;
      reversePlaybackRef.current = reversePlayback;
      playback.reset(phoneTtgBootstrapEndpoint(targetPreparationRef.current));
      reconcileMedia();
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(ownershipFrame);
      root.removeEventListener('error', handleAssetError, true);
      reverseAbortRef.current?.abort();
      reverseAbortRef.current = null;
      reversePlaybackRef.current?.dispose();
      reversePlaybackRef.current = null;
      const playback = playbackRef.current;
      playback?.dispose();
      if (playbackRef.current === playback) playbackRef.current = null;
      cancelChapterTransition();
      disposeTtgMedia(root);
    };
  }, [
    cancelChapterTransition,
    ensureInitialFrame,
    failMedia,
    mediaMounted,
    publishChapterProgress,
    reconcileMedia,
    renderFrame,
    reportExecutionFrame,
    reportRunCompletion,
    runChapterDissolve
  ]);

  useEffect(() => {
    executionRef.current = execution;
    activeRef.current = execution !== null;
    directionRef.current = execution?.[4] ?? direction;
    prewarmRef.current = prewarm;
    reducedMotionRef.current = reducedMotion;
    if (!execution) {
      forwardRequestedRef.current = false;
      forwardIntentIdentityRef.current = null;
      runIdentityRef.current = null;
      executionFrameRef.current = null;
    } else if (
      forwardIntentIdentityRef.current
      && !sameExecution(forwardIntentIdentityRef.current, execution)
    ) {
      forwardRequestedRef.current = false;
      forwardIntentIdentityRef.current = null;
    }
    reconcileMedia();
  }, [direction, execution, prewarm, reconcileMedia, reducedMotion]);

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  useEffect(() => () => releaseMedia(), [releaseMedia]);

  const prepareTargetPresentation = useCallback((
    request: TargetPresentationRequest
  ): Promise<void> => {
    const root = rootRef.current;
    if (!root) {
      return Promise.reject(new Error('TTG target root unavailable'));
    }
    const presentationKey = phoneRuntimePresentationTokenKey(
      request.presentationToken as PresentationToken
    );
    if (reducedMotionRef.current) {
      renderFrame(request.progress);
      return Promise.resolve();
    }
    if (mediaFailedRef.current) {
      mediaFailedRef.current = false;
      setMediaFailed(false);
      mediaRetiringRef.current = false;
      delete root.dataset.phoneMediaState;
    }
    mountMedia();
    const endpoint: 0 | 1 = request.progress >= 0.999 ? 1 : 0;
    const target = {
      endpoint,
      direction: request.direction,
      // A reused endpoint must never prove a new authority/revision token.
      token: request.presentationToken as PresentationToken,
      signal: request.signal
    } as const;
    targetPreparationRef.current = target;
    preparedEndpointRef.current = null;
    if (endpoint === 1) {
      initialFrameGenerationRef.current += 1;
      initialFrameAbortRef.current?.abort();
      initialFrameAbortRef.current = null;
      initialFramePreparationRef.current = null;
      // A prewarm initial-frame seek must not remain the physical playhead
      // owner after reverse admission claims the terminal endpoint.
      disposePhoneTimelineVideo(videoRef.current);
    }
    let terminalRequested = false;
    const abandon = () => {
      if (targetPreparationRef.current !== target) return;
      targetPreparationRef.current = null;
      if (preparedEndpointRef.current?.presentationKey === presentationKey) {
        preparedEndpointRef.current = null;
      }
      window.requestAnimationFrame(reconcileMedia);
    };
    request.signal.addEventListener('abort', abandon, { once: true });
    return waitForPhonePresentationEvidence(
      () => {
        if (root.dataset.phoneMediaState === 'retryable-failure') {
          return 'retryable-failure';
        }
        const video = videoRef.current;
        if (!video || !playbackRef.current) return null;
        // The exact timeline tuple is the immutable decoder fact. Do not
        // reject it later because Safari exposes a lagging mutable playhead.
        if (phoneTtgHasTokenBoundEndpointFrame(
          preparedEndpointRef.current,
          endpoint,
          presentationKey
        )) {
          return true;
        }
        if (endpoint === 0) {
          void ensureInitialFrame(video, presentationKey);
        } else if (!terminalRequested) {
          terminalRequested = true;
          void waitForPhoneTtgCurrentData(video, request.signal).then((ready) => {
            if (
              !ready
              || request.signal.aborted
              || targetPreparationRef.current !== target
            ) {
              if (!request.signal.aborted && targetPreparationRef.current === target) {
                failMedia();
              }
              return null;
            }
            return preparePhoneTimelineVideoFrame(
              video,
              ttgEndpointMediaInput(
                presentationKey,
                1,
                request.direction,
                browserPrefersHevcAlpha(),
                request.signal
              )
            );
          }).then((result) => {
            if (
              result?.[0] !== 'ready'
              || request.signal.aborted
              || targetPreparationRef.current !== target
            ) return;
            video.dataset.phoneGroup45FrameReady = 'true';
            video.dataset.phoneTtgEndpointReady = 'terminal';
            video.dataset.phoneTtgPresentationToken = presentationKey;
            preparedEndpointRef.current = {
              endpoint: 1,
              presentationKey
            };
            renderFrame(1);
          }).catch(() => {
            if (
              !request.signal.aborted
              && targetPreparationRef.current === target
            ) failMedia();
          });
        }
        return null;
      },
      request.signal
    ).then(() => {
      // The runner can publish leg 1 before this physical endpoint finishes
      // preparation. Reconcile on the next frame so this exact prepared
      // token yields to the runner's pending playback instead of retaining a
      // second admission owner until timeout.
      window.requestAnimationFrame(reconcileMedia);
    }).finally(() => {
      request.signal.removeEventListener('abort', abandon);
    });
  }, [
    ensureInitialFrame,
    failMedia,
    mountMedia,
    reconcileMedia,
    renderFrame
  ]);

  useImperativeHandle(forwardedRef, () => ({
    root: () => rootRef.current,
    effectRoot: () => videoRef.current,
    play(runDirection: 1 | -1, request?: PhoneCinematicRequest) {
      // Only the route runner may issue this token-bound playback intent.
      // Reconciliation may finish endpoint preparation, but stale callers
      // cannot replace the current execution identity.
      if (
        reducedMotionRef.current
        || mediaFailedRef.current
        || (request && runIdentityRef.current && !sameExecution(runIdentityRef.current, request))
      ) return;
      if (request) executionRef.current = request;
      activeRef.current = true;
      directionRef.current = runDirection;
      forwardRequestedRef.current = true;
      forwardIntentIdentityRef.current = request ?? executionRef.current;
      reconcileMedia();
    },
    presentPresentation(token, report) {
      clearPresentationFrameCallback();
      const key = phoneRuntimePresentationTokenKey(token);
      presentationBindingRef.current = {
        token,
        key,
        frameSequence: 0,
        reported: false,
        report
      };
      const video = videoRef.current as VideoWithFrameCallbacks | null;
      // The exact decoder endpoint was prepared under this token before the
      // runner released target layout. WebKit can withhold this second rVFC;
      // its leaf-owned post-paint path rechecks the same decoder evidence and
      // never recreates a token or submits a synthetic runtime proof.
      armPreparedPresentationPostPaint(key);
      if (!video?.requestVideoFrameCallback) return;
      // A retained native-video endpoint must produce a new browser-presented
      // frame after this exact revision is armed. A WebKit initial endpoint
      // needs a non-zero in-tolerance seek to request that decoder callback;
      // only its exact prepared token is eligible for that re-arm.
      try {
        video.currentTime = phoneTtgPresentationProbeTime(
          video.currentTime,
          preparedEndpointRef.current,
          key
        );
      } catch {
        // requestVideoFrameCallback below still validates a decoder frame.
      }
      presentationFrameCallbackRef.current = video.requestVideoFrameCallback(() => {
        presentationFrameCallbackRef.current = 0;
        reportPresentationFrame(key);
      });
    },
    disposePresentation(token) {
      const binding = presentationBindingRef.current;
      if (
        binding
        && binding.key === phoneRuntimePresentationTokenKey(token)
      ) {
        presentationBindingRef.current = null;
        clearPresentationFrameCallback();
      }
    },
    prepareTargetPresentation,
    dispose() {
      releaseMedia();
      const root = rootRef.current;
      if (!root) return;
      if (import.meta.env.DEV) {
        delete root.dataset.phoneTtgActive;
        delete root.dataset.phoneTtgProgress;
        delete root.dataset.phoneTtgScrollProgress;
        delete root.dataset.phoneTtgVisualProgress;
      }
      delete root.dataset.phoneTtgPlayback;
      delete root.dataset.phoneMediaState;
      root.style.removeProperty('--phone-ttg-background-y');
      root.style.removeProperty('--phone-ttg-background-scale');
      root.style.removeProperty('--phone-ttg-middle-y');
      root.style.removeProperty('--phone-ttg-middle-scale');
      root.style.removeProperty('--phone-ttg-foreground-y');
      root.style.removeProperty('--phone-ttg-figure-y');
      root.style.removeProperty('--phone-ttg-figure-scale');
      root.style.removeProperty('--phone-ttg-figure-opacity');
    }
  }), [
    prepareTargetPresentation,
    clearPresentationFrameCallback,
    armPreparedPresentationPostPaint,
    releaseMedia,
    reportPresentationFrame,
    reconcileMedia
  ]);

  const mediaState = mediaFailed
    ? 'retryable-failure'
    : reducedMotion
      ? 'reduced'
      : mediaReady
        ? 'ready'
        : 'preparing';

  return (
    <section
      ref={rootRef}
      className="phone-ttg"
      data-phone-scene="ttg-animation"
      data-phone-media-owner="ttg-figure-motion"
      data-phone-media-state={mediaState}
      aria-hidden="true"
    >
      <div className="phone-ttg__fallback" data-phone-media-fallback="ttg" />
      {mediaMounted && (
        <TtgSurface
          scene="ttg-animation"
          hidden={false}
          registerHandle={registerHandle}
        />
      )}
    </section>
  );
});

export default PhoneTtg;
