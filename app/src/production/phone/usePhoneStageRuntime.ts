import {
  useCallback,
  useLayoutEffect,
  useRef,
  type RefObject
} from 'react';
import type {
  PhoneStoryRuntimePort
} from './phone-story/runtime';
import {
  registerPhoneRuntimeAodCapability,
  registerPhoneRuntimeFrontStageCapability,
  registerPhoneRuntimeEffect,
  registerPhoneRuntimeSampledScrollCorridor,
  registerPhoneRuntimeSurface,
  selectPhoneCinematicSnapshot,
  syncPhoneRuntimeDiagnostics,
  type PhoneAodFailureReason,
  type PhoneAodExecution,
  type PhoneCinematicSnapshot,
  type PhoneRenderedPresentationFrame
} from './phone-story/runtime';
import {
  PHONE_STAGE_STOPS,
  phoneFrontRailSampleTuple,
  phoneFrontSurfaceFrame
} from './phone-stage-timeline';
import type {
  PhoneAodAdapterHandle,
  PhoneHeroAdapterHandle,
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';

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

/** Method leaf effects follow the projection and AOD's authored receiver cue. */
export function phoneSnapshotOwnsMethod(
  snapshot: PhoneCinematicSnapshot,
  mapAodToMethod: (progress: number) => number
): boolean {
  const [
    ,
    sourceSurface,
    receiverSurface,
    ,
    ,
    ,
    run,
    direction,
    ,
    phase,
    progress
  ] = snapshot;
  if (sourceSurface === 'native:method') return true;
  if (receiverSurface !== 'native:method') return false;
  if (run !== 'aod-method' || direction !== 1) return true;
  if (phase === 'preparing') return false;
  return phase !== 'animating' || mapAodToMethod(progress ?? 0) > 0;
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
    case 'pattern-compact': return PHONE_STAGE_STOPS.patternMotionEnd;
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
  if (status === 'scroll-run' && scrollRun === 'star-aod-scroll') {
    return interpolate(
      PHONE_STAGE_STOPS.starAodStart,
      PHONE_STAGE_STOPS.starAodEnd,
      scrollProgress
    );
  }
  if (status === 'transaction' && transactionRun === 'aod-method') {
    // Keep the rail at the stable source semantic edge while the runner owns
    // AOD admission and playback. A rail percentage is never an autoplay
    // command or an alternative transaction owner.
    return PHONE_STAGE_STOPS.starAodEnd;
  }
  if (
    status === 'transaction'
    && (
      transactionRun === 'hero-pattern'
      || transactionRun === 'pattern-collapse'
      || transactionRun === 'pattern-star-map'
    )
  ) return null;
  if (stageOwner !== 'front') return null;
  return frontHoldProgress(semanticScene);
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
  /** The one physical DOM backdrop that covers Safari's live viewport. */
  coverageRef: RefObject<HTMLElement | null>;
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
    execution: PhoneAodExecution
  ): void;
  onAodComplete(execution: PhoneAodExecution): void;
  onAodFrame(
    frame: PhoneRenderedPresentationFrame,
    execution: PhoneAodExecution
  ): void;
  onAodFailure(
    execution: PhoneAodExecution,
    reason: PhoneAodFailureReason
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
      execution: PhoneAodExecution
    ) => void
  >(undefined);
  const completeHandlerRef = useRef<
    ((execution: PhoneAodExecution) => void) | undefined
  >(undefined);
  const frameHandlerRef = useRef<
    ((
      frame: PhoneRenderedPresentationFrame,
      execution: PhoneAodExecution
    ) => void) | undefined
  >(undefined);
  const failureHandlerRef = useRef<
    ((
      execution: PhoneAodExecution,
      reason: PhoneAodFailureReason
    ) => void) | undefined
  >(undefined);

  const onAodProgress = useCallback((
    progress: number,
    execution: PhoneAodExecution
  ) => {
    progressHandlerRef.current?.(progress, execution);
  }, []);
  const onAodComplete = useCallback((
    execution: PhoneAodExecution
  ) => {
    completeHandlerRef.current?.(execution);
  }, []);
  const onAodFrame = useCallback((
    frame: PhoneRenderedPresentationFrame,
    execution: PhoneAodExecution
  ) => {
    frameHandlerRef.current?.(frame, execution);
  }, []);
  const onAodFailure = useCallback((
    execution: PhoneAodExecution,
    reason: PhoneAodFailureReason
  ) => {
    failureHandlerRef.current?.(execution, reason);
  }, []);

  useLayoutEffect(() => {
    renderSnapshotRef.current?.(options.snapshot);
    // Input dispatch starts synchronously before React refreshes this render
    // mirror. The capability itself reads the orchestrator's current snapshot.
    if (options.enabled && options.snapshot[9] === 'preparing') {
      syncPhoneRuntimeDiagnostics(options.orchestrator);
    }
  }, [
    options.adapterRevision,
    options.enabled,
    options.orchestrator,
    options.snapshot
  ]);

  /**
   * Surface identity outlives renderer capabilities. React may clear and
   * rebind a forwarded adapter handle while a terminal transaction is still
   * animating; retaining this manifest registration lets the engine replay
  * its one pending completion when the exact leaf becomes available again.
  */
  useLayoutEffect(() => {
    const surfaceLeases = [
      registerPhoneRuntimeSurface(
        options.orchestrator,
        'front:hero',
        'hero',
        'fixed',
        () => options.heroRef.current?.root() ?? null,
        () => options.coverageRef.current,
        undefined,
        {
          present(token, report) {
            options.heroRef.current?.presentPresentation?.(token, report);
          },
          dispose(token) {
            options.heroRef.current?.disposePresentation?.(token);
          }
        },
        (token) => (
          token.kind === 'static-poster'
          && token.subject === 'front:hero'
          && options.heroRef.current?.root()?.querySelector<HTMLCanvasElement>(
            '[data-portrait-figure-canvas]'
          )?.dataset.packedAlphaFrameReady === 'true'
        )
      ),
      registerPhoneRuntimeSurface(
        options.orchestrator,
        'front:pattern',
        'pattern',
        'fixed',
        () => options.patternRef.current?.root() ?? null,
        () => options.coverageRef.current,
        undefined,
        {
          present(token, report) {
            options.patternRef.current?.presentPresentation?.(token, report);
          },
          dispose(token) {
            options.patternRef.current?.disposePresentation?.(token);
          }
        },
        (token) => (
          token.kind === 'static-poster'
          && token.subject === 'front:pattern'
          && options.patternRef.current?.root()?.querySelector<HTMLCanvasElement>(
            '[data-portrait-pattern-bloom]'
          )?.dataset.portraitPatternRenderer === 'ready'
        )
      ),
      registerPhoneRuntimeSurface(
        options.orchestrator,
        'front:star-map',
        'star-map',
        'fixed',
        () => options.starMapRef.current?.root() ?? null,
        () => options.coverageRef.current,
        undefined,
        {
          present(token, report) {
            options.starMapRef.current?.presentPresentation?.(token, report);
          },
          dispose(token) {
            options.starMapRef.current?.disposePresentation?.(token);
          }
        },
        (token) => (
          token.kind === 'static-poster'
          && token.subject === 'front:star-map'
          && options.starMapRef.current?.root()?.querySelector<HTMLCanvasElement>(
            '[data-portrait-star-perlin]'
          )?.dataset.portraitStarPerlin === 'ready'
        )
      ),
      registerPhoneRuntimeSurface(
        options.orchestrator,
        FRONT_AOD_SURFACE,
        'aod-animation',
        'fixed',
        () => options.aodRef.current?.root() ?? null,
        () => options.coverageRef.current,
        undefined,
        {
          present(token, report, fail) {
            options.aodRef.current?.presentPresentation?.(token, report, fail);
          },
          dispose(token) {
            options.aodRef.current?.disposePresentation?.(token);
          }
        }
      ),
      registerPhoneRuntimeSurface(
        options.orchestrator,
        'native:method',
        'method-top',
        'native',
        () => options.methodRef.current?.root() ?? null,
        () => options.coverageRef.current,
        undefined,
        {
          present(token, report) {
            options.methodRef.current?.presentPresentation?.(token, report);
          },
          dispose(token) {
            options.methodRef.current?.disposePresentation?.(token);
          }
        }
      )
    ];
    // Registration may have happened before a lazy forwarded ref was bound.
    // Re-evaluate the machine-owned pending terminal event with the current
    // dynamic roots, never by asking a leaf to emit completion again.
    syncPhoneRuntimeDiagnostics(options.orchestrator);
    return () => {
      for (const lease of surfaceLeases) lease.dispose();
    };
  }, [options.orchestrator]);

  useLayoutEffect(() => {
    if (!options.enabled) return;
    const root = options.rootRef.current;
    const stageRail = options.railRef.current;
    const stage = options.stageRef.current;
    if (
      !root
      || !stageRail
      || !stage
    ) return;
    const heroRef = options.heroRef;
    const aodRef = options.aodRef;
    const methodRef = options.methodRef;

    let active = true;
    let stageScrollStart = 0;
    let stageScrollEnd = 1;
    let lastRailY = snapshotRef.current[14];
    let completedHeroEntrance = false;
    const stagePosition = (progress: number) => stageScrollStart
      + (stageScrollEnd - stageScrollStart) * progress;
    const aodSemanticPosition = () => stagePosition(PHONE_STAGE_STOPS.starAodEnd);
    const methodDocumentPosition = () => {
      const method = methodRef.current?.root();
      return method
        ? window.scrollY + method.getBoundingClientRect().top
        : null;
    };
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
      syncAodRuntime();

      const heroAdapter = heroRef.current;
      const patternAdapter = options.patternRef.current;
      const starAdapter = options.starMapRef.current;
      const aodAdapter = aodRef.current;
      const methodAdapter = methodRef.current;
      const starAodAdapter = options.starMapAodRef.current;

      const stableFrontPosition = frontProgressForSnapshot(snapshot);
      if (
        stableFrontPosition !== null
        && heroAdapter
        && patternAdapter
        && starAdapter
        && starAodAdapter
      ) {
        const [heroProgress, patternProgress, starProgress, starAodProgress] =
          phoneFrontSurfaceFrame(stableFrontPosition);
        if (import.meta.env.DEV) {
          root.dataset.portraitStageProgress = stableFrontPosition.toFixed(4);
        }
        heroAdapter.update(heroProgress);
        patternAdapter.update(patternProgress);
        starAdapter.update(starProgress);
        starAodAdapter.render(starAodProgress);
        if (
          options.reducedMotion
          && stableFrontPosition >= PHONE_STAGE_STOPS.starAodEnd
          && aodAdapter
        ) {
          aodAdapter.update(1);
        }
        if (stableFrontPosition > 0.003 && !completedHeroEntrance) {
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
        ,
        sessionProgress,
        status
      ] = snapshot;
      if (status === 'transaction' && run === 'aod-method' && methodAdapter) {
        const progress = sessionProgress ?? 0;
        methodAdapter.update(options.mapAodToMethod(progress));
      }
    };

    // The document sampler publishes only source intent/landing geometry and
    // the frozen Star→AOD rail. Hero/Pattern playback clocks belong to their
    // registered machine capability, never a sampled document percentage.
    refreshStageGeometry();
    phoneStageRefreshers.add(refreshStageGeometry);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(refreshStageGeometry);
    resizeObserver?.observe(stageRail);
    window.addEventListener('resize', refreshStageGeometry);
    window.addEventListener('orientationchange', refreshStageGeometry);

    const frontStageRuntime = registerPhoneRuntimeFrontStageCapability(
      options.orchestrator,
      {
        position(run, direction) {
          const targetProgress = (() => {
            switch (run) {
              case 'hero-pattern':
                return direction === 1
                  ? PHONE_STAGE_STOPS.patternMotionStart
                  : 0;
              case 'pattern-collapse':
                return direction === 1
                  ? PHONE_STAGE_STOPS.patternMotionEnd
                  : PHONE_STAGE_STOPS.patternMotionStart;
              case 'pattern-star-map':
                return direction === 1
                  ? PHONE_STAGE_STOPS.patternStarEnd
                  : PHONE_STAGE_STOPS.patternMotionEnd;
            }
          })();
          return stagePosition(targetProgress);
        },
        hero: () => heroRef.current,
        pattern: () => options.patternRef.current,
        starMap: () => options.starMapRef.current,
        heroPattern: () => options.heroPatternRef.current,
        patternStarMap: () => options.patternStarMapRef.current,
        reducedMotion: options.reducedMotion
      }
    );

    const effectLease = registerPhoneRuntimeEffect(
      options.orchestrator,
      'aod-to-method',
      () => options.stageRef.current,
      () => aodRef.current?.effectRoot?.() ?? null
    );
    const corridorLease = registerPhoneRuntimeSampledScrollCorridor(
      options.orchestrator,
      'front-rail',
      ['hero', 'pattern', 'pattern-compact', 'star-map', 'aod-animation'],
      (actualY, _width, _height, _offsetTop, snapshot) => {
        const delta = actualY - lastRailY;
        lastRailY = actualY;
        const direction = delta > .5 ? 1 : delta < -.5 ? -1 : 0;
        const progress = clamp(
          (actualY - stageScrollStart) / Math.max(1, stageScrollEnd - stageScrollStart)
        );
        const [
          scene,
          run,
          sampledDirection,
          sampledProgress,
          sampledReducedMotion
        ] = phoneFrontRailSampleTuple(
          progress,
          direction,
          options.reducedMotion
        );
        const starAodEligible = snapshot[0] === 'star-map'
          || (snapshot[11] === 'scroll-run' && snapshot[17] === 'star-aod-scroll');
        return [
          actualY,
          starAodEligible ? scene : null,
          starAodEligible ? run : null,
          sampledDirection,
          sampledProgress,
          sampledReducedMotion
        ];
      },
      (run, direction) => {
        switch (run) {
          case 'hero-pattern':
            return stagePosition(direction === 1 ? 0 : PHONE_STAGE_STOPS.patternMotionStart);
          case 'pattern-collapse':
            return stagePosition(direction === 1
              ? PHONE_STAGE_STOPS.patternMotionStart
              : PHONE_STAGE_STOPS.patternMotionEnd);
          case 'pattern-star-map':
            return stagePosition(direction === 1
              ? PHONE_STAGE_STOPS.patternMotionEnd
              : PHONE_STAGE_STOPS.patternStarEnd);
          case 'aod-method':
            return direction === 1
              ? aodSemanticPosition()
              : Math.max(stageScrollStart, stageScrollEnd - 1);
          default:
            return null;
        }
      },
      (scene) => {
        if (scene === 'method-top') {
          return methodDocumentPosition();
        }
        const progress = frontHoldProgress(scene);
        return progress === null ? null : stagePosition(progress);
      }
    );
    const [
      observeAodMediaProgress,
      reportAodCompositorFrame,
      completeAodRun,
      failAodRun,
      syncAodRuntime,
      disposeAodRuntime
    ] = registerPhoneRuntimeAodCapability(
      options.orchestrator,
      (direction) => direction === 1
        ? aodSemanticPosition()
        : Math.max(stageScrollStart, stageScrollEnd - 1),
      (direction) => {
        // This read stays in the originating input stack, but the runtime
        // selector owns named snapshot fields. The lazy stage chunk receives
        // only positional data, so production property mangling cannot turn
        // an otherwise valid AOD admission into a permanent false negative.
        const [, , , , , , run, currentDirection, , phase, , status] =
          selectPhoneCinematicSnapshot(options.orchestrator.getSnapshot());
        return status === 'transaction'
          && run === 'aod-method'
          && currentDirection === direction
          && phase === 'preparing'
          && aodRef.current !== null;
      },
      (execution) => {
        const aodAdapter = aodRef.current;
        return aodAdapter
          ? aodAdapter.startAutoplay(execution)
          : Promise.resolve('error');
      },
      (execution, progress) => {
        const aodAdapter = aodRef.current;
        if (aodAdapter) aodAdapter.renderAutoplayProgress(execution, progress);
      },
      () => {
        const aodAdapter = aodRef.current;
        if (aodAdapter) aodAdapter.resetAutoplay();
      },
      options.reducedMotion,
      {
        position(direction) {
          if (direction !== 1) {
            return aodSemanticPosition();
          }
          return methodDocumentPosition();
        },
        present(execution, report) {
          const methodAdapter = methodRef.current;
          const aodAdapter = aodRef.current;
          const target = execution[1] === 1 ? methodAdapter : aodAdapter;
          if (!target?.presentPresentation) return false;
          target.presentPresentation(execution[0], report);
          return true;
        },
        dispose(execution) {
          const methodAdapter = methodRef.current;
          const aodAdapter = aodRef.current;
          const target = execution[1] === 1 ? methodAdapter : aodAdapter;
          target?.disposePresentation?.(execution[0]);
        }
      }
    );

    progressHandlerRef.current = observeAodMediaProgress;
    completeHandlerRef.current = completeAodRun;
    frameHandlerRef.current = reportAodCompositorFrame;
    failureHandlerRef.current = failAodRun;

    const pointerTargetIsPermissionButton = (event: Event) => (
      event.target instanceof Element
      && Boolean(event.target.closest('[data-portrait-gyro-permission]'))
    );
    const onHeroPointerDown = (event: PointerEvent) => {
      if (!pointerTargetIsPermissionButton(event)) {
        heroRef.current?.unlockFromGesture();
      }
    };
    const onHeroClick = (event: Event) => {
      heroRef.current?.unlockFromGesture();
      if (pointerTargetIsPermissionButton(event)) requestPortraitFullscreen(root);
    };
    root.addEventListener('pointerdown', onHeroPointerDown, { passive: true });
    root.addEventListener('click', onHeroClick);

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
      const heroAdapter = heroRef.current;
      if (heroAdapter) heroAdapter.startEntrance();
    }

    return () => {
      active = false;
      if (renderSnapshotRef.current === renderSnapshot) renderSnapshotRef.current = undefined;
      if (progressHandlerRef.current === observeAodMediaProgress) progressHandlerRef.current = undefined;
      if (completeHandlerRef.current === completeAodRun) completeHandlerRef.current = undefined;
      if (frameHandlerRef.current === reportAodCompositorFrame) frameHandlerRef.current = undefined;
      if (failureHandlerRef.current === failAodRun) failureHandlerRef.current = undefined;
      frontStageRuntime.dispose();
      disposeAodRuntime();
      const heroAdapter = heroRef.current;
      if (heroAdapter) heroAdapter.cancelEntrance();
      window.cancelAnimationFrame(refreshFrame);
      window.removeEventListener('load', refresh);
      window.removeEventListener('resize', refreshStageGeometry);
      window.removeEventListener('orientationchange', refreshStageGeometry);
      resizeObserver?.disconnect();
      phoneStageRefreshers.delete(refreshStageGeometry);
      root.removeEventListener('pointerdown', onHeroPointerDown);
      root.removeEventListener('click', onHeroClick);
      corridorLease.dispose();
      effectLease.dispose();
      if (import.meta.env.DEV) {
        delete root.dataset.portraitSpikeMotionState;
        delete root.dataset.portraitStagePin;
        delete root.dataset.portraitStageProgress;
      }
    };
  }, [
    options.enabled,
    options.orchestrator,
    options.reducedMotion
  ]);

  return { onAodProgress, onAodComplete, onAodFrame, onAodFailure };
}
