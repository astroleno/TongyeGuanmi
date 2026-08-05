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
import type { ScenePresentationAdapterHandle } from '../../story/presentation';
import {
  type Group45PhoneSceneId,
  type Group45PhoneTransitionId
} from './adapter-groups/group4-5';
import {
  usePhoneStoryRuntimePort,
  usePhoneStorySnapshot
} from './PhoneStoryRuntimeContext';
import {
  registerPhoneRuntimeScrollCorridor,
  registerPhoneRuntimeEffect,
  registerPhoneRuntimeSurface,
  selectPhoneCinematicSnapshot,
  syncPhoneRuntimeDiagnostics,
  type PhoneExecutionToken,
  type PhoneRenderedPresentationFrame
} from './phone-story/runtime';
import { phoneScenePresentationTuple } from './phone-story/manifest';
import {
  phoneCompositeAdapterScene,
  phoneClampProgress,
  phoneDocumentTop,
  phoneSnapshotProjectsSurface,
  phoneCompositeVisualProjection,
  phoneCompositeVisualSpec
} from './phone-composite-snapshot';
import {
  phoneDirectEntryGeometryReady
} from './phone-direct-entry-position';
import {
  createPhoneCompositeRunner,
  type PhoneCompositeRuntimeConfig
} from './phone-composite-runner';
import type {
  PhoneTransitionDirection
} from './phone-transition-coordinator';
import {
  createPhoneCapabilityRegistry
} from './phone-transition-readiness';
import { usePhoneCapabilityBinding } from './phone-adapter-binding';
import type {
  PhonePresentationAdapterHandle,
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';
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
  /** Leaf-loading intent from the formal direct-entry route only. */
  entryScene?: Group45PhoneSceneId;
  validationMode?: string | undefined;
  onBrandRootChange?: (root: HTMLElement | null) => void;
  onBrandPresentationChange?: (
    handle: PhonePresentationAdapterHandle | null
  ) => void;
  onLabBoundaryChange?: (
    boundary: Readonly<{
      root: HTMLElement;
      adapter: ScenePresentationAdapterHandle;
    }> | null
  ) => void;
}>;

export type Group45VisualScene = Extract<
  Group45PhoneSceneId,
  'figure3-animation' | 'ttg-animation'
>;

const GROUP45_VISUAL_SCENES = [
  'figure3-animation',
  'ttg-animation'
] as const satisfies readonly Group45VisualScene[];
const GROUP45_SCENES = [
  'brand',
  'figure3-animation',
  'services',
  'ttg-animation',
  'lab'
] as const satisfies readonly Group45PhoneSceneId[];
const BRAND_READING_HOLD_RATIO = .16;
const GROUP45_READINESS_TIMEOUT_MS = 10000;

type Group45CapabilityId = Group45PhoneSceneId | Group45PhoneTransitionId;
type Group45CapabilityHandle =
  | ScenePresentationAdapterHandle
  | PhoneTransitionAdapterHandle;
type VisualRuntimeConfig = PhoneCompositeRuntimeConfig;

function group45RunForVisual(scene: Group45VisualScene) {
  return phoneCompositeVisualSpec(scene)[0];
}

/**
 * Unit 5 contributes geometry, presentation capabilities, and media evidence
 * only. The route-local PhoneStory authority owns scene, stage, lock, scroll,
 * endpoint, transaction, and rollback state through its one snapshot.
 */
export const PhoneBrandLabContinuation = forwardRef<
  PhoneBrandLabContinuationHandle,
  PhoneBrandLabContinuationProps
