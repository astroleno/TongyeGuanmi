import { useCallback, useRef, type RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { FrontHalfCheckpointId } from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import { sceneFromHash } from '../navigation';
import { clearPhoneInkBoundary } from './phone-ink';
import {
  registerPhoneTransitionBoundary,
  runPhoneTimedTransition,
  type PhoneTransitionDirection,
  type PhoneTransitionSession
} from './phone-transition-coordinator';
import {
  PHONE_STAGE_STOPS,
  phoneAodCheckpointForMethodProgress,
  phoneAodCompletionCheckpoint,
  phoneDirectEntryCompletesAod,
  phoneStageFrame
} from './phone-stage-timeline';
import { renderPhoneStageTransitions } from './phone-transition-stage';
import type { PhoneEdgeScene } from './phone-edge-surface';
import type {
  PhoneAodAdapterHandle,
  PhoneHeroAdapterHandle,
  PhoneSceneAdapterHandle,
  PhoneStageSceneId,
  PhoneTransitionAdapterHandle
} from './types';

gsap.registerPlugin(ScrollTrigger, useGSAP);

export function refreshPhoneScrollStage(): void {
  ScrollTrigger.refresh();
}

type PortraitStageScene = 'hero' | 'pattern' | 'star' | 'aod';
type PortraitAodRunState = 'idle' | 'forward' | 'complete' | 'reverse';

const FRONT_INK_BOUNDARIES = [
  {
    start: PHONE_STAGE_STOPS.heroMotionEnd,
    end: PHONE_STAGE_STOPS.heroPatternEnd
  },
  {
    start: PHONE_STAGE_STOPS.patternStarStart,
    end: PHONE_STAGE_STOPS.patternStarEnd
  },
  {
    start: PHONE_STAGE_STOPS.starAodStart,
    end: PHONE_STAGE_STOPS.starAodEnd
  }
] as const;
type FrontInkBoundary = typeof FRONT_INK_BOUNDARIES[number];

function portraitStageScene(scene: PhoneStageSceneId): PortraitStageScene {
  if (scene === 'star-map') return 'star';
  if (scene === 'aod-animation') return 'aod';
  return scene;
}

type FullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

function requestPortraitFullscreen(root: HTMLElement): void {
  const target = root as FullscreenElement;
  const request = target.requestFullscreen?.bind(target)
    ?? target.webkitRequestFullscreen?.bind(target);
  if (!request) {
    root.dataset.portraitFullscreen = 'unavailable';
    return;
  }
  root.dataset.portraitFullscreen = 'requesting';
  void Promise.resolve(request()).then(
    () => {
      root.dataset.portraitFullscreen = 'active';
    },
    () => {
      root.dataset.portraitFullscreen = 'unavailable';
    }
  );
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
  enabled: boolean;
  reducedMotion: boolean;
  adapterRevision: number;
  aodAlphaEndProgress: number;
  mapAodToMethod(progress: number): number;
  onCheckpoint(checkpoint: FrontHalfCheckpointId): void;
  onNavigationScene(scene: SceneId): void;
  onEdgeScene(scene: PhoneEdgeScene): void;
}>;

export type PhoneStageRuntime = Readonly<{
  onAodProgress(progress: number, direction: 1 | -1): void;
  onAodComplete(direction: 1 | -1): void;
}>;

/**
 * Exact Route B coordinator moved out of the shell. It owns rail sampling,
 * scene stacking, document surfaces, and AOD snap semantics while every
 * visual/media mutation is delegated to its mounted adapter owner.
 */
export function usePhoneStageRuntime(
  options: PhoneStageRuntimeOptions
): PhoneStageRuntime {
  const progressHandlerRef = useRef<
    ((progress: number, direction: 1 | -1) => void) | undefined
  >(undefined);
  const completeHandlerRef = useRef<
    ((direction: 1 | -1) => void) | undefined
  >(undefined);

  const onAodProgress = useCallback((progress: number, direction: 1 | -1) => {
    progressHandlerRef.current?.(progress, direction);
  }, []);
  const onAodComplete = useCallback((direction: 1 | -1) => {
    completeHandlerRef.current?.(direction);
  }, []);

  useGSAP(() => {
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
    ) {
      return;
    }

    const motionEnabled = !options.reducedMotion;
    let active = true;
    let currentOwnership = '';
    let heroActive: boolean | undefined;
    let patternActive: boolean | undefined;
    let starActive: boolean | undefined;
    let aodActive: boolean | undefined;
    let aodRunState: PortraitAodRunState = 'idle';
    let aodProgress = 0;
    let lastStageProgress = Number.NaN;
    let stageScrollStart = 0;
    let stageScrollEnd = 1;
    let aodSession: PhoneTransitionSession | null = null;
    let stageInkRun: {
      direction: PhoneTransitionDirection;
      start: number;
      end: number;
      progress: number;
    } | null = null;
    let cancelStageInkRun: (() => void) | undefined;
    const completedStageInk = new Set<FrontInkBoundary>();
    const stagePosition = (progress: number) => stageScrollStart
      + (stageScrollEnd - stageScrollStart) * progress;
    let currentNavigationScene: SceneId = 'hero';

    root.dataset.portraitSpikeMotionState = motionEnabled ? 'running' : 'reduced';
    root.dataset.portraitStagePin = 'native-fixed-composite';
    root.dataset.portraitStageActive = 'true';
    root.dataset.portraitAodRun = aodRunState;
    root.dataset.phoneAodSnap = 'idle';
    root.dataset.portraitAodMethodVisible = 'false';
    ScrollTrigger.config({ ignoreMobileResize: true });

    const setCurrentNavigationScene = (scene: SceneId) => {
      if (currentNavigationScene === scene) return;
      currentNavigationScene = scene;
      options.onNavigationScene(scene);
    };

    const setStageActive = (stageActive: boolean) => {
      if (
        !stageActive
        && (aodRunState === 'forward' || aodRunState === 'reverse')
      ) {
        root.dataset.portraitStageActive = 'true';
        root.dataset.portraitStageBoundary = 'held-by-aod';
        return;
      }
      delete root.dataset.portraitStageBoundary;
      root.dataset.portraitStageActive = String(stageActive);
      if (!stageActive) {
        options.onEdgeScene('method');
        setCurrentNavigationScene('method-top');
      }
    };

    const scenes: Record<PortraitStageScene, HTMLElement> = {
      hero: heroScene,
      pattern: patternScene,
      star: starScene,
      aod: aodScene
    };
    const sceneEntries = Object.entries(scenes) as [
      PortraitStageScene,
      HTMLElement
    ][];

    const setSceneVisibility = (
      scene: PortraitStageScene,
      visible: boolean,
      zIndex: number
    ) => {
      const element = scenes[scene];
      clearPhoneInkBoundary(element);
      element.style.visibility = visible ? 'visible' : 'hidden';
      element.style.zIndex = String(zIndex);
      element.setAttribute('aria-hidden', visible ? 'false' : 'true');
    };

    const setOwnership = (
      key: string,
      visible: readonly PortraitStageScene[],
      stack: readonly PortraitStageScene[]
    ) => {
      const ownershipChanged = currentOwnership !== key;
      currentOwnership = key;
      const visibleSet = new Set(visible);
      for (const [scene] of sceneEntries) {
        const stackIndex = stack.indexOf(scene);
        setSceneVisibility(
          scene,
          visibleSet.has(scene),
          stackIndex >= 0 ? stack.length + 1 - stackIndex : 0
        );
      }
      if (ownershipChanged) root.dataset.portraitStageOwner = key;
    };

    const setAodHoldOwnership = (progress: number, phase: string) => {
      const alphaTransparent = progress < options.aodAlphaEndProgress;
      aodScene.dataset.portraitAodAlpha = alphaTransparent
        ? 'transparent'
        : 'opaque';
      setOwnership(
        `hold-aod-${phase}-${alphaTransparent ? 'alpha' : 'opaque'}`,
        ['aod'],
        ['aod']
      );
    };

    const setHeroFigureActive = (nextActive: boolean) => {
      if (heroActive === nextActive) return;
      heroActive = nextActive;
      if (nextActive) heroAdapter.enter?.();
      else heroAdapter.leave?.();
    };
    const setPatternActive = (nextActive: boolean) => {
      if (patternActive === nextActive) return;
      patternActive = nextActive;
      if (nextActive) patternAdapter.enter?.();
      else patternAdapter.leave?.();
    };
    const setStarVisible = (nextVisible: boolean) => {
      if (starActive === nextVisible) return;
      starActive = nextVisible;
      if (nextVisible) starAdapter.enter?.();
      else starAdapter.leave?.();
    };
    const setAodFigureActive = (nextActive: boolean) => {
      if (aodActive === nextActive) return;
      aodActive = nextActive;
      if (nextActive) aodAdapter.enter?.();
      else aodAdapter.leave?.();
    };

    const renderMethodBridge = (progress: number) => {
      methodAdapter.update(progress);
    };

    const renderAodFrame = (rawProgress: number) => {
      const progress = Math.min(1, Math.max(0, rawProgress));
      aodProgress = progress;
      const methodProgress = options.mapAodToMethod(progress);
      renderMethodBridge(methodProgress);
      if (aodRunState === 'forward' || aodRunState === 'reverse') {
        options.onCheckpoint(
          phoneAodCheckpointForMethodProgress(methodProgress)
        );
      }
      if (
        aodRunState !== 'idle'
        || (Number.isFinite(lastStageProgress)
          && lastStageProgress >= PHONE_STAGE_STOPS.starAodEnd)
      ) {
        options.onEdgeScene('aod');
        setAodHoldOwnership(progress, aodRunState);
      }
    };
    progressHandlerRef.current = renderAodFrame;

    const beginAodForward = (session: PhoneTransitionSession) => {
      if (aodRunState !== 'idle' || !session.valid()) return false;
      aodSession = session;
      renderMethodBridge(0);
      aodRunState = 'forward';
      root.dataset.portraitAodRun = aodRunState;
      root.dataset.phoneAodSnap = 'locked';
      options.onCheckpoint('aod-autoplay');
      setStageActive(true);
      setAodFigureActive(true);
      aodAdapter.startAutoplay(1);
      return true;
    };

    const beginAodReverse = (session: PhoneTransitionSession) => {
      if (aodRunState !== 'complete' || !session.valid()) return false;
      aodSession = session;
      aodRunState = 'reverse';
      root.dataset.portraitAodRun = aodRunState;
      root.dataset.phoneAodSnap = 'locked';
      options.onCheckpoint(phoneAodCheckpointForMethodProgress(
        options.mapAodToMethod(aodProgress)
      ));
      setStageActive(true);
      setAodFigureActive(true);
      aodAdapter.startAutoplay(-1);
      return true;
    };

    const completeAodRun = (direction: 1 | -1) => {
      const session = aodSession;
      aodSession = null;
      aodRunState = direction === 1 ? 'complete' : 'idle';
      root.dataset.portraitAodRun = aodRunState;
      root.dataset.phoneAodSnap = 'released';
      options.onCheckpoint(phoneAodCompletionCheckpoint(direction));
      session?.complete(stagePosition(PHONE_STAGE_STOPS.aodAutoplayStart));
      if (direction === 1) setAodFigureActive(false);
      else renderStage(stageTrigger.progress);
    };
    completeHandlerRef.current = completeAodRun;

    const retryHeroFigureFromGesture = () => {
      heroAdapter.unlockFromGesture();
      if (aodRunState === 'forward' || aodRunState === 'reverse') {
        aodAdapter.startAutoplay(aodRunState === 'forward' ? 1 : -1);
      }
    };
    const pointerTargetIsPermissionButton = (event: Event) => (
      event.target instanceof Element
      && Boolean(event.target.closest('[data-portrait-gyro-permission]'))
    );
    const onHeroPointerDown = (event: PointerEvent) => {
      if (!pointerTargetIsPermissionButton(event)) {
        retryHeroFigureFromGesture();
      }
    };
    const onHeroClick = (event: Event) => {
      retryHeroFigureFromGesture();
      if (pointerTargetIsPermissionButton(event)) {
        requestPortraitFullscreen(root);
      }
    };
    root.addEventListener('pointerdown', onHeroPointerDown, { passive: true });
    root.addEventListener('click', onHeroClick);

    if (motionEnabled) aodAdapter.resetAutoplay();
    const directEntryScene = sceneFromHash(window.location.hash);
    if (phoneDirectEntryCompletesAod(directEntryScene)) {
      aodRunState = 'complete';
      root.dataset.portraitAodRun = aodRunState;
      aodAdapter.update(1);
      renderAodFrame(1);
    }

    const renderStage = (rawProgress: number, triggerDirection = 0) => {
      const activeInk = stageInkRun;
      const effectiveProgress = activeInk
        ? activeInk.start
          + (activeInk.end - activeInk.start) * activeInk.progress
        : rawProgress;
      if (activeInk) triggerDirection = activeInk.direction;
      const progress = Math.min(1, Math.max(0, effectiveProgress));
      const previousStageProgress = lastStageProgress;
      const movingBackward = triggerDirection < 0
        || (Number.isFinite(previousStageProgress)
          && progress < previousStageProgress);
      lastStageProgress = progress;
      if (
        progress > 0.003
        && root.dataset.portraitHeroEntrance !== 'complete'
      ) {
        heroAdapter.completeEntrance();
      }
      const frame = phoneStageFrame(progress, options.reducedMotion);
      setCurrentNavigationScene(frame.navigationScene);

      if (
        motionEnabled
        && movingBackward
        && aodRunState === 'idle'
        && previousStageProgress >= PHONE_STAGE_STOPS.starAodEnd
        && progress < PHONE_STAGE_STOPS.starAodEnd
      ) {
        aodAdapter.resetAutoplay();
      }

      root.dataset.portraitStageProgress = progress.toFixed(4);
      if (aodRunState === 'idle') options.onCheckpoint(frame.checkpoint);
      if (progress < PHONE_STAGE_STOPS.heroPatternEnd) {
        options.onEdgeScene('hero');
      } else if (progress < PHONE_STAGE_STOPS.patternStarEnd) {
        options.onEdgeScene('pattern');
      } else if (progress < PHONE_STAGE_STOPS.starAodEnd) {
        options.onEdgeScene('star');
      } else {
        options.onEdgeScene('aod');
      }
      setHeroFigureActive(
        motionEnabled && progress < PHONE_STAGE_STOPS.heroPatternEnd
      );
      setPatternActive(
        motionEnabled
        && progress >= PHONE_STAGE_STOPS.heroMotionEnd - 0.015
        && progress < PHONE_STAGE_STOPS.patternStarEnd + 0.015
      );
      setStarVisible(
        motionEnabled
        && progress >= PHONE_STAGE_STOPS.patternStarStart - 0.015
        && progress < PHONE_STAGE_STOPS.starAodEnd + 0.015
      );
      setAodFigureActive(
        motionEnabled
        && aodRunState !== 'complete'
        && progress >= PHONE_STAGE_STOPS.starAodStart - 0.015
      );
      heroAdapter.update(frame.heroProgress);
      patternAdapter.update(frame.patternProgress);
      starAdapter.update(frame.starProgress);

      if (!motionEnabled) {
        setOwnership(
          frame.ownership.key,
          frame.ownership.visible.map(portraitStageScene),
          frame.ownership.stack.map(portraitStageScene)
        );
        if (progress >= PHONE_STAGE_STOPS.starAodEnd) aodAdapter.update(1);
        return;
      }

      if (aodRunState === 'forward' || aodRunState === 'reverse') {
        heroPatternAdapter.render(1);
        patternStarAdapter.render(1);
        starAodAdapter.render(1);
        setAodHoldOwnership(aodProgress, aodRunState);
        return;
      }

      const visible = frame.ownership.visible.map(portraitStageScene);
      const stack = frame.ownership.stack.map(portraitStageScene);
      renderPhoneStageTransitions(frame, {
        heroPattern: heroPatternAdapter,
        patternStar: patternStarAdapter,
        starAod: starAodAdapter
      }, () => setOwnership(frame.ownership.key, visible, stack));
      if (progress >= PHONE_STAGE_STOPS.starAodEnd) {
        setAodHoldOwnership(aodProgress, aodRunState);
      }
    };

    const refresh = () => {
      if (active) ScrollTrigger.refresh();
    };
    const refreshFrame = window.requestAnimationFrame(refresh);
    void document.fonts?.ready.then(refresh).catch(() => undefined);
    window.addEventListener('load', refresh, { once: true });

    const updateStageFromTrigger = (self: ScrollTrigger) => {
      stageScrollStart = self.start;
      stageScrollEnd = self.end;
      renderStage(self.progress, self.direction);
    };
    const readStageScrollDistance = () => {
      const configuredDistance = Number.parseFloat(
        root.style.getPropertyValue('--portrait-stage-scroll-distance')
      );
      return Number.isFinite(configuredDistance) && configuredDistance > 0
        ? configuredDistance
        : Math.max(1, stageRail.offsetHeight - stage.offsetHeight);
    };
    const stageTrigger = ScrollTrigger.create({
      id: 'portrait-spike-stage',
      trigger: stageRail,
      start: 'top top',
      end: () => `+=${readStageScrollDistance()}`,
      invalidateOnRefresh: true,
      onUpdate: updateStageFromTrigger,
      onRefresh: (self) => {
        updateStageFromTrigger(self);
        setStageActive(self.progress < 1);
      },
      onEnter: () => setStageActive(true),
      onEnterBack: () => setStageActive(true),
      onLeave: () => setStageActive(false)
    });

    for (const boundary of FRONT_INK_BOUNDARIES) {
      if (stageTrigger.progress >= boundary.end - .001) {
        completedStageInk.add(boundary);
      }
    }
    const transitionOwner = root.closest<HTMLElement>(
      'main.portrait-scroll-spike'
    ) ?? root;
    const aodRegistration = motionEnabled
      ? registerPhoneTransitionBoundary(transitionOwner, {
          position: (direction) => stagePosition(
            direction === 1 ? PHONE_STAGE_STOPS.aodAutoplayStart : 1
          ),
          canStart: (direction) => direction === 1
            ? aodRunState === 'idle'
            : aodRunState === 'complete',
          start: (direction, session) => direction === 1
            ? beginAodForward(session)
            : beginAodReverse(session)
        })
      : null;
    const stageInkRegistrations = motionEnabled
      ? FRONT_INK_BOUNDARIES.map((boundary) => (
          registerPhoneTransitionBoundary(transitionOwner, {
            position: (direction) => stagePosition(
              direction === 1 ? boundary.start : boundary.end
            ),
            canStart: (direction) => (
              !stageInkRun
              && (direction === 1
                ? !completedStageInk.has(boundary)
                : completedStageInk.has(boundary))
            ),
            start: (direction, session) => {
              stageInkRun = {
                ...boundary,
                direction,
                progress: direction === 1 ? 0 : 1
              };
              cancelStageInkRun = runPhoneTimedTransition(
                session,
                direction,
                (progress) => {
                  stageInkRun!.progress = progress;
                  renderStage(0);
                },
                () => {
                  if (direction === 1) completedStageInk.add(boundary);
                  else completedStageInk.delete(boundary);
                  stageInkRun = null;
                  const landingProgress = direction === 1
                    ? boundary.end
                    : boundary.start;
                  session.complete(stagePosition(landingProgress));
                  renderStage(landingProgress, direction);
                }
              );
              return true;
            }
          })
        ))
      : [];

    renderStage(stageTrigger.progress);
    if (motionEnabled && stageTrigger.progress <= 0.003) {
      heroAdapter.startEntrance();
    } else {
      heroAdapter.completeEntrance();
    }

    return () => {
      active = false;
      if (progressHandlerRef.current === renderAodFrame) {
        progressHandlerRef.current = undefined;
      }
      if (completeHandlerRef.current === completeAodRun) {
        completeHandlerRef.current = undefined;
      }
      heroAdapter.cancelEntrance();
      window.cancelAnimationFrame(refreshFrame);
      window.removeEventListener('load', refresh);
      root.removeEventListener('pointerdown', onHeroPointerDown);
      root.removeEventListener('click', onHeroClick);
      cancelStageInkRun?.();
      aodSession?.abort(window.scrollY);
      aodSession = null;
      aodRegistration?.dispose();
      for (const registration of stageInkRegistrations) {
        registration.dispose();
      }
      stageTrigger.kill();
      setHeroFigureActive(false);
      setPatternActive(false);
      setStarVisible(false);
      setAodFigureActive(false);
      aodRunState = 'idle';
      aodAdapter.resetAutoplay();
      delete root.dataset.portraitSpikeMotionState;
      delete root.dataset.portraitStagePin;
      delete root.dataset.portraitStageActive;
      delete root.dataset.portraitStageOwner;
      delete root.dataset.portraitStageProgress;
      delete root.dataset.portraitMethodEntrance;
      delete root.dataset.portraitAodRun;
      delete root.dataset.phoneAodSnap;
      delete root.dataset.portraitAodMethodVisible;
      delete root.dataset.portraitStageBoundary;
      delete root.dataset.portraitHeroEntrance;
      delete root.dataset.portraitHeroTextEntrance;
      delete aodScene.dataset.portraitAodAlpha;
      ScrollTrigger.config({ ignoreMobileResize: false });
    };
  }, {
    scope: options.rootRef,
    dependencies: [
      options.adapterRevision,
      options.aodAlphaEndProgress,
      options.enabled,
      options.mapAodToMethod,
      options.onEdgeScene,
      options.reducedMotion
    ],
    revertOnUpdate: true
  });

  return { onAodProgress, onAodComplete };
}
