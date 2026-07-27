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
  LayerHandle,
  SceneId,
  SegmentRunId,
  StagedLegPreparation,
  StageHandle
} from '../../../story/types';
import {
  createFigure2DistanceExpandTransition,
  FIGURE2_INTRO_END,
  figure2IntroProgress
} from '../../../transitions/figure2-distance-expand';
import {
  claimPhoneInkSurface,
  type PhoneInkSurfaceLease
} from '../phone-ink-surface-pool';
import type {
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../types';

const PHONE_FIGURE2_RUN = 'phone-grade-a:1' as SegmentRunId;
const PHONE_FIGURE2_PREPARE = 'phone-grade-a:prepare:1' as const;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function phoneFigure2ProofTimelineProgress(
  progress: number
): number {
  return FIGURE2_INTRO_END
    + (1 - FIGURE2_INTRO_END) * clamp(progress);
}

function phoneLayer(scene: SceneId, element: HTMLElement): LayerHandle {
  void element;
  const layer: LayerHandle = {
    scene,
    role: 'current',
    element,
    visibility: {
      mounted: true,
      visible: scene === 'figure2-animation',
      inert: true,
      opacity: scene === 'figure2-animation' ? 1 : 0,
      pointerEvents: 'none'
    },
    setVisibility(state) {
      layer.visibility = state;
    },
    dispose() {}
  };
  return layer;
}

function phoneStage(layers: readonly LayerHandle[]): StageHandle {
  const getLayer = (scene: SceneId) => layers.find((layer) => layer.scene === scene);
  return {
    getLayer,
    ensureLayer(scene) {
      const layer = getLayer(scene);
      if (!layer) throw new Error(scene);
      return layer;
    },
    releaseLayer() {},
    snapshot: () => layers
  };
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
  { host, from, to, reducedMotion, onReady },
  forwardedRef
) {
  const timelineRef = useRef<Awaited<ReturnType<ReturnType<
    typeof createFigure2DistanceExpandTransition
  >['buildTimeline']>> | null>(null);
  const runRevisionRef = useRef(0);
  const buildRevisionRef = useRef(0);
  const buildRef = useRef<Promise<NonNullable<
    typeof timelineRef.current
  >> | null>(null);
  const leaseRef = useRef<PhoneInkSurfaceLease | undefined>(undefined);
  const retireTimeline = useCallback(() => {
    buildRevisionRef.current += 1;
    timelineRef.current?.dispose();
    timelineRef.current = null;
    buildRef.current = null;
    leaseRef.current = undefined;
  }, []);
  const releaseTimeline = useCallback(() => {
    leaseRef.current?.release();
    retireTimeline();
  }, [retireTimeline]);
  const ensureTimeline = useCallback(async (
    direction: 1 | -1
  ): Promise<NonNullable<typeof timelineRef.current>> => {
    if (timelineRef.current) return timelineRef.current;
    if (buildRef.current) return buildRef.current;
    if (!host || !from || !to) {
      throw new Error();
    }
    const fromLayer = phoneLayer('figure2-animation', from);
    const toLayer = phoneLayer('figure2-proof', to);
    const lease = claimPhoneInkSurface(host.ownerDocument, {
      host,
      className: 'r4-figure2-proof-ink-canvas',
      onRevoke: retireTimeline
    });
    leaseRef.current = lease;
    const transition = createFigure2DistanceExpandTransition({ ownsMedia: false, inkCanvas: lease.canvas });
    const buildRevision = buildRevisionRef.current;
    const build = Promise.resolve(transition.buildTimeline({
      segment: FIGURE2_DISTANCE_EXPAND_SEGMENT,
      stage: phoneStage([fromLayer, toLayer]),
      from: fromLayer,
      to: toLayer,
      direction,
      runId: PHONE_FIGURE2_RUN,
      prepareToken: PHONE_FIGURE2_PREPARE,
      prefersReducedMotion: reducedMotion,
      reportMilestone() {}
    })).then((timeline) => {
      if (buildRevision !== buildRevisionRef.current) {
        timeline.dispose();
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
  }, [from, host, reducedMotion, retireTimeline, to]);
  const prepare = useCallback(async (
    direction: 1 | -1,
    signal: AbortSignal
  ) => {
    if (signal.aborted) throw signal.reason;
    if (reducedMotion) return;
    const timeline = await ensureTimeline(direction);
    const leg: StagedLegPreparation = {
      runId: `phone-grade-a:${++runRevisionRef.current}` as SegmentRunId,
      segment: 'figure2-distance-expand',
      direction,
      legIndex: 1,
      from: direction === 1 ? FIGURE2_INTRO_END : 1,
      to: direction === 1 ? 1 : FIGURE2_INTRO_END,
      durationMs: FIGURE2_DISTANCE_EXPAND_SEGMENT.policy.playMs[1],
      signal
    };
    await timeline.prepareLeg?.(leg);
    if (signal.aborted) throw signal.reason;
    timeline.commitLeg?.(leg);
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
    timeline.progress(sampled);
  };

  useLayoutEffect(() => {
    if (!host || !from || !to) return;
    onReady?.();
    return releaseTimeline;
  }, [from, host, onReady, releaseTimeline, to]);

  useImperativeHandle(forwardedRef, () => ({
    render,
    prepare,
    begin() {},
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
