import { useCallback, useEffect, useRef, useState } from 'react';
import { semanticBoolean } from '../../runtime/semantic-data-attribute';
import { StoryNav } from '../StoryNav';
import { PhoneStageRail } from './PhoneStageRail';
import { usePhoneAdapterHandleRef } from './phone-adapter-binding';
import { phoneMotionDriver } from './phone-gsap-driver';
import {
  phoneSnapshotOwnsMethod,
  usePhoneStageRuntime
} from './usePhoneStageRuntime';
import { usePhoneFrontHalfAdapters } from './usePhoneFrontHalfAdapters';
import { usePhoneFixedStageRegistration } from './usePhoneFixedStageRegistration';
import { usePhoneViewportGeometry } from './usePhoneViewportGeometry';
import { usePhoneStoryEntry, usePhoneStoryEntryLifecycle } from './usePhoneStoryEntry';
import {
  usePhoneStoryNavigationRuntime
} from './usePhoneStoryNavigationRuntime';
import type { StoryLoaderExitReason } from '../StoryLoader';
import {
  PhoneStoryRuntimeProvider
} from './PhoneStoryRuntimeContext';
import {
  usePhoneStoryRuntime
} from './usePhoneStoryRuntime';
import type {
  PhoneAodAdapterHandle,
  PhoneHeroAdapterHandle,
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';
import './PhoneStoryShell.css';
const ZERO_METHOD_PROGRESS = () => 0;
/** `?portrait-spike-motion=reduce` is the explicit low-motion comparison. */
function portraitSpikeMotionEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return new URLSearchParams(window.location.search)
    .get('portrait-spike-motion') !== 'reduce';
}
export type PhoneStoryShellProps = Readonly<{
  /** Short numbered routes remain physical-device comparison entries. */
  validationMode?: 'v16' | 'v17' | 'v18' | 'v19' | 'v20' | 'v21' | 'v22' | 'v23' | 'v24' | 'v25' | 'v26' | 'v27' | 'v28' | 'v29' | 'v30' | 'v31' | 'v32' | 'v33' | 'v34' | 'v35' | 'v36' | 'v37' | 'v38' | 'v39' | 'v40' | 'v42' | 'v43' | 'v44' | 'v45' | 'v46' | 'v47';
  /** Bootstrap owns the global visual plane until StoryLoader `onHidden`. */
  startupLoaderActive?: boolean;
  /** StoryLoader has begun its fade, so the retained Hero may start beneath it. */
  startupLoaderExiting?: boolean;
  startupLoaderExitReason?: StoryLoaderExitReason;
  onStartupPrepared?: (failed: boolean) => void;
}>;
// Bootstrap owns only startup visibility; this remains the one formal shell.
// Stage, navigation, edge, viewport, and transition ownership stay here.
export function PhoneStoryShell(props: PhoneStoryShellProps = {}) {
  const motionEnabled = portraitSpikeMotionEnabled();
  const entry = usePhoneStoryEntry();
  const {
    entryScene,
    directStoryEntry,
    loaderHidden,
    setLoaderHidden
  } = entry;
  const frontHalf = usePhoneFrontHalfAdapters(
    loaderHidden,
    setLoaderHidden
  );
  const {
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
  useEffect(() => {
    if (directStoryEntry || ready || failed) {
      props.onStartupPrepared?.(failed);
    }
  }, [directStoryEntry, failed, props.onStartupPrepared, ready]);
  useEffect(() => {
    if (loaderHidden || props.startupLoaderExitReason === undefined) return;
    finishLoader(props.startupLoaderExitReason);
  }, [finishLoader, loaderHidden, props.startupLoaderExitReason]);
  const mapAodToMethod = frontHalf.mapAodToMethod ?? ZERO_METHOD_PROGRESS;
  const [adapterRevision, setAdapterRevision] = useState(0);
  // The Loader remains the top visual plane through its fade, while the same
  // retained Hero run is admitted beneath it. Waiting for `onHidden` here
  // would reveal a blank coverage plane and only then start the entrance.
  const openingExecutionOpen = loaderHidden || props.startupLoaderExiting === true;
  const fixedStageRegistered = usePhoneFixedStageRegistration(
    openingExecutionOpen && ready
  );
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRailRef = useRef<HTMLElement | null>(null);
  const stageViewportRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const publishAdapterRevision = useCallback(() => {
    setAdapterRevision((revision) => revision + 1);
  }, []);
  const bindStageHost = useCallback((host: HTMLDivElement | null) => {
    if (stageRef.current === host) return;
    stageRef.current = host;
    if (host) setStageHost(host);
  }, []);
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

  const authority = usePhoneStoryRuntime(
    'formal',
    entry.initialScene,
    rootRef
  );
  const orchestrator = authority.port;
  const directAdmissionOpen = !props.startupLoaderActive;
  const navigation = usePhoneStoryNavigationRuntime(orchestrator, loaderHidden);
  const activeFrontSurface = (id: 'front:hero' | 'front:pattern' | 'front:star-map' | 'front:aod') => (
    navigation.cinematicSnapshot[1] === id
    || navigation.cinematicSnapshot[2] === id
  );
  const methodExecutionActive = loaderHidden
    && modulesReady
    && phoneSnapshotOwnsMethod(navigation.cinematicSnapshot, mapAodToMethod);

  usePhoneViewportGeometry(rootRef, motionEnabled);

  usePhoneStoryEntryLifecycle(
    entryScene,
    loaderHidden,
    orchestrator,
    directAdmissionOpen
  );

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
    orchestrator,
    snapshot: navigation.cinematicSnapshot,
    enabled: fixedStageRegistered && openingExecutionOpen
      && ready
      && aodAlphaEndProgress !== undefined
      && !staticFallback,
    reducedMotion: !motionEnabled,
    adapterRevision,
    mapAodToMethod
  });

  return (
    <PhoneStoryRuntimeProvider authority={authority}>
      <main
      ref={rootRef}
      className="portrait-scroll-spike"
      data-portrait-spike-route="b"
      data-portrait-spike-media={directStoryEntry
        ? 'direct-entry-full-route-runtime'
        : 'figure1-packed-alpha-pattern-bloom-star-perlin-aod-packed-alpha-autoplay'}
      data-portrait-spike-animation="gsap-scrolltrigger-native-fixed-stage"
      data-portrait-spike-motion={motionEnabled ? 'force' : 'reduce'}
      data-portrait-fixed-stage={fixedStageRegistered ? 'registered' : 'priming'}
      data-portrait-loader-ready={semanticBoolean(loaderHidden)}
      data-phone-validation-mode={props.validationMode}
      data-phone-aod-alpha-start={aodAlphaStartProgress?.toFixed(2)}
      data-phone-aod-alpha-end={aodAlphaEndProgress?.toFixed(2)}
      data-phone-direct-entry={directStoryEntry ? 'story' : undefined}
      data-phone-direct-entry-scene={entryScene ?? undefined}
      hidden={staticFallback}
    >
      <PhoneStageRail
        railRef={stageRailRef}
        viewportRef={stageViewportRef}
        stageRef={bindStageHost}
      >
        {Hero && (
          <Hero
            ref={bindHeroAdapter}
            active={activeFrontSurface('front:hero')}
            reducedMotion={!motionEnabled}
            motionDriver={phoneMotionDriver}
            onReady={markHeroReady}
          />
        )}
        {Pattern && (
          <Pattern
            ref={bindPatternAdapter}
            active={loaderHidden && activeFrontSurface('front:pattern')}
            reducedMotion={!motionEnabled}
            motionDriver={phoneMotionDriver}
            onReady={markPatternReady}
          />
        )}
        {StarMap && (
          <StarMap
            ref={bindStarMapAdapter}
            active={loaderHidden && activeFrontSurface('front:star-map')}
            reducedMotion={!motionEnabled}
            motionDriver={phoneMotionDriver}
          />
        )}
        {Aod && (
          <Aod
            ref={bindAodAdapter}
            active={loaderHidden && activeFrontSurface('front:aod')}
            reducedMotion={!motionEnabled}
            onAodProgress={runtime.onAodProgress}
            onAodComplete={runtime.onAodComplete}
            onAodFrame={runtime.onAodFrame}
            onAodFailure={runtime.onAodFailure}
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
          active={methodExecutionActive}
          reducedMotion={!motionEnabled}
          motionDriver={phoneMotionDriver}
          stageHost={stageHost}
          directEntryScene={entryScene}
        />
      )}
      <StoryNav
        currentScene={navigation.cinematicSnapshot[12]}
        visible={navigation.visible}
        menuOpen={navigation.menuOpen}
        onToggleMenu={() => navigation.setMenuOpen((open) => !open)}
        onNavigate={navigation.navigate}
      />
      </main>
    </PhoneStoryRuntimeProvider>
  );
}
