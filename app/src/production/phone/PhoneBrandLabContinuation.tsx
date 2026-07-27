import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import { semanticBoolean } from '../../runtime/semantic-data-attribute';
import type { ScenePresentationAdapterHandle } from '../../story/presentation';
import {
  group45PhoneSceneIds,
  type Group45PhoneSceneId,
  type Group45PhoneTransitionId
} from './adapter-groups/group4-5';
import {
  usePhoneStoryOrchestrator,
  usePhoneStorySnapshot
} from './PhoneStoryOrchestratorContext';
import {
  phoneBrandLabCompositeFrame,
  phoneBrandLabRunForVisual
} from './phone-brand-lab-runtime';
import {
  createPhoneCompositeRunner,
  type PhoneCompositeRunView,
  type PhoneCompositeRuntimeConfig
} from './phone-composite-runner';
import {
  type PhoneTransitionDirection
} from './phone-transition-coordinator';
import {
  createPhoneCapabilityRegistry,
} from './phone-transition-readiness';
import { usePhoneCapabilityBinding } from './phone-adapter-binding';
import type { PhoneTransitionAdapterHandle } from './types';
import { usePhoneGroup45Adapters } from './usePhoneGroup45Adapters';
import './PhoneBrandLabStory.css';

export type PhoneBrandLabContinuationHandle = Readonly<{
  brandRoot(): HTMLElement | null;
  labRoot(): HTMLElement | null;
  labAdapter(): ScenePresentationAdapterHandle | null;
}>;

export type PhoneBrandLabContinuationProps = Readonly<{
  reducedMotion: boolean;
  stageHost: HTMLElement | null;
  entryScene?: Group45PhoneSceneId;
  validationMode?: string | undefined;
  onBrandRootChange?: (root: HTMLElement | null) => void;
  onLabBoundaryChange?: (
    boundary: Readonly<{
      root: HTMLElement;
      adapter: ScenePresentationAdapterHandle;
    }> | null
  ) => void;
}>;

type VisualActivity = Readonly<{
  active: boolean;
  prewarm: boolean;
}>;

export type Group45VisualScene = Extract<
  Group45PhoneSceneId,
  'figure3-animation' | 'ttg-animation'
>;

type VisualRunDirection = 1 | -1;

const GROUP45_VISUAL_SCENES = [
  'figure3-animation',
  'ttg-animation'
] as const satisfies readonly Group45VisualScene[];
const BRAND_READING_HOLD_RATIO = 0.16;
const GROUP45_READINESS_TIMEOUT_MS = 10000;

type Group45CapabilityId = Group45PhoneSceneId | Group45PhoneTransitionId;
type Group45CapabilityHandle =
  | ScenePresentationAdapterHandle
  | PhoneTransitionAdapterHandle;

type VisualRuntimeConfig = PhoneCompositeRuntimeConfig;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function phoneGroup45TrackActivity(
  trackTop: number,
  trackHeight: number,
  viewportHeight: number
): VisualActivity {
  const trackBottom = trackTop + trackHeight;
  const visibleHeight = Math.max(
    0,
    Math.min(trackBottom, viewportHeight) - Math.max(trackTop, 0)
  );
  const visibleRatio = visibleHeight
    / Math.max(1, Math.min(trackHeight, viewportHeight));
  return {
    prewarm: trackTop <= viewportHeight * 1.25
      && trackBottom > viewportHeight * .1,
    active: trackHeight <= viewportHeight + 1
      ? visibleRatio >= .5
      : trackTop <= 0 && trackBottom >= viewportHeight
  };
}

function frameForTrack(
  element: HTMLElement | null,
  viewportHeight: number
): VisualActivity {
  if (!element) return { active: false, prewarm: false };
  const rect = element.getBoundingClientRect();
  return phoneGroup45TrackActivity(rect.top, rect.height, viewportHeight);
}

/**
 * Embeddable Unit 5 continuation. The caller owns the document shell, edge
 * publisher, navigation, and the one persistent fixed stage. This component
 * contributes native reading roots, scroll markers, and registered rendering
 * capabilities; the shell orchestrator owns all durable run state.
 */
