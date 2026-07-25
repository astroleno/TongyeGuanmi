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
import type {
  Group67CheckpointId,
  PhoneCheckpointId
} from '../../story/semantic-checkpoints';
import {
  INTRA_CHAPTER_DISSOLVE_MS,
  PH_PLAYBACK_MS
} from '../../story/timings';
import {
  group67PhoneSceneIds,
  type Group67PhoneSceneId
} from './adapter-groups/group6-7';
import type { PhoneEdgeScene } from './phone-edge-surface';
import {
  PHONE_LAB_CONTACT_AUTOPLAY_EVENT,
  type PhoneLabContactAutoplayEventDetail,
  type PhoneLabContactCinematicRunState,
  phoneLabContactCanBeginVisualRun,
  phoneLabContactPhaseAfterVisualCompletion,
  phoneLabContactRetainsCraneTerminal,
  phoneLabContactRetainsPhTerminal
} from './phone-lab-contact-timeline';
import {
  registerPhoneTransitionBoundary,
  runPhoneTimedTransition,
  type PhoneTransitionDirection,
  type PhoneTransitionSession
} from './phone-transition-coordinator';
import { runPhoneTargetPreparation } from './phone-target-presentation';
import type {
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterHandle
} from './types';
import {
  phoneGroup67CheckpointForScene,
  phoneGroup67EdgeScene
} from './phone-entry-plan';
import {
  usePhoneGroup67Adapters,
  type Group67AdapterFocus
} from './usePhoneGroup67Adapters';
import './PhoneLabContactContinuation.css';

export type PhoneLabBoundary = Readonly<{
  root: HTMLElement;
  adapter: ScenePresentationAdapterHandle;
}>;

export type PhoneGroup67VisualScene = Extract<
  Group67PhoneSceneId,
  'ph-animation' | 'crane-animation'
>;
export type PhoneGroup67ContinuationScene = 'lab' | Group67PhoneSceneId;
type VisualScene = PhoneGroup67VisualScene;
type ContinuationScene = PhoneGroup67ContinuationScene;
type RunStep =
  | 'preparing'
  | 'entry-ink'
  | 'media'
  | 'exit-ink';
type VisualRun = {
  scene: VisualScene;
  direction: PhoneTransitionDirection;
  session: PhoneTransitionSession;
  direct: boolean;
  step: RunStep;
};

type Group67Handles = {
  ph: PhoneSceneAdapterHandle | null;
  education: PhoneSceneAdapterHandle | null;
  crane: PhoneSceneAdapterHandle | null;
  contact: PhoneSceneAdapterHandle | null;
  labPh: PhoneTransitionAdapterHandle | null;
  phEducation: PhoneTransitionAdapterHandle | null;
  educationCrane: PhoneTransitionAdapterHandle | null;
  craneContact: PhoneTransitionAdapterHandle | null;
};

const PHONE_GROUP67_MEDIA_TIMEOUT_MS = 10000;
const PHONE_PH_EDUCATION_ANIMATION_STOP = PH_PLAYBACK_MS
  / (PH_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS);

export type PhoneGroup67RunReadiness = Readonly<{
  labBoundary: boolean;
  ph: boolean;
  education: boolean;
  crane: boolean;
  contact: boolean;
  labPh: boolean;
  phEducation: boolean;
  educationCrane: boolean;
  craneContact: boolean;
}>;

export function phoneGroup67RunIsReady(
  scene: VisualScene,
  direct: boolean,
  ready: PhoneGroup67RunReadiness
): boolean {
  if (scene === 'ph-animation') {
    return ready.ph
      && ready.education
      && ready.phEducation
      && (direct || (ready.labBoundary && ready.labPh));
  }
  return ready.crane
    && ready.contact
    && ready.craneContact
    && (direct || (ready.education && ready.educationCrane));
}

export function phoneGroup67RunTarget(
  scene: VisualScene,
  direction: PhoneTransitionDirection
): ContinuationScene {
  if (scene === 'ph-animation') {
    return direction === 1 ? 'education' : 'lab';
  }
  return direction === 1 ? 'contact' : 'education';
}

export function releasePhoneGroup67FailedSession(
  session: PhoneTransitionSession,
  sourceY: number,
  cancelInk?: () => void
): void {
  session.moveTo(sourceY);
  cancelInk?.();
  if (session.valid()) session.abort(sourceY);
}

export function phoneGroup67VisibleFallbackEndpoint(
  direction: PhoneTransitionDirection
): 0 | 1 {
  return direction === 1 ? 1 : 0;
}

