import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefCallback
} from 'react';
import type { SceneId } from '../../story/types';
import { StoryNav } from '../StoryNav';
import { hashForScene, sceneFromHash } from '../navigation';
import {
  loadLabContactPhoneSceneAdapter
} from './scenes/lab-contact-loaders';
import {
  loadLabContactPhoneTransitionAdapter
} from './transitions/lab-contact-loaders';
import {
  labContactPhoneSceneAdapterIds,
  type LabContactPhoneSceneAdapterModule,
  type LabContactPhoneTransitionAdapterModule,
  type LabContactSceneId,
  type LabContactTransitionId
} from './lab-contact-types';
import {
  phoneLabContactPhaseFrame,
  phoneLabContactScrollProgress
} from './phone-lab-contact-timeline';
import { usePhoneAdapterHandleRef } from './phone-adapter-binding';
import type {
  PhoneSceneAdapterComponent,
  PhoneSceneAdapterHandle,
  PhoneTransitionAdapterComponent,
  PhoneTransitionAdapterHandle
} from './types';
import './PhoneLabContactShell.css';

export type { LabContactSceneId } from './lab-contact-types';

type LifecycleState = Readonly<{
  handle: PhoneSceneAdapterHandle;
  active: boolean;
}>;

function isLabContactScene(scene: SceneId | undefined): scene is LabContactSceneId {
  return Boolean(scene && labContactPhoneSceneAdapterIds.includes(scene as LabContactSceneId));
}

export function phoneLabContactEntryScene(hash: string): LabContactSceneId {
  const scene = sceneFromHash(hash);
  return isLabContactScene(scene) ? scene : 'lab';
}

function entrySceneFromHash(): LabContactSceneId {
  return typeof window === 'undefined'
    ? 'lab'
    : phoneLabContactEntryScene(window.location.hash);
}

export function phoneLabContactInitialAdapterPlan(
  entryScene: LabContactSceneId
): Readonly<{
  scenes: readonly LabContactSceneId[];
  transitions: readonly LabContactTransitionId[];
}> {
  return entryScene === 'lab'
    ? { scenes: ['lab', 'ph-animation'], transitions: ['lab-ph'] }
    : { scenes: [entryScene], transitions: [] };
}

function phoneMotionEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return new URLSearchParams(window.location.search)
    .get('portrait-spike-motion') !== 'reduce';
}

function setStageActive(stage: HTMLElement | null, active: boolean): void {
  if (!stage) return;
  stage.dataset.phoneAcceptanceStageActive = String(active);
}

function setVisualEndpoint(
  handle: PhoneSceneAdapterHandle | null,
  opacity: number
): void {
  const root = handle?.root();
  if (!root) return;
  const visible = opacity > 0.001;
  root.style.opacity = opacity.toFixed(4);
  root.style.visibility = visible ? 'visible' : 'hidden';
  root.style.pointerEvents = 'none';
  root.inert = true;
  root.setAttribute('aria-hidden', 'true');
}

function syncSceneLifecycle(
  states: Map<LabContactSceneId, LifecycleState>,
  scene: LabContactSceneId,
  handle: PhoneSceneAdapterHandle | null,
  active: boolean
): void {
  if (!handle) return;
  const previous = states.get(scene);
  if (previous?.handle === handle && previous.active === active) return;
  if (active) handle.enter?.();
  else handle.leave?.();
  states.set(scene, { handle, active });
}

function acceptanceNavigationTarget(scene: SceneId): LabContactSceneId {
  return isLabContactScene(scene) ? scene : 'lab';
}

