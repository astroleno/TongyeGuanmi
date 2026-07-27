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
  usePhoneStoryOrchestrator,
  usePhoneStorySnapshot
} from './PhoneStoryOrchestratorContext';
import {
  registerPhoneRuntimeScrollCorridor,
  registerPhoneRuntimeSurface,
  selectPhoneCinematicSnapshot,
  syncPhoneRuntimeDiagnostics
} from './phone-story-runtime';
import {
  phoneBrandLabAdapterScene,
  phoneBrandLabRunForVisual,
  phoneBrandLabVisualProjection
} from './phone-brand-lab-runtime';
import {
  phoneClampProgress,
  phoneDocumentTop,
  phoneSnapshotProjectsSurface
} from './phone-composite-snapshot';
import {
  createPhoneCompositeRunner,
  type PhoneCompositeRuntimeConfig
} from './phone-composite-runner';
import type {
  PhoneExecutionIdentity
} from './phone-story-state';
import type {
  PhoneTransitionDirection
} from './phone-transition-coordinator';
import {
  createPhoneCapabilityRegistry
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
  validationMode?: string | undefined;
  onBrandRootChange?: (root: HTMLElement | null) => void;
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
  validationMode,
  onBrandRootChange,
  onLabBoundaryChange
}, forwardedRef) {
  const orchestrator = usePhoneStoryOrchestrator();
  const storySnapshot = usePhoneStorySnapshot();
  const cinematicSnapshot = selectPhoneCinematicSnapshot(storySnapshot);
  const adapterScene = phoneBrandLabAdapterScene(cinematicSnapshot);
  const [
    figure3Execution,
    figure3Prewarm,
    figure3Progress
  ] = phoneBrandLabVisualProjection(cinematicSnapshot, 'figure3-animation');
  const [
    ttgExecution,
    ttgPrewarm,
    ttgProgress
  ] = phoneBrandLabVisualProjection(cinematicSnapshot, 'ttg-animation');
  const adapters = usePhoneGroup45Adapters(adapterScene, adapterScene);
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
  const labRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const brandFigure3Ref = useRef<PhoneTransitionAdapterHandle | null>(null);
  const figure3ServicesRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const servicesTtgRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const ttgLabRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const mediaProgressRef = useRef<(
    scene: Group45VisualScene,
    identity: PhoneExecutionIdentity,
    progress: number
  ) => void>(() => undefined);
  const mediaCompleteRef = useRef<(
    scene: Group45VisualScene,
    identity: PhoneExecutionIdentity
  ) => void>(() => undefined);
  const mediaErrorRef = useRef<(
    scene: Group45VisualScene,
    identity: PhoneExecutionIdentity
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
    identity: PhoneExecutionIdentity,
    progress: number
  ) => {
    if (scene === 'figure3-animation' || scene === 'ttg-animation') {
      mediaProgressRef.current(scene, identity, progress);
    }
  }, []);
  const onVisualComplete = useCallback((
    scene: Group45PhoneSceneId,
    identity: PhoneExecutionIdentity
  ) => {
    if (scene === 'figure3-animation' || scene === 'ttg-animation') {
      mediaCompleteRef.current(scene, identity);
    }
  }, []);
  const onMediaError = useCallback((
    scene: Group45PhoneSceneId,
    identity: PhoneExecutionIdentity
  ) => {
    if (scene === 'figure3-animation' || scene === 'ttg-animation') {
      mediaErrorRef.current(scene, identity);
    }
  }, []);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

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
      runForVisual: phoneBrandLabRunForVisual,
      config: configFor,
      directConfig: directConfigFor,
      position: boundaryPosition,
      // Media transition adapters still own their authored opacity endpoints.
      // Figure3/TTG decoder start is instead a snapshot-driven effect below.
      startMedia({ identity, config }) {
        if (identity.direction === 1) config.media.enter?.();
        else config.media.reverse?.();
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
          () => rootForScene(scene),
          () => true
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
          () => ref.current?.root() ?? null,
          () => true
        )
      ))
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
        const directNativeEntry = reason === 'direct-entry'
          && run === null;
        if (directNativeEntry) {
          return phoneDocumentTop(rootForScene(scene as Group45PhoneSceneId));
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
      mediaProgressRef.current = () => undefined;
      mediaCompleteRef.current = () => undefined;
      mediaErrorRef.current = () => undefined;
      corridorLease.dispose();
      for (const lease of surfaceLeases) lease.dispose();
      runner.dispose();
    };
  }, [adapters.rootReady, capabilities, orchestrator, reducedMotion]);

  /*
   * Snapshot -> adapter bridge. Geometry is sampled by the route's one
   * document runtime above; this bridge never installs a second scroll,
   * resize, or orientation listener.
  */
  useLayoutEffect(() => {
    brandRef.current?.update(1);
    servicesRef.current?.update(1);
    labRef.current?.update(1);
    if (!figure3Execution) {
      figure3Ref.current?.update(figure3Progress);
    }
    if (!ttgExecution) {
      ttgRef.current?.update(ttgProgress);
    }
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
          direction={figure3Execution?.direction ?? 1}
          execution={figure3Execution}
          prewarm={figure3Prewarm}
          reducedMotion={reducedMotion}
          onMediaError={onMediaError}
          onProgress={onVisualProgress}
          onComplete={onVisualComplete}
        />
      )}
      {Ttg && (
        <Ttg
          ref={bindTtg}
          active={ttgExecution !== null}
          direction={ttgExecution?.direction ?? 1}
          execution={ttgExecution}
          prewarm={ttgPrewarm}
          reducedMotion={reducedMotion}
          onMediaError={onMediaError}
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