export type PhoneLabContactContinuationProps = Readonly<{
  reducedMotion: boolean;
  stageHost: HTMLElement | null;
  entryScene?: Group67PhoneSceneId;
  fromLabBoundary?: boolean;
  labBoundary?: PhoneLabBoundary | null;
  onCheckpoint?: (checkpoint: PhoneCheckpointId) => void;
  onEdgeScene?: (scene: PhoneEdgeScene) => void;
  onSceneChange?: (scene: Group67PhoneSceneId) => void;
  onStageSceneChange?: (scene: VisualScene | null) => void;
}>;

function checkpointForBoundary(
  scene: VisualScene,
  direction: PhoneTransitionDirection
): Group67CheckpointId {
  if (scene === 'ph-animation') {
    return direction === 1 ? 'lab-to-ph' : 'ph-to-education';
  }
  return direction === 1 ? 'education-to-crane' : 'crane-to-contact';
}

function sceneIndex(scene: Group67PhoneSceneId): number {
  return group67PhoneSceneIds.indexOf(scene);
}

function setEndpointRetained(
  handle: PhoneSceneAdapterHandle | null,
  retained: boolean
): void {
  const root = handle?.root() ?? null;
  if (!root) return;
  root.inert = true;
  root.setAttribute('aria-hidden', 'true');
  if (retained) root.dataset.phoneLabContactEndpoint = 'retained';
  else delete root.dataset.phoneLabContactEndpoint;
}

function stageLandingY(
  phase: HTMLElement,
  direction: PhoneTransitionDirection
): number {
  const top = window.scrollY + phase.getBoundingClientRect().top;
  return direction === 1 ? top : Math.max(0, top - window.innerHeight);
}

export function phoneGroup67BoundaryPosition(
  phaseTop: number,
  viewportHeight: number,
  direction: PhoneTransitionDirection
): number {
  return direction === 1
    ? Math.max(0, phaseTop - viewportHeight * 0.85)
    : Math.max(0, phaseTop);
}

