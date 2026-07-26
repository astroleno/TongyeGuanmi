import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import { semanticBoolean } from '../../runtime/semantic-data-attribute';
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
  usePhoneStoryOrchestrator
} from './PhoneStoryOrchestratorContext';
import {
  acquirePhoneDocumentEndpointAlignment
} from './phone-document-endpoint-alignment';
import {
  PHONE_LAB_CONTACT_AUTOPLAY_EVENT,
  type PhoneLabContactAutoplayEventDetail
} from './phone-lab-contact-timeline';
import {
  phoneGroup67RunSource,
  phoneLabContactRunForVisual,
  type PhoneLabContactVisualScene
} from './phone-lab-contact-runtime';
import {
  createPhoneCompositeRunner,
  type PhoneCompositeRunView,
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
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';
import {
  usePhoneGroup67Adapters,
  type Group67AdapterFocus
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
  onStageSceneChange?: (scene: VisualScene | null) => void;
}>;

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function PhoneLabContactContinuation({
  reducedMotion,
  stageHost,
  entryScene,
  fromLabBoundary = false,
  labBoundary = null,
  onStageSceneChange
}: PhoneLabContactContinuationProps) {
  const orchestrator = usePhoneStoryOrchestrator();
  const initialScene: ContinuationScene = entryScene
    ?? (fromLabBoundary ? 'lab' : 'ph-animation');
  const [focus, setFocus] = useState<Group67AdapterFocus>(
    initialScene
  );
  const adapters = usePhoneGroup67Adapters(focus);
  const [currentScene, setCurrentScene] = useState<ContinuationScene>(
    initialScene
  );
  const [stageScene, setStageScene] = useState<VisualScene | null>(null);
  const [prewarmScene, setPrewarmScene] = useState<VisualScene | null>(null);
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
  const activeRunRef = useRef<PhoneCompositeRunView<VisualScene> | null>(null);
  const mediaEventRef = useRef<(event: Event) => void>(() => undefined);
  labBoundaryRef.current = labBoundary;
  const publishAdapter = useCallback(() => {
    setAdapterRevision((revision) => revision + 1);
    // Lazy roots only report readiness; stable ownership is recommitted by the
    // single Orchestrator through its registered scene adapter.
    orchestrator.syncDiagnostics();
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

  useEffect(() => {
    onStageSceneChange?.(stageScene);
  }, [onStageSceneChange, stageScene]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const inputOwner = root.closest<HTMLElement>(
      'main.portrait-scroll-spike'
    ) ?? root;

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

    const setRootRunState = (
      run: PhoneCompositeRunView<VisualScene> | null,
      retry = false
    ) => {
      root.dataset.phoneGroup67Run = run
        ? `${run.scene}:${run.direction === 1 ? 'forward' : 'reverse'}`
        : 'idle';
      root.dataset.phoneGroup67StageActive = semanticBoolean(Boolean(run));
      if (import.meta.env.DEV) {
        root.dataset.phoneGroup67Step = run
          ? `${run.scene}:${run.step}`
          : 'idle';
        if (run || !retry) delete root.dataset.phoneGroup67MediaRetry;
      }
    };

    const setNativeOwner = (
      scene: Extract<ContinuationScene, 'lab' | 'education' | 'contact'>
    ) => {
      const lab = labBoundaryRef.current?.adapter;
      if (scene === 'lab') {
        lab?.update(1);
        lab?.enter?.();
      }
      else lab?.leave?.();
      if (scene === 'education') {
        educationRef.current?.update(1);
        educationRef.current?.enter?.();
      }
      else educationRef.current?.leave?.();
      if (scene === 'contact') {
        contactRef.current?.update(1);
        contactRef.current?.enter?.();
      }
      else contactRef.current?.leave?.();
    };

    const settleVisibleState = (
      scene: Extract<ContinuationScene, 'lab' | 'education' | 'contact'>
    ) => {
      setCurrentScene(scene);
      setStageScene(null);
      setPrewarmScene(null);
      setFocus(scene);
      setNativeOwner(scene);
      phRef.current?.leave?.();
      craneRef.current?.leave?.();
    };

    const boundaryPosition = (
      scene: VisualScene,
      direction: PhoneTransitionDirection
    ): number | null => {
      const track = scene === 'ph-animation'
        ? phTrackRef.current
        : craneTrackRef.current;
      if (!track) return null;
      const viewportHeight = Math.max(1, window.innerHeight);
      const media = window.scrollY + track.getBoundingClientRect().top;
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
      onRunState(run, retry) {
        activeRunRef.current = run;
        setRootRunState(run, retry);
        if (retry && import.meta.env.DEV) {
          root.dataset.phoneGroup67MediaRetry = 'composite';
        }
      },
      onRunBegin(run) {
        const source = phoneGroup67RunSource(run.scene, run.direction);
        setFocus(source);
        setCurrentScene(source);
        setPrewarmScene(run.scene);
      },
      onMediaActive(run) {
        const source = phoneGroup67RunSource(run.scene, run.direction);
        setStageScene(run.scene);
        setPrewarmScene(null);
        setCurrentScene(source);
      },
      startMedia({ run, config, animate }) {
        if (run.direction === 1) {
          config.media.enter?.();
          config.visual.enter?.();
          return;
        }
        config.media.reverse?.();
        if (run.scene === 'ph-animation') {
          animate(
            1,
            PHONE_PH_EDUCATION_ANIMATION_STOP,
            INTRA_CHAPTER_DISSOLVE_MS,
            () => config.visual.reverse?.()
          );
        } else {
          config.visual.reverse?.();
        }
      },
      acquireReverseEntry(_run, config) {
        const priorRoot = config.prior.root();
        return priorRoot
          ? acquirePhoneDocumentEndpointAlignment(priorRoot, _run.session)
          : undefined;
      }
    });

    const stableLeases = (
      ['lab', 'education', 'contact'] as const
    ).map((scene) => orchestrator.registerStableSceneAdapter(
      scene,
      `phone-lab-contact:stable:${scene}`,
      {
        root: () => (scene === 'lab'
          ? labBoundaryRef.current?.adapter
          : scene === 'education'
            ? educationRef.current
            : contactRef.current)?.root() ?? null,
        commit: () => settleVisibleState(scene)
      }
    ));

    mediaEventRef.current = (event: Event) => {
      const detail = (
        event as CustomEvent<PhoneLabContactAutoplayEventDetail>
      ).detail;
      const run = activeRunRef.current;
      if (
        !detail
        || !run
        || run.step !== 'media'
        || run.scene !== detail.scene
        || run.direction !== detail.direction
        || !run.session.valid()
      ) return;
      if (detail.phase === 'playing') {
        runner.heartbeat(run.scene, run.direction);
        return;
      }
      if (detail.phase === 'failed') {
        runner.failMedia(run.scene);
        return;
      }
      if (
        detail.phase === 'progress'
        && typeof detail.progress === 'number'
        && Number.isFinite(detail.progress)
      ) {
        const progress = clamp(detail.progress);
        const canonical = run.scene === 'ph-animation'
          ? progress * PHONE_PH_EDUCATION_ANIMATION_STOP
          : progress;
        runner.progressMedia(run.scene, run.direction, canonical);
        if (import.meta.env.DEV) {
          root.dataset.phoneGroup67Progress =
            `${detail.scene}:${detail.direction}:${canonical.toFixed(4)}`;
        }
        return;
      }
      if (detail.phase !== 'complete') return;
      if (run.direction === 1 && run.scene === 'ph-animation') {
        runner.animateMedia(
          run.scene,
          run.direction,
          PHONE_PH_EDUCATION_ANIMATION_STOP,
          1,
          INTRA_CHAPTER_DISSOLVE_MS,
          () => runner.completeMedia(run.scene, run.direction)
        );
        return;
      }
      runner.completeMedia(run.scene, run.direction);
    };

    const onMediaEvent = (event: Event) => mediaEventRef.current(event);
    inputOwner.addEventListener(PHONE_LAB_CONTACT_AUTOPLAY_EVENT, onMediaEvent);

    return () => {
      inputOwner.removeEventListener(
        PHONE_LAB_CONTACT_AUTOPLAY_EVENT,
        onMediaEvent
      );
      mediaEventRef.current = () => undefined;
      for (const lease of stableLeases) lease.dispose();
      runner.dispose();
    };
  }, [capabilities, orchestrator, reducedMotion]);

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
  const presentedStageScene = stageScene ?? prewarmScene;

  const stageSurfaces = (
    <div
      className="phone-group67__stage-surfaces"
      data-phone-group67-stage-active={semanticBoolean(presentedStageScene !== null)}
      aria-hidden="true"
    >
      <div
        ref={phStageRef}
        className="phone-group67__stage phone-group67__stage--ph"
        data-phone-group67-layer-active={semanticBoolean(
          presentedStageScene === 'ph-animation'
        )}
      >
        <div className="phone-group67__stage-canvas">
          {Ph ? (
            <Ph
              ref={bindPh}
              active={stageScene === 'ph-animation'}
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
        data-phone-group67-layer-active={semanticBoolean(
          presentedStageScene === 'crane-animation'
        )}
      >
        <div className="phone-group67__stage-canvas">
          {Crane ? (
            <Crane
              ref={bindCrane}
              active={stageScene === 'crane-animation'}
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
      data-phone-group67-entry={initialScene}
      data-phone-group67-active-scene={currentScene}
      data-phone-group67-stage-active={semanticBoolean(presentedStageScene !== null)}
      data-phone-group67-adapters-ready={String(adapters.ready)}
      data-phone-group67-run="idle"
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
            active={currentScene === 'education'}
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
            active={currentScene === 'contact'}
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