function useLazyLabContactAdapters() {
  const [scenes, setScenes] = useState<Partial<Record<
    LabContactSceneId,
    LabContactPhoneSceneAdapterModule
  >>>({});
  const [transitions, setTransitions] = useState<Partial<Record<
    LabContactTransitionId,
    LabContactPhoneTransitionAdapterModule
  >>>({});
  const [failed, setFailed] = useState(false);
  const requestedScenes = useRef(new Set<LabContactSceneId>());
  const requestedTransitions = useRef(new Set<LabContactTransitionId>());

  const ensureScene = useCallback((id: LabContactSceneId) => {
    if (requestedScenes.current.has(id)) return;
    requestedScenes.current.add(id);
    void loadLabContactPhoneSceneAdapter(id).then(
      (adapter) => {
        setScenes((current) => ({ ...current, [id]: adapter }));
      },
      () => setFailed(true)
    );
  }, []);

  const ensureTransition = useCallback((id: LabContactTransitionId) => {
    if (requestedTransitions.current.has(id)) return;
    requestedTransitions.current.add(id);
    void loadLabContactPhoneTransitionAdapter(id).then(
      (adapter) => {
        setTransitions((current) => ({ ...current, [id]: adapter }));
      },
      () => setFailed(true)
    );
  }, []);

  return { scenes, transitions, failed, ensureScene, ensureTransition };
}

type SceneMountProps = Readonly<{
  adapter: LabContactPhoneSceneAdapterModule | undefined;
  active: boolean;
  reducedMotion: boolean;
  bind: RefCallback<PhoneSceneAdapterHandle>;
  onReady: () => void;
  pendingLabel: string;
}>;

function SceneMount({
  adapter,
  active,
  reducedMotion,
  bind,
  onReady,
  pendingLabel
}: SceneMountProps) {
  if (!adapter) {
    return <p className="phone-lab-contact__pending" aria-live="polite">{pendingLabel}</p>;
  }
  const Component = adapter.Component as PhoneSceneAdapterComponent;
  return (
    <Component
      ref={bind}
      active={active}
      reducedMotion={reducedMotion}
      onReady={onReady}
    />
  );
}

type TransitionMountProps = Readonly<{
  adapter: LabContactPhoneTransitionAdapterModule | undefined;
  host: HTMLElement | null;
  from: HTMLElement | null;
  to: HTMLElement | null;
  reducedMotion: boolean;
  bind: RefCallback<PhoneTransitionAdapterHandle>;
  onReady: () => void;
}>;

function TransitionMount({
  adapter,
  host,
  from,
  to,
  reducedMotion,
  bind,
  onReady
}: TransitionMountProps) {
  if (!adapter?.Component || !from || !to) return null;
  const Component = adapter.Component as PhoneTransitionAdapterComponent;
  return (
    <Component
      ref={bind}
      host={host}
      from={from}
      to={to}
      reducedMotion={reducedMotion}
      onReady={onReady}
    />
  );
}

export type PhoneLabContactShellProps = Readonly<{
  validationMode: 'v36';
}>;

/**
 * Physical-device acceptance composition for the independently migrated
 * back-half. It deliberately starts at Lab and keeps the normal PhoneStory
 * shell untouched until the final Unit 7 story integration is approved.
 */
