import { useCallback, useEffect, useRef, useState } from 'react';
import type { PhoneCheckpointId } from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import { StoryNav } from '../StoryNav';
import { hashForScene } from '../navigation';
import { PhoneStageRail } from './PhoneStageRail';
import { usePhoneAdapterHandleRef } from './phone-adapter-binding';
import { phoneMotionDriver } from './phone-gsap-driver';
import {
  attachPhoneLoaderVisibilityLifecycle,
  phoneLoaderCompletedInDocument
} from './phone-loader-lifecycle';
import { attachStoryMediaUnlock } from '../mobile-media-unlock';
import {
  refreshPhoneScrollStage,
  usePhoneStageRuntime
} from './usePhoneStageRuntime';
import { usePhoneFrontHalfAdapters } from './usePhoneFrontHalfAdapters';
import { usePhoneEdgeSurface } from './usePhoneEdgeSurface';
import { usePhoneFixedStageRegistration } from './usePhoneFixedStageRegistration';
import { usePhoneViewportGeometry } from './usePhoneViewportGeometry';
import type {
  PhoneAodAdapterHandle,
  PhoneHeroAdapterHandle,
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';
import './PhoneStoryShell.css';
const ZERO_METHOD_PROGRESS = () => 0;

/**
 * The physical-device validation route keeps requested motion on by default.
 * `?portrait-spike-motion=reduce` is the explicit low-motion comparison.
 */
function portraitSpikeMotionEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return new URLSearchParams(window.location.search)
    .get('portrait-spike-motion') !== 'reduce';
}
export type PhoneStoryShellProps = Readonly<{
  /** Short numbered routes remain physical-device comparison entries. */
  validationMode?: 'v16' | 'v17' | 'v18' | 'v19' | 'v20' | 'v21' | 'v22' | 'v23' | 'v24' | 'v25' | 'v26' | 'v27' | 'v28' | 'v29' | 'v30' | 'v31' | 'v32' | 'v33' | 'v34' | 'v35' | 'v36' | 'v37' | 'v38' | 'v39' | 'v40' | 'v42' | 'v43' | 'v44' | 'v45' | 'v46' | 'v47';
}>;

/**
 * Production Route B phone shell. It owns only document geometry,
 * navigation, checkpoints, and adapter binding; Loader → Method visual/media
 * ownership lives in dynamically loaded Scene/Transition Adapters.
 */
