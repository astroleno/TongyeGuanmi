import {
  useCallback,
  useLayoutEffect,
  useRef,
  type RefObject
} from 'react';
import { gsap } from 'gsap/gsap-core';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type {
  PhoneOrchestratedRunSession,
  PhoneStoryRuntimePort
} from './phone-story-orchestrator';
import {
  PHONE_STAGE_STOPS,
  phoneFrontRailSample,
  phoneStageFrame
} from './phone-stage-timeline';
import { renderPhoneStageTransitions } from './phone-transition-stage';
import type {
  PhoneExecutionIdentity,
  PhoneStorySnapshot
} from './phone-story-state';
import type {
  PhoneAodAdapterHandle,
  PhoneHeroAdapterHandle,
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';

type PhonePrefixStyle = object;

export function phoneGsapCheckPrefix(
  property: string,
  style?: PhonePrefixStyle
): string {
  const targetStyle = style ?? (
    typeof document === 'undefined'
      ? undefined
      : document.createElement('div').style
  );
  if (!targetStyle || property in targetStyle) return property;

  const capitalized = property.charAt(0).toUpperCase() + property.slice(1);
  for (const prefix of ['Webkit', 'Moz', 'ms', 'O'] as const) {
    const candidate = `${prefix}${capitalized}`;
    if (candidate in targetStyle) return candidate;
  }
  return property;
}

const phoneGsapUtils = gsap.utils as typeof gsap.utils & {
  checkPrefix?: (property: string) => string;
};
if (!phoneGsapUtils.checkPrefix) {
  phoneGsapUtils.checkPrefix = phoneGsapCheckPrefix;
}
gsap.registerPlugin(ScrollTrigger);

export function refreshPhoneScrollStage(): void {
  ScrollTrigger.refresh();
}

const PHONE_AOD_RUN_TIMEOUT_MS = 6000;
const FRONT_AOD_SURFACE = 'front:aod';

/** Resource activity is derived from the same projection that owns root roles. */
export function phoneSnapshotOwnsAod(snapshot: PhoneStorySnapshot): boolean {
  return snapshot.projection.sourceSurface === FRONT_AOD_SURFACE
    || snapshot.projection.receiverSurface === FRONT_AOD_SURFACE;
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

function frontProgressForSnapshot(snapshot: PhoneStorySnapshot): number | null {
  if (snapshot.status === 'scroll-run') {
    switch (snapshot.run) {
      case 'hero-pattern-scroll':
        return interpolate(
          PHONE_STAGE_STOPS.heroMotionEnd,
          PHONE_STAGE_STOPS.heroPatternEnd,
          snapshot.scroll.progress
        );
      case 'pattern-star-scroll':
        return interpolate(
          PHONE_STAGE_STOPS.patternStarStart,
          PHONE_STAGE_STOPS.patternStarEnd,
          snapshot.scroll.progress
        );
      case 'star-aod-scroll':
        return interpolate(
          PHONE_STAGE_STOPS.starAodStart,
          PHONE_STAGE_STOPS.starAodEnd,
          snapshot.scroll.progress
        );
    }
  }
  if (
    snapshot.status === 'transaction'
    && snapshot.session.operation.run === 'aod-method'
  ) return PHONE_STAGE_STOPS.aodAutoplayStart;
  if (snapshot.projection.stageOwner !== 'front') return null;
  const scene = snapshot.projection.semanticScene;
  return snapshot.scroll.progress > 0 || scene === 'hero'
    ? snapshot.scroll.progress
    : frontHoldProgress(scene);
}

function identityForAod(
  snapshot: PhoneStorySnapshot,
  direction: 1 | -1
): PhoneExecutionIdentity | null {
  if (
    snapshot.status !== 'transaction'
    || snapshot.session.operation.run !== 'aod-method'
    || snapshot.session.operation.direction !== direction
  ) return null;
  return {
    authorityId: snapshot.authorityId,
    sessionId: snapshot.session.sessionId,
    generation: snapshot.session.generation,
    leg: snapshot.session.operation.legIndex,
    direction
  };
}

function identityForAodSession(
  session: Pick<
    PhoneOrchestratedRunSession,
    'authorityId' | 'sessionId' | 'generation' | 'leg' | 'direction'
  >
): PhoneExecutionIdentity {
  return {
    authorityId: session.authorityId,
    sessionId: session.sessionId,
    generation: session.generation,
    leg: session.leg,
    direction: session.direction
  };
}

function snapshotMatchesAodIdentity(
  snapshot: PhoneStorySnapshot,
  identity: PhoneExecutionIdentity
): boolean {
  if (
    snapshot.status !== 'transaction'
    || snapshot.session.operation.run !== 'aod-method'
  ) return false;
  const { session } = snapshot;
  return snapshot.authorityId === identity.authorityId
    && session.sessionId === identity.sessionId
    && session.generation === identity.generation
    && session.operation.legIndex === identity.leg
    && session.operation.direction === identity.direction;
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
  snapshot: PhoneStorySnapshot;
  enabled: boolean;
  reducedMotion: boolean;
  adapterRevision: number;
  mapAodToMethod(progress: number): number;
}>;

export type PhoneStageRuntime = Readonly<{
  onAodProgress(
    progress: number,
    direction: 1 | -1,
    identity: PhoneExecutionIdentity
  ): void;
  onAodComplete(direction: 1 | -1, identity: PhoneExecutionIdentity): void;
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
  const renderSnapshotRef = useRef<((snapshot: PhoneStorySnapshot) => void) | undefined>(undefined);
  const progressHandlerRef = useRef<
    (
      progress: number,
      direction: 1 | -1,
      identity: PhoneExecutionIdentity
    ) => void
  >(undefined);
  const completeHandlerRef = useRef<
    ((direction: 1 | -1, identity: PhoneExecutionIdentity) => void) | undefined
  >(undefined);

  const onAodProgress = useCallback((
    progress: number,
    direction: 1 | -1,
    identity: PhoneExecutionIdentity
  ) => {
    progressHandlerRef.current?.(progress, direction, identity);
  }, []);
  const onAodComplete = useCallback((
    direction: 1 | -1,
    identity: PhoneExecutionIdentity
  ) => {
    completeHandlerRef.current?.(direction, identity);
  }, []);

  useLayoutEffect(() => {
    renderSnapshotRef.current?.(options.snapshot);
  }, [options.snapshot]);

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
    let lastRailY = snapshotRef.current.scroll.actualY;
    let completedHeroEntrance = false;
    let observedAodSession: string | null = null;
    const aodTimers = new Set<number>();
    const clearAodTimers = () => {
      for (const timer of aodTimers) window.clearTimeout(timer);
      aodTimers.clear();
    };
    const stagePosition = (progress: number) => stageScrollStart
      + (stageScrollEnd - stageScrollStart) * progress;
    const updateStageGeometry = (trigger: ScrollTrigger) => {
      stageScrollStart = trigger.start;
      stageScrollEnd = trigger.end;
    };
    const readStageScrollDistance = () => {
      const configuredDistance = Number.parseFloat(
        root.style.getPropertyValue('--portrait-stage-scroll-distance')
      );
      return Number.isFinite(configuredDistance) && configuredDistance > 0
        ? configuredDistance
        : Math.max(1, stageRail.offsetHeight - stage.offsetHeight);
    };
    const renderSnapshot = (snapshot: PhoneStorySnapshot) => {
      if (!active) return;
      const aodIdentity = identityForAod(snapshot, 1)
        ?? identityForAod(snapshot, -1);
      const aodSession = aodIdentity
        ? `${aodIdentity.sessionId}:${aodIdentity.generation}`
        : null;
      if (observedAodSession && !aodSession) {
        clearAodTimers();
        aodAdapter.resetAutoplay();
      }
      observedAodSession = aodSession;

      const stageProgress = frontProgressForSnapshot(snapshot);
      if (stageProgress !== null) {
        const frame = phoneStageFrame(stageProgress, options.reducedMotion);
        if (import.meta.env.DEV) {
          root.dataset.portraitStageProgress = stageProgress.toFixed(4);
        }
        heroAdapter.update(frame.heroProgress);
        patternAdapter.update(frame.patternProgress);
        starAdapter.update(frame.starProgress);
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

      if (snapshot.status === 'transaction' && snapshot.session.operation.run === 'aod-method') {
        const { session } = snapshot;
        aodAdapter.update(session.progress);
        methodAdapter.update(options.mapAodToMethod(session.progress));
        if (session.phase.startsWith('rollback-')) aodAdapter.resetAutoplay();
      }
    };

    const stageTrigger = ScrollTrigger.create({
      id: 'portrait-spike-stage',
      trigger: stageRail,
      start: 'top top',
      end: () => `+=${readStageScrollDistance()}`,
      invalidateOnRefresh: true,
      // ScrollTrigger is geometry-only. The document sampler is the sole
      // publisher of a front-rail sample into the authority.
      onUpdate: updateStageGeometry,
      onRefresh: updateStageGeometry,
      onEnter: () => undefined,
      onEnterBack: () => undefined,
      onLeave: () => undefined
    });
    updateStageGeometry(stageTrigger);

    const surfaceLeases = [
      options.orchestrator.registerSurface({
        id: 'front:hero', scene: 'hero', kind: 'fixed', root: () => heroAdapter.root()
      }),
      options.orchestrator.registerSurface({
        id: 'front:pattern', scene: 'pattern', kind: 'fixed', root: () => patternAdapter.root()
      }),
      options.orchestrator.registerSurface({
        id: 'front:star', scene: 'star-map', kind: 'fixed', root: () => starAdapter.root()
      }),
      options.orchestrator.registerSurface({
        id: FRONT_AOD_SURFACE, scene: 'aod-animation', kind: 'fixed', root: () => aodAdapter.root()
      }),
      options.orchestrator.registerSurface({
        id: 'native:method',
        scene: 'method-top',
        kind: 'native',
        root: () => methodAdapter.root(),
        coverageRoot: () => methodAdapter.root(),
        presented: () => true
      })
    ];
    const corridorLease = options.orchestrator.registerScrollCorridor({
      id: 'front-rail',
      scenes: ['hero', 'pattern', 'star-map', 'aod-animation'],
      sample(viewport) {
        const delta = viewport.actualY - lastRailY;
        lastRailY = viewport.actualY;
        const direction = delta > .5 ? 1 : delta < -.5 ? -1 : 0;
        const progress = clamp(
          (viewport.actualY - stageScrollStart) / Math.max(1, stageScrollEnd - stageScrollStart)
        );
        return {
          actualY: viewport.actualY,
          ...phoneFrontRailSample(progress, direction, options.reducedMotion)
        };
      },
      boundary(run, direction) {
        if (run !== 'aod-method') return null;
        return direction === 1
          ? stagePosition(PHONE_STAGE_STOPS.aodAutoplayStart)
          : Math.max(stageScrollStart, stageScrollEnd - 1);
      },
      landing(scene) {
        const progress = frontHoldProgress(scene);
        return progress === null ? null : stagePosition(progress);
      }
    });
    const aodRegistration = options.orchestrator.registerRunCapability(
      'aod-method',
      'aod:method',
      {
        position(direction) {
          return direction === 1
            ? stagePosition(PHONE_STAGE_STOPS.aodAutoplayStart)
            : Math.max(stageScrollStart, stageScrollEnd - 1);
        },
        canStart(direction) {
          const snapshot = snapshotRef.current;
          return snapshot.status === 'transaction'
            && snapshot.session.operation.run === 'aod-method'
            && snapshot.session.operation.direction === direction
            && snapshot.session.phase === 'preparing';
        },
        start(direction, session) {
          if (!session.valid()) return false;
          const identity = identityForAodSession(session);
          // The packed-alpha poster is already projected; publish its frame
          // before an adapter's reduced-motion completion can fire synchronously.
          session.reportPresentedFrame();
          const timer = window.setTimeout(() => {
            aodTimers.delete(timer);
            if (session.valid()) session.reportFailure();
          }, PHONE_AOD_RUN_TIMEOUT_MS);
          aodTimers.add(timer);
          void aodAdapter.startAutoplay(direction, identity).then(
            (result) => {
              if (result === 'playing' || !session.valid()) return;
              window.clearTimeout(timer);
              aodTimers.delete(timer);
              session.reportFailure();
            },
            () => {
              window.clearTimeout(timer);
              aodTimers.delete(timer);
              if (session.valid()) session.reportFailure();
            }
          );
          return true;
        }
      }
    );

    const emitAodProgress = (
      progress: number,
      _direction: 1 | -1,
      identity: PhoneExecutionIdentity
    ) => {
      options.orchestrator.dispatch({
        ...identity,
        type: 'PROGRESS_REPORTED',
        progress
      });
    };
    const completeAod = (identity: PhoneExecutionIdentity) => {
      clearAodTimers();
      options.orchestrator.dispatch({ ...identity, type: 'LEG_COMPLETED' });
      const after = options.orchestrator.getSnapshot();
      if (
        after.status === 'transaction'
        && snapshotMatchesAodIdentity(after, identity)
        && after.session.phase === 'verifying-target'
      ) {
        options.orchestrator.dispatch({ ...identity, type: 'TARGET_PRESENTED' });
      }
    };
    progressHandlerRef.current = emitAodProgress;
    const deliverAodComplete = (direction: 1 | -1, identity: PhoneExecutionIdentity) => {
      if (direction === identity.direction) completeAod(identity);
    };
    completeHandlerRef.current = deliverAodComplete;

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

    const refresh = () => {
      if (active) ScrollTrigger.refresh();
    };
    const refreshFrame = window.requestAnimationFrame(refresh);
    void document.fonts?.ready.then(refresh).catch(() => undefined);
    window.addEventListener('load', refresh, { once: true });

    if (import.meta.env.DEV) {
      root.dataset.portraitSpikeMotionState = options.reducedMotion ? 'reduced' : 'running';
      root.dataset.portraitStagePin = 'native-fixed-composite';
    }
    ScrollTrigger.config({ ignoreMobileResize: true });
    renderSnapshotRef.current = renderSnapshot;
    renderSnapshot(snapshotRef.current);
    if (frontProgressForSnapshot(snapshotRef.current) === 0) {
      heroAdapter.startEntrance();
    }

    return () => {
      active = false;
      if (renderSnapshotRef.current === renderSnapshot) renderSnapshotRef.current = undefined;
      if (progressHandlerRef.current === emitAodProgress) progressHandlerRef.current = undefined;
      if (completeHandlerRef.current === deliverAodComplete) completeHandlerRef.current = undefined;
      clearAodTimers();
      heroAdapter.cancelEntrance();
      window.cancelAnimationFrame(refreshFrame);
      window.removeEventListener('load', refresh);
      root.removeEventListener('pointerdown', onHeroPointerDown);
      root.removeEventListener('click', onHeroClick);
      corridorLease.dispose();
      aodRegistration.dispose();
      for (const lease of surfaceLeases) lease.dispose();
      stageTrigger.kill();
      aodAdapter.resetAutoplay();
      if (import.meta.env.DEV) {
        delete root.dataset.portraitSpikeMotionState;
        delete root.dataset.portraitStagePin;
        delete root.dataset.portraitStageProgress;
      }
      ScrollTrigger.config({ ignoreMobileResize: false });
    };
  }, [
    options.adapterRevision,
    options.enabled,
    options.mapAodToMethod,
    options.orchestrator,
    options.reducedMotion
  ]);

  return { onAodProgress, onAodComplete };
}
