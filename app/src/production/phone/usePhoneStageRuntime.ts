import {
  useCallback,
  useLayoutEffect,
  useRef,
  type RefObject
} from 'react';
import { gsap } from 'gsap/gsap-core';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { clearPhoneInkBoundary } from './phone-ink';
import type {
  PhoneOrchestratedRunSession,
  PhoneStoryOrchestrator
} from './phone-story-orchestrator';
import {
  PHONE_STAGE_STOPS,
  phoneStageFrame
} from './phone-stage-timeline';
import type { PhoneStoryCursor } from './phone-story-state';
import { renderPhoneStageTransitions } from './phone-transition-stage';
import type {
  PhoneAodAdapterHandle,
  PhoneHeroAdapterHandle,
  PhoneSceneAdapterHandle,
  PhoneStageSceneId,
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

type PortraitStageScene = 'hero' | 'pattern' | 'star' | 'aod';
const PHONE_AOD_RUN_TIMEOUT_MS = 6000;

export function phoneStageCursorOwnsAod(
  cursor: PhoneStoryCursor
): boolean {
  return cursor.kind === 'hold'
    ? cursor.scene === 'aod-animation'
    : cursor.run === 'star-aod-scroll' || cursor.run === 'aod-method';
}

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
  orchestrator: PhoneStoryOrchestrator;
  enabled: boolean;
  reducedMotion: boolean;
  adapterRevision: number;
  aodAlphaEndProgress: number;
  mapAodToMethod(progress: number): number;
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
    ) {
      return;
    }

    const motionEnabled = !options.reducedMotion;
    let active = true;
    let heroActive: boolean | undefined;
    let patternActive: boolean | undefined;
    let starActive: boolean | undefined;
    let aodActive: boolean | undefined;
    let aodProgress = 0;
    let aodRun: {
      direction: 1 | -1;
      session: PhoneOrchestratedRunSession;
      timeout: number;
    } | null = null;
    let lastStageProgress = Number.NaN;
    let stageScrollStart = 0;
    let stageScrollEnd = 1;
    const aodAtMethod = () => {
      const cursor = options.orchestrator.cursor();
      return cursor.kind === 'hold' && cursor.scene === 'method-top';
    };
    const stagePosition = (progress: number) => stageScrollStart
      + (stageScrollEnd - stageScrollStart) * progress;

    if (import.meta.env.DEV) {
      root.dataset.portraitSpikeMotionState = motionEnabled ? 'running' : 'reduced';
      root.dataset.portraitStagePin = 'native-fixed-composite';
    }
    ScrollTrigger.config({ ignoreMobileResize: true });

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
      const visibleSet = new Set(visible);
      for (const [scene] of sceneEntries) {
        const stackIndex = stack.indexOf(scene);
        setSceneVisibility(
          scene,
          visibleSet.has(scene),
          stackIndex >= 0 ? stack.length + 1 - stackIndex : 0
        );
      }
      if (import.meta.env.DEV) {
        root.dataset.portraitStageOwner = key;
      }
    };

    const setAodHoldOwnership = (progress: number) => {
      const alphaTransparent = progress < options.aodAlphaEndProgress;
      aodScene.dataset.portraitAodAlpha = alphaTransparent
        ? 'transparent'
        : 'opaque';
      setOwnership(
        `hold-aod-${alphaTransparent ? 'alpha' : 'opaque'}`,
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
    const clearAodTimeout = (run: NonNullable<typeof aodRun>) => {
      window.clearTimeout(run.timeout);
      run.timeout = 0;
    };
    const rollbackAodRun = (run: NonNullable<typeof aodRun>) => {
      if (aodRun !== run) return;
      clearAodTimeout(run);
      aodRun = null;
      aodAdapter.resetAutoplay();
      const forward = run.direction === 1;
      const progress = forward ? 0 : 1;
      aodProgress = progress;
      renderMethodBridge(options.mapAodToMethod(progress));
      run.session.reportFailure();
      setAodFigureActive(forward);
      if (forward) {
        setAodHoldOwnership(progress);
      }
    };
    const armAodTimeout = (run: NonNullable<typeof aodRun>) => {
      clearAodTimeout(run);
      run.timeout = window.setTimeout(
        () => rollbackAodRun(run),
        PHONE_AOD_RUN_TIMEOUT_MS
      );
    };
    const startAodMedia = (run: NonNullable<typeof aodRun>) => {
      armAodTimeout(run);
      void aodAdapter.startAutoplay(run.direction).then(
        (result) => {
          if (aodRun !== run || !run.session.valid()) return;
          if (result === 'playing') {
            run.session.reportPresentedFrame();
            armAodTimeout(run);
          }
          else rollbackAodRun(run);
        },
        () => rollbackAodRun(run)
      );
    };

    const renderAodFrame = (rawProgress: number) => {
      const progress = Math.min(1, Math.max(0, rawProgress));
      aodProgress = progress;
      const methodProgress = options.mapAodToMethod(progress);
      renderMethodBridge(methodProgress);
      aodRun?.session.reportProgress(progress);
      if (aodRun) armAodTimeout(aodRun);
      if (
        aodRun
        || (Number.isFinite(lastStageProgress)
          && lastStageProgress >= PHONE_STAGE_STOPS.starAodEnd)
      ) {
        setAodHoldOwnership(progress);
      }
    };
    progressHandlerRef.current = renderAodFrame;

    const beginAodRun = (
      direction: 1 | -1,
      session: PhoneOrchestratedRunSession
    ) => {
      if (aodRun || !session.valid()) return false;
      aodRun = { direction, session, timeout: 0 };
      const run = aodRun;
      if (direction === 1) renderMethodBridge(0);
      setAodFigureActive(true);
      startAodMedia(run);
      return true;
    };

    const completeAodRun = (direction: 1 | -1) => {
      const run = aodRun;
      if (!run || run.direction !== direction) return;
      clearAodTimeout(run);
      const session = run.session;
      aodRun = null;
      session.provideRelease(() => {
        if (direction === 1) setAodFigureActive(false);
        else renderStage(stageTrigger.progress);
      });
      session.reportAnimationComplete();
    };
    completeHandlerRef.current = completeAodRun;

    const retryHeroFigureFromGesture = () => {
      heroAdapter.unlockFromGesture();
      if (aodRun) {
        startAodMedia(aodRun);
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
    const renderStage = (rawProgress: number, triggerDirection = 0) => {
      const progress = Math.min(1, Math.max(0, rawProgress));
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

      if (
        motionEnabled
        && movingBackward
        && !aodRun
        && !aodAtMethod()
        && previousStageProgress >= PHONE_STAGE_STOPS.starAodEnd
        && progress < PHONE_STAGE_STOPS.starAodEnd
      ) {
        aodAdapter.resetAutoplay();
      }

      if (import.meta.env.DEV) {
        root.dataset.portraitStageProgress = progress.toFixed(4);
      }
      if (!aodRun) {
        const direction = movingBackward ? -1 : 1;
        if (frame.ownership.key === 'handoff-hero-pattern') {
          options.orchestrator.reconcileScrollRun(
            'hero-pattern-scroll',
            direction,
            frame.heroPatternProgress
          );
        } else if (frame.ownership.key === 'handoff-pattern-star') {
          options.orchestrator.reconcileScrollRun(
            'pattern-star-scroll',
            direction,
            frame.patternStarProgress
          );
        } else if (frame.ownership.key === 'handoff-star-aod') {
          options.orchestrator.reconcileScrollRun(
            'star-aod-scroll',
            direction,
            frame.starAodProgress
          );
        } else {
          options.orchestrator.reconcileScrollHold(frame.navigationScene);
        }
      }
      if (
        motionEnabled
        && frame.shouldStartAodAutoplay
        && !(previousStageProgress >= PHONE_STAGE_STOPS.aodAutoplayStart)
      ) {
        options.orchestrator.requestRun(1);
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
        && phoneStageCursorOwnsAod(options.orchestrator.cursor())
        && !aodAtMethod()
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

      if (aodRun) {
        heroPatternAdapter.render(1);
        patternStarAdapter.render(1);
        starAodAdapter.render(1);
        setAodHoldOwnership(aodProgress);
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
        setAodHoldOwnership(aodProgress);
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
      },
      // ScrollTrigger is a passive geometry sampler. The Orchestrator owns
      // stage activation and must not let an old rail position hide a later
      // committed surface.
      onEnter: () => undefined,
      onEnterBack: () => undefined,
      onLeave: () => undefined
    });

    const aodRegistration = motionEnabled
      ? options.orchestrator.registerRunCapability(
          'aod-method',
          'phone-stage-runtime:aod-method',
          {
            position: (direction) => direction === 1
              ? stagePosition(PHONE_STAGE_STOPS.aodAutoplayStart)
              : Math.max(stageScrollStart, stageScrollEnd - 1),
            canStart: () => !aodRun,
            start: beginAodRun
          }
        )
      : null;

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
      if (aodRun) {
        clearAodTimeout(aodRun);
        aodRun.session.reportFailure();
      }
      aodRun = null;
      aodRegistration?.dispose();
      stageTrigger.kill();
      setHeroFigureActive(false);
      setPatternActive(false);
      setStarVisible(false);
      setAodFigureActive(false);
      aodAdapter.resetAutoplay();
      if (import.meta.env.DEV) {
        delete root.dataset.portraitSpikeMotionState;
        delete root.dataset.portraitStagePin;
        delete root.dataset.portraitStageOwner;
        delete root.dataset.portraitStageBoundary;
      }
      if (import.meta.env.DEV) {
        delete root.dataset.portraitStageProgress;
        delete root.dataset.portraitMethodEntrance;
      }
      delete root.dataset.portraitHeroEntrance;
      delete root.dataset.portraitHeroTextEntrance;
      delete aodScene.dataset.portraitAodAlpha;
      ScrollTrigger.config({ ignoreMobileResize: false });
    };
  }, [
    options.adapterRevision,
    options.aodAlphaEndProgress,
    options.enabled,
    options.mapAodToMethod,
    options.orchestrator,
    options.reducedMotion
  ]);

  return { onAodProgress, onAodComplete };
}