export const PhoneBrandLabContinuation = forwardRef<
  PhoneBrandLabContinuationHandle,
  PhoneBrandLabContinuationProps
>(function PhoneBrandLabContinuation({
  reducedMotion,
  stageHost,
  entryScene = 'brand',
  validationMode,
  onBrandRootChange,
  onLabBoundaryChange
}, forwardedRef) {
  const orchestrator = usePhoneStoryOrchestrator();
  const storySnapshot = usePhoneStorySnapshot();
  const [adapterScene, setAdapterScene] = useState(entryScene);
  const adapters = usePhoneGroup45Adapters(entryScene, adapterScene);
  const currentScene: Group45PhoneSceneId = (
    group45PhoneSceneIds as readonly string[]
  ).includes(storySnapshot.projection.semanticScene)
    ? storySnapshot.projection.semanticScene as Group45PhoneSceneId
    : entryScene;
  const [, setAdapterRevision] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<1 | -1>(1);
  const [stageScene, setStageScene] = useState<Group45VisualScene | null>(null);
  const [visualActivity, setVisualActivity] = useState<Readonly<{
    figure3: VisualActivity;
    ttg: VisualActivity;
  }>>({
    figure3: { active: false, prewarm: false },
    ttg: { active: false, prewarm: false }
  });
  const [capabilities] = useState(() => createPhoneCapabilityRegistry<
    Group45CapabilityId,
    Group45CapabilityHandle
  >());
  const rootRef = useRef<HTMLElement | null>(null);
  const figure3TrackRef = useRef<HTMLDivElement | null>(null);
  const ttgTrackRef = useRef<HTMLDivElement | null>(null);
  const brandRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const figure3Ref = useRef<ScenePresentationAdapterHandle | null>(null);
  const servicesRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const ttgRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const labRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const brandFigure3Ref = useRef<PhoneTransitionAdapterHandle | null>(null);
  const figure3ServicesRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const servicesTtgRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const ttgLabRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const activeRunRef = useRef<
    PhoneCompositeRunView<Group45VisualScene> | null
  >(null);
  const stageSceneRef = useRef(stageScene);
  stageSceneRef.current = stageScene;
  const scheduleRenderRef = useRef<() => void>(() => undefined);
  const mediaProgressRef = useRef<(
    scene: Group45PhoneSceneId,
    progress: number,
    direction: VisualRunDirection
  ) => void>(() => undefined);
  const mediaCompleteRef = useRef<(
    scene: Group45PhoneSceneId,
    direction: VisualRunDirection
  ) => void>(() => undefined);
  const mediaErrorRef = useRef<(scene: Group45PhoneSceneId) => void>(
    () => undefined
  );

  useImperativeHandle(forwardedRef, () => ({
    brandRoot: () => brandRef.current?.root() ?? null,
    labRoot: () => labRef.current?.root() ?? null,
    labAdapter: () => labRef.current
  }), []);

  const publishAdapter = useCallback(() => {
    setAdapterRevision((revision) => revision + 1);
    scheduleRenderRef.current();
    // The adapter reports that a local root changed. The Orchestrator alone
    // decides whether the current stable scene may be committed again.
    orchestrator.syncDiagnostics();
  }, [orchestrator]);
  const bindCapability = usePhoneCapabilityBinding(
    capabilities,
    'phone-brand-lab',
    publishAdapter
  );
  const {
    bindBrand,
    bindFigure3,
    bindServices,
    bindTtg,
    bindLab,
    bindBrandFigure3,
    bindFigure3Services,
    bindServicesTtg,
    bindTtgLab
  } = useMemo(() => ({
    bindBrand: (handle: ScenePresentationAdapterHandle | null) => {
      if (!bindCapability('brand', brandRef, handle)) return;
      onBrandRootChange?.(handle?.root() ?? null);
    },
    bindFigure3: (handle: ScenePresentationAdapterHandle | null) => {
      bindCapability('figure3-animation', figure3Ref, handle);
    },
    bindServices: (handle: ScenePresentationAdapterHandle | null) => {
      bindCapability('services', servicesRef, handle);
    },
    bindTtg: (handle: ScenePresentationAdapterHandle | null) => {
      bindCapability('ttg-animation', ttgRef, handle);
    },
    bindLab: (handle: ScenePresentationAdapterHandle | null) => {
      if (!bindCapability('lab', labRef, handle)) return;
      const root = handle?.root() ?? null;
      onLabBoundaryChange?.(root && handle ? { root, adapter: handle } : null);
    },
    bindBrandFigure3: (handle: PhoneTransitionAdapterHandle | null) => {
      bindCapability('brand-figure3', brandFigure3Ref, handle);
    },
    bindFigure3Services: (handle: PhoneTransitionAdapterHandle | null) => {
      bindCapability('figure3-services', figure3ServicesRef, handle);
    },
    bindServicesTtg: (handle: PhoneTransitionAdapterHandle | null) => {
      bindCapability('services-ttg', servicesTtgRef, handle);
    },
    bindTtgLab: (handle: PhoneTransitionAdapterHandle | null) => {
      bindCapability('ttg-lab', ttgLabRef, handle);
    }
  }), [bindCapability, onBrandRootChange, onLabBoundaryChange]);

  const onVisualProgress = useCallback((
    scene: Group45PhoneSceneId,
    progress: number,
    direction: VisualRunDirection
  ) => {
    mediaProgressRef.current(scene, progress, direction);
  }, []);
  const onVisualComplete = useCallback((
    scene: Group45PhoneSceneId,
    direction: VisualRunDirection
  ) => {
    mediaCompleteRef.current(scene, direction);
  }, []);
  const onMediaError = useCallback((scene: Group45PhoneSceneId) => {
    mediaErrorRef.current(scene);
  }, []);

  useEffect(() => {
    setAdapterScene(entryScene);
  }, [entryScene]);

  useEffect(() => {
    if (currentScene !== 'brand' && currentScene !== 'services' && currentScene !== 'lab') {
      return;
    }
    setStageScene(null);
    setVisualActivity({
      figure3: { active: false, prewarm: currentScene === 'services' },
      ttg: { active: false, prewarm: currentScene === 'lab' }
    });
  }, [currentScene]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let renderFrameId = 0;

    const configFor = (
      scene: Group45VisualScene
    ): VisualRuntimeConfig | null => {
      const figure3 = scene === 'figure3-animation';
      const prior = figure3 ? brandRef.current : servicesRef.current;
      const visual = figure3 ? figure3Ref.current : ttgRef.current;
      const final = figure3 ? servicesRef.current : labRef.current;
      const entry = figure3 ? brandFigure3Ref.current : servicesTtgRef.current;
      const media = figure3 ? figure3ServicesRef.current : ttgLabRef.current;
      if (!prior || !visual || !final || !entry || !media) {
        return null;
      }
      return {
        prior,
        visual,
        final,
        entry,
        media
      };
    };
    const directConfigFor = (scene: Group45VisualScene) => {
      const figure3 = scene === 'figure3-animation';
      const visual = figure3 ? figure3Ref.current : ttgRef.current;
      const final = figure3 ? servicesRef.current : labRef.current;
      const media = figure3 ? figure3ServicesRef.current : ttgLabRef.current;
      if (!visual || !final || !media) return null;
      return {
        visual,
        final,
        media
      };
    };

    const setRootRunState = (
      run: PhoneCompositeRunView<Group45VisualScene> | null,
      retry = false
    ) => {
      root.dataset.phoneGroup45VisualRun = run
        ? `${run.scene}:${run.direction === 1 ? 'forward' : 'reverse'}`
        : 'idle';
      root.dataset.phoneGroup45Snap = run ? 'locked' : 'released';
      root.dataset.phoneGroup45StageActive = semanticBoolean(Boolean(run));
      root.dataset.phoneGroup45StageScene = run?.scene ?? 'none';
      if (import.meta.env.DEV) {
        if (run) {
          root.dataset.phoneGroup45VisualStep = `${run.scene}:${run.step}`;
          delete root.dataset.phoneGroup45MediaRetry;
        } else {
          root.dataset.phoneGroup45VisualStep = 'idle';
          if (!retry) delete root.dataset.phoneGroup45MediaRetry;
        }
      }
    };

    const boundaryPosition = (
      scene: Group45VisualScene,
      direction: PhoneTransitionDirection
    ): number | null => {
      const track = scene === 'figure3-animation'
        ? figure3TrackRef.current
        : ttgTrackRef.current;
      if (!track) return null;
      const viewportHeight = Math.max(1, window.innerHeight);
      const media = window.scrollY + track.getBoundingClientRect().top;
      const entryOffset = scene === 'figure3-animation'
        ? viewportHeight * BRAND_READING_HOLD_RATIO
        : 0;
      const boundary = direction === 1
        ? media - viewportHeight + entryOffset
        : media;
      return Math.max(0, boundary);
    };

    const runner = createPhoneCompositeRunner<
      Group45VisualScene,
      Group45CapabilityId,
      Group45CapabilityHandle
    >({
      ownerId: 'phone-brand-lab',
      visualScenes: GROUP45_VISUAL_SCENES,
      orchestrator,
      capabilities,
      reducedMotion,
      timeoutMs: GROUP45_READINESS_TIMEOUT_MS,
      runForVisual: phoneBrandLabRunForVisual,
      config: configFor,
      directConfig: directConfigFor,
      position: boundaryPosition,
      onRunState(run, retry) {
        activeRunRef.current = run;
        setRootRunState(run, retry);
        if (retry && import.meta.env.DEV) {
          root.dataset.phoneGroup45MediaRetry = 'composite';
        }
      },
      onRunBegin(run) {
        setAdapterScene(run.scene);
        setScrollDirection(run.direction);
        setStageScene(run.scene);
        setVisualActivity((current) => run.scene === 'figure3-animation'
          ? {
              ...current,
              figure3: { active: false, prewarm: true }
            }
          : {
              ...current,
              ttg: { active: false, prewarm: true }
            });
      },
      onMediaActive(run) {
        setVisualActivity((current) => run.scene === 'figure3-animation'
          ? {
              ...current,
              figure3: { active: true, prewarm: true }
            }
          : {
              ...current,
              ttg: { active: true, prewarm: true }
            });
      }
    });

    const surfaceLeases = (
      ['brand', 'services', 'lab'] as const
    ).map((scene) => orchestrator.registerSurface({
        id: `native:${scene}`,
        scene,
        kind: 'native',
        root: () => (scene === 'brand'
          ? brandRef.current
          : scene === 'services'
            ? servicesRef.current
            : labRef.current)?.root() ?? null,
        coverageRoot: () => (scene === 'brand'
          ? brandRef.current
          : scene === 'services'
            ? servicesRef.current
            : labRef.current)?.root() ?? null,
        presented: () => true
    }));

    mediaProgressRef.current = (scene, progress, direction) => {
      if (!GROUP45_VISUAL_SCENES.includes(scene as Group45VisualScene)) return;
      const canonicalProgress = clamp(progress);
      runner.progressMedia(
        scene as Group45VisualScene,
        direction,
        canonicalProgress
      );
      if (import.meta.env.DEV) {
        root.dataset.phoneGroup45VisualProgress =
          `${scene}:${direction}:${canonicalProgress.toFixed(4)}`;
      }
    };
    mediaCompleteRef.current = (scene, direction) => {
      if (!GROUP45_VISUAL_SCENES.includes(scene as Group45VisualScene)) return;
      runner.completeMedia(scene as Group45VisualScene, direction);
    };
    mediaErrorRef.current = (scene) => {
      if (!GROUP45_VISUAL_SCENES.includes(scene as Group45VisualScene)) return;
      runner.failMedia(scene as Group45VisualScene);
    };

    const render = () => {
      renderFrameId = 0;
      const viewportHeight = Math.max(1, window.innerHeight);
      const continuationRect = root.getBoundingClientRect();
      const nextContinuationActive = continuationRect.top <= 1
        && continuationRect.bottom > 0;
      const figure3Track = frameForTrack(
        figure3TrackRef.current,
        viewportHeight
      );
      const ttgTrack = frameForTrack(ttgTrackRef.current, viewportHeight);
      const cursor = orchestrator.cursor();
      const figure3Frame = phoneBrandLabCompositeFrame(
        cursor,
        'figure3-animation'
      );
      const ttgFrame = phoneBrandLabCompositeFrame(cursor, 'ttg-animation');
      const activeRun = activeRunRef.current;
      const ttgNeedsMedia = activeRun?.scene === 'ttg-animation'
        || ttgTrack.prewarm
        || ttgFrame.entryProgress >= 1;
      const nextActivity = {
        figure3: {
          active: activeRun?.scene === 'figure3-animation'
            && activeRun.step === 'media',
          prewarm: activeRun?.scene === 'figure3-animation'
            || (
              figure3Frame.entryProgress < 1
              && figure3Track.prewarm
            )
            || (
              figure3Frame.entryProgress >= 1
              && !ttgNeedsMedia
            )
        },
        ttg: {
          active: activeRun?.scene === 'ttg-animation'
            && activeRun.step === 'media',
          prewarm: activeRun?.scene === 'ttg-animation'
            || ttgTrack.prewarm
            || ttgFrame.entryProgress >= 1
        }
      };
      setVisualActivity((current) => (
        current.figure3.active === nextActivity.figure3.active
          && current.figure3.prewarm === nextActivity.figure3.prewarm
          && current.ttg.active === nextActivity.ttg.active
          && current.ttg.prewarm === nextActivity.ttg.prewarm
          ? current
          : nextActivity
      ));
      if (ttgTrack.prewarm) setAdapterScene('ttg-animation');
      else if (figure3Track.prewarm) setAdapterScene('figure3-animation');
      brandRef.current?.update(1);
      servicesRef.current?.update(1);
      labRef.current?.update(1);
      if (!activeRun) {
        figure3Ref.current?.update(figure3Frame.mediaProgress);
        ttgRef.current?.update(ttgFrame.mediaProgress);
      }
      root.dataset.phoneGroup45Active = semanticBoolean(nextContinuationActive);
      root.dataset.phoneGroup45StageActive = semanticBoolean(
        stageSceneRef.current !== null
      );
      root.dataset.phoneGroup45StageScene = stageSceneRef.current ?? 'none';
    };
    const schedule = () => {
      if (!renderFrameId) {
        renderFrameId = window.requestAnimationFrame(render);
      }
    };
    scheduleRenderRef.current = schedule;
    render();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (renderFrameId) window.cancelAnimationFrame(renderFrameId);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      mediaProgressRef.current = () => undefined;
      mediaCompleteRef.current = () => undefined;
      mediaErrorRef.current = () => undefined;
      scheduleRenderRef.current = () => undefined;
      for (const lease of surfaceLeases) lease.dispose();
      runner.dispose();
    };
  }, [adapters.rootReady, capabilities, orchestrator, reducedMotion]);

  useEffect(() => () => {
    brandFigure3Ref.current?.dispose?.();
    figure3ServicesRef.current?.dispose?.();
    servicesTtgRef.current?.dispose?.();
    ttgLabRef.current?.dispose?.();
    brandRef.current?.dispose?.();
    figure3Ref.current?.dispose?.();
    servicesRef.current?.dispose?.();
    ttgRef.current?.dispose?.();
    labRef.current?.dispose?.();
  }, []);

  if (adapters.failed && !adapters.rootReady) {
    return (
      <section
        className="phone-brand-lab phone-brand-lab--fallback"
        data-phone-group45-state="fallback"
      >
        <p>Brand → Lab 内容暂时无法载入，请刷新后重试。</p>
      </section>
    );
  }

  if (!adapters.rootReady) {
    return (
      <section
        className="phone-brand-lab phone-brand-lab--loading"
        data-phone-group45-state="loading"
      >
        <p>正在准备 Brand → Lab…</p>
      </section>
    );
  }

  const Brand = adapters.scenes.brand;
  const Figure3 = adapters.scenes['figure3-animation'];
  const Services = adapters.scenes.services;
  const Ttg = adapters.scenes['ttg-animation'];
  const Lab = adapters.scenes.lab;
  const BrandFigure3 = adapters.transitions['brand-figure3'];
  const Figure3Services = adapters.transitions['figure3-services'];
  const ServicesTtg = adapters.transitions['services-ttg'];
  const TtgLab = adapters.transitions['ttg-lab'];
  const stageSurfaces = (
    <div
      className="phone-brand-lab__stage-surfaces"
      data-phone-group45-stage-active={semanticBoolean(stageScene !== null)}
      data-phone-group45-stage-scene={stageScene ?? 'none'}
      aria-hidden={stageScene === null}
    >
      {Figure3 && (
        <Figure3
          ref={bindFigure3}
          active={visualActivity.figure3.active}
          direction={scrollDirection}
          prewarm={visualActivity.figure3.prewarm}
          reducedMotion={reducedMotion}
          onMediaError={onMediaError}
          onProgress={onVisualProgress}
          onComplete={onVisualComplete}
        />
      )}
      {Ttg && (
        <Ttg
          ref={bindTtg}
          active={visualActivity.ttg.active}
          direction={scrollDirection}
          prewarm={visualActivity.ttg.prewarm}
          reducedMotion={reducedMotion}
          onMediaError={onMediaError}
          onProgress={onVisualProgress}
          onComplete={onVisualComplete}
        />
      )}
    </div>
  );

  return (
    <section
      ref={rootRef}
      className="phone-brand-lab phone-brand-lab--continuation"
      data-phone-continuation="brand-lab"
      data-phone-validation-mode={validationMode}
      data-phone-group45-state="ready"
      data-phone-group45-layout="shared-boundary-stage"
      data-phone-proof-brand-input="stable-receiver"
      data-phone-motion={reducedMotion ? 'reduce' : 'full'}
      data-phone-group45-scroll-direction={scrollDirection}
      data-phone-group45-stage-active={semanticBoolean(stageScene !== null)}
      data-phone-group45-stage-scene={stageScene ?? 'none'}
      data-phone-lab-boundary="stable-lab-ph-input"
    >
      {stageHost ? createPortal(stageSurfaces, stageHost) : null}
      {Brand && (
        <Brand
          ref={bindBrand}
          active={currentScene === 'brand'}
          reducedMotion={reducedMotion}
        />
      )}
      <div
        id="figure3-animation"
        ref={figure3TrackRef}
        className="phone-brand-lab__visual-track phone-brand-lab__visual-track--figure3"
        data-phone-group45-track="figure3"
        aria-hidden="true"
      />
      {Services && (
        <Services
          ref={bindServices}
          active={currentScene === 'services'}
          reducedMotion={reducedMotion}
        />
      )}
      <div
        id="ttg-animation"
        ref={ttgTrackRef}
        className="phone-brand-lab__visual-track phone-brand-lab__visual-track--ttg"
        data-phone-group45-track="ttg"
        aria-hidden="true"
      />
      {Lab && (
        <Lab
          ref={bindLab}
          active={currentScene === 'lab'}
          reducedMotion={reducedMotion}
        />
      )}

      {BrandFigure3 && (
        <div className="phone-brand-lab__transition-host" aria-hidden="true">
          <BrandFigure3
            ref={bindBrandFigure3}
            host={stageHost}
            from={brandRef.current?.root() ?? null}
            to={figure3Ref.current?.root() ?? null}
            reducedMotion={reducedMotion}
            documentFlow
          />
        </div>
      )}
      {Figure3Services && (
        <div className="phone-brand-lab__transition-host" aria-hidden="true">
          <Figure3Services
            ref={bindFigure3Services}
            host={stageHost}
            from={figure3Ref.current?.root() ?? null}
            to={servicesRef.current?.root() ?? null}
            reducedMotion={reducedMotion}
            documentFlow
          />
        </div>
      )}
      {ServicesTtg && (
        <div className="phone-brand-lab__transition-host" aria-hidden="true">
          <ServicesTtg
            ref={bindServicesTtg}
            host={stageHost}
            from={servicesRef.current?.root() ?? null}
            to={ttgRef.current?.root() ?? null}
            reducedMotion={reducedMotion}
            documentFlow
          />
        </div>
      )}
      {TtgLab && (
        <div className="phone-brand-lab__transition-host" aria-hidden="true">
          <TtgLab
            ref={bindTtgLab}
            host={stageHost}
            from={ttgRef.current?.root() ?? null}
            to={labRef.current?.root() ?? null}
            reducedMotion={reducedMotion}
            documentFlow
          />
        </div>
      )}
    </section>
  );
});

export default PhoneBrandLabContinuation;