export function PhoneLabContactContinuation({
  reducedMotion,
  stageHost,
  entryScene = 'ph-animation',
  fromLabBoundary = false,
  labBoundary = null,
  onCheckpoint,
  onEdgeScene,
  onSceneChange,
  onStageSceneChange
}: PhoneLabContactContinuationProps) {
  const [focus, setFocus] = useState<Group67AdapterFocus>(
    fromLabBoundary ? 'lab' : entryScene
  );
  const [activeScene, setActiveScene] = useState<ContinuationScene>(
    fromLabBoundary ? 'lab' : entryScene
  );
  const [stageScene, setStageScene] = useState<VisualScene | null>(null);
  const [prewarmScene, setPrewarmScene] = useState<VisualScene | null>(null);
  const [adapterRevision, setAdapterRevision] = useState(0);
  const adapters = usePhoneGroup67Adapters(focus);
  const rootRef = useRef<HTMLElement | null>(null);
  const phPhaseRef = useRef<HTMLElement | null>(null);
  const cranePhaseRef = useRef<HTMLElement | null>(null);
  const phStageRef = useRef<HTMLDivElement | null>(null);
  const craneStageRef = useRef<HTMLDivElement | null>(null);
  const educationSlotRef = useRef<HTMLElement | null>(null);
  const contactSlotRef = useRef<HTMLElement | null>(null);
  const labBoundaryRef = useRef<PhoneLabBoundary | null>(labBoundary);
  const currentSceneRef = useRef<ContinuationScene>(activeScene);
  const runRef = useRef<VisualRun | null>(null);
  const phasesRef = useRef<Record<
    VisualScene,
    PhoneLabContactCinematicRunState
  >>({
    'ph-animation': 'initial',
    'crane-animation': 'initial'
  });
  const readyRef = useRef(new Set<string>());
  const handlesRef = useRef<Group67Handles>({
    ph: null,
    education: null,
    crane: null,
    contact: null,
    labPh: null,
    phEducation: null,
    educationCrane: null,
    craneContact: null
  });
  const handles = handlesRef.current;
  const cancelTargetPreparationRef = useRef<(() => void) | null>(null);
  const dissolveFrameRef = useRef(0);
  const mediaTimeoutRef = useRef(0);
  const cancelInkRef = useRef<(() => void) | undefined>(undefined);
  const scheduleRef = useRef<(() => void) | null>(null);
  const directTriggeredRef = useRef(false);
  labBoundaryRef.current = labBoundary;

  const publishAdapterRevision = useCallback(() => {
    setAdapterRevision((revision) => revision + 1);
  }, []);
  const bindings = useMemo(() => {
    const bind = <K extends keyof Group67Handles>(key: K) => (
      next: Group67Handles[K]
    ) => {
      if (handles[key] === next) return;
      handles[key] = next;
      if (next) publishAdapterRevision();
    };
    return {
      ph: bind('ph'),
      education: bind('education'),
      crane: bind('crane'),
      contact: bind('contact'),
      labPh: bind('labPh'),
      phEducation: bind('phEducation'),
      educationCrane: bind('educationCrane'),
      craneContact: bind('craneContact')
    };
  }, [handles, publishAdapterRevision]);
  const ready = useMemo(() => {
    const mark = (id: string) => () => {
      if (readyRef.current.has(id)) return;
      readyRef.current.add(id);
      publishAdapterRevision();
    };
    return {
      ph: mark('ph-animation'),
      education: mark('education'),
      crane: mark('crane-animation'),
      contact: mark('contact'),
      labPh: mark('lab-ph'),
      phEducation: mark('ph-education'),
      educationCrane: mark('education-crane'),
      craneContact: mark('crane-contact')
    };
  }, [publishAdapterRevision]);

  const publishScene = useCallback((scene: ContinuationScene) => {
    onEdgeScene?.(phoneGroup67EdgeScene(scene));
    if (currentSceneRef.current === scene) return;
    currentSceneRef.current = scene;
    setActiveScene(scene);
    if (scene !== 'lab') {
      onSceneChange?.(scene);
      onCheckpoint?.(phoneGroup67CheckpointForScene(scene));
    }
  }, [onCheckpoint, onEdgeScene, onSceneChange]);

  const publishStageScene = useCallback((scene: VisualScene | null) => {
    setStageScene(scene);
    onStageSceneChange?.(scene);
  }, [onStageSceneChange]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const inputOwner = root.closest<HTMLElement>(
      'main.portrait-scroll-spike'
    ) ?? root;
    let scrollFrame = 0;

    const clearMediaTimeout = () => {
      if (!mediaTimeoutRef.current) return;
      window.clearTimeout(mediaTimeoutRef.current);
      mediaTimeoutRef.current = 0;
    };
    const clearDissolve = () => {
      if (!dissolveFrameRef.current) return;
      window.cancelAnimationFrame(dissolveFrameRef.current);
      dissolveFrameRef.current = 0;
    };
    const phaseFor = (scene: VisualScene) => (
      scene === 'ph-animation' ? phPhaseRef.current : cranePhaseRef.current
    );
    const handleFor = (scene: VisualScene) => (
      scene === 'ph-animation' ? handles.ph : handles.crane
    );
    const incomingFor = (scene: VisualScene) => (
      scene === 'ph-animation' ? handles.labPh : handles.educationCrane
    );
    const outgoingFor = (scene: VisualScene) => (
      scene === 'ph-animation'
        ? handles.phEducation
        : handles.craneContact
    );
    const downstreamFor = (scene: VisualScene) => (
      scene === 'ph-animation' ? handles.education : handles.contact
    );
    const upstreamFor = (scene: VisualScene) => (
      scene === 'ph-animation'
        ? labBoundaryRef.current?.adapter ?? null
        : handles.education
    );
    const sceneIsReady = (scene: Group67PhoneSceneId) => (
      readyRef.current.has(scene)
      && Boolean({
        'ph-animation': handles.ph,
        education: handles.education,
        'crane-animation': handles.crane,
        contact: handles.contact
      }[scene]?.root())
    );
    const transitionIsReady = (id: string) => (
      readyRef.current.has(id)
      && Boolean({
        'lab-ph': handles.labPh,
        'ph-education': handles.phEducation,
        'education-crane': handles.educationCrane,
        'crane-contact': handles.craneContact
      }[id])
    );
    const runIsReady = (run: VisualRun) => {
      return phoneGroup67RunIsReady(run.scene, run.direct, {
        labBoundary: Boolean(labBoundaryRef.current?.root),
        ph: sceneIsReady('ph-animation'),
        education: sceneIsReady('education'),
        crane: sceneIsReady('crane-animation'),
        contact: sceneIsReady('contact'),
        labPh: transitionIsReady('lab-ph'),
        phEducation: transitionIsReady('ph-education'),
        educationCrane: transitionIsReady('education-crane'),
        craneContact: transitionIsReady('crane-contact')
      });
    };
    const setNativeOwner = (scene: 'lab' | 'education' | 'contact' | null) => {
      const lab = labBoundaryRef.current?.adapter;
      if (scene === 'lab') lab?.enter?.();
      else if (lab) lab.leave?.();
      if (scene === 'education') handles.education?.enter?.();
      else handles.education?.leave?.();
      if (scene === 'contact') handles.contact?.enter?.();
      else handles.contact?.leave?.();
    };
    const retainEndpoint = (scene: VisualScene) => {
      const handle = handleFor(scene);
      const retained = scene === 'ph-animation'
        ? phoneLabContactRetainsPhTerminal(phasesRef.current[scene])
        : phoneLabContactRetainsCraneTerminal(phasesRef.current[scene]);
      setEndpointRetained(handle, retained);
    };
    const finishRun = (
      scene: VisualScene,
      direction: PhoneTransitionDirection
    ) => {
      const run = runRef.current;
      const phase = phaseFor(scene);
      if (
        !run
        || run.scene !== scene
        || run.direction !== direction
        || !run.session.valid()
        || !phase
      ) return;
      clearMediaTimeout();
      clearDissolve();
      cancelTargetPreparationRef.current?.();
      cancelTargetPreparationRef.current = null;
      const target = phoneGroup67RunTarget(scene, direction);
      if (import.meta.env.DEV) {
        root.dataset.phoneGroup67CompleteHandoff =
          `${scene}-${target}:complete:${direction === 1 ? 'forward' : 'reverse'}`;
        delete root.dataset.phoneGroup67MediaRetry;
      }
      if (scene === 'ph-animation') {
        if (direction === 1) {
          handles.phEducation?.leave?.();
          retainEndpoint(scene);
        } else {
          handles.ph?.leave?.();
          handles.labPh?.enter?.();
          handles.labPh?.render(0);
        }
      } else if (direction === 1) {
        handles.craneContact?.leave?.();
        retainEndpoint(scene);
      } else {
        handles.crane?.leave?.();
        handles.educationCrane?.enter?.();
        handles.educationCrane?.render(0);
      }
      setNativeOwner(
        target === 'lab' || target === 'education' || target === 'contact'
          ? target
          : null
      );
      const landingY = stageLandingY(phase, direction);
      runRef.current = null;
      cancelInkRef.current = undefined;
      root.dataset.phoneGroup67Run = 'idle';
      if (import.meta.env.DEV) root.dataset.phoneGroup67Step = 'idle';
      setPrewarmScene(null);
      publishStageScene(null);
      publishScene(target);
      setFocus(target);
      run.session.complete(landingY);
      scheduleRef.current?.();
    };
    const runDissolve = (
      run: VisualRun,
      start: number,
      end: number,
      onComplete: () => void
    ) => {
      clearDissolve();
      const transition = outgoingFor(run.scene);
      if (!transition) return;
      transition.render(start);
      let startedAt = -1;
      const tick = (now: number) => {
        dissolveFrameRef.current = 0;
        if (runRef.current !== run || !run.session.valid()) return;
        if (startedAt < 0) startedAt = now;
        const progress = Math.min(
          1,
          Math.max(0, (now - startedAt) / INTRA_CHAPTER_DISSOLVE_MS)
        );
        transition.render(start + (end - start) * progress);
        if (import.meta.env.DEV) {
          root.dataset.phoneGroup67Dissolve = progress.toFixed(4);
        }
        if (progress >= 1) {
          onComplete();
          return;
        }
        dissolveFrameRef.current = window.requestAnimationFrame(tick);
      };
      dissolveFrameRef.current = window.requestAnimationFrame(tick);
    };
    const abortRunToSource = (run: VisualRun) => {
      if (runRef.current !== run || !run.session.valid()) return;
      clearMediaTimeout();
      clearDissolve();
      cancelTargetPreparationRef.current?.();
      cancelTargetPreparationRef.current = null;
      const phase = phaseFor(run.scene);
      const source = run.direction === 1
        ? run.scene === 'ph-animation' ? 'lab' : 'education'
        : run.scene === 'ph-animation' ? 'education' : 'contact';
      const endpoint = run.direction === 1 ? 0 : 1;
      handleFor(run.scene)?.update(endpoint);
      outgoingFor(run.scene)?.render(endpoint);
      if (!run.direct) incomingFor(run.scene)?.render(endpoint);
      phasesRef.current[run.scene] = run.direction === 1
        ? 'initial'
        : 'complete';
      const sourceY = phase
        ? phoneGroup67BoundaryPosition(
            window.scrollY + phase.getBoundingClientRect().top,
            window.innerHeight,
            run.direction
          )
        : window.scrollY;
      const cancelInk = cancelInkRef.current;
      cancelInkRef.current = undefined;
      runRef.current = null;
      root.dataset.phoneGroup67Run = 'idle';
      if (import.meta.env.DEV) {
        root.dataset.phoneGroup67Step = 'idle';
        root.dataset.phoneGroup67MediaRetry = run.scene;
      }
      setPrewarmScene(null);
      if (run.direct) {
        publishStageScene(run.scene);
        publishScene(run.scene);
        setFocus(run.scene);
      } else {
        setNativeOwner(source);
        publishStageScene(null);
        publishScene(source);
        setFocus(source);
      }
      releasePhoneGroup67FailedSession(run.session, sourceY, cancelInk);
      scheduleRef.current?.();
    };
    const armMediaTimeout = (run: VisualRun) => {
      clearMediaTimeout();
      mediaTimeoutRef.current = window.setTimeout(() => {
        if (runRef.current !== run || !run.session.valid()) return;
        abortRunToSource(run);
      }, PHONE_GROUP67_MEDIA_TIMEOUT_MS);
    };
    const startMedia = (run: VisualRun) => {
      if (runRef.current !== run || !run.session.valid()) return;
      const phase = phaseFor(run.scene);
      const handle = handleFor(run.scene);
      const outgoing = outgoingFor(run.scene);
      if (!phase || !handle || !outgoing) return;
      run.step = 'media';
      if (import.meta.env.DEV) {
        delete root.dataset.phoneGroup67MediaRetry;
        root.dataset.phoneGroup67Step = `${run.scene}:media`;
      }
      run.session.moveTo(
        window.scrollY + phase.getBoundingClientRect().top
      );
      setNativeOwner(null);
      publishStageScene(run.scene);
      publishScene(run.scene);
      onCheckpoint?.(phoneGroup67CheckpointForScene(run.scene));
      if (run.scene === 'crane-animation') {
        handles.ph?.leave?.();
        setEndpointRetained(handles.ph, false);
      }
      if (run.direction === 1) {
        outgoing.enter?.();
        handle.enter?.();
      } else if (run.scene === 'ph-animation') {
        outgoing.reverse?.();
        runDissolve(
          run,
          1,
          PHONE_PH_EDUCATION_ANIMATION_STOP,
          () => {
            if (runRef.current === run && run.session.valid()) {
              handle.reverse?.();
              armMediaTimeout(run);
            }
          }
        );
        return;
      } else {
        outgoing.reverse?.();
        handle.reverse?.();
      }
      armMediaTimeout(run);
    };
    const commitReducedRun = (run: VisualRun) => {
      const endpoint = phoneGroup67VisibleFallbackEndpoint(run.direction);
      handleFor(run.scene)?.update(endpoint);
      outgoingFor(run.scene)?.render(endpoint);
      if (!run.direct) incomingFor(run.scene)?.render(endpoint);
      phasesRef.current[run.scene] =
        phoneLabContactPhaseAfterVisualCompletion(run.direction);
      finishRun(run.scene, run.direction);
    };
    const startPreparedRun = (run: VisualRun) => {
      if (runRef.current !== run || !run.session.valid()) return;
      if (run.direction === -1) {
        downstreamFor(run.scene)?.leave?.();
      } else {
        upstreamFor(run.scene)?.leave?.();
      }
      setPrewarmScene(null);
      publishStageScene(run.scene);
      publishScene(run.scene);
      if (reducedMotion) {
        commitReducedRun(run);
        return;
      }
      if (run.direction === -1 || run.direct) {
        startMedia(run);
        return;
      }
      const incoming = incomingFor(run.scene);
      if (!incoming) return;
      run.step = 'entry-ink';
      if (import.meta.env.DEV) {
        root.dataset.phoneGroup67Step = `${run.scene}:entry-ink`;
      }
      incoming.enter?.();
      cancelInkRef.current = runPhoneTimedTransition(
        run.session,
        1,
        (progress) => incoming.render(progress),
        () => {
          cancelInkRef.current = undefined;
          incoming.leave?.();
          startMedia(run);
        }
      );
    };
    const prepareRun = (run: VisualRun) => {
      if (
        runRef.current !== run
        || !run.session.valid()
        || cancelTargetPreparationRef.current
      ) return;
      run.step = 'preparing';
      if (import.meta.env.DEV) {
        root.dataset.phoneGroup67Step = `${run.scene}:preparing`;
      }
      cancelTargetPreparationRef.current = runPhoneTargetPreparation(
        () => runRef.current === run
          && run.step === 'preparing'
          && run.session.valid(),
        () => runIsReady(run),
        () => handleFor(run.scene),
        run.direction === 1 ? 0 : 1,
        run.direction,
        `phone-group67-${run.scene}`,
        () => {
          cancelTargetPreparationRef.current = null;
          if (import.meta.env.DEV) {
            delete root.dataset.phoneGroup67MediaRetry;
          }
          startPreparedRun(run);
        },
        () => {
          cancelTargetPreparationRef.current = null;
          abortRunToSource(run);
        }
      );
    };
    const beginVisualRun = (
      scene: VisualScene,
      direction: PhoneTransitionDirection,
      session: PhoneTransitionSession,
      direct: boolean
    ): boolean => {
      if (
        runRef.current
        || !session.valid()
        || !phoneLabContactCanBeginVisualRun(
          phasesRef.current[scene],
          direction
        )
        || (direction === -1 && direct)
      ) return false;
      const phase = phaseFor(scene);
      if (!phase) return false;
      const run: VisualRun = {
        scene,
        direction,
        session,
        direct,
        step: 'preparing'
      };
      runRef.current = run;
      phasesRef.current[scene] = direction === 1 ? 'forward' : 'reverse';
      setFocus(scene);
      onCheckpoint?.(checkpointForBoundary(scene, direction));
      root.dataset.phoneGroup67Run =
        `${scene}:${direction === 1 ? 'forward' : 'reverse'}`;
      if (import.meta.env.DEV) {
        root.dataset.phoneGroup67Step = `${scene}:preparing`;
      }
      setPrewarmScene(scene);
      prepareRun(run);
      return true;
    };
    const onAutoplay = (event: Event) => {
      const detail = (
        event as CustomEvent<PhoneLabContactAutoplayEventDetail>
      ).detail;
      const run = runRef.current;
      if (
        !detail
        || !run
        || run.scene !== detail.scene
        || run.direction !== detail.direction
        || !run.session.valid()
      ) return;
      if (detail.phase === 'playing') {
        armMediaTimeout(run);
        return;
      }
      if (detail.phase === 'failed') {
        abortRunToSource(run);
        return;
      }
      if (
        detail.phase === 'progress'
        && typeof detail.progress === 'number'
        && Number.isFinite(detail.progress)
      ) {
        const progress = Math.min(1, Math.max(0, detail.progress));
        if (import.meta.env.DEV) {
          root.dataset.phoneGroup67Progress =
            `${detail.scene}:${detail.direction}:${progress.toFixed(4)}`;
        }
        if (detail.scene === 'crane-animation') {
          handles.craneContact?.render(progress);
        }
        return;
      }
      if (detail.phase !== 'complete') return;
      clearMediaTimeout();
      phasesRef.current[run.scene] =
        phoneLabContactPhaseAfterVisualCompletion(run.direction);
      if (run.direction === 1 && run.scene === 'ph-animation') {
        runDissolve(
          run,
          PHONE_PH_EDUCATION_ANIMATION_STOP,
          1,
          () => finishRun(run.scene, run.direction)
        );
        return;
      }
      if (run.direction === -1 && !run.direct) {
        const incoming = incomingFor(run.scene);
        if (!incoming) return;
        run.step = 'exit-ink';
        if (import.meta.env.DEV) {
          root.dataset.phoneGroup67Step = `${run.scene}:exit-ink`;
        }
        incoming.reverse?.();
        cancelInkRef.current = runPhoneTimedTransition(
          run.session,
          -1,
          (progress) => incoming.render(progress),
          () => {
            cancelInkRef.current = undefined;
            finishRun(run.scene, run.direction);
          }
        );
        return;
      }
      finishRun(run.scene, run.direction);
    };
    const registrations = (
      ['ph-animation', 'crane-animation'] as const
    ).map((scene) => registerPhoneTransitionBoundary(inputOwner, {
      position: (direction) => {
        const phase = phaseFor(scene);
        if (!phase) return null;
        const top = window.scrollY + phase.getBoundingClientRect().top;
        return phoneGroup67BoundaryPosition(
          top,
          window.innerHeight,
          direction
        );
      },
      canStart: (direction) => {
        const direct = !fromLabBoundary && entryScene === scene;
        return !runRef.current
          && !(direction === -1 && direct)
          && phoneLabContactCanBeginVisualRun(
            phasesRef.current[scene],
            direction
          );
      },
      start: (direction, session) => beginVisualRun(
        scene,
        direction,
        session,
        !fromLabBoundary && entryScene === scene
      )
    }));
    const renderDocumentOwner = () => {
      scrollFrame = 0;
      if (runRef.current) return;
      const midpoint = window.innerHeight * 0.5;
      const reading: readonly [
        Extract<ContinuationScene, 'education' | 'contact'>,
        HTMLElement | null
      ][] = [
        ['contact', contactSlotRef.current],
        ['education', educationSlotRef.current]
      ];
      const next = reading.find(([, element]) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.top <= midpoint && rect.bottom >= midpoint;
      })?.[0];
      if (next) publishScene(next);
    };
    const schedule = () => {
      if (!scrollFrame) {
        scrollFrame = window.requestAnimationFrame(renderDocumentOwner);
      }
    };
    scheduleRef.current = schedule;
    inputOwner.addEventListener(PHONE_LAB_CONTACT_AUTOPLAY_EVENT, onAutoplay);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    schedule();
    let directFrame = 0;
    if (
      !fromLabBoundary
      && (entryScene === 'ph-animation' || entryScene === 'crane-animation')
      && !directTriggeredRef.current
    ) {
      directTriggeredRef.current = true;
      const index = entryScene === 'ph-animation' ? 0 : 1;
      directFrame = window.requestAnimationFrame(() => {
        registrations[index]?.trigger(1);
      });
    }
    return () => {
      const interruptedRun = runRef.current;
      if (interruptedRun?.session.valid()) {
        const source = interruptedRun.direction === 1
          ? interruptedRun.scene === 'ph-animation' ? 'lab' : 'education'
          : interruptedRun.scene === 'ph-animation' ? 'education' : 'contact';
        phasesRef.current[interruptedRun.scene] =
          interruptedRun.direction === 1 ? 'initial' : 'complete';
        handleFor(interruptedRun.scene)?.update(
          interruptedRun.direction === 1 ? 0 : 1
        );
        outgoingFor(interruptedRun.scene)?.render(
          interruptedRun.direction === 1 ? 0 : 1
        );
        if (!interruptedRun.direct) {
          incomingFor(interruptedRun.scene)?.render(
            interruptedRun.direction === 1 ? 0 : 1
          );
        }
        setNativeOwner(source);
        root.dataset.phoneGroup67Run = 'idle';
        if (import.meta.env.DEV) root.dataset.phoneGroup67Step = 'idle';
        runRef.current = null;
        publishStageScene(null);
        publishScene(source);
        interruptedRun.session.abort(window.scrollY);
      }
      inputOwner.removeEventListener(
        PHONE_LAB_CONTACT_AUTOPLAY_EVENT,
        onAutoplay
      );
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      for (const registration of registrations) registration.dispose();
      if (directFrame) window.cancelAnimationFrame(directFrame);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      cancelTargetPreparationRef.current?.();
      cancelTargetPreparationRef.current = null;
      clearMediaTimeout();
      clearDissolve();
      cancelInkRef.current?.();
      cancelInkRef.current = undefined;
      runRef.current = null;
      setPrewarmScene(null);
      directTriggeredRef.current = false;
      if (scheduleRef.current === schedule) scheduleRef.current = null;
    };
  }, [
    entryScene,
    fromLabBoundary,
    onCheckpoint,
    publishScene,
    publishStageScene,
    reducedMotion
  ]);

  useEffect(() => {
    scheduleRef.current?.();
  }, [adapterRevision, adapters.ready]);

  useEffect(() => {
    if (fromLabBoundary) {
      return;
    }
    if (entryScene === 'ph-animation' || entryScene === 'crane-animation') {
      return;
    }
    const handle = entryScene === 'education'
      ? handles.education
      : handles.contact;
    if (!handle || !readyRef.current.has(entryScene)) return;
    handle.update(1);
    handle.enter?.();
    publishScene(entryScene);
    const frame = window.requestAnimationFrame(() => {
      handle.root()?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [adapterRevision, entryScene, fromLabBoundary, publishScene]);

  useEffect(() => () => {
    Object.values(handles).forEach((handle) => handle?.dispose?.());
  }, []);

  const entryIndex = sceneIndex(entryScene);
  const mountPh = entryIndex <= sceneIndex('ph-animation');
  const mountEducation = entryIndex <= sceneIndex('education');
  const mountCrane = entryIndex <= sceneIndex('crane-animation');
  const mountContact = entryIndex <= sceneIndex('contact');
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
      data-phone-group67-stage-active={String(presentedStageScene !== null)}
      aria-hidden="true"
    >
      {mountPh && (
        <div
          ref={phStageRef}
          className="phone-group67__stage phone-group67__stage--ph"
          data-phone-group67-layer-active={String(
            presentedStageScene === 'ph-animation'
          )}
        >
          <div className="phone-group67__stage-canvas">
            {Ph ? (
              <Ph
                ref={bindings.ph}
                active={stageScene === 'ph-animation'}
                reducedMotion={reducedMotion}
                onReady={ready.ph}
              />
            ) : (
              <div className="phone-group67__stage-pending" aria-hidden="true" />
            )}
          </div>
          {LabPh && fromLabBoundary && labBoundary && handles.ph?.root() && (
            <LabPh
              ref={bindings.labPh}
              host={phStageRef.current}
              from={labBoundary.root}
              to={handles.ph.root()}
              reducedMotion={reducedMotion}
              onReady={ready.labPh}
            />
          )}
          {PhEducation
            && handles.ph?.root()
            && handles.education?.root() && (
              <PhEducation
                ref={bindings.phEducation}
                host={phStageRef.current}
                from={handles.ph.root()}
                to={handles.education.root()}
                reducedMotion={reducedMotion}
                onReady={ready.phEducation}
              />
            )}
        </div>
      )}
      {mountCrane && (
        <div
          ref={craneStageRef}
          className="phone-group67__stage phone-group67__stage--crane"
          data-phone-group67-layer-active={String(
            presentedStageScene === 'crane-animation'
          )}
        >
          <div className="phone-group67__stage-canvas">
            {Crane ? (
              <Crane
                ref={bindings.crane}
                active={stageScene === 'crane-animation'}
                reducedMotion={reducedMotion}
                onReady={ready.crane}
              />
            ) : (
              <div className="phone-group67__stage-pending" aria-hidden="true" />
            )}
          </div>
          {EducationCrane
            && handles.education?.root()
            && handles.crane?.root() && (
              <EducationCrane
                ref={bindings.educationCrane}
                host={craneStageRef.current}
                from={handles.education.root()}
                to={handles.crane.root()}
                reducedMotion={reducedMotion}
                onReady={ready.educationCrane}
              />
            )}
          {CraneContact
            && handles.crane?.root()
            && handles.contact?.root() && (
              <CraneContact
                ref={bindings.craneContact}
                host={craneStageRef.current}
                from={handles.crane.root()}
                to={handles.contact.root()}
                reducedMotion={reducedMotion}
                onReady={ready.craneContact}
              />
            )}
        </div>
      )}
    </div>
  );

  return (
    <section
      ref={rootRef}
      className="phone-lab-contact-continuation"
      data-phone-continuation="lab-contact"
      data-phone-group67-entry={fromLabBoundary ? 'lab' : entryScene}
      data-phone-group67-active-scene={activeScene}
      data-phone-group67-stage-active={String(stageScene !== null)}
      data-phone-group67-adapters-ready={String(adapters.ready)}
      data-phone-group67-run="idle"
    >
      {stageHost ? createPortal(stageSurfaces, stageHost) : null}
      {mountPh && (
        <section
          id="ph-animation"
          ref={phPhaseRef}
          className="phone-lab-contact-continuation__phase phone-lab-contact-continuation__phase--ph"
          data-phone-story-chapter="lab-ph-education"
        />
      )}
      {mountEducation && (
        <section
          ref={educationSlotRef}
          className="phone-lab-contact__native phone-lab-contact-continuation__native"
          data-phone-acceptance-chapter="education"
          data-phone-story-chapter="education"
        >
          {Education ? (
            <Education
              ref={bindings.education}
              active={activeScene === 'education'}
              reducedMotion={reducedMotion}
              onReady={ready.education}
            />
          ) : (
            <div
              className="phone-lab-contact-continuation__native-pending phone-lab-contact-continuation__native-pending--education"
              aria-hidden="true"
            />
          )}
        </section>
      )}
      {mountCrane && (
        <section
          id="crane-animation"
          ref={cranePhaseRef}
          className="phone-lab-contact-continuation__phase phone-lab-contact-continuation__phase--crane"
          data-phone-story-chapter="education-crane-contact"
        />
      )}
      {mountContact && (
        <section
          ref={contactSlotRef}
          className="phone-lab-contact__native phone-lab-contact-continuation__native"
          data-phone-acceptance-chapter="contact"
          data-phone-story-chapter="contact"
        >
          {Contact ? (
            <Contact
              ref={bindings.contact}
              active={activeScene === 'contact'}
              reducedMotion={reducedMotion}
              onReady={ready.contact}
            />
          ) : (
            <div
              className="phone-lab-contact-continuation__native-pending phone-lab-contact-continuation__native-pending--contact"
              aria-hidden="true"
            />
          )}
        </section>
      )}
    </section>
  );
}

export default PhoneLabContactContinuation;
