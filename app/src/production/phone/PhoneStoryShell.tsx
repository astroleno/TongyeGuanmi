import { useCallback, useEffect, useRef, useState } from 'react';
import { semanticBoolean } from '../../runtime/semantic-data-attribute';
import { StoryNav } from '../StoryNav';
import { PhoneStageRail } from './PhoneStageRail';
import { usePhoneAdapterHandleRef } from './phone-adapter-binding';
import { phoneMotionDriver } from './phone-gsap-driver';
import { attachStoryMediaUnlock } from '../mobile-media-unlock';
import { usePhoneStageRuntime } from './usePhoneStageRuntime';
import { usePhoneFrontHalfAdapters } from './usePhoneFrontHalfAdapters';
import { usePhoneEdgeSurface } from './usePhoneEdgeSurface';
import { usePhoneFixedStageRegistration } from './usePhoneFixedStageRegistration';
import { usePhoneViewportGeometry } from './usePhoneViewportGeometry';
import { PhoneGroup67DirectEntry } from './PhoneGroup67DirectEntry';
import { usePhoneStoryEntry, usePhoneStoryEntryLifecycle } from './usePhoneStoryEntry';
import { usePhoneCheckpointPublisher } from './usePhoneCheckpointPublisher';
import {
  usePhoneStoryNavigationRuntime
} from './usePhoneStoryNavigationRuntime';
import type { StoryLoaderExitReason } from '../StoryLoader';
import {
  PhoneStoryOrchestratorProvider
} from './PhoneStoryOrchestratorContext';
import {
  usePhoneStoryOrchestratorRuntime
} from './usePhoneStoryOrchestratorRuntime';
import type {
  PhonePresentationEvidence
} from './phone-story-orchestrator';
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
  startupLoaderExitReason?: StoryLoaderExitReason;
  onStartupPrepared?: (failed: boolean) => void;
}>;
// Bootstrap owns only startup visibility; this remains the one formal shell.
// Stage, navigation, edge, viewport, and transition ownership stay here.
export function PhoneStoryShell(props: PhoneStoryShellProps = {}) {
  const motionEnabled = portraitSpikeMotionEnabled();
  const entry = usePhoneStoryEntry();
  const {
    directEntryPlan,
    directStoryEntry,
    directContinuationEntry,
    continuationEntryPlan,
    loaderHidden,
    setLoaderHidden
  } = entry;
  const frontHalf = usePhoneFrontHalfAdapters(
    loaderHidden,
    setLoaderHidden,
    !directContinuationEntry
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
    if (directContinuationEntry || ready || failed) {
      props.onStartupPrepared?.(failed);
    }
  }, [directContinuationEntry, failed, props.onStartupPrepared, ready]);
  useEffect(() => {
    if (loaderHidden || props.startupLoaderExitReason === undefined) return;
    finishLoader(props.startupLoaderExitReason);
  }, [finishLoader, loaderHidden, props.startupLoaderExitReason]);
  const mapAodToMethod = frontHalf.mapAodToMethod ?? ZERO_METHOD_PROGRESS;
  const navigation = usePhoneStoryNavigationRuntime(
    entry.initialScene,
    loaderHidden
  );
  const [adapterRevision, setAdapterRevision] = useState(0);
  const fixedStageRegistered = usePhoneFixedStageRegistration(loaderHidden && ready);
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRailRef = useRef<HTMLElement | null>(null);
  const stageViewportRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const checkpoint = usePhoneCheckpointPublisher(
    entry.initialCheckpoint,
    rootRef
  );
  const publishAdapterRevision = useCallback(() => {
    setAdapterRevision((revision) => revision + 1);
  }, []);
  const bindStageHost = useCallback((host: HTMLDivElement | null) => {
    if (stageRef.current === host) return;
    stageRef.current = host;
    if (host) setStageHost(host);
  }, []);
  const publishEdgeScene = usePhoneEdgeSurface(
    rootRef, stageViewportRef, entry.initialEdgeScene
  );
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

  const publishPresentation = useCallback((
    evidence: PhonePresentationEvidence
  ) => {
    if (evidence.scene) navigation.setScene(evidence.scene);
    if (evidence.checkpoint) checkpoint.publish(evidence.checkpoint);
    if (evidence.edge) publishEdgeScene(evidence.edge);
  }, [checkpoint.publish, navigation.setScene, publishEdgeScene]);
  const orchestrator = usePhoneStoryOrchestratorRuntime({
    initialScene: entry.initialScene,
    rootRef,
    onPresentation: publishPresentation,
    onRetryable: (run) => {
      if (rootRef.current) rootRef.current.dataset.phoneRetryableRun = run;
    }
  });

  usePhoneViewportGeometry(rootRef, motionEnabled);

  useEffect(() => attachStoryMediaUnlock(rootRef.current), []);
  usePhoneStoryEntryLifecycle(entry, orchestrator);

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
    enabled: fixedStageRegistered && loaderHidden
      && !directStoryEntry
      && !directContinuationEntry
      && ready
      && aodAlphaEndProgress !== undefined
      && !staticFallback,
    reducedMotion: !motionEnabled,
    adapterRevision,
    aodAlphaEndProgress: aodAlphaEndProgress ?? 0,
    mapAodToMethod
  });

  return (
    <PhoneStoryOrchestratorProvider orchestrator={orchestrator}>
      <main
      ref={rootRef}
      className="portrait-scroll-spike"
      data-portrait-spike-route="b"
      data-portrait-spike-media={directContinuationEntry
        ? 'continuation-adjacent-autoplay'
        : 'figure1-packed-alpha-pattern-bloom-star-perlin-aod-packed-alpha-autoplay'}
      data-portrait-spike-animation="gsap-scrolltrigger-native-fixed-stage"
      data-portrait-spike-motion={motionEnabled ? 'force' : 'reduce'}
      data-portrait-fixed-stage={fixedStageRegistered ? 'registered' : 'priming'}
      data-portrait-loader-ready={semanticBoolean(loaderHidden)}
      data-phone-validation-mode={props.validationMode}
      data-phone-aod-alpha-start={aodAlphaStartProgress?.toFixed(2)}
      data-phone-aod-alpha-end={aodAlphaEndProgress?.toFixed(2)}
      data-portrait-checkpoint={checkpoint.checkpointRef.current}
      data-portrait-checkpoint-trace={checkpoint.traceRef.current.join('>')}
      data-phone-direct-entry={directContinuationEntry
        ? 'continuation'
        : directStoryEntry ? 'story' : undefined}
      data-phone-direct-entry-scene={directEntryPlan?.scene}
      hidden={staticFallback}
    >
      <PhoneStageRail
        railRef={stageRailRef}
        viewportRef={stageViewportRef}
        stageRef={bindStageHost}
      >
        {!directContinuationEntry && Hero && (
          <Hero
            ref={bindHeroAdapter}
            active={loaderHidden}
            reducedMotion={!motionEnabled}
            motionDriver={phoneMotionDriver}
            onReady={markHeroReady}
          />
        )}
        {!directContinuationEntry && Pattern && (
          <Pattern
            ref={bindPatternAdapter}
            active={false}
            reducedMotion={!motionEnabled}
            motionDriver={phoneMotionDriver}
            onReady={markPatternReady}
          />
        )}
        {!directContinuationEntry && StarMap && (
          <StarMap
            ref={bindStarMapAdapter}
            active={false}
            reducedMotion={!motionEnabled}
            motionDriver={phoneMotionDriver}
          />
        )}
        {!directContinuationEntry && Aod && (
          <Aod
            ref={bindAodAdapter}
            active={false}
            reducedMotion={!motionEnabled}
            onAodProgress={runtime.onAodProgress}
            onAodComplete={runtime.onAodComplete}
          />
        )}
        {!directContinuationEntry && HeroPatternTransition && (
          <HeroPatternTransition
            ref={bindHeroPatternAdapter}
            host={stageRef.current}
            from={heroAdapterRef.current?.root() ?? null}
            to={patternAdapterRef.current?.root() ?? null}
            reducedMotion={!motionEnabled}
            onReady={markHeroPatternReady}
          />
        )}
        {!directContinuationEntry && PatternStarMapTransition && (
          <PatternStarMapTransition
            ref={bindPatternStarMapAdapter}
            host={stageRef.current}
            from={patternAdapterRef.current?.root() ?? null}
            to={starMapAdapterRef.current?.root() ?? null}
            reducedMotion={!motionEnabled}
          />
        )}
        {!directContinuationEntry && StarMapAodTransition && (
          <StarMapAodTransition
            ref={bindStarMapAodAdapter}
            host={stageRef.current}
            from={starMapAdapterRef.current?.root() ?? null}
            to={aodAdapterRef.current?.root() ?? null}
            reducedMotion={!motionEnabled}
          />
        )}
      </PhoneStageRail>
      {!directContinuationEntry && MethodTop && (
        <MethodTop
          ref={bindMethodAdapter}
          active={loaderHidden && modulesReady}
          reducedMotion={!motionEnabled}
          motionDriver={phoneMotionDriver}
          stageHost={stageHost}
        />
      )}
      <PhoneGroup67DirectEntry
        plan={continuationEntryPlan}
        reducedMotion={!motionEnabled}
        stageHost={stageHost}
      />
      <StoryNav
        currentScene={navigation.scene}
        visible={navigation.visible}
        menuOpen={navigation.menuOpen}
        onToggleMenu={() => navigation.setMenuOpen((open) => !open)}
        onNavigate={navigation.navigate}
      />
      </main>
    </PhoneStoryOrchestratorProvider>
  );
}