>(function PhoneBrandLabContinuation({
  reducedMotion,
  stageHost,
  entryScene,
  validationMode,
  onBrandRootChange,
  onBrandPresentationChange,
  onLabBoundaryChange
}, forwardedRef) {
  const orchestrator = usePhoneStoryRuntimePort();
  const storySnapshot = usePhoneStorySnapshot();
  const cinematicSnapshot = selectPhoneCinematicSnapshot(storySnapshot);
  const activeVisual = cinematicSnapshot[6] === 'brand-services'
    ? 'figure3-animation'
    : cinematicSnapshot[6] === 'services-lab' ? 'ttg-animation' : null;
  const adapterScene = phoneCompositeAdapterScene(
    cinematicSnapshot,
    'brand',
    'brand',
    'lab',
    activeVisual
  );
  // Keep the direct-entry closure mounted while neighboring Group 6–7
  // snapshots select their own adapters. Otherwise a cold Lab entry changes
  // focus to Brand during Lab → Education and disconnects its source root.
  const entryAdapterSceneRef = useRef(entryScene ?? adapterScene);
  const [figure3Run, figure3Surface, figure3Target] = phoneCompositeVisualSpec(
    'figure3-animation'
  );
  const [ttgRun, ttgSurface, ttgTarget] = phoneCompositeVisualSpec('ttg-animation');
  const [figure3Execution, figure3Prewarm] = phoneCompositeVisualProjection(
    cinematicSnapshot,
    figure3Run,
    figure3Surface,
    figure3Target
  );
  const [ttgExecution, ttgPrewarm] = phoneCompositeVisualProjection(
    cinematicSnapshot,
    ttgRun,
    ttgSurface,
    ttgTarget
  );
  const adapters = usePhoneGroup45Adapters(
    entryAdapterSceneRef.current,
    adapterScene
  );
  const [, setAdapterRevision] = useState(0);
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
  const labRef = useRef<PhoneSceneAdapterHandle | null>(null);
  const brandFigure3Ref = useRef<PhoneTransitionAdapterHandle | null>(null);
  const figure3ServicesRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const servicesTtgRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const ttgLabRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const mediaFrameRef = useRef<(
    scene: Group45PhoneSceneId,
    frame: PhoneRenderedPresentationFrame
  ) => void>(() => undefined);
  const mediaProgressRef = useRef<(
    scene: Group45VisualScene,
    identity: PhoneExecutionToken,
    progress: number
  ) => void>(() => undefined);
  const mediaCompleteRef = useRef<(
    scene: Group45VisualScene,
    identity: PhoneExecutionToken
  ) => void>(() => undefined);
  const mediaErrorRef = useRef<(
    scene: Group45VisualScene,
    identity: PhoneExecutionToken
  ) => void>(() => undefined);

  useImperativeHandle(forwardedRef, () => ({
    brandRoot: () => brandRef.current?.root() ?? null,
    labRoot: () => labRef.current?.root() ?? null,
    labAdapter: () => labRef.current
  }), []);

  const publishAdapter = useCallback(() => {
    setAdapterRevision((revision) => revision + 1);
    // Binding is readiness evidence only. The projector re-applies the same
    // authority snapshot; no adapter is allowed to publish a stable scene.
    syncPhoneRuntimeDiagnostics(orchestrator);
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
      const presentation = handle as PhoneSceneAdapterHandle | null;
      onBrandPresentationChange?.(
        presentation?.presentPresentation
          ? presentation as PhonePresentationAdapterHandle
          : null
      );
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
    bindLab: (handle: PhoneSceneAdapterHandle | null) => {
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
  }), [
    bindCapability,
    onBrandPresentationChange,
    onBrandRootChange,
    onLabBoundaryChange
  ]);

  const onVisualProgress = useCallback((
    scene: Group45PhoneSceneId,
    identity: PhoneExecutionToken,
    progress: number
  ) => {
    if (scene === 'figure3-animation' || scene === 'ttg-animation') {
      mediaProgressRef.current(scene, identity, progress);
    }
  }, []);
  const onVisualFrame = useCallback((
    scene: Group45PhoneSceneId,
    frame: PhoneRenderedPresentationFrame
  ) => {
    mediaFrameRef.current(scene, frame);
  }, []);
  const onVisualComplete = useCallback((
    scene: Group45PhoneSceneId,
    identity: PhoneExecutionToken
  ) => {
    if (scene === 'figure3-animation' || scene === 'ttg-animation') {
      mediaCompleteRef.current(scene, identity);
    }
  }, []);
  const onMediaError = useCallback((
    scene: Group45PhoneSceneId,
    identity: PhoneExecutionToken
  ) => {
    if (scene === 'figure3-animation' || scene === 'ttg-animation') {
      mediaErrorRef.current(scene, identity);
    }
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !stageHost) return;
    const directEntryGeometryReady = () => phoneDirectEntryGeometryReady([
      adapters.entryReady,
      true
    ]);

    const configFor = (
      scene: Group45VisualScene
    ): VisualRuntimeConfig | null => {
      const figure3 = scene === 'figure3-animation';
      const prior = figure3 ? brandRef.current : servicesRef.current;
      const visual = figure3 ? figure3Ref.current : ttgRef.current;
      const final = figure3 ? servicesRef.current : labRef.current;
      const entry = figure3 ? brandFigure3Ref.current : servicesTtgRef.current;
      const media = figure3 ? figure3ServicesRef.current : ttgLabRef.current;
      if (!prior || !visual || !final || !entry || !media) return null;
      return { prior, visual, final, entry, media };
    };
    const directConfigFor = (scene: Group45VisualScene) => {
      const figure3 = scene === 'figure3-animation';
      const visual = figure3 ? figure3Ref.current : ttgRef.current;
      const final = figure3 ? servicesRef.current : labRef.current;
      const media = figure3 ? figure3ServicesRef.current : ttgLabRef.current;
      return visual && final && media ? { visual, final, media } : null;
    };
    const rootForScene = (
      scene: Group45PhoneSceneId
    ): HTMLElement | null => {
      const adapter = scene === 'brand'
        ? brandRef.current
        : scene === 'figure3-animation'
          ? figure3Ref.current
          : scene === 'services'
            ? servicesRef.current
            : scene === 'ttg-animation'
              ? ttgRef.current
              : labRef.current;
      return adapter?.root() ?? null;
    };
    const boundaryPosition = (
      scene: Group45VisualScene,
      direction: PhoneTransitionDirection
    ): number | null => {
      const track = scene === 'figure3-animation'
        ? figure3TrackRef.current
        : ttgTrackRef.current;
      const media = phoneDocumentTop(track);
      if (media === null) return null;
      const entryOffset = scene === 'figure3-animation'
        ? Math.max(1, window.innerHeight) * BRAND_READING_HOLD_RATIO
        : 0;
      return Math.max(
        0,
        direction === 1 ? media - Math.max(1, window.innerHeight) + entryOffset : media
      );
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
      runForVisual: group45RunForVisual,
      config: configFor,
      directConfig: directConfigFor,
      position: boundaryPosition,
      targetLanding(_scene, admission) {
        return phoneDocumentTop(rootForScene(
          admission[3] as Group45PhoneSceneId
        ));
      },
      // The runner owns admission ordering. Leaf handles only record playback
      // intent and reconcile after the runner has reset endpoint roles.
      startMedia({ identity, config, prepareReverseMediaFirstFrame }) {
        if (identity[4] === 1) {
          config.media.enter?.();
          config.visual.enter?.();
          return;
        }
        prepareReverseMediaFirstFrame();
        config.visual.reverse?.();
      }
    });
    const surfaceLeases = [
      ...(['brand', 'services', 'lab'] as const).map((scene) => (
        registerPhoneRuntimeSurface(
          orchestrator,
          'native:' + scene,
          scene,
          'native',
          () => rootForScene(scene),
          () => stageHost,
          undefined,
          scene === 'brand'
            ? {
                present(token, report) {
                  const brand = brandRef.current as PhoneSceneAdapterHandle | null;
                  brand?.presentPresentation?.(token, report);
                },
                dispose(token) {
                  const brand = brandRef.current as PhoneSceneAdapterHandle | null;
                  brand?.disposePresentation?.(token);
                }
              }
            : undefined
        )
      )),
      ...([
        ['group45:figure3', 'figure3-animation', figure3Ref],
        ['group45:ttg', 'ttg-animation', ttgRef]
      ] as const).map(([id, scene, ref]) => (
        registerPhoneRuntimeSurface(
          orchestrator,
          id,
          scene,
          'fixed',
          () => ref.current?.root() ?? null,
          () => stageHost,
          (request) => {
            const prepare = ref.current?.prepareTargetPresentation;
            if (!prepare) {
              throw new Error(`${scene} direct-entry receiver unavailable`);
            }
            return prepare({
              progress: 0,
              direction: 1,
              runId: `${request.sessionId}:${request.generation}:direct`,
              presentationToken: request.token,
              signal: request.signal,
              directEntry: true
            });
          },
          {
            present(token, report) {
              (ref.current as PhoneSceneAdapterHandle | null)
                ?.presentPresentation?.(token, report);
            },
            dispose(token) {
              (ref.current as PhoneSceneAdapterHandle | null)
                ?.disposePresentation?.(token);
            }
          }
        )
      ))
    ];
    const effectLeases = [
      registerPhoneRuntimeEffect(
        orchestrator,
        'figure3-to-services',
        () => stageHost,
        () => figure3Ref.current?.effectRoot?.() ?? null
      ),
      registerPhoneRuntimeEffect(
        orchestrator,
        'ttg-to-lab',
        () => stageHost,
        () => ttgRef.current?.effectRoot?.() ?? null
      )
    ];
    const corridorLease = registerPhoneRuntimeScrollCorridor(
      orchestrator,
      'group45',
      GROUP45_SCENES,
      (actualY, priorY) => {
        const delta = actualY - priorY;
        return delta > .5 ? 1 : delta < -.5 ? -1 : 0;
      },
      (run, direction) => {
        if (run === 'brand-services') {
          return boundaryPosition('figure3-animation', direction);
        }
        if (run === 'services-lab') {
          return boundaryPosition('ttg-animation', direction);
        }
        return null;
      },
      (scene, reason, direction, [, , , , , , run]) => {
        const targetScene = scene as Group45PhoneSceneId;
        const directNativeEntry = reason === 'direct-entry'
          && run === null;
        if (directNativeEntry) {
          if (!directEntryGeometryReady()) return null;
          return phoneDocumentTop(rootForScene(targetScene));
        }
        // The manifest declares Services and Lab as native-reading holds.
        // Their terminal proof is only meaningful once authored copy occupies
        // the viewport, so do not leave their scroll landing at the previous
        // media boundary after the fixed plane has retired.
        if (phoneScenePresentationTuple(targetScene)[5] === 'native-reading') {
          return phoneDocumentTop(rootForScene(targetScene));
        }
        if (scene === 'brand' || scene === 'figure3-animation' || scene === 'services') {
          return boundaryPosition('figure3-animation', direction);
        }
        if (scene === 'ttg-animation' || scene === 'lab') {
          return boundaryPosition('ttg-animation', direction);
        }
        return null;
      }
    );

    mediaFrameRef.current = (scene, frame) => {
      runner.reportMediaFrame(scene, frame);
    };
    mediaProgressRef.current = (scene, identity, progress) => {
      runner.progressMedia(scene, identity, phoneClampProgress(progress));
    };
    mediaCompleteRef.current = (scene, identity) => {
      runner.completeMedia(scene, identity);
    };
    mediaErrorRef.current = (scene, identity) => {
      runner.failMedia(scene, identity);
    };
    return () => {
      mediaFrameRef.current = () => undefined;
      mediaProgressRef.current = () => undefined;
      mediaCompleteRef.current = () => undefined;
      mediaErrorRef.current = () => undefined;
      corridorLease.dispose();
      for (const lease of effectLeases) lease.dispose();
      for (const lease of surfaceLeases) lease.dispose();
      runner.dispose();
    };
  }, [
    adapters.entryReady,
    adapters.rootReady,
    capabilities,
    orchestrator,
    reducedMotion,
    stageHost
  ]);

  /*
   * Snapshot -> adapter bridge. Geometry is sampled by the route's one
   * document runtime above; this bridge never installs a second scroll,
   * resize, or orientation listener.
  */
  useLayoutEffect(() => {
    brandRef.current?.update(1);
    servicesRef.current?.update(1);
    labRef.current?.update(1);
  }, [storySnapshot]);

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
    <div className="phone-brand-lab__stage-surfaces" aria-hidden="true">
      {Figure3 && (
        <Figure3
          ref={bindFigure3}
          active={figure3Execution !== null}
          direction={figure3Execution?.[4] ?? 1}
          execution={figure3Execution}
          prewarm={figure3Prewarm}
          reducedMotion={reducedMotion}
          onMediaError={onMediaError}
          onPresentedFrame={onVisualFrame}
          onProgress={onVisualProgress}
          onComplete={onVisualComplete}
        />
      )}
      {Ttg && (
        <Ttg
          ref={bindTtg}
          active={ttgExecution !== null}
          direction={ttgExecution?.[4] ?? 1}
          execution={ttgExecution}
          prewarm={ttgPrewarm}
          reducedMotion={reducedMotion}
          onMediaError={onMediaError}
          onPresentedFrame={onVisualFrame}
          onProgress={onVisualProgress}
          onComplete={onVisualComplete}
        />
      )}
    </div>
  );

  const [, sourceSurface, receiverSurface] = cinematicSnapshot;
  return (
    <section
      ref={rootRef}
      className="phone-brand-lab phone-brand-lab--continuation"
      data-phone-continuation="brand-lab"
      data-phone-validation-mode={validationMode}
      data-phone-group45-state="ready"
      data-phone-group45-document-geometry={adapters.entryReady
        ? 'ready'
        : 'pending'}
      data-phone-group45-layout="shared-boundary-stage"
      data-phone-proof-brand-input="stable-receiver"
      data-phone-motion={reducedMotion ? 'reduce' : 'full'}
      data-phone-lab-boundary="stable-lab-ph-input"
    >
      {stageHost ? createPortal(stageSurfaces, stageHost) : null}
      {Brand && (
        <Brand
          ref={bindBrand}
            active={phoneSnapshotProjectsSurface(
            sourceSurface,
            receiverSurface,
            'native:brand'
          )}
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
            active={phoneSnapshotProjectsSurface(
            sourceSurface,
            receiverSurface,
            'native:services'
          )}
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
            active={phoneSnapshotProjectsSurface(
            sourceSurface,
            receiverSurface,
            'native:lab'
          )}
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
