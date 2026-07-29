import {
  useCallback,
  useLayoutEffect,
  useRef,
  type RefObject
} from 'react';
import type {
  PhoneStoryRuntimePort
} from './phone-story-orchestrator';
import {
  registerPhoneCompositeRunCapability,
  registerPhoneRuntimeSampledScrollCorridor,
  registerPhoneRuntimeSurface,
  syncPhoneRuntimeDiagnostics,
  type PhoneCinematicSnapshot,
  type PhoneCompositeSession
} from './phone-story-runtime';
import {
  PHONE_STAGE_STOPS,
  phoneFrontRailSampleTuple,
  phoneStageFrame
} from './phone-stage-timeline';
import { renderPhoneStageTransitions } from './phone-transition-stage';
import type { PhoneExecutionToken } from './phone-story-state';
import type {
  PhoneAodAdapterHandle,
  PhoneHeroAdapterHandle,
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';
import { createPhoneAodPresentationGate } from './phone-aod-presentation-gate';
import { attachPhoneMediaGestureLease } from './phone-media-gesture-lease';

const phoneStageRefreshers = new Set<() => void>();

export function refreshPhoneScrollStage(): void {
  for (const refresh of phoneStageRefreshers) refresh();
}

/** Native document-coordinate replacement for ScrollTrigger's top/top range. */
export function phoneStageScrollBounds(
  scrollY: number,
  railTop: number,
  scrollDistance: number
): readonly [start: number, end: number] {
  const start = scrollY + railTop;
  return [start, start + Math.max(1, scrollDistance)];
}

const FRONT_AOD_SURFACE = 'front:aod';

/** Resource activity is derived from the same projection that owns root roles. */
export function phoneSnapshotOwnsAod(snapshot: PhoneCinematicSnapshot): boolean {
  return snapshot[1] === FRONT_AOD_SURFACE
    || snapshot[2] === FRONT_AOD_SURFACE;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function interpolate(start: number, end: number, progress: number): number {
  return start + (end - start) * clamp(progress);
}

function frontHoldProgress(scene: string): number | null {
  switch (scene) {
    case 'hero': return 0;
    case 'pattern': return PHONE_STAGE_STOPS.patternMotionStart;
    case 'star-map': return PHONE_STAGE_STOPS.patternStarEnd;
    case 'aod-animation': return PHONE_STAGE_STOPS.starAodEnd;
    default: return null;
  }
}

function frontProgressForSnapshot(snapshot: PhoneCinematicSnapshot): number | null {
  const [
    semanticScene,
    ,
    ,
    ,
    ,
    ,
    transactionRun,
    ,
    ,
    ,
    ,
    status,
    ,
    stageOwner,
    ,
    ,
    scrollProgress,
    scrollRun
  ] = snapshot;
  if (status === 'scroll-run') {
    switch (scrollRun) {
      case 'hero-pattern-scroll':
        return interpolate(
          PHONE_STAGE_STOPS.heroMotionEnd,
          PHONE_STAGE_STOPS.heroPatternEnd,
          scrollProgress
        );
      case 'pattern-star-scroll':
        return interpolate(
          PHONE_STAGE_STOPS.patternStarStart,
          PHONE_STAGE_STOPS.patternStarEnd,
          scrollProgress
        );
      case 'star-aod-scroll':
        return interpolate(
          PHONE_STAGE_STOPS.starAodStart,
          PHONE_STAGE_STOPS.starAodEnd,
          scrollProgress
        );
    }
  }
  if (status === 'transaction' && transactionRun === 'aod-method') {
    return PHONE_STAGE_STOPS.aodAutoplayStart;
  }
  if (stageOwner !== 'front') return null;
  return scrollProgress > 0 || semanticScene === 'hero'
    ? scrollProgress
    : frontHoldProgress(semanticScene);
}

function tokenForAod(
  snapshot: PhoneCinematicSnapshot,
  direction: 1 | -1
): PhoneExecutionToken | null {
  const [
    ,
    ,
    ,
    authorityId,
    sessionId,
    generation,
    run,
    transactionDirection,
    leg,
    ,
    ,
    status
  ] = snapshot;
  if (
    status !== 'transaction'
    || run !== 'aod-method'
    || transactionDirection !== direction
    || sessionId === null
    || generation === null
    || leg === null
  ) return null;
  return [authorityId, sessionId, generation, leg, direction];
}

function tokenForAodSession(
  session: PhoneCompositeSession,
  direction: 1 | -1
): PhoneExecutionToken {
  return [session[0], session[1], session[2], session[3](), direction];
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function requestPortraitFullscreen(root: HTMLElement): void {
  const target = root as FullscreenElement;
  const request = target.requestFullscreen?.bind(target)
    ?? target.webkitRequestFullscreen?.bind(target);
  if (!request) return;
  try {
    void Promise.resolve(request()).catch(() => undefined);
  } catch {
    // Older WebKit can throw synchronously when fullscreen is unavailable.
  }
}

export type PhoneStageRuntimeOptions = Readonly<{
  rootRef: RefObject<HTMLElement | null>;
  railRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  heroRef: RefObject<PhoneHeroAdapterHandle | null>;
  patternRef: RefObject<PhoneSceneAdapterHandle | null>;
  starMapRef: RefObject<PhoneSceneAdapterHandle | null>;
  aodRef: RefObject<PhoneAodAdapterHandle | null>;
  methodRef: RefObject<PhoneSceneAdapterHandle | null>;
  heroPatternRef: RefObject<PhoneTransitionAdapterHandle | null>;
  patternStarMapRef: RefObject<PhoneTransitionAdapterHandle | null>;
  starMapAodRef: RefObject<PhoneTransitionAdapterHandle | null>;
  orchestrator: PhoneStoryRuntimePort;
  snapshot: PhoneCinematicSnapshot;
  enabled: boolean;
  reducedMotion: boolean;
  adapterRevision: number;
  mapAodToMethod(progress: number): number;
}>;

export type PhoneStageRuntime = Readonly<{
  onAodProgress(
    progress: number,
    direction: 1 | -1,
    identity: PhoneExecutionToken
  ): void;
  onAodComplete(direction: 1 | -1, identity: PhoneExecutionToken): void;
  onAodFrame(
    progress: number,
    direction: 1 | -1,
    identity: PhoneExecutionToken
  ): void;
}>;

/**
 * Front/AOD geometry and media adapter bridge. It has no durable scene,
 * progress, visibility, or AOD-run state: every such decision comes from the
 * immutable snapshot and the projector's surface roles.
 */
export function usePhoneStageRuntime(
  options: PhoneStageRuntimeOptions
): PhoneStageRuntime {
  const snapshotRef = useRef(options.snapshot);
  snapshotRef.current = options.snapshot;
  const renderSnapshotRef = useRef<
    ((snapshot: PhoneCinematicSnapshot) => void) | undefined
  >(undefined);
  const progressHandlerRef = useRef<
    (
      progress: number,
      direction: 1 | -1,
      identity: PhoneExecutionToken
    ) => void
  >(undefined);
  const completeHandlerRef = useRef<
    ((direction: 1 | -1, identity: PhoneExecutionToken) => void) | undefined
  >(undefined);
  const frameHandlerRef = useRef<
    ((
      progress: number,
      direction: 1 | -1,
      identity: PhoneExecutionToken
    ) => void) | undefined
  >(undefined);

  const onAodProgress = useCallback((
    progress: number,
    direction: 1 | -1,
    identity: PhoneExecutionToken
  ) => {
    progressHandlerRef.current?.(progress, direction, identity);
  }, []);
  const onAodComplete = useCallback((
    direction: 1 | -1,
    identity: PhoneExecutionToken
  ) => {
    completeHandlerRef.current?.(direction, identity);
  }, []);
  const onAodFrame = useCallback((
    progress: number,
    direction: 1 | -1,
    identity: PhoneExecutionToken
  ) => {
    frameHandlerRef.current?.(progress, direction, identity);
  }, []);

  useLayoutEffect(() => {
    renderSnapshotRef.current?.(options.snapshot);
    // Input dispatch starts synchronously before React refreshes snapshotRef.
    // Retry after this layout pass so the capability sees the new session.
    if (options.enabled && options.snapshot[9] === 'preparing') {
      syncPhoneRuntimeDiagnostics(options.orchestrator);
    }
  }, [options.enabled, options.orchestrator, options.snapshot]);

  useLayoutEffect(() => {
    if (!options.enabled) return;
    const root = options.rootRef.current;
    const stageRail = options.railRef.current;
    const stage = options.stageRef.current;
    const heroAdapter = options.heroRef.current;
    const patternAdapter = options.patternRef.current;
    const starAdapter = options.starMapRef.current;
    const aodAdapter = options.aodRef.current;
    const methodAdapter = options.methodRef.current;
    const heroPatternAdapter = options.heroPatternRef.current;
    const patternStarAdapter = options.patternStarMapRef.current;
    const starAodAdapter = options.starMapAodRef.current;
    const heroScene = heroAdapter?.root();
    const patternScene = patternAdapter?.root();
    const starScene = starAdapter?.root();
    const aodScene = aodAdapter?.root();
    if (
      !root
      || !stageRail
      || !stage
      || !heroAdapter
      || !patternAdapter
      || !starAdapter
      || !aodAdapter
      || !methodAdapter
      || !heroPatternAdapter
      || !patternStarAdapter
      || !starAodAdapter
      || !heroScene
      || !patternScene
      || !starScene
      || !aodScene
    ) return;

    let active = true;
    let stageScrollStart = 0;
    let stageScrollEnd = 1;
    let lastRailY = snapshotRef.current[14];
    let completedHeroEntrance = false;
    let observedAodSession: string | null = null;
    const aodGate = createPhoneAodPresentationGate({
      startAutoplay: (direction, identity) => aodAdapter.startAutoplay(
        direction,
        identity
      ),
      onReset: () => aodAdapter.resetAutoplay()
    });
    const aodGateSession = (
      session: PhoneCompositeSession,
      direction: 1 | -1
    ) => ({
      identity: tokenForAodSession(session, direction),
      valid: session[4],
      // The compositor callback is the only first-frame source. Keep the
      // proof and the prepare->animate event in one authority transaction.
      reportFrame: () => session[5]('packed-canvas-frame', FRONT_AOD_SURFACE),
      reportEvidence: () => undefined,
      reportProgress: session[6],
      complete: () => {
        if (!session[4]()) return;
        session[9]('receiver');
        session[10]();
      },
      fail: session[13]
    });
    const stagePosition = (progress: number) => stageScrollStart
      + (stageScrollEnd - stageScrollStart) * progress;
    const readStageScrollDistance = () => {
      const configuredDistance = Number.parseFloat(
        root.style.getPropertyValue('--portrait-stage-scroll-distance')
      );
      return Number.isFinite(configuredDistance) && configuredDistance > 0
        ? configuredDistance
        : Math.max(1, stageRail.offsetHeight - stage.offsetHeight);
    };
    const refreshStageGeometry = () => {
      const [start, end] = phoneStageScrollBounds(
        window.scrollY,
        stageRail.getBoundingClientRect().top,
        readStageScrollDistance()
      );
      stageScrollStart = start;
      stageScrollEnd = end;
    };
    const renderSnapshot = (snapshot: PhoneCinematicSnapshot) => {
      if (!active) return;
      const aodToken = tokenForAod(snapshot, 1)
        ?? tokenForAod(snapshot, -1);
      const aodSession = aodToken
        ? `${aodToken[1]}:${aodToken[2]}`
        : null;
      if (observedAodSession && observedAodSession !== aodSession) {
        aodGate.reset();
        aodAdapter.resetAutoplay();
      }
      observedAodSession = aodSession;

      const stageProgress = frontProgressForSnapshot(snapshot);
      if (stageProgress !== null) {
        const frame = phoneStageFrame(stageProgress, options.reducedMotion);
        const [, , , heroProgress, patternProgress, starProgress] = frame;
        if (import.meta.env.DEV) {
          root.dataset.portraitStageProgress = stageProgress.toFixed(4);
        }
        heroAdapter.update(heroProgress);
        patternAdapter.update(patternProgress);
        starAdapter.update(starProgress);
        renderPhoneStageTransitions(frame, {
          heroPattern: heroPatternAdapter,
          patternStar: patternStarAdapter,
          starAod: starAodAdapter
        });
        if (options.reducedMotion && stageProgress >= PHONE_STAGE_STOPS.starAodEnd) {
          aodAdapter.update(1);
        }
        if (stageProgress > 0.003 && !completedHeroEntrance) {
          completedHeroEntrance = true;
          heroAdapter.completeEntrance();
        }
      }

      const [
        ,
        ,
        ,
        ,
        ,
        ,
        run,
        ,
        ,
        phase,
        sessionProgress,
        status
      ] = snapshot;
      if (status === 'transaction' && run === 'aod-method') {
        const progress = sessionProgress ?? 0;
        aodAdapter.update(progress);
        methodAdapter.update(options.mapAodToMethod(progress));
        if (phase?.startsWith('rollback-')) aodAdapter.resetAutoplay();
      }
    };

    // The document sampler is the sole publisher of progress. Native bounds
    // keep Safari toolbar coverage changes from importing ScrollTrigger.
    refreshStageGeometry();
    phoneStageRefreshers.add(refreshStageGeometry);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(refreshStageGeometry);
    resizeObserver?.observe(stageRail);
    window.addEventListener('resize', refreshStageGeometry);
    window.addEventListener('orientationchange', refreshStageGeometry);

    const surfaceLeases = [
      registerPhoneRuntimeSurface(
        options.orchestrator,
        'front:hero',
        'hero',
        'fixed',
        () => heroAdapter.root(),
        () => stage
      ),
      registerPhoneRuntimeSurface(
        options.orchestrator,
        'front:pattern',
        'pattern',
        'fixed',
        () => patternAdapter.root(),
        () => stage
      ),
      registerPhoneRuntimeSurface(
        options.orchestrator,
        'front:star-map',
        'star-map',
        'fixed',
        () => starAdapter.root(),
        () => stage
      ),
      registerPhoneRuntimeSurface(
        options.orchestrator,
        FRONT_AOD_SURFACE,
        'aod-animation',
        'fixed',
        () => aodAdapter.root(),
        () => stage
      ),
      registerPhoneRuntimeSurface(
        options.orchestrator,
        'native:method',
        'method-top',
        'native',
        () => methodAdapter.root(),
        () => stage
      )
    ];
    const corridorLease = registerPhoneRuntimeSampledScrollCorridor(
      options.orchestrator,
      'front-rail',
      ['hero', 'pattern', 'star-map', 'aod-animation'],
      (actualY) => {
        const delta = actualY - lastRailY;
        lastRailY = actualY;
        const direction = delta > .5 ? 1 : delta < -.5 ? -1 : 0;
        const progress = clamp(
          (actualY - stageScrollStart) / Math.max(1, stageScrollEnd - stageScrollStart)
        );
        const [scene, run, sampledDirection, sampledProgress] = phoneFrontRailSampleTuple(
          progress,
          direction,
          options.reducedMotion
        );
        return [
          actualY,
          scene,
          run,
          sampledDirection,
          sampledProgress
        ];
      },
      (run, direction) => {
        if (run !== 'aod-method') return null;
        return direction === 1
          ? stagePosition(PHONE_STAGE_STOPS.aodAutoplayStart)
          : Math.max(stageScrollStart, stageScrollEnd - 1);
      },
      (scene) => {
        const progress = frontHoldProgress(scene);
        return progress === null ? null : stagePosition(progress);
      }
    );
    const aodRegistration = registerPhoneCompositeRunCapability(
      options.orchestrator,
      'aod-method',
      'aod:method',
      (direction) => direction === 1
        ? stagePosition(PHONE_STAGE_STOPS.aodAutoplayStart)
        : Math.max(stageScrollStart, stageScrollEnd - 1),
      (direction) => {
        const snapshot = snapshotRef.current;
        return snapshot[11] === 'transaction'
          && snapshot[6] === 'aod-method'
          && snapshot[7] === direction
          && snapshot[9] === 'preparing';
      },
      (direction, session) => {
        if (!session[4]()) return false;
        return aodGate.start(aodGateSession(session, direction));
      },
      () => false
    );

    const emitAodProgress = (
      progress: number,
      direction: 1 | -1,
      identity: PhoneExecutionToken
    ) => {
      aodGate.observeMediaProgress(progress, direction, identity);
    };
    const emitAodFrame = (
      progress: number,
      direction: 1 | -1,
      identity: PhoneExecutionToken
    ) => {
      aodGate.reportCompositorFrame(progress, direction, identity);
    };
    const completeAod = (
      direction: 1 | -1,
      identity: PhoneExecutionToken
    ) => {
      aodGate.complete(direction, identity);
    };
    progressHandlerRef.current = emitAodProgress;
    completeHandlerRef.current = completeAod;
    frameHandlerRef.current = emitAodFrame;

    const pointerTargetIsPermissionButton = (event: Event) => (
      event.target instanceof Element
      && Boolean(event.target.closest('[data-portrait-gyro-permission]'))
    );
    const onHeroPointerDown = (event: PointerEvent) => {
      if (!pointerTargetIsPermissionButton(event)) heroAdapter.unlockFromGesture();
    };
    const onHeroClick = (event: Event) => {
      heroAdapter.unlockFromGesture();
      if (pointerTargetIsPermissionButton(event)) requestPortraitFullscreen(root);
    };
    root.addEventListener('pointerdown', onHeroPointerDown, { passive: true });
    root.addEventListener('click', onHeroClick);
    const releaseMediaGestureLease = attachPhoneMediaGestureLease(
      root,
      () => aodGate.retryFromGesture()
    );

    const refresh = () => {
      if (active) refreshStageGeometry();
    };
    const refreshFrame = window.requestAnimationFrame(refresh);
    void document.fonts?.ready.then(refresh).catch(() => undefined);
    window.addEventListener('load', refresh, { once: true });

    if (import.meta.env.DEV) {
      root.dataset.portraitSpikeMotionState = options.reducedMotion ? 'reduced' : 'running';
      root.dataset.portraitStagePin = 'native-fixed-composite';
    }
    renderSnapshotRef.current = renderSnapshot;
    renderSnapshot(snapshotRef.current);
    if (frontProgressForSnapshot(snapshotRef.current) === 0) {
      heroAdapter.startEntrance();
    }

    return () => {
      active = false;
      if (renderSnapshotRef.current === renderSnapshot) renderSnapshotRef.current = undefined;
      if (progressHandlerRef.current === emitAodProgress) progressHandlerRef.current = undefined;
      if (completeHandlerRef.current === completeAod) completeHandlerRef.current = undefined;
      if (frameHandlerRef.current === emitAodFrame) frameHandlerRef.current = undefined;
      aodGate.reset();
      heroAdapter.cancelEntrance();
      window.cancelAnimationFrame(refreshFrame);
      window.removeEventListener('load', refresh);
      window.removeEventListener('resize', refreshStageGeometry);
      window.removeEventListener('orientationchange', refreshStageGeometry);
      resizeObserver?.disconnect();
      phoneStageRefreshers.delete(refreshStageGeometry);
      root.removeEventListener('pointerdown', onHeroPointerDown);
      root.removeEventListener('click', onHeroClick);
      releaseMediaGestureLease();
      corridorLease.dispose();
      aodRegistration.dispose();
      for (const lease of surfaceLeases) lease.dispose();
      aodAdapter.resetAutoplay();
      if (import.meta.env.DEV) {
        delete root.dataset.portraitSpikeMotionState;
        delete root.dataset.portraitStagePin;
        delete root.dataset.portraitStageProgress;
      }
    };
  }, [
    options.adapterRevision,
    options.enabled,
    options.mapAodToMethod,
    options.orchestrator,
    options.reducedMotion
  ]);

  return { onAodProgress, onAodComplete, onAodFrame };
}
