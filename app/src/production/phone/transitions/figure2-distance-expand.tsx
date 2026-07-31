import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import {
  renderFigure2AnimationProgress
} from '../../../scenes/figure2-animation';
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
  figure2IntroProgress,
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
import { registerPhoneRuntimeEffect } from '../phone-story/runtime';
import type {
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../types';

const PHONE_FIGURE2_RUN = 'phone-grade-a:1' as SegmentRunId;
const PHONE_FIGURE2_PREPARE = 'phone-grade-a:prepare:1' as PrepareToken;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneFigure2ProofTimelineProgress(
  progress: number
): number {
  return FIGURE2_INTRO_END
    + (1 - FIGURE2_INTRO_END) * clamp(progress);
}

function fallbackFrame(
  from: HTMLElement,
  to: HTMLElement,
  progress: number,
  reducedMotion: boolean
): void {
  void to;
  const canonical = reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
  renderFigure2AnimationProgress(
    from,
    figure2IntroProgress(phoneFigure2ProofTimelineProgress(canonical)),
    { videoMode: 'none' }
  );
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
  const presentedFrameRef = useRef<(() => void) | undefined>(undefined);
  const releaseEffectRegistration = useCallback(() => {
    effectRegistrationRef.current?.dispose();
    effectRegistrationRef.current = undefined;
  }, []);
  const retireTimeline = useCallback(() => {
    buildRevisionRef.current += 1;
    releaseEffectRegistration();
    timelineRef.current?.(['dispose']);
    timelineRef.current = null;
    buildRef.current = null;
    leaseRef.current = undefined;
    presentedFrameRef.current = undefined;
  }, [releaseEffectRegistration]);
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

  const render = (rawProgress: number) => {
    if (!from || !to) return;
    const progress = clamp(rawProgress);
    const canonical = reducedMotion ? (progress < 0.5 ? 0 : 1) : progress;
    const sampled = phoneFigure2ProofTimelineProgress(canonical);
    const timeline = timelineRef.current;
    if (!timeline) {
      fallbackFrame(from, to, canonical, reducedMotion);
      return;
    }
    timeline(['render', sampled]);
    if (leaseRef.current?.canvas.dataset.phonePresentationEffectFrame === 'ready') {
      const report = presentedFrameRef.current;
      presentedFrameRef.current = undefined;
      report?.();
    }
  };

  useLayoutEffect(() => {
    if (!effectHost || !from || !to) return;
    onReady?.();
    return releaseTimeline;
  }, [effectHost, from, onReady, releaseTimeline, to]);

  useImperativeHandle(forwardedRef, () => ({
    render,
    prepare,
    begin(_owner, onPresentedFrame) {
      presentedFrameRef.current = onPresentedFrame;
    },
    prepareFirstFrame() {
      // Figure2 owns its depth field only after the authored intro interval.
      render(.5);
    },
    commitEndpoint(endpoint) { render(endpoint); },
    releaseEndpoint() {
      releaseTimeline();
    },
    leave() { render(1); },
    dispose() {
      releaseTimeline();
    }
  }), [from, prepare, reducedMotion, releaseTimeline, to]);

  return null;
});

export default PhoneFigure2DistanceExpandTransition;
