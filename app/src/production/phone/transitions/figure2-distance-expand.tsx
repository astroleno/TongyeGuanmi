import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import {
  FIGURE2_DISTANCE_EXPAND_SEGMENT
} from '../../../story/figure2-distance-expand-contract';
import type {
  PrepareToken,
  SegmentRunId
} from '../../../story/types';
import {
  createPhoneFigure2DistanceExpandBridge,
  FIGURE2_INTRO_END,
  type PhoneFigure2DistanceExpandBridge
} from '../../../transitions/figure2-distance-expand';
import {
  claimPhoneInkSurface,
  type PhoneInkSurfaceLease
} from '../phone-ink-surface-pool';
import {
  useOptionalPhoneStoryRuntimePort
} from '../PhoneStoryRuntimeContext';
import { phoneRouteOverlayHostFor } from '../PhoneStageRail';
import {
  phoneRuntimePresentationTokenKey,
  registerPhoneRuntimeEffect,
  type PresentationToken
} from '../phone-story/runtime';
import type {
  PhoneCinematicRequest,
  PhonePresentedFrameReporter,
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../types';

const PHONE_FIGURE2_RUN = 'phone-grade-a:1' as SegmentRunId;
const PHONE_FIGURE2_PREPARE = 'phone-grade-a:prepare:1' as PrepareToken;

type PhoneFigure2EffectPresentation = readonly [
  token: PresentationToken,
  tokenKey: string,
  claimGeneration: number | null,
  report: PhonePresentedFrameReporter
];

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneFigure2ProofTimelineProgress(
  progress: number
): number {
  return FIGURE2_INTRO_END
    + (1 - FIGURE2_INTRO_END) * clamp(progress);
}

/**
 * A reclaimed WebGL surface can need more than one browser paint before its
 * first depth frame is drawable. This retries rendering only; it cannot
 * advance the machine or manufacture a presentation proof.
 */
export function schedulePhoneFigure2FirstFrameRetry(
  pending: () => boolean,
  render: () => void
): () => void {
  let cancelled = false;
  let frame = 0;
  const retry = () => {
    frame = 0;
    if (cancelled || !pending()) return;
    render();
    if (!cancelled && pending()) frame = requestAnimationFrame(retry);
  };
  retry();
  return () => {
    cancelled = true;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  };
}

/**
 * Native-scroll driver for the existing authored Figure2 timeline. The shared
 * timeline still owns camera, depth mask, and Ink; document progress replaces
 * Director time and uses deterministic seek frames in both directions.
 */
export const PhoneFigure2DistanceExpandTransition = forwardRef<
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
>(function PhoneFigure2DistanceExpandTransition(
  { host: contentHost, from, to, reducedMotion, onReady },
  forwardedRef
) {
  const runtime = useOptionalPhoneStoryRuntimePort();
  const effectHost = phoneRouteOverlayHostFor(contentHost);
  const timelineRef = useRef<PhoneFigure2DistanceExpandBridge | null>(null);
  const runRevisionRef = useRef(0);
  const buildRevisionRef = useRef(0);
  const buildRef = useRef<Promise<NonNullable<
    typeof timelineRef.current
  >> | null>(null);
  const leaseRef = useRef<PhoneInkSurfaceLease | undefined>(undefined);
  const effectRegistrationRef = useRef<{ dispose(): void } | undefined>(undefined);
  const presentedLeaseRef = useRef<PhoneFigure2EffectPresentation | undefined>(undefined);
  const presentedFrameSequenceRef = useRef(0);
  const firstFrameRetryCancelRef = useRef<(() => void) | undefined>(undefined);
  const cancelFirstFrameRetry = useCallback(() => {
    firstFrameRetryCancelRef.current?.();
    firstFrameRetryCancelRef.current = undefined;
  }, []);
  const releaseEffectRegistration = useCallback(() => {
    effectRegistrationRef.current?.dispose();
    effectRegistrationRef.current = undefined;
  }, []);
  const retireTimeline = useCallback(() => {
    cancelFirstFrameRetry();
    buildRevisionRef.current += 1;
    releaseEffectRegistration();
    timelineRef.current?.(['dispose']);
    timelineRef.current = null;
    buildRef.current = null;
    leaseRef.current = undefined;
    presentedLeaseRef.current = undefined;
    presentedFrameSequenceRef.current = 0;
  }, [cancelFirstFrameRetry, releaseEffectRegistration]);
  const releaseTimeline = useCallback(() => {
    leaseRef.current?.release();
    retireTimeline();
  }, [retireTimeline]);
  const ensureTimeline = useCallback(async (
    direction: 1 | -1
  ): Promise<NonNullable<typeof timelineRef.current>> => {
    if (timelineRef.current) return timelineRef.current;
    if (buildRef.current) return buildRef.current;
    if (!effectHost || !from || !to) {
      throw new Error();
    }
    const lease = claimPhoneInkSurface(effectHost.ownerDocument, {
      host: effectHost,
      className: 'r4-figure2-proof-ink-canvas',
      onRevoke: retireTimeline
    });
    leaseRef.current = lease;
    const presentation = presentedLeaseRef.current;
    if (presentation) {
      const [token, tokenKey, , report] = presentation;
      presentedLeaseRef.current = [token, tokenKey, lease.generation, report];
      delete lease.canvas.dataset.phonePresentationEffectFrame;
      lease.canvas.dataset.phonePresentationEffectToken = tokenKey;
    }
    if (runtime) {
      releaseEffectRegistration();
      effectRegistrationRef.current = registerPhoneRuntimeEffect(
        runtime,
        'figure2-distance-expand',
        () => effectHost,
        () => lease.canvas
      );
    }
    const buildRevision = buildRevisionRef.current;
    const build = createPhoneFigure2DistanceExpandBridge([
      from,
      to,
      direction,
      PHONE_FIGURE2_RUN,
      PHONE_FIGURE2_PREPARE,
      reducedMotion,
      lease.canvas
    ]).then((timeline) => {
      if (buildRevision !== buildRevisionRef.current) {
        timeline(['dispose']);
        throw new DOMException('F2 retired', 'AbortError');
      }
      timelineRef.current = timeline;
      return timeline;
    });
    buildRef.current = build;
    try {
      return await build;
    } finally {
      if (buildRef.current === build) buildRef.current = null;
    }
  }, [effectHost, from, reducedMotion, releaseEffectRegistration, retireTimeline, runtime, to]);
  const prepare = useCallback(async (
    direction: 1 | -1,
    signal: AbortSignal
  ) => {
    if (signal.aborted) throw signal.reason;
    if (reducedMotion) return;
    const timeline = await ensureTimeline(direction);
    const leg = [
      `phone-grade-a:${++runRevisionRef.current}` as SegmentRunId,
      direction,
      1,
      direction === 1 ? FIGURE2_INTRO_END : 1,
      direction === 1 ? 1 : FIGURE2_INTRO_END,
      FIGURE2_DISTANCE_EXPAND_SEGMENT.policy.playMs[1],
      signal
    ] as const;
    await timeline(['prepare', ...leg]);
    if (signal.aborted) throw signal.reason;
    timeline(['commit', ...leg]);
  }, [ensureTimeline, reducedMotion]);

  const render = useCallback((rawProgress: number) => {
    if (!from || !to) return;
    const progress = clamp(rawProgress);
    const canonical = reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
    const sampled = phoneFigure2ProofTimelineProgress(canonical);
    const timeline = timelineRef.current;
    if (!timeline) return;
    const rendered = timeline(['render', sampled]) === true;
    const lease = leaseRef.current;
    const presentation = presentedLeaseRef.current;
    if (
      rendered
      && lease
      && presentation
      && presentation[2] === lease.generation
      && lease.canvas.dataset.phonePresentationEffectToken === presentation[1]
    ) {
      cancelFirstFrameRetry();
      presentedLeaseRef.current = undefined;
      const report = presentation[3];
      const token = presentation[0];
      report?.(token ? {
        token,
        frameSequence: ++presentedFrameSequenceRef.current,
        observedAt: performance.now(),
        origin: 'segment-first-frame'
      } : undefined);
    }
  }, [cancelFirstFrameRetry, from, reducedMotion, to]);

  const scheduleFirstFrameRetry = useCallback(() => {
    cancelFirstFrameRetry();
    const cancel = schedulePhoneFigure2FirstFrameRetry(
      () => Boolean(presentedLeaseRef.current),
      () => render(.5)
    );
    if (presentedLeaseRef.current) {
      firstFrameRetryCancelRef.current = cancel;
    } else {
      cancel();
    }
  }, [cancelFirstFrameRetry, render]);

  useLayoutEffect(() => {
    if (!effectHost || !from || !to) return;
    onReady?.();
    return releaseTimeline;
  }, [effectHost, from, onReady, releaseTimeline, to]);

  useImperativeHandle(forwardedRef, () => ({
    render,
    prepare,
    begin(owner: PhoneCinematicRequest, onPresentedFrame) {
      cancelFirstFrameRetry();
      const token = owner[5];
      if (!token || !onPresentedFrame) {
        presentedLeaseRef.current = undefined;
        return;
      }
      const tokenKey = phoneRuntimePresentationTokenKey(token);
      const lease = leaseRef.current;
      presentedLeaseRef.current = [
        token,
        tokenKey,
        lease?.generation ?? null,
        onPresentedFrame
      ];
      if (lease) {
        delete lease.canvas.dataset.phonePresentationEffectFrame;
        lease.canvas.dataset.phonePresentationEffectToken = tokenKey;
      }
      presentedFrameSequenceRef.current = 0;
    },
    prepareFirstFrame() {
      // Figure2 owns its depth field only after the authored intro interval.
      scheduleFirstFrameRetry();
    },
    commitEndpoint(endpoint) { render(endpoint); },
    releaseEndpoint() {
      releaseTimeline();
    },
    leave() { render(1); },
    dispose() {
      releaseTimeline();
    }
  }), [
    cancelFirstFrameRetry,
    from,
    prepare,
    reducedMotion,
    releaseTimeline,
    scheduleFirstFrameRetry,
    to
  ]);

  return null;
});

export default PhoneFigure2DistanceExpandTransition;