export function PhoneStoryShell(props: PhoneStoryShellProps = {}) {
  const motionEnabled = portraitSpikeMotionEnabled();
  const [loaderHidden, setLoaderHidden] = useState(phoneLoaderCompletedInDocument);
  const frontHalf = usePhoneFrontHalfAdapters(loaderHidden, setLoaderHidden);
  const {
    Loader,
    Hero,
    Pattern,
    StarMap,
    Aod,
    MethodTop,
    HeroPatternTransition,
    PatternStarMapTransition,
    StarMapAodTransition,
    aodAlphaStartProgress,
    aodAlphaEndProgress,
    modulesReady,
    ready,
    failed,
    staticFallback,
    markHeroReady,
    markHeroPatternReady,
    markPatternReady,
    finishLoader
  } = frontHalf;
  const mapAodToMethod = frontHalf.mapAodToMethod ?? ZERO_METHOD_PROGRESS;
  const [navigationScene, setNavigationScene] = useState<SceneId>('hero');
  const [navigationMenuOpen, setNavigationMenuOpen] = useState(false);
  const [adapterRevision, setAdapterRevision] = useState(0);
  const fixedStageRegistered = usePhoneFixedStageRegistration(loaderHidden && ready);
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRailRef = useRef<HTMLElement | null>(null);
  const stageViewportRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const checkpointRef = useRef<PhoneCheckpointId>(
    loaderHidden ? 'hero-entered' : 'loader'
  );
  const checkpointTraceRef = useRef<PhoneCheckpointId[]>([checkpointRef.current]);
  const publishAdapterRevision = useCallback(() => {
    setAdapterRevision((revision) => revision + 1);
  }, []);
  const bindStageHost = useCallback((host: HTMLDivElement | null) => {
    if (stageRef.current === host) return;
    stageRef.current = host;
    if (host) setStageHost(host);
  }, []);
  const publishEdgeScene = usePhoneEdgeSurface(rootRef, stageViewportRef, props.validationMode === 'v47' ? 'pattern-terminal' : 'baseline');
  const [heroAdapterRef, bindHeroAdapter] =
    usePhoneAdapterHandleRef<PhoneHeroAdapterHandle>(publishAdapterRevision);
  const [patternAdapterRef, bindPatternAdapter] =
    usePhoneAdapterHandleRef<PhoneSceneAdapterHandle>(publishAdapterRevision);
  const [starMapAdapterRef, bindStarMapAdapter] =
    usePhoneAdapterHandleRef<PhoneSceneAdapterHandle>(publishAdapterRevision);
  const [aodAdapterRef, bindAodAdapter] =
    usePhoneAdapterHandleRef<PhoneAodAdapterHandle>(publishAdapterRevision);
  const [methodAdapterRef, bindMethodAdapter] =
    usePhoneAdapterHandleRef<PhoneSceneAdapterHandle>(publishAdapterRevision);
  const [heroPatternAdapterRef, bindHeroPatternAdapter] =
    usePhoneAdapterHandleRef<PhoneTransitionAdapterHandle>(publishAdapterRevision);
  const [patternStarMapAdapterRef, bindPatternStarMapAdapter] =
    usePhoneAdapterHandleRef<PhoneTransitionAdapterHandle>(publishAdapterRevision);
  const [starMapAodAdapterRef, bindStarMapAodAdapter] =
    usePhoneAdapterHandleRef<PhoneTransitionAdapterHandle>(publishAdapterRevision);

  const publishCheckpoint = useCallback((checkpoint: PhoneCheckpointId) => {
    const root = rootRef.current;
    if (!root) return;
    if (checkpointRef.current !== checkpoint) {
      checkpointRef.current = checkpoint;
      checkpointTraceRef.current = [
        ...checkpointTraceRef.current.slice(-63),
        checkpoint
      ];
    }
    const trace = checkpointTraceRef.current.join('>');
    root.dataset.portraitCheckpoint = checkpoint;
    root.dataset.portraitCheckpointTrace = trace;
    document.documentElement.dataset.portraitCheckpoint = checkpoint;
  }, []);

  usePhoneViewportGeometry(rootRef, motionEnabled);

  useEffect(() => attachPhoneLoaderVisibilityLifecycle(), []);

  useEffect(() => attachStoryMediaUnlock(rootRef.current), []);

  useEffect(() => {
    const documentElement = document.documentElement;
    documentElement.dataset.portraitSpikeLoader = loaderHidden
      ? 'ready'
      : 'active';
    publishCheckpoint(loaderHidden ? 'hero-entered' : 'loader');
    if (!loaderHidden) {
      window.scrollTo(0, 0);
      return () => {
        delete documentElement.dataset.portraitSpikeLoader;
      };
    }
    const refreshFrame = window.requestAnimationFrame(
      refreshPhoneScrollStage
    );
    return () => {
      window.cancelAnimationFrame(refreshFrame);
      delete documentElement.dataset.portraitSpikeLoader;
    };
  }, [loaderHidden, publishCheckpoint]);

  const navigationVisible = loaderHidden
    && navigationScene !== 'hero' && navigationScene !== 'pattern';

  useEffect(() => {
    if (!navigationVisible) setNavigationMenuOpen(false);
  }, [navigationVisible]);

  const navigatePortraitStory = useCallback((scene: SceneId) => {
    setNavigationMenuOpen(false);
    if (scene === 'hero') {
      window.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      return;
    }
    if (scene === 'method-top' || scene === 'method-bottom') {
      document.getElementById('method')?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
      return;
    }
    window.location.assign(`/${hashForScene(scene)}`);
  }, []);

  const runtime = usePhoneStageRuntime({
    rootRef,
    railRef: stageRailRef,
    stageRef,
    heroRef: heroAdapterRef,
    patternRef: patternAdapterRef,
    starMapRef: starMapAdapterRef,
    aodRef: aodAdapterRef,
    methodRef: methodAdapterRef,
    heroPatternRef: heroPatternAdapterRef,
    patternStarMapRef: patternStarMapAdapterRef,
    starMapAodRef: starMapAodAdapterRef,
    enabled: fixedStageRegistered && loaderHidden
      && ready
      && aodAlphaEndProgress !== undefined
      && !staticFallback,
    reducedMotion: !motionEnabled,
    adapterRevision,
    aodAlphaEndProgress: aodAlphaEndProgress ?? 0,
    mapAodToMethod,
    onCheckpoint: publishCheckpoint,
    onNavigationScene: setNavigationScene,
    onEdgeScene: publishEdgeScene
  });

  return (
    <main
      ref={rootRef}
      className="portrait-scroll-spike"
      data-portrait-spike-route="b"
      data-portrait-spike-media="figure1-packed-alpha-pattern-bloom-star-perlin-aod-packed-alpha-autoplay"
      data-portrait-spike-animation="gsap-scrolltrigger-native-fixed-stage"
      data-portrait-spike-motion={motionEnabled ? 'force' : 'reduce'}
      data-portrait-fixed-stage={fixedStageRegistered ? 'registered' : 'priming'}
      data-portrait-loader-ready={String(loaderHidden)}
      data-phone-validation-mode={props.validationMode}
      data-phone-aod-alpha-start={aodAlphaStartProgress?.toFixed(2)}
      data-phone-aod-alpha-end={aodAlphaEndProgress?.toFixed(2)}
      data-portrait-checkpoint={checkpointRef.current}
      data-portrait-checkpoint-trace={checkpointTraceRef.current.join('>')}
      hidden={staticFallback}
    >
      {!loaderHidden && Loader && (
        <Loader
          mode={motionEnabled ? 'cold-hero' : 'reduced'}
          ready={ready}
          failed={failed}
          onHidden={finishLoader}
        />
      )}

      <PhoneStageRail
        railRef={stageRailRef}
        viewportRef={stageViewportRef}
        stageRef={bindStageHost}
      >
        {Hero && (
          <Hero
            ref={bindHeroAdapter}
            active={loaderHidden}
            reducedMotion={!motionEnabled}
            motionDriver={phoneMotionDriver}
            onReady={markHeroReady}
          />
        )}
        {Pattern && (
          <Pattern
            ref={bindPatternAdapter}
            active={false}
            reducedMotion={!motionEnabled}
            motionDriver={phoneMotionDriver}
            onReady={markPatternReady}
          />
        )}
        {StarMap && (
          <StarMap
            ref={bindStarMapAdapter}
            active={false}
            reducedMotion={!motionEnabled}
            motionDriver={phoneMotionDriver}
          />
        )}
        {Aod && (
          <Aod
            ref={bindAodAdapter}
            active={false}
            reducedMotion={!motionEnabled}
            onAodProgress={runtime.onAodProgress}
            onAodComplete={runtime.onAodComplete}
          />
        )}
        {HeroPatternTransition && (
          <HeroPatternTransition
            ref={bindHeroPatternAdapter}
            host={stageRef.current}
            from={heroAdapterRef.current?.root() ?? null}
            to={patternAdapterRef.current?.root() ?? null}
            reducedMotion={!motionEnabled}
            onReady={markHeroPatternReady}
          />
        )}
        {PatternStarMapTransition && (
          <PatternStarMapTransition
            ref={bindPatternStarMapAdapter}
            host={stageRef.current}
            from={patternAdapterRef.current?.root() ?? null}
            to={starMapAdapterRef.current?.root() ?? null}
            reducedMotion={!motionEnabled}
          />
        )}
        {StarMapAodTransition && (
          <StarMapAodTransition
            ref={bindStarMapAodAdapter}
            host={stageRef.current}
            from={starMapAdapterRef.current?.root() ?? null}
            to={aodAdapterRef.current?.root() ?? null}
            reducedMotion={!motionEnabled}
          />
        )}
      </PhoneStageRail>
      {MethodTop && (
        <MethodTop
          ref={bindMethodAdapter}
          active={loaderHidden && modulesReady}
          reducedMotion={!motionEnabled}
          motionDriver={phoneMotionDriver}
          stageHost={stageHost}
          onGradeACheckpoint={publishCheckpoint}
          onGradeASceneChange={setNavigationScene}
          onGradeAEdgeScene={publishEdgeScene}
        />
      )}
      <StoryNav
        currentScene={navigationScene}
        visible={navigationVisible}
        menuOpen={navigationMenuOpen}
        onToggleMenu={() => setNavigationMenuOpen((open) => !open)}
        onNavigate={navigatePortraitStory}
      />
    </main>
  );
}