export function PhoneLabContactShell({ validationMode }: PhoneLabContactShellProps) {
  const [entryScene, setEntryScene] = useState<LabContactSceneId>(entrySceneFromHash);
  const [navigationScene, setNavigationScene] = useState<SceneId>(entryScene);
  const [navigationMenuOpen, setNavigationMenuOpen] = useState(false);
  const [activeScene, setActiveScene] = useState<LabContactSceneId>(entryScene);
  const [adapterRevision, setAdapterRevision] = useState(0);
  const rootRef = useRef<HTMLElement | null>(null);
  const phPhaseRef = useRef<HTMLElement | null>(null);
  const cranePhaseRef = useRef<HTMLElement | null>(null);
  const phStageRef = useRef<HTMLDivElement | null>(null);
  const craneStageRef = useRef<HTMLDivElement | null>(null);
  const educationSlotRef = useRef<HTMLElement | null>(null);
  const contactSlotRef = useRef<HTMLElement | null>(null);
  const lifecycleStates = useRef(new Map<LabContactSceneId, LifecycleState>());
  const currentNavigationScene = useRef<SceneId>(entryScene);
  const currentActiveScene = useRef<LabContactSceneId>(entryScene);
  const motionEnabled = phoneMotionEnabled();
  const reducedMotion = !motionEnabled;
  const fullJourney = entryScene === 'lab';
  const {
    scenes,
    transitions,
    failed,
    ensureScene,
    ensureTransition
  } = useLazyLabContactAdapters();
  const publishAdapterRevision = useCallback(() => {
    setAdapterRevision((revision) => revision + 1);
  }, []);
  const [labRef, bindLab] = usePhoneAdapterHandleRef<PhoneSceneAdapterHandle>(
    publishAdapterRevision
  );
  const [phRef, bindPh] = usePhoneAdapterHandleRef<PhoneSceneAdapterHandle>(
    publishAdapterRevision
  );
  const [educationRef, bindEducation] = usePhoneAdapterHandleRef<PhoneSceneAdapterHandle>(
    publishAdapterRevision
  );
  const [craneRef, bindCrane] = usePhoneAdapterHandleRef<PhoneSceneAdapterHandle>(
    publishAdapterRevision
  );
  const [contactRef, bindContact] = usePhoneAdapterHandleRef<PhoneSceneAdapterHandle>(
    publishAdapterRevision
  );
  const [labPhRef, bindLabPh] = usePhoneAdapterHandleRef<PhoneTransitionAdapterHandle>(
    publishAdapterRevision
  );
  const [phEducationRef, bindPhEducation] = usePhoneAdapterHandleRef<PhoneTransitionAdapterHandle>(
    publishAdapterRevision
  );
  const [educationCraneRef, bindEducationCrane] = usePhoneAdapterHandleRef<PhoneTransitionAdapterHandle>(
    publishAdapterRevision
  );
  const [craneContactRef, bindCraneContact] = usePhoneAdapterHandleRef<PhoneTransitionAdapterHandle>(
    publishAdapterRevision
  );

  const publishNavigationScene = useCallback((scene: SceneId) => {
    if (currentNavigationScene.current === scene) return;
    currentNavigationScene.current = scene;
    setNavigationScene(scene);
  }, []);

  const publishActiveScene = useCallback((scene: LabContactSceneId) => {
    if (currentActiveScene.current === scene) return;
    currentActiveScene.current = scene;
    setActiveScene(scene);
  }, []);

  useEffect(() => {
    const documentElement = document.documentElement;
    documentElement.dataset.phoneLabContactAcceptance = 'true';
    // v36 intentionally bypasses Loader → Proof, so retire the HTML recovery
    // loader as soon as this independent acceptance shell owns the document.
    document.getElementById('story-loader-static')?.remove();
    return () => {
      delete documentElement.dataset.phoneLabContactAcceptance;
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const next = entrySceneFromHash();
      setEntryScene(next);
      publishNavigationScene(next);
      publishActiveScene(next);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [publishActiveScene, publishNavigationScene]);

  useEffect(() => {
    const plan = phoneLabContactInitialAdapterPlan(entryScene);
    for (const scene of plan.scenes) ensureScene(scene);
    for (const transition of plan.transitions) ensureTransition(transition);
  }, [ensureScene, ensureTransition, entryScene]);

  useEffect(() => {
    if (fullJourney) return;
    const handle = {
      'ph-animation': phRef.current,
      education: educationRef.current,
      'crane-animation': craneRef.current,
      contact: contactRef.current,
      lab: labRef.current
    }[entryScene];
    if (!handle) return;
    syncSceneLifecycle(lifecycleStates.current, entryScene, handle, true);
    handle.update(1);
    if (entryScene === 'ph-animation' || entryScene === 'crane-animation') {
      setVisualEndpoint(handle, 1);
    }
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(entryScene)?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [adapterRevision, entryScene, fullJourney]);

  useEffect(() => {
    if (!fullJourney) return;
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(render);
    };
    const render = () => {
      frame = 0;
      const viewportHeight = Math.max(1, window.innerHeight);
      const phPhase = phPhaseRef.current;
      const cranePhase = cranePhaseRef.current;
      const educationSlot = educationSlotRef.current;
      const contactSlot = contactSlotRef.current;
      if (!phPhase || !cranePhase || !educationSlot || !contactSlot) return;

      const phRect = phPhase.getBoundingClientRect();
      const craneRect = cranePhase.getBoundingClientRect();
      const phInRange = phRect.top <= 0 && phRect.bottom >= viewportHeight;
      const craneInRange = craneRect.top <= 0 && craneRect.bottom >= viewportHeight;
      const userHasScrolled = window.scrollY > 1;
      const phFrame = phoneLabContactPhaseFrame(
        phoneLabContactScrollProgress(phRect.top, phPhase.offsetHeight, viewportHeight),
        reducedMotion
      );
      const craneFrame = phoneLabContactPhaseFrame(
        phoneLabContactScrollProgress(craneRect.top, cranePhase.offsetHeight, viewportHeight),
        reducedMotion
      );

      const lab = labRef.current;
      const ph = phRef.current;
      const education = educationRef.current;
      const crane = craneRef.current;
      const contact = contactRef.current;

      if (userHasScrolled && (phInRange || phFrame.progress > 0.05)) {
        ensureScene('education');
      }
      if (userHasScrolled && phFrame.progress > 0.56) {
        ensureTransition('ph-education');
      }
      if (
        userHasScrolled
        && educationSlot.getBoundingClientRect().bottom < viewportHeight * 2.2
      ) {
        ensureScene('crane-animation');
        ensureTransition('education-crane');
      }
      if (userHasScrolled && craneInRange && craneFrame.progress > 0.22) {
        ensureScene('contact');
        ensureTransition('crane-contact');
      }

      if (phInRange) {
        publishNavigationScene('ph-animation');
        publishActiveScene('ph-animation');
        setStageActive(phStageRef.current, phFrame.stageActive);
        syncSceneLifecycle(lifecycleStates.current, 'lab', lab, phFrame.handoffProgress < 1);
        syncSceneLifecycle(lifecycleStates.current, 'ph-animation', ph, phFrame.stageActive);

        if (phFrame.handoffProgress < 1) {
          labPhRef.current?.render(phFrame.handoffProgress);
          if (!labPhRef.current) setVisualEndpoint(ph, phFrame.handoffProgress);
        } else if (phFrame.arrivalProgress > 0) {
          phEducationRef.current?.render(phFrame.arrivalProgress);
          if (!phEducationRef.current) {
            ph?.update(1);
            setVisualEndpoint(ph, 1 - phFrame.arrivalProgress);
          }
        } else {
          setVisualEndpoint(ph, 1);
          ph?.update(phFrame.sceneProgress);
        }

        if (!phFrame.stageActive) {
          setVisualEndpoint(ph, 0);
          syncSceneLifecycle(lifecycleStates.current, 'education', education, true);
        }
      } else if (phRect.bottom < viewportHeight) {
        setStageActive(phStageRef.current, false);
        setVisualEndpoint(ph, 0);
      }

      if (craneInRange) {
        publishNavigationScene('crane-animation');
        publishActiveScene('crane-animation');
        setStageActive(craneStageRef.current, craneFrame.stageActive);
        syncSceneLifecycle(lifecycleStates.current, 'education', education, craneFrame.handoffProgress < 1);
        syncSceneLifecycle(lifecycleStates.current, 'crane-animation', crane, craneFrame.stageActive);

        if (craneFrame.handoffProgress < 1) {
          educationCraneRef.current?.render(craneFrame.handoffProgress);
          if (!educationCraneRef.current) setVisualEndpoint(crane, craneFrame.handoffProgress);
        } else if (craneFrame.arrivalProgress > 0) {
          craneContactRef.current?.render(craneFrame.arrivalProgress);
          if (!craneContactRef.current) {
            crane?.update(1);
            setVisualEndpoint(crane, 1 - craneFrame.arrivalProgress);
          }
        } else {
          setVisualEndpoint(crane, 1);
          crane?.update(craneFrame.sceneProgress);
        }

        if (!craneFrame.stageActive) {
          setVisualEndpoint(crane, 0);
          syncSceneLifecycle(lifecycleStates.current, 'contact', contact, true);
        }
      } else if (craneRect.bottom < viewportHeight) {
        setStageActive(craneStageRef.current, false);
        setVisualEndpoint(crane, 0);
      }

      const contactTop = contactSlot.getBoundingClientRect().top;
      const educationTop = educationSlot.getBoundingClientRect().top;
      if (contactTop <= viewportHeight * 0.42) {
        publishNavigationScene('contact');
        publishActiveScene('contact');
        syncSceneLifecycle(lifecycleStates.current, 'contact', contact, true);
      } else if (!craneInRange && craneRect.top <= viewportHeight * 0.42) {
        publishNavigationScene('crane-animation');
      } else if (!phInRange && educationTop <= viewportHeight * 0.42) {
        publishNavigationScene('education');
        publishActiveScene('education');
        syncSceneLifecycle(lifecycleStates.current, 'education', education, true);
      } else if (!phInRange && phRect.top > viewportHeight * 0.42) {
        publishNavigationScene('lab');
        publishActiveScene('lab');
        syncSceneLifecycle(lifecycleStates.current, 'lab', lab, true);
      }
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    render();
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [
    adapterRevision,
    ensureScene,
    ensureTransition,
    fullJourney,
    publishActiveScene,
    publishNavigationScene,
    reducedMotion
  ]);

  useEffect(() => () => {
    for (const state of lifecycleStates.current.values()) state.handle.dispose?.();
    labPhRef.current?.dispose?.();
    phEducationRef.current?.dispose?.();
    educationCraneRef.current?.dispose?.();
    craneContactRef.current?.dispose?.();
  }, []);

  const navigate = useCallback((scene: SceneId) => {
    setNavigationMenuOpen(false);
    const target = acceptanceNavigationTarget(scene);
    const destination = new URL(window.location.href);
    destination.searchParams.set('v', '36');
    destination.hash = hashForScene(target);
    window.location.assign(destination.toString());
  }, []);

  const directAdapter = scenes[entryScene];
  const directBind = {
    lab: bindLab,
    'ph-animation': bindPh,
    education: bindEducation,
    'crane-animation': bindCrane,
    contact: bindContact
  }[entryScene];
  const isDirectCinematic = entryScene === 'ph-animation'
    || entryScene === 'crane-animation';

  return (
    <main
      ref={rootRef}
      className="phone-lab-contact"
      data-phone-validation-mode={validationMode}
      data-phone-acceptance-route="lab-contact"
      data-phone-acceptance-motion={motionEnabled ? 'force' : 'reduce'}
      data-phone-acceptance-load={failed ? 'fallback' : 'ready'}
    >
      {fullJourney ? (
        <>
          <section className="phone-lab-contact__native" data-phone-acceptance-chapter="lab">
            <SceneMount
              adapter={scenes.lab}
              active={activeScene === 'lab'}
              reducedMotion={reducedMotion}
              bind={bindLab}
              onReady={publishAdapterRevision}
              pendingLabel="正在加载 Lab…"
            />
          </section>

          <section
            ref={phPhaseRef}
            className="phone-lab-contact__phase phone-lab-contact__phase--ph"
            data-phone-acceptance-chapter="lab-ph-education"
          >
            <div
              ref={phStageRef}
              className="phone-lab-contact__stage"
              data-phone-acceptance-stage-active="false"
              aria-hidden="true"
            >
              <div className="phone-lab-contact__stage-canvas">
                <SceneMount
                  adapter={scenes['ph-animation']}
                  active={activeScene === 'ph-animation'}
                  reducedMotion={reducedMotion}
                  bind={bindPh}
                  onReady={publishAdapterRevision}
                  pendingLabel="正在准备 PH…"
                />
              </div>
              <TransitionMount
                adapter={transitions['lab-ph']}
                host={phStageRef.current}
                from={labRef.current?.root() ?? null}
                to={phRef.current?.root() ?? null}
                reducedMotion={reducedMotion}
                bind={bindLabPh}
                onReady={publishAdapterRevision}
              />
              <TransitionMount
                adapter={transitions['ph-education']}
                host={phStageRef.current}
                from={phRef.current?.root() ?? null}
                to={educationRef.current?.root() ?? null}
                reducedMotion={reducedMotion}
                bind={bindPhEducation}
                onReady={publishAdapterRevision}
              />
            </div>
          </section>

          <section
            ref={educationSlotRef}
            className="phone-lab-contact__native"
            data-phone-acceptance-chapter="education"
          >
            <SceneMount
              adapter={scenes.education}
              active={activeScene === 'education'}
              reducedMotion={reducedMotion}
              bind={bindEducation}
              onReady={publishAdapterRevision}
              pendingLabel="正在加载留学内容…"
            />
          </section>

          <section
            ref={cranePhaseRef}
            className="phone-lab-contact__phase phone-lab-contact__phase--crane"
            data-phone-acceptance-chapter="education-crane-contact"
          >
            <div
              ref={craneStageRef}
              className="phone-lab-contact__stage"
              data-phone-acceptance-stage-active="false"
              aria-hidden="true"
            >
              <div className="phone-lab-contact__stage-canvas">
                <SceneMount
                  adapter={scenes['crane-animation']}
                  active={activeScene === 'crane-animation'}
                  reducedMotion={reducedMotion}
                  bind={bindCrane}
                  onReady={publishAdapterRevision}
                  pendingLabel="正在准备 Crane…"
                />
              </div>
              <TransitionMount
                adapter={transitions['education-crane']}
                host={craneStageRef.current}
                from={educationRef.current?.root() ?? null}
                to={craneRef.current?.root() ?? null}
                reducedMotion={reducedMotion}
                bind={bindEducationCrane}
                onReady={publishAdapterRevision}
              />
              <TransitionMount
                adapter={transitions['crane-contact']}
                host={craneStageRef.current}
                from={craneRef.current?.root() ?? null}
                to={contactRef.current?.root() ?? null}
                reducedMotion={reducedMotion}
                bind={bindCraneContact}
                onReady={publishAdapterRevision}
              />
            </div>
          </section>

          <section
            ref={contactSlotRef}
            className="phone-lab-contact__native"
            data-phone-acceptance-chapter="contact"
          >
            <SceneMount
              adapter={scenes.contact}
              active={activeScene === 'contact'}
              reducedMotion={reducedMotion}
              bind={bindContact}
              onReady={publishAdapterRevision}
              pendingLabel="正在加载联系信息…"
            />
          </section>
        </>
      ) : (
        <section className={isDirectCinematic
          ? 'phone-lab-contact__direct phone-lab-contact__direct--cinematic'
          : 'phone-lab-contact__direct'}>
          <div
            className={isDirectCinematic
              ? 'phone-lab-contact__stage phone-lab-contact__stage--direct'
              : undefined}
            data-phone-acceptance-stage-active={String(isDirectCinematic)}
            aria-hidden={isDirectCinematic ? 'true' : undefined}
          >
            <div className={isDirectCinematic
              ? 'phone-lab-contact__stage-canvas'
              : undefined}>
              <SceneMount
                adapter={directAdapter}
                active
                reducedMotion={reducedMotion}
                bind={directBind}
                onReady={publishAdapterRevision}
                pendingLabel="正在加载场景…"
              />
            </div>
          </div>
        </section>
      )}
      <StoryNav
        currentScene={navigationScene}
        visible
        menuOpen={navigationMenuOpen}
        onToggleMenu={() => setNavigationMenuOpen((open) => !open)}
        onNavigate={navigate}
      />
    </main>
  );
}
