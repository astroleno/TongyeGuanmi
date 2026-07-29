import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import type {
  ScenePresentationAdapterHandle
} from '../../story/presentation';
import {
  INTRA_CHAPTER_DISSOLVE_MS,
  PH_PLAYBACK_MS
} from '../../story/timings';
import {
  type Group67PhoneSceneId,
  type Group67PhoneTransitionId
} from './adapter-groups/group6-7';
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
  acquirePhoneDocumentEndpointAlignment
} from './phone-document-endpoint-alignment';
import {
  PHONE_LAB_CONTACT_AUTOPLAY_EVENT,
  phoneLabContactAutoplayToken,
  type PhoneLabContactAutoplayEvent
} from './phone-lab-contact-timeline';
import {
  phoneLabContactAdapterScene,
  phoneLabContactRunForVisual,
  phoneLabContactVisualProjection,
  type PhoneLabContactVisualScene
} from './phone-lab-contact-runtime';
import {
  phoneClampProgress,
  phoneDocumentTop,
  phoneSnapshotProjectsSurface
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
  createPhoneCapabilityRegistry,
} from './phone-transition-readiness';
import { usePhoneCapabilityBinding } from './phone-adapter-binding';
import type {
  PhoneCinematicSceneAdapterHandle,
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';
import {
  usePhoneGroup67Adapters
} from './usePhoneGroup67Adapters';
import './PhoneLabContactContinuation.css';

export type PhoneLabBoundary = Readonly<{
  root: HTMLElement;
  adapter: ScenePresentationAdapterHandle;
}>;

export type PhoneGroup67VisualScene = PhoneLabContactVisualScene;
export type PhoneGroup67ContinuationScene = 'lab' | Group67PhoneSceneId;

type VisualScene = PhoneGroup67VisualScene;
type ContinuationScene = PhoneGroup67ContinuationScene;
type Group67CapabilityId =
  | 'lab'
  | Group67PhoneSceneId
  | Group67PhoneTransitionId;
type Group67CapabilityHandle =
  | ScenePresentationAdapterHandle
  | PhoneTransitionAdapterHandle;
type VisualRuntimeConfig = PhoneCompositeRuntimeConfig;

const GROUP67_VISUAL_SCENES = [
  'ph-animation',
  'crane-animation'
] as const satisfies readonly VisualScene[];
const GROUP67_SCENES = [
  'lab',
  'ph-animation',
  'education',
  'crane-animation',
  'contact'
] as const satisfies readonly ContinuationScene[];
const GROUP67_READINESS_TIMEOUT_MS = 10000;
const GROUP67_ENTRY_VIEWPORT_RATIO = .85;
const PHONE_PH_EDUCATION_ANIMATION_STOP = PH_PLAYBACK_MS
  / (PH_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS);

export type PhoneLabContactContinuationProps = Readonly<{
  reducedMotion: boolean;
  stageHost: HTMLElement | null;
  entryScene?: Group67PhoneSceneId;
  fromLabBoundary?: boolean;
  labBoundary?: PhoneLabBoundary | null;
}>;

export function PhoneLabContactContinuation({
  reducedMotion,
  stageHost,
  entryScene,
  fromLabBoundary = false,
  labBoundary = null
}: PhoneLabContactContinuationProps) {
  const orchestrator = usePhoneStoryOrchestrator();
  const storySnapshot = usePhoneStorySnapshot();
  const cinematicSnapshot = selectPhoneCinematicSnapshot(storySnapshot);
  const initialScene: ContinuationScene = entryScene
    ?? (fromLabBoundary ? 'lab' : 'ph-animation');
  const adapterScene = phoneLabContactAdapterScene(
    cinematicSnapshot,
    initialScene
  );
  const [phExecution, phPrewarm, phProgress] = phoneLabContactVisualProjection(
    cinematicSnapshot,
    'ph-animation'
  );
  const [craneExecution, cranePrewarm, craneProgress] = phoneLabContactVisualProjection(
    cinematicSnapshot,
    'crane-animation'
  );
  const adapters = usePhoneGroup67Adapters(adapterScene);
  const [, setAdapterRevision] = useState(0);
  const [capabilities] = useState(() => createPhoneCapabilityRegistry<
    Group67CapabilityId,
    Group67CapabilityHandle
  >());
  const rootRef = useRef<HTMLElement | null>(null);
  const phTrackRef = useRef<HTMLElement | null>(null);
  const craneTrackRef = useRef<HTMLElement | null>(null);
  const phStageRef = useRef<HTMLDivElement | null>(null);
  const craneStageRef = useRef<HTMLDivElement | null>(null);
  const educationSlotRef = useRef<HTMLElement | null>(null);
  const contactSlotRef = useRef<HTMLElement | null>(null);
  const labBoundaryRef = useRef<PhoneLabBoundary | null>(labBoundary);
  const labAdapterRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const phRef = useRef<PhoneSceneAdapterHandle | null>(null);
  const educationRef = useRef<PhoneSceneAdapterHandle | null>(null);
  const craneRef = useRef<PhoneSceneAdapterHandle | null>(null);
  const contactRef = useRef<PhoneSceneAdapterHandle | null>(null);
  const labPhRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const phEducationRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const educationCraneRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const craneContactRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  labBoundaryRef.current = labBoundary;
  const publishAdapter = useCallback(() => {
    setAdapterRevision((revision) => revision + 1);
    // Lazy roots only report readiness; stable ownership is recommitted by the
    // single Orchestrator through its registered scene adapter.
    syncPhoneRuntimeDiagnostics(orchestrator);
  }, [orchestrator]);
  const bindCapability = usePhoneCapabilityBinding(
    capabilities,
    'phone-lab-contact',
    publishAdapter
  );
  const {
    bindPh,
    bindEducation,
    bindCrane,
    bindContact,
    bindLabPh,
    bindPhEducation,
    bindEducationCrane,
    bindCraneContact
  } = useMemo(() => ({
    bindPh: (handle: PhoneSceneAdapterHandle | null) => {
      bindCapability('ph-animation', phRef, handle);
    },
    bindEducation: (handle: PhoneSceneAdapterHandle | null) => {
      bindCapability('education', educationRef, handle);
    },
    bindCrane: (handle: PhoneSceneAdapterHandle | null) => {
      bindCapability('crane-animation', craneRef, handle);
    },
    bindContact: (handle: PhoneSceneAdapterHandle | null) => {
      bindCapability('contact', contactRef, handle);
    },
    bindLabPh: (handle: PhoneTransitionAdapterHandle | null) => {
      bindCapability('lab-ph', labPhRef, handle);
    },
    bindPhEducation: (handle: PhoneTransitionAdapterHandle | null) => {
      bindCapability('ph-education', phEducationRef, handle);
    },
    bindEducationCrane: (handle: PhoneTransitionAdapterHandle | null) => {
      bindCapability('education-crane', educationCraneRef, handle);
    },
    bindCraneContact: (handle: PhoneTransitionAdapterHandle | null) => {
      bindCapability('crane-contact', craneContactRef, handle);
    }
  }), [bindCapability]);

  useEffect(() => {
    bindCapability('lab', labAdapterRef, labBoundary?.adapter ?? null);
  }, [bindCapability, labBoundary]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !stageHost) return;
    const inputOwner = root.closest<HTMLElement>(
      'main.portrait-scroll-spike'
    ) ?? root;
    const upstreamDocumentGeometryReady = () => (
      inputOwner.querySelector(
        '[data-phone-group45-document-geometry="ready"]'
      ) !== null
    );
    const directEntryGeometryReady = () => phoneDirectEntryGeometryReady([
      adapters.ready,
      upstreamDocumentGeometryReady()
    ]);

    const configFor = (scene: VisualScene): VisualRuntimeConfig | null => {
      const ph = scene === 'ph-animation';
      const prior = ph ? labBoundaryRef.current?.adapter : educationRef.current;
      const visual = ph ? phRef.current : craneRef.current;
      const final = ph ? educationRef.current : contactRef.current;
      const entry = ph ? labPhRef.current : educationCraneRef.current;
      const media = ph ? phEducationRef.current : craneContactRef.current;
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
    const directConfigFor = (scene: VisualScene) => {
      const ph = scene === 'ph-animation';
      const visual = ph ? phRef.current : craneRef.current;
      const final = ph ? educationRef.current : contactRef.current;
      const media = ph ? phEducationRef.current : craneContactRef.current;
      if (!visual || !final || !media) return null;
      return {
        visual,
        final,
        media
      };
    };
    const rootForScene = (
      scene: ContinuationScene
    ): HTMLElement | null => {
      const adapter = scene === 'lab'
        ? labBoundaryRef.current?.adapter
        : scene === 'ph-animation'
          ? phRef.current
          : scene === 'education'
            ? educationRef.current
            : scene === 'crane-animation'
              ? craneRef.current
              : contactRef.current;
      return adapter?.root() ?? null;
    };

    const boundaryPosition = (
      scene: VisualScene,
      direction: PhoneTransitionDirection
    ): number | null => {
      const track = scene === 'ph-animation'
        ? phTrackRef.current
          ?? root.querySelector<HTMLElement>('#ph-animation')
        : craneTrackRef.current
          ?? root.querySelector<HTMLElement>('#crane-animation');
      const media = phoneDocumentTop(track);
      if (media === null) return null;
      const viewportHeight = Math.max(1, window.innerHeight);
      const boundary = direction === 1
        ? media - viewportHeight * GROUP67_ENTRY_VIEWPORT_RATIO
        : media;
      return Math.max(0, boundary);
    };

    const runner = createPhoneCompositeRunner<
      VisualScene,
      Group67CapabilityId,
      Group67CapabilityHandle
    >({
      ownerId: 'phone-lab-contact',
      visualScenes: GROUP67_VISUAL_SCENES,
      orchestrator,
      capabilities,
      reducedMotion,
      timeoutMs: GROUP67_READINESS_TIMEOUT_MS,
      runForVisual: phoneLabContactRunForVisual,
      config: configFor,
      directConfig: directConfigFor,
      position: boundaryPosition,
      startMedia({ scene, identity, config, animate }) {
        if (identity[4] === 1) {
          config.media.enter?.();
          (config.visual as PhoneCinematicSceneAdapterHandle).enter?.(identity);
          return;
        }
        config.media.reverse?.();
        if (scene === 'ph-animation') {
          animate(
            1,
            PHONE_PH_EDUCATION_ANIMATION_STOP,
            INTRA_CHAPTER_DISSOLVE_MS,
            () => (
              config.visual as PhoneCinematicSceneAdapterHandle
            ).reverse?.(identity)
          );
        } else {
          (config.visual as PhoneCinematicSceneAdapterHandle).reverse?.(identity);
        }
      },
      acquireReverseEntry(identity, config) {
        const priorRoot = config.prior.root();
        return priorRoot
          ? acquirePhoneDocumentEndpointAlignment(
            priorRoot,
            [identity[1], identity[2]]
          )
          : undefined;
      }
    });

    const surfaceLeases = [
      ...(['lab', 'education', 'contact'] as const).map((scene) => (
        registerPhoneRuntimeSurface(
          orchestrator,
          `native:${scene}`,
          scene,
          'native',
          () => rootForScene(scene),
          () => stageHost
        )
      )),
      ...([
        ['group67:ph', 'ph-animation', phRef],
        ['group67:crane', 'crane-animation', craneRef]
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
              signal: request.signal,
              directEntry: true
            });
          }
        )
      ))
    ];
    const corridorLease = registerPhoneRuntimeScrollCorridor(
      orchestrator,
      'group67',
      GROUP67_SCENES,
      (actualY, priorY) => {
        const delta = actualY - priorY;
        return delta > .5 ? 1 : delta < -.5 ? -1 : 0;
      },
      (run, direction) => {
        if (run === 'lab-education') {
          return boundaryPosition('ph-animation', direction);
        }
        if (run === 'education-contact') {
          return boundaryPosition('crane-animation', direction);
        }
        return null;
      },
      (scene, reason, direction, [, , , , , , run]) => {
        const directNativeEntry = reason === 'direct-entry' && run === null;
        if (directNativeEntry) {
          if (!directEntryGeometryReady()) return null;
          return phoneDocumentTop(rootForScene(scene as ContinuationScene));
        }
        if (
          scene === 'lab'
          || scene === 'ph-animation'
          || scene === 'education'
        ) return boundaryPosition('ph-animation', direction);
        if (scene === 'crane-animation' || scene === 'contact') {
          return boundaryPosition('crane-animation', direction);
        }
        return null;
      }
    );

    const onMediaEvent = (event: Event) => {
      const detail = (
        event as CustomEvent<PhoneLabContactAutoplayEvent>
      ).detail;
      const identity = detail
        ? phoneLabContactAutoplayToken(detail)
        : null;
      if (
        !detail
        || !identity
      ) return;
      const [scene, phase, direction, , progress] = detail;
      if (phase === 'playing') {
        runner.heartbeat(scene, identity);
        return;
      }
      if (phase === 'presented') {
        runner.reportMediaFrame(scene, identity);
        return;
      }
      if (phase === 'failed') {
        runner.failMedia(scene, identity);
        return;
      }
      if (
        phase === 'progress'
        && typeof progress === 'number'
        && Number.isFinite(progress)
      ) {
        const sampled = phoneClampProgress(progress);
        const canonical = scene === 'ph-animation'
          ? sampled * PHONE_PH_EDUCATION_ANIMATION_STOP
          : sampled;
        runner.progressMedia(scene, identity, canonical);
        if (import.meta.env.DEV) {
          root.dataset.phoneGroup67Progress =
            `${scene}:${direction}:${canonical.toFixed(4)}`;
        }
        return;
      }
      if (phase !== 'complete') return;
      if (identity[4] === 1 && scene === 'ph-animation') {
        runner.animateMedia(
          scene,
          identity,
          PHONE_PH_EDUCATION_ANIMATION_STOP,
          1,
          INTRA_CHAPTER_DISSOLVE_MS,
          () => runner.completeMedia(scene, identity)
        );
        return;
      }
      runner.completeMedia(scene, identity);
    };

    inputOwner.addEventListener(PHONE_LAB_CONTACT_AUTOPLAY_EVENT, onMediaEvent);

    return () => {
      inputOwner.removeEventListener(
        PHONE_LAB_CONTACT_AUTOPLAY_EVENT,
        onMediaEvent
      );
      corridorLease.dispose();
      for (const lease of surfaceLeases) lease.dispose();
      runner.dispose();
    };
  }, [adapters.ready, capabilities, orchestrator, reducedMotion, stageHost]);

  /*
   * The route's document sampler owns geometry. This bridge only renders the
   * one immutable snapshot into already-registered adapter handles; it never
   * retains durable presentation truth locally.
  */
  useLayoutEffect(() => {
    educationRef.current?.update(1);
    contactRef.current?.update(1);
    if (!phExecution) {
      phRef.current?.update(phProgress);
    }
    if (!craneExecution) {
      craneRef.current?.update(craneProgress);
    }
  }, [storySnapshot]);

  useEffect(() => () => {
    labPhRef.current?.dispose?.();
    phEducationRef.current?.dispose?.();
    educationCraneRef.current?.dispose?.();
    craneContactRef.current?.dispose?.();
    phRef.current?.dispose?.();
    educationRef.current?.dispose?.();
    craneRef.current?.dispose?.();
    contactRef.current?.dispose?.();
  }, []);

  const Ph = adapters.scenes['ph-animation'];
  const Education = adapters.scenes.education;
  const Crane = adapters.scenes['crane-animation'];
  const Contact = adapters.scenes.contact;
  const LabPh = adapters.transitions['lab-ph'];
  const PhEducation = adapters.transitions['ph-education'];
  const EducationCrane = adapters.transitions['education-crane'];
  const CraneContact = adapters.transitions['crane-contact'];
  const [, sourceSurface, receiverSurface] = cinematicSnapshot;

  const stageSurfaces = (
    <div
      className="phone-group67__stage-surfaces"
      aria-hidden="true"
    >
      <div
        ref={phStageRef}
        className="phone-group67__stage phone-group67__stage--ph"
      >
        <div className="phone-group67__stage-canvas">
          {Ph ? (
            <Ph
              ref={bindPh}
              active={phExecution !== null || phPrewarm}
              reducedMotion={reducedMotion}
            />
          ) : (
            <div className="phone-group67__stage-pending" aria-hidden="true" />
          )}
        </div>
        {LabPh && labBoundary && phRef.current?.root() && (
          <LabPh
            ref={bindLabPh}
            host={phStageRef.current}
            from={labBoundary.root}
            to={phRef.current.root()}
            reducedMotion={reducedMotion}
          />
        )}
        {PhEducation && phRef.current?.root() && educationRef.current?.root() && (
          <PhEducation
            ref={bindPhEducation}
            host={phStageRef.current}
            from={phRef.current.root()}
            to={educationRef.current.root()}
            reducedMotion={reducedMotion}
          />
        )}
      </div>
      <div
        ref={craneStageRef}
        className="phone-group67__stage phone-group67__stage--crane"
      >
        <div className="phone-group67__stage-canvas">
          {Crane ? (
            <Crane
              ref={bindCrane}
              active={craneExecution !== null || cranePrewarm}
              reducedMotion={reducedMotion}
            />
          ) : (
            <div className="phone-group67__stage-pending" aria-hidden="true" />
          )}
        </div>
        {EducationCrane
          && educationRef.current?.root()
          && craneRef.current?.root() && (
            <EducationCrane
              ref={bindEducationCrane}
              host={craneStageRef.current}
              from={educationRef.current.root()}
              to={craneRef.current.root()}
              reducedMotion={reducedMotion}
            />
          )}
        {CraneContact
          && craneRef.current?.root()
          && contactRef.current?.root() && (
            <CraneContact
              ref={bindCraneContact}
              host={craneStageRef.current}
              from={craneRef.current.root()}
              to={contactRef.current.root()}
              reducedMotion={reducedMotion}
            />
          )}
      </div>
    </div>
  );

  return (
    <section
      ref={rootRef}
      className="phone-lab-contact-continuation"
      data-phone-continuation="lab-contact"
    >
      {stageHost ? createPortal(stageSurfaces, stageHost) : null}
      <section
        id="ph-animation"
        ref={phTrackRef}
        className="phone-lab-contact-continuation__phase phone-lab-contact-continuation__phase--ph"
        data-phone-story-chapter="lab-ph-education"
      />
      <section
        ref={educationSlotRef}
        className="phone-lab-contact__native phone-lab-contact-continuation__native"
        data-phone-acceptance-chapter="education"
        data-phone-story-chapter="education"
      >
        {Education ? (
          <Education
            ref={bindEducation}
            active={phoneSnapshotProjectsSurface(
              sourceSurface,
              receiverSurface,
              'native:education'
            )}
            reducedMotion={reducedMotion}
          />
        ) : (
          <div
            className="phone-lab-contact-continuation__native-pending phone-lab-contact-continuation__native-pending--education"
            aria-hidden="true"
          />
        )}
      </section>
      <section
        id="crane-animation"
        ref={craneTrackRef}
        className="phone-lab-contact-continuation__phase phone-lab-contact-continuation__phase--crane"
        data-phone-story-chapter="education-crane-contact"
      />
      <section
        ref={contactSlotRef}
        className="phone-lab-contact__native phone-lab-contact-continuation__native"
        data-phone-acceptance-chapter="contact"
        data-phone-story-chapter="contact"
      >
        {Contact ? (
          <Contact
            ref={bindContact}
            active={phoneSnapshotProjectsSurface(
              sourceSurface,
              receiverSurface,
              'native:contact'
            )}
            reducedMotion={reducedMotion}
          />
        ) : (
          <div
            className="phone-lab-contact-continuation__native-pending phone-lab-contact-continuation__native-pending--contact"
            aria-hidden="true"
          />
        )}
      </section>
    </section>
  );
}

export default PhoneLabContactContinuation;
