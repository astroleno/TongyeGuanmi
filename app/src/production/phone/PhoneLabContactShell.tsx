import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefCallback,
  type RefObject
} from 'react';
import type { SceneId } from '../../story/types';
import {
  INTRA_CHAPTER_DISSOLVE_MS,
  PH_PLAYBACK_MS
} from '../../story/timings';
import { StoryNav } from '../StoryNav';
import { attachStoryMediaUnlock } from '../mobile-media-unlock';
import { hashForScene, publicMenuItems, sceneFromHash } from '../navigation';
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
  PHONE_LAB_CONTACT_AUTOPLAY_EVENT,
  type PhoneLabContactCinematicRunState,
  type PhoneLabContactCinematicScene,
  type PhoneLabContactAutoplayEventDetail,
  phoneLabContactApproachProgress,
  phoneLabContactAtOrPastVisualBoundary,
  phoneLabContactCanBeginVisualRun,
  phoneLabContactCanArmReverseGesture,
  phoneLabContactCommittedBoundaryProgress,
  phoneLabContactCrossedVisualBoundary,
  phoneLabContactCrossedVisualStart,
  phoneLabContactInkBoundaryProgress,
  phoneLabContactPhaseAfterVisualCompletion,
  phoneLabContactVisualBoundaryY,
  phoneLabContactVisualRunAnchor
} from './phone-lab-contact-timeline';
import {
  attachPhoneLabContactReverseGesture
} from './phone-lab-contact-reverse-gesture';
import {
  createPhoneLabContactSnapLock,
  type PhoneLabContactSnapLock
} from './phone-lab-contact-snap-lock';
import { usePhoneAdapterHandleRef } from './phone-adapter-binding';
import { usePhoneLabContactFixedStageRegistration } from './usePhoneLabContactFixedStageRegistration';
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
  direction: 1 | -1;
}>;

type CinematicSceneId = PhoneLabContactCinematicScene;

const PHONE_LAB_CONTACT_RUN_TIMEOUT_MS = 10000;
const PHONE_PH_EDUCATION_ANIMATION_STOP = PH_PLAYBACK_MS
  / (PH_PLAYBACK_MS + INTRA_CHAPTER_DISSOLVE_MS);
const PHONE_LAB_CONTACT_PAPER_SURFACE = '#ede4d2';
// PH keeps the average sky color at its rendered retained-camera top edge.
const PHONE_LAB_CONTACT_PH_EDGE_SURFACE = '#a594ab';

export function phoneLabContactDirectEntryAutoplays(
  scene: LabContactSceneId,
  reducedMotion: boolean
): boolean {
  return !reducedMotion
    && (scene === 'ph-animation' || scene === 'crane-animation');
}

export function phoneLabContactEdgeSurface(scene: LabContactSceneId): string {
  return scene === 'ph-animation'
    ? PHONE_LAB_CONTACT_PH_EDGE_SURFACE
    : PHONE_LAB_CONTACT_PAPER_SURFACE;
}

type PreviousPhoneLabContactEdgeSurface = Readonly<{
  documentSurface: string;
  localDocumentSurface: string;
  documentEdgeScene: string | undefined;
  localDocumentEdgeScene: string | undefined;
  themeColor: string | undefined;
}>;

/**
 * Match deda1bb's single Safari edge publisher inside the isolated v36 shell.
 * The document, retained host, theme-color and active scene must commit in the
 * same layout frame or WebKit can keep sampling PH's blue compositor after it
 * has handed ownership back to a paper scene.
 */
function usePhoneLabContactEdgeSurface(
  rootRef: RefObject<HTMLElement | null>,
  stageHostRef: RefObject<HTMLElement | null>,
  scene: LabContactSceneId
): void {
  const edgeSceneRef = useRef<LabContactSceneId>(scene);
  const previousRef = useRef<PreviousPhoneLabContactEdgeSurface | null>(null);
  const commit = useCallback((nextScene: LabContactSceneId, force = false) => {
    const documentElement = document.documentElement;
    const root = rootRef.current;
    const stageHost = stageHostRef.current;
    const surface = phoneLabContactEdgeSurface(nextScene);
    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (
      !force
      && edgeSceneRef.current === nextScene
      && documentElement.dataset.portraitEdgeScene === nextScene
      && documentElement.dataset.phoneLabContactEdgeScene === nextScene
      && documentElement.style.getPropertyValue('--portrait-document-surface') === surface
      && documentElement.style.getPropertyValue('--phone-lab-contact-edge-surface') === surface
      && root?.dataset.portraitEdgeScene === nextScene
      && root?.dataset.portraitEdgeSurface === surface
      && (!stageHost || stageHost.dataset.portraitEdgeScene === nextScene)
      && (!themeColor || themeColor.content === surface)
    ) {
      return;
    }

    edgeSceneRef.current = nextScene;
    documentElement.style.setProperty('--portrait-document-surface', surface);
    documentElement.style.setProperty('--phone-lab-contact-edge-surface', surface);
    documentElement.dataset.portraitEdgeScene = nextScene;
    documentElement.dataset.phoneLabContactEdgeScene = nextScene;
    if (root) {
      root.style.setProperty('--portrait-edge-surface', surface);
      root.style.setProperty('--phone-lab-contact-edge-surface', surface);
      root.dataset.portraitEdgeSurface = surface;
      root.dataset.portraitEdgeScene = nextScene;
      // Commit the new solid paper before Safari samples the rebuilt fixed
      // compositor for its status-bar and top-edge pixels.
      void window.getComputedStyle(root).backgroundColor;
    }
    if (stageHost) stageHost.dataset.portraitEdgeScene = nextScene;
    if (themeColor) themeColor.setAttribute('content', surface);
  }, [rootRef, stageHostRef]);

  useLayoutEffect(() => {
    const documentElement = document.documentElement;
    const themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    previousRef.current = {
      documentSurface: documentElement.style.getPropertyValue(
        '--portrait-document-surface'
      ),
      localDocumentSurface: documentElement.style.getPropertyValue(
        '--phone-lab-contact-edge-surface'
      ),
      documentEdgeScene: documentElement.dataset.portraitEdgeScene,
      localDocumentEdgeScene: documentElement.dataset.phoneLabContactEdgeScene,
      themeColor: themeColor?.content
    };
    commit(edgeSceneRef.current, true);

    const republishCurrentSurface = () => {
      if (!document.hidden) commit(edgeSceneRef.current, true);
    };
    window.addEventListener('pageshow', republishCurrentSurface);
    document.addEventListener('visibilitychange', republishCurrentSurface);
    return () => {
      window.removeEventListener('pageshow', republishCurrentSurface);
      document.removeEventListener(
        'visibilitychange',
        republishCurrentSurface
      );
      const previous = previousRef.current;
      const restoreProperty = (name: string, value: string | undefined) => {
        if (value) documentElement.style.setProperty(name, value);
        else documentElement.style.removeProperty(name);
      };
      restoreProperty(
        '--portrait-document-surface',
        previous?.documentSurface
      );
      restoreProperty(
        '--phone-lab-contact-edge-surface',
        previous?.localDocumentSurface
      );
      if (previous?.documentEdgeScene) {
        documentElement.dataset.portraitEdgeScene = previous.documentEdgeScene;
      } else {
        delete documentElement.dataset.portraitEdgeScene;
      }
      if (previous?.localDocumentEdgeScene) {
        documentElement.dataset.phoneLabContactEdgeScene =
          previous.localDocumentEdgeScene;
      } else {
        delete documentElement.dataset.phoneLabContactEdgeScene;
      }
      if (themeColor && previous?.themeColor !== undefined) {
        themeColor.setAttribute('content', previous.themeColor);
      }
      rootRef.current?.style.removeProperty('--portrait-edge-surface');
      rootRef.current?.style.removeProperty('--phone-lab-contact-edge-surface');
      if (rootRef.current) {
        delete rootRef.current.dataset.portraitEdgeSurface;
        delete rootRef.current.dataset.portraitEdgeScene;
      }
      if (stageHostRef.current) {
        delete stageHostRef.current.dataset.portraitEdgeScene;
      }
      previousRef.current = null;
    };
  }, [commit, rootRef, stageHostRef]);

  useLayoutEffect(() => {
    edgeSceneRef.current = scene;
    commit(scene);
  }, [commit, scene]);
}

/**
 * The isolated Lab → Contact acceptance route has no GSAP/ScrollTrigger
 * stage. Keep Safari's stable viewport coverage locally so importing this
 * shell cannot pull the production phone stage runtime into a shared chunk.
 */
function usePhoneLabContactViewportGeometry(
  rootRef: RefObject<HTMLElement | null>,
  motionEnabled: boolean
): void {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const documentElement = document.documentElement;
    documentElement.dataset.portraitSpike = 'b';
    documentElement.dataset.portraitSpikeMotion = motionEnabled ? 'force' : 'reduce';
    if (!root) return;

    let frame = 0;
    let coverageHeight = 0;
    let retainedWidth = 0;
    let forceRetainedGeometry = true;
    const sync = () => {
      frame = 0;
      const viewport = window.visualViewport;
      const height = Math.max(1, Math.round(viewport?.height || window.innerHeight || 1));
      const width = Math.max(1, Math.round(viewport?.width || window.innerWidth || 1));
      const offsetTop = Math.max(0, viewport?.offsetTop || 0);
      const viewportBottom = Math.max(1, Math.ceil(height + offsetTop));
      const widthChanged = !retainedWidth || Math.abs(width - retainedWidth) > 1;
      if (widthChanged) {
        coverageHeight = viewportBottom;
      } else {
        coverageHeight = Math.max(coverageHeight, viewportBottom);
      }
      // Match the accepted Safari stage: toolbar motion may grow paint
      // coverage, but only a real width/orientation change may replace the
      // retained layout camera.
      if (widthChanged || forceRetainedGeometry) {
        retainedWidth = width;
        forceRetainedGeometry = false;
        root.style.setProperty('--portrait-live-height', `${height}px`);
        root.style.setProperty('--portrait-live-width', `${width}px`);
        root.dataset.portraitLayoutViewport = `${width}x${height}`;
      }
      root.style.setProperty('--portrait-stage-coverage-height', `${coverageHeight}px`);
      root.dataset.portraitLiveViewport = `${width}x${height}`;
      root.dataset.portraitStageCoverage = `${coverageHeight}px`;
      root.dataset.portraitViewportOffsetTop = `${Math.ceil(offsetTop)}px`;
      root.dataset.portraitViewportBottom = `${viewportBottom}px`;
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(sync);
    };
    const forceGeometry = () => {
      forceRetainedGeometry = true;
      retainedWidth = 0;
      schedule();
    };

    sync();
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', forceGeometry);
    document.addEventListener('fullscreenchange', forceGeometry);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', forceGeometry);
      document.removeEventListener('fullscreenchange', forceGeometry);
      root.style.removeProperty('--portrait-live-height');
      root.style.removeProperty('--portrait-live-width');
      root.style.removeProperty('--portrait-stage-coverage-height');
      delete root.dataset.portraitLiveViewport;
      delete root.dataset.portraitLayoutViewport;
      delete root.dataset.portraitStageCoverage;
      delete root.dataset.portraitViewportOffsetTop;
      delete root.dataset.portraitViewportBottom;
      delete documentElement.dataset.portraitSpike;
      delete documentElement.dataset.portraitSpikeMotion;
    };
  }, [motionEnabled, rootRef]);
}

function isLabContactScene(scene: SceneId | undefined): scene is LabContactSceneId {
  return Boolean(scene && labContactPhoneSceneAdapterIds.includes(scene as LabContactSceneId));
}

/**
 * This acceptance route begins at Lab. Keep the shared navigation contract,
 * but do not expose Grade A / Brand destinations that this shell deliberately
 * does not mount.
 */
const labContactMenuItems = publicMenuItems.filter((item) =>
  isLabContactScene(item.scene)
);

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
  if (!active) stage.style.removeProperty('--phone-lab-contact-stage-y');
}

function setStageExitOffset(stage: HTMLElement | null, offsetY: number): void {
  if (!stage) return;
  stage.style.setProperty(
    '--phone-lab-contact-stage-y',
    `${Math.min(0, offsetY).toFixed(2)}px`
  );
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
  active: boolean,
  direction: 1 | -1 = 1
): void {
  if (!handle) return;
  const previous = states.get(scene);
  if (
    previous?.handle === handle
    && previous.active === active
    && (!active || previous.direction === direction)
  ) return;
  // A newly mounted cinematic adapter owns a prepared opening surface for its
  // incoming transition. Calling leave() before its first enter() immediately
  // releases that Canvas and leaves the handoff with only a background plate.
  if (!previous && !active) {
    const root = handle.root();
    root?.setAttribute('aria-hidden', 'true');
    if (root) root.inert = true;
    states.set(scene, { handle, active: false, direction });
    return;
  }
  if (active) {
    if (direction === -1 && handle.reverse) handle.reverse();
    else handle.enter?.();
  } else {
    handle.leave?.();
  }
  const root = handle.root();
  const nativeDocumentOwner = scene === 'lab'
    || scene === 'education'
    || scene === 'contact';
  if (!active) {
    root?.setAttribute('aria-hidden', 'true');
    if (root) root.inert = true;
  } else if (nativeDocumentOwner) {
    root?.removeAttribute('aria-hidden');
    if (root) root.inert = false;
  }
  states.set(scene, { handle, active, direction });
}

function acceptanceNavigationTarget(scene: SceneId): LabContactSceneId {
  return isLabContactScene(scene) ? scene : 'lab';
}

export function phoneLabContactNavigationHref(
  currentHref: string,
  scene: SceneId
): string {
  const destination = new URL(currentHref);
  destination.search = '?v=36';
  destination.hash = hashForScene(acceptanceNavigationTarget(scene));
  return destination.toString();
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
  pendingLabel?: string | undefined;
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
    return pendingLabel ? (
      <p className="phone-lab-contact__pending" aria-live="polite">{pendingLabel}</p>
    ) : (
      <div
        className="phone-lab-contact__pending phone-lab-contact__pending--silent"
        aria-hidden="true"
      />
    );
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
  const stageHostRef = useRef<HTMLDivElement | null>(null);
  const phPhaseRef = useRef<HTMLElement | null>(null);
  const cranePhaseRef = useRef<HTMLElement | null>(null);
  const phStageRef = useRef<HTMLDivElement | null>(null);
  const craneStageRef = useRef<HTMLDivElement | null>(null);
  const educationSlotRef = useRef<HTMLElement | null>(null);
  const contactSlotRef = useRef<HTMLElement | null>(null);
  const lifecycleStates = useRef(new Map<LabContactSceneId, LifecycleState>());
  const cinematicRunStates = useRef<Record<
    CinematicSceneId,
    PhoneLabContactCinematicRunState
  >>({
    'ph-animation': 'initial',
    'crane-animation': 'initial'
  });
  const visualRunRef = useRef<CinematicSceneId | null>(null);
  const visualRunDirectionRef = useRef<1 | -1>(1);
  const scheduleCoordinatorRef = useRef<(() => void) | null>(null);
  const lastScrollYRef = useRef(0);
  const snapLockRef = useRef<PhoneLabContactSnapLock | null>(null);
  const currentNavigationScene = useRef<SceneId>(entryScene);
  const currentActiveScene = useRef<LabContactSceneId>(entryScene);
  const motionEnabled = phoneMotionEnabled();
  const reducedMotion = !motionEnabled;
  const fullJourney = entryScene === 'lab';
  const fixedStageRegistered = usePhoneLabContactFixedStageRegistration(
    fullJourney,
    !fullJourney
  );
  usePhoneLabContactViewportGeometry(rootRef, motionEnabled);
  usePhoneLabContactEdgeSurface(rootRef, stageHostRef, activeScene);
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
  const latestPhEducationRef = useRef<PhoneTransitionAdapterHandle | null>(null);
  const latestCraneContactRef = useRef<PhoneTransitionAdapterHandle | null>(null);

  useEffect(() => {
    latestPhEducationRef.current = phEducationRef.current;
    latestCraneContactRef.current = craneContactRef.current;
  }, [adapterRevision, craneContactRef, phEducationRef]);

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

  useLayoutEffect(() => {
    const documentElement = document.documentElement;
    documentElement.dataset.phoneLabContactAcceptance = 'true';
    // v36 intentionally bypasses Loader → Proof, so retire the HTML recovery
    // loader as soon as this independent acceptance shell owns the document.
    document.getElementById('story-loader-static')?.remove();
    return () => {
      delete documentElement.dataset.phoneLabContactAcceptance;
    };
  }, []);

  // A physical reload can restore the old document Y before the lazy Lab
  // surface mounts. This cut route always starts at Lab, so retire that stale
  // position across both the initial commit and the browser's anchor pass.
  useEffect(() => {
    if (!fullJourney) return;
    const previousRestoration = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    let settleFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      settleFrame = window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (settleFrame) window.cancelAnimationFrame(settleFrame);
      window.history.scrollRestoration = previousRestoration;
    };
  }, [fullJourney]);

  // Keep the physical iOS media-unlock path identical to the production
  // phone shell. Lazy PH/Crane videos can otherwise miss the touch that
  // crosses their cinematic threshold on Safari.
  useEffect(() => attachStoryMediaUnlock(rootRef.current), []);

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
    if (!phoneLabContactDirectEntryAutoplays(entryScene, reducedMotion)) {
      handle.update(1);
    }
    if (entryScene === 'ph-animation' || entryScene === 'crane-animation') {
      setVisualEndpoint(handle, 1);
    }
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(entryScene)?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [adapterRevision, entryScene, fullJourney, reducedMotion]);

  useLayoutEffect(() => {
    if (!fullJourney || !fixedStageRegistered) return;
    const root = rootRef.current;
    if (!root) return;
    const snapLock = createPhoneLabContactSnapLock({
      root,
      getScrollY: () => window.scrollY,
      scrollTo: (y) => window.scrollTo({ top: y, left: 0, behavior: 'auto' })
    });
    snapLockRef.current = snapLock;
    let frame = 0;
    let settleFrame = 0;
    let completionFrame = 0;
    let transitionFrame = 0;
    let runTimeout = 0;
    let scrollDirectionLockUntil = 0;
    const retiredCinematics = new Set<CinematicSceneId>();
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(render);
    };
    scheduleCoordinatorRef.current = schedule;

    const clearRunTimers = () => {
      if (runTimeout) window.clearTimeout(runTimeout);
      if (transitionFrame) window.cancelAnimationFrame(transitionFrame);
      runTimeout = 0;
      transitionFrame = 0;
    };

    const setNativeOwner = (scene: 'lab' | 'education' | 'contact' | null) => {
      syncSceneLifecycle(
        lifecycleStates.current,
        'lab',
        labRef.current,
        scene === 'lab'
      );
      syncSceneLifecycle(
        lifecycleStates.current,
        'education',
        educationRef.current,
        scene === 'education'
      );
      syncSceneLifecycle(
        lifecycleStates.current,
        'contact',
        contactRef.current,
        scene === 'contact'
      );
    };

    const retireCinematic = (
      scene: CinematicSceneId,
      handle: PhoneSceneAdapterHandle | null
    ) => {
      if (!handle || retiredCinematics.has(scene)) return;
      handle.leave?.();
      setVisualEndpoint(handle, 0);
      retiredCinematics.add(scene);
    };

    const prepareCinematic = (
      scene: CinematicSceneId,
      handle: PhoneSceneAdapterHandle | null
    ) => {
      if (!handle || !retiredCinematics.delete(scene)) return;
      handle.update(0);
    };

    const handoffVisual = (
      scene: CinematicSceneId,
      direction: 1 | -1,
      reason: 'complete' | 'media-failure'
    ) => {
      if (
        visualRunRef.current !== scene
        || visualRunDirectionRef.current !== direction
      ) return;
      clearRunTimers();
      if (completionFrame) window.cancelAnimationFrame(completionFrame);
      const target: LabContactSceneId = direction === 1
        ? scene === 'ph-animation' ? 'education' : 'contact'
        : scene === 'ph-animation' ? 'lab' : 'education';
      root.dataset.phoneLabContactCompleteHandoff =
        `${scene}-${target}:${reason}:${direction === 1 ? 'forward' : 'reverse'}`;
      scrollDirectionLockUntil = window.performance.now() + 280;
      completionFrame = window.requestAnimationFrame(() => {
        completionFrame = 0;
        if (
          visualRunRef.current !== scene
          || visualRunDirectionRef.current !== direction
        ) return;
        if (scene === 'ph-animation') {
          if (direction === 1) latestPhEducationRef.current?.leave?.();
          else latestPhEducationRef.current?.enter?.();
          syncSceneLifecycle(
            lifecycleStates.current,
            'ph-animation',
            phRef.current,
            false
          );
        } else {
          if (direction === 1) latestCraneContactRef.current?.leave?.();
          else latestCraneContactRef.current?.enter?.();
          syncSceneLifecycle(
            lifecycleStates.current,
            'crane-animation',
            craneRef.current,
            false
          );
        }
        visualRunRef.current = null;
        snapLock.release();
        delete root.dataset.phoneLabContactSnapScene;
        root.dataset.phoneLabContactVisualRun = 'idle';
        const keepStage = direction === -1;
        setStageActive(phStageRef.current, keepStage && scene === 'ph-animation');
        setStageActive(
          craneStageRef.current,
          keepStage && scene === 'crane-animation'
        );
        setNativeOwner(
          target === 'lab' || target === 'education' || target === 'contact'
            ? target
            : null
        );
        publishNavigationScene(target);
        publishActiveScene(target);
        lastScrollYRef.current = window.scrollY;
        schedule();
      });
    };

    const completeRunAtFallback = (scene: CinematicSceneId) => {
      if (visualRunRef.current !== scene) return;
      const direction = visualRunDirectionRef.current;
      const endpoint = direction === 1 ? 1 : 0;
      const handle = scene === 'ph-animation'
        ? phRef.current
        : craneRef.current;
      handle?.update(endpoint);
      if (scene === 'ph-animation') {
        latestPhEducationRef.current?.render(endpoint);
      } else {
        latestCraneContactRef.current?.render(endpoint);
      }
      cinematicRunStates.current[scene] =
        phoneLabContactPhaseAfterVisualCompletion(direction);
      root.dataset.phoneLabContactMediaFallback =
        `${scene}:${direction === 1 ? 'forward' : 'reverse'}`;
      handoffVisual(scene, direction, 'media-failure');
    };

    const armRunTimeout = (scene: CinematicSceneId) => {
      if (runTimeout) window.clearTimeout(runTimeout);
      runTimeout = window.setTimeout(
        () => completeRunAtFallback(scene),
        PHONE_LAB_CONTACT_RUN_TIMEOUT_MS
      );
    };

    const runPhEducationDissolve = (
      direction: 1 | -1,
      onComplete: () => void
    ) => {
      if (transitionFrame) window.cancelAnimationFrame(transitionFrame);
      const transition = latestPhEducationRef.current;
      if (!transition) {
        onComplete();
        return;
      }
      const start = direction === 1 ? PHONE_PH_EDUCATION_ANIMATION_STOP : 1;
      const end = direction === 1 ? 1 : PHONE_PH_EDUCATION_ANIMATION_STOP;
      transition.render(start);
      let startedAt: number | undefined;
      const tick: FrameRequestCallback = (time) => {
        transitionFrame = 0;
        if (
          visualRunRef.current !== 'ph-animation'
          || visualRunDirectionRef.current !== direction
        ) return;
        if (startedAt === undefined) startedAt = time;
        const progress = Math.min(
          1,
          Math.max(0, (time - startedAt) / INTRA_CHAPTER_DISSOLVE_MS)
        );
        transition.render(start + (end - start) * progress);
        root.dataset.phoneLabContactPhDissolve =
          `${direction}:${progress.toFixed(4)}`;
        if (progress >= 1) {
          onComplete();
          return;
        }
        transitionFrame = window.requestAnimationFrame(tick);
      };
      transitionFrame = window.requestAnimationFrame(tick);
    };

    const beginCinematicRun = (
      scene: CinematicSceneId,
      direction: 1 | -1
    ): boolean => {
      const handle = scene === 'ph-animation'
        ? phRef.current
        : craneRef.current;
      const phase = scene === 'ph-animation'
        ? phPhaseRef.current
        : cranePhaseRef.current;
      const exitTransition = scene === 'ph-animation'
        ? latestPhEducationRef.current
        : latestCraneContactRef.current;
      const incomingTransition = scene === 'ph-animation'
        ? labPhRef.current
        : educationCraneRef.current;
      if (
        reducedMotion
        || visualRunRef.current
        || !handle
        || !phase
        || !exitTransition
        || !incomingTransition
        || !phoneLabContactCanBeginVisualRun(
          cinematicRunStates.current[scene],
          direction
        )
      ) {
        return false;
      }

      visualRunRef.current = scene;
      visualRunDirectionRef.current = direction;
      retiredCinematics.delete(scene);
      cinematicRunStates.current[scene] = direction === 1
        ? 'forward'
        : 'reverse';
      scrollDirectionLockUntil = window.performance.now() + 280;
      publishNavigationScene(scene);
      publishActiveScene(scene);
      root.dataset.phoneLabContactVisualRun =
        `${scene}:${direction === 1 ? 'forward' : 'reverse'}`;
      root.dataset.phoneLabContactSnapScene = scene;
      if (scene === 'ph-animation') {
        setStageActive(phStageRef.current, true);
        setStageExitOffset(phStageRef.current, 0);
        setStageActive(craneStageRef.current, false);
      } else {
        ensureScene('contact');
        ensureTransition('crane-contact');
        setStageActive(craneStageRef.current, true);
        setStageExitOffset(craneStageRef.current, 0);
        setStageActive(phStageRef.current, false);
      }
      setVisualEndpoint(handle, 1);
      const boundaryY = phoneLabContactVisualBoundaryY(
        window.scrollY,
        phase.getBoundingClientRect().top
      );
      snapLock.lock(phoneLabContactVisualRunAnchor(
        window.scrollY,
        boundaryY,
        direction
      ));
      armRunTimeout(scene);
      setNativeOwner(null);
      if (scene === 'ph-animation') {
        if (direction === 1) {
          labPhRef.current?.leave?.();
          latestPhEducationRef.current?.enter?.();
          syncSceneLifecycle(
            lifecycleStates.current,
            'ph-animation',
            handle,
            true,
            1
          );
        } else {
          labPhRef.current?.reverse?.();
          handle.update(1);
          latestPhEducationRef.current?.reverse?.();
          runPhEducationDissolve(-1, () => {
            if (
              visualRunRef.current !== 'ph-animation'
              || visualRunDirectionRef.current !== -1
            ) return;
            syncSceneLifecycle(
              lifecycleStates.current,
              'ph-animation',
              handle,
              true,
              -1
            );
          });
        }
      } else {
        if (direction === 1) {
          educationCraneRef.current?.leave?.();
          latestCraneContactRef.current?.enter?.();
        } else {
          handle.update(1);
          latestCraneContactRef.current?.reverse?.();
        }
        syncSceneLifecycle(
          lifecycleStates.current,
          scene,
          handle,
          true,
          direction
        );
      }
      schedule();
      return true;
    };

    const onAutoplay = (event: Event) => {
      const detail = (
        event as CustomEvent<PhoneLabContactAutoplayEventDetail>
      ).detail;
      if (
        !detail
        || visualRunRef.current !== detail.scene
        || visualRunDirectionRef.current !== detail.direction
      ) return;
      if (detail.phase === 'playing') {
        armRunTimeout(detail.scene);
        return;
      }
      if (
        detail.phase === 'progress'
        && typeof detail.progress === 'number'
        && Number.isFinite(detail.progress)
      ) {
        const progress = Math.min(1, Math.max(0, detail.progress));
        root.dataset.phoneLabContactVisualProgress =
          `${detail.scene}:${detail.direction}:${progress.toFixed(4)}`;
        if (detail.scene === 'crane-animation') {
          latestCraneContactRef.current?.render(progress);
        }
        return;
      }
      if (detail.phase !== 'complete') return;
      cinematicRunStates.current[detail.scene] =
        phoneLabContactPhaseAfterVisualCompletion(detail.direction);
      if (detail.scene === 'ph-animation' && detail.direction === 1) {
        runPhEducationDissolve(1, () => {
          handoffVisual('ph-animation', 1, 'complete');
        });
        return;
      }
      if (detail.scene === 'crane-animation') {
        latestCraneContactRef.current?.render(
          detail.direction === 1 ? 1 : 0
        );
      }
      handoffVisual(detail.scene, detail.direction, 'complete');
    };

    const render = () => {
      frame = 0;
      const viewportHeight = Math.max(
        1,
        phStageRef.current?.offsetHeight
          || craneStageRef.current?.offsetHeight
          || window.innerHeight
      );
      const scrollY = window.scrollY;
      const previousScrollY = lastScrollYRef.current;
      const directionLocked = window.performance.now()
        < scrollDirectionLockUntil;
      const scrollDirection: 1 | -1 | 0 = directionLocked
        ? 0
        : scrollY > previousScrollY + 0.5
          ? 1
          : scrollY < previousScrollY - 0.5
            ? -1
            : 0;
      const phPhase = phPhaseRef.current;
      const cranePhase = cranePhaseRef.current;
      const educationSlot = educationSlotRef.current;
      const contactSlot = contactSlotRef.current;
      if (!phPhase || !cranePhase || !educationSlot || !contactSlot) return;

      const phRect = phPhase.getBoundingClientRect();
      const craneRect = cranePhase.getBoundingClientRect();
      const phApproaching = phRect.top > 0 && phRect.top < viewportHeight;
      const craneApproaching = craneRect.top > 0 && craneRect.top < viewportHeight;
      const phPrewarming = phRect.top > 0
        && phRect.top < viewportHeight * 1.25;
      const cranePrewarming = craneRect.top > 0
        && craneRect.top < viewportHeight * 1.25;
      const phBoundaryY = phoneLabContactVisualBoundaryY(scrollY, phRect.top);
      const craneBoundaryY = phoneLabContactVisualBoundaryY(
        scrollY,
        craneRect.top
      );
      const atOrPastPhBoundary = phoneLabContactAtOrPastVisualBoundary(
        scrollY,
        phBoundaryY
      );
      const atOrPastCraneBoundary = phoneLabContactAtOrPastVisualBoundary(
        scrollY,
        craneBoundaryY
      );
      const userHasScrolled = window.scrollY > 1;

      const ph = phRef.current;
      const crane = craneRef.current;

      if (
        phPrewarming
        && cinematicRunStates.current['ph-animation'] === 'initial'
      ) {
        prepareCinematic('ph-animation', ph);
      }
      if (
        cranePrewarming
        && cinematicRunStates.current['crane-animation'] === 'initial'
      ) {
        prepareCinematic('crane-animation', crane);
      }

      if (phRect.top < viewportHeight * 1.25) {
        ensureScene('education');
        ensureTransition('ph-education');
      }
      if (
        userHasScrolled
        && educationSlot.getBoundingClientRect().bottom < viewportHeight * 2.2
      ) {
        ensureScene('crane-animation');
        ensureTransition('education-crane');
        // Contact is the next native document owner. Prepare it while the
        // second Education screen is still visible so no loader copy can win
        // the first Contact frame after Crane releases its snap.
        ensureScene('contact');
        ensureTransition('crane-contact');
      }

      /*
       * deda1bb/d208a86: one sampled document edge starts both directions.
       * Forward and reverse therefore converge on the same begin function and
       * the same snap owner instead of translating between two Y coordinates.
       */
      const crossedRunBoundary = (
        rect: DOMRect
      ): boolean => {
        if (scrollDirection === 1) {
          return phoneLabContactCrossedVisualStart(
            previousScrollY,
            scrollY,
            rect.top
          ) || (rect.top <= 1 && rect.bottom > 0);
        }
        return scrollDirection === -1
          && phoneLabContactCrossedVisualBoundary(
            previousScrollY,
            scrollY,
            rect.top
          );
      };

      if (!visualRunRef.current && !reducedMotion && scrollDirection !== 0) {
        const candidates: readonly [
          CinematicSceneId,
          DOMRect
        ][] = scrollDirection === -1
          ? [
              ['crane-animation', craneRect],
              ['ph-animation', phRect]
            ]
          : [
              ['ph-animation', phRect],
              ['crane-animation', craneRect]
            ];
        const nextRun = candidates.find(([scene, rect]) => (
          phoneLabContactCanBeginVisualRun(
            cinematicRunStates.current[scene],
            scrollDirection
          )
          && crossedRunBoundary(rect)
        ))?.[0];
        if (nextRun && beginCinematicRun(nextRun, scrollDirection)) {
          lastScrollYRef.current = window.scrollY;
          return;
        }
      }

      if (visualRunRef.current) {
        const heldScene = visualRunRef.current;
        publishNavigationScene(heldScene);
        publishActiveScene(heldScene);
        setStageActive(
          phStageRef.current,
          heldScene === 'ph-animation'
        );
        setStageActive(
          craneStageRef.current,
          heldScene === 'crane-animation'
        );
        setStageExitOffset(
          heldScene === 'ph-animation'
            ? phStageRef.current
            : craneStageRef.current,
          0
        );
        setVisualEndpoint(
          heldScene === 'ph-animation' ? ph : crane,
          1
        );
        setNativeOwner(null);
        lastScrollYRef.current = window.scrollY;
        return;
      }

      if (reducedMotion) {
        if (
          cinematicRunStates.current['ph-animation'] === 'initial'
          && atOrPastPhBoundary
        ) {
          cinematicRunStates.current['ph-animation'] = 'complete';
          ph?.update(1);
          latestPhEducationRef.current?.leave?.();
        } else if (
          cinematicRunStates.current['ph-animation'] === 'complete'
          && scrollY < phBoundaryY - 1
        ) {
          cinematicRunStates.current['ph-animation'] = 'initial';
          latestPhEducationRef.current?.enter?.();
          ph?.update(0);
        }
        if (
          cinematicRunStates.current['crane-animation'] === 'initial'
          && atOrPastCraneBoundary
        ) {
          cinematicRunStates.current['crane-animation'] = 'complete';
          crane?.update(1);
          latestCraneContactRef.current?.leave?.();
        } else if (
          cinematicRunStates.current['crane-animation'] === 'complete'
          && scrollY < craneBoundaryY - 1
        ) {
          cinematicRunStates.current['crane-animation'] = 'initial';
          latestCraneContactRef.current?.enter?.();
          crane?.update(0);
        }
      }

      if (!atOrPastPhBoundary) {
        const progress = phApproaching
          ? phoneLabContactInkBoundaryProgress(phRect.top, viewportHeight)
          : 0;
        const stageActive = progress > 0.001;
        setStageActive(phStageRef.current, stageActive);
        setStageExitOffset(phStageRef.current, 0);
        setStageActive(craneStageRef.current, false);
        syncSceneLifecycle(
          lifecycleStates.current,
          'ph-animation',
          ph,
          false
        );
        syncSceneLifecycle(
          lifecycleStates.current,
          'crane-animation',
          crane,
          false
        );
        if (!phPrewarming) {
          retireCinematic('ph-animation', ph);
        }
        retireCinematic('crane-animation', crane);
        setNativeOwner('lab');
        if (stageActive) {
          labPhRef.current?.render(
            phoneLabContactCommittedBoundaryProgress(progress, false)
          );
        } else {
          // The Lab opener is more than one viewport from PH. Retire the ink
          // WebGL surface; render() recreates it inside the reviewed approach.
          labPhRef.current?.dispose?.();
        }
        const scene = progress >= 0.5 ? 'ph-animation' : 'lab';
        publishNavigationScene(scene);
        publishActiveScene(scene);
        lastScrollYRef.current = scrollY;
        return;
      }

      if (
        cinematicRunStates.current['ph-animation'] === 'initial'
        && !atOrPastCraneBoundary
      ) {
        setStageActive(phStageRef.current, true);
        setStageExitOffset(phStageRef.current, 0);
        setStageActive(craneStageRef.current, false);
        setVisualEndpoint(ph, 1);
        labPhRef.current?.render(
          phoneLabContactCommittedBoundaryProgress(1, true)
        );
        setNativeOwner(null);
        publishNavigationScene('ph-animation');
        publishActiveScene('ph-animation');
        lastScrollYRef.current = scrollY;
        return;
      }

      if (!atOrPastCraneBoundary) {
        setStageActive(phStageRef.current, false);
        syncSceneLifecycle(
          lifecycleStates.current,
          'ph-animation',
          ph,
          false
        );
        if (
          craneApproaching
          && cinematicRunStates.current['crane-animation'] === 'initial'
        ) {
          const progress = phoneLabContactApproachProgress(
            craneRect.top,
            viewportHeight
          );
          setStageActive(craneStageRef.current, progress > 0.001);
          setStageExitOffset(craneStageRef.current, 0);
          setVisualEndpoint(crane, 1);
          educationCraneRef.current?.render(
            phoneLabContactCommittedBoundaryProgress(progress, false)
          );
          syncSceneLifecycle(
            lifecycleStates.current,
            'crane-animation',
            crane,
            false
          );
          setNativeOwner('education');
          const scene = progress >= 0.5 ? 'crane-animation' : 'education';
          publishNavigationScene(scene);
          publishActiveScene(scene);
        } else {
          setStageActive(craneStageRef.current, false);
          syncSceneLifecycle(
            lifecycleStates.current,
            'crane-animation',
            crane,
            false
          );
          if (!cranePrewarming) {
            retireCinematic('crane-animation', crane);
          }
          setNativeOwner('education');
          publishNavigationScene('education');
          publishActiveScene('education');
        }
        lastScrollYRef.current = scrollY;
        return;
      }

      if (cinematicRunStates.current['crane-animation'] === 'initial') {
        setStageActive(phStageRef.current, false);
        setStageActive(craneStageRef.current, true);
        setStageExitOffset(craneStageRef.current, 0);
        setVisualEndpoint(crane, 1);
        educationCraneRef.current?.render(
          phoneLabContactCommittedBoundaryProgress(1, true)
        );
        setNativeOwner(null);
        publishNavigationScene('crane-animation');
        publishActiveScene('crane-animation');
        lastScrollYRef.current = scrollY;
        return;
      }

      setStageActive(phStageRef.current, false);
      setStageActive(craneStageRef.current, false);
      syncSceneLifecycle(
        lifecycleStates.current,
        'ph-animation',
        ph,
        false
      );
      syncSceneLifecycle(
        lifecycleStates.current,
        'crane-animation',
        crane,
        false
      );
      setNativeOwner('contact');
      publishNavigationScene('contact');
      publishActiveScene('contact');
      lastScrollYRef.current = scrollY;
    };

    const reverseSceneAtBoundary = (): CinematicSceneId | null => {
      const candidates: readonly CinematicSceneId[] = [
        'crane-animation',
        'ph-animation'
      ];
      for (const scene of candidates) {
        const phase = scene === 'ph-animation'
          ? phPhaseRef.current
          : cranePhaseRef.current;
        if (!phase) continue;
        const boundaryY = phoneLabContactVisualBoundaryY(
          window.scrollY,
          phase.getBoundingClientRect().top
        );
        if (!phoneLabContactCanArmReverseGesture(
          cinematicRunStates.current[scene],
          window.scrollY,
          boundaryY
        )) {
          continue;
        }
        return scene;
      }
      return null;
    };

    const reverseGesture = attachPhoneLabContactReverseGesture({
      root,
      reducedMotion,
      hasActiveRun: () => visualRunRef.current !== null,
      sceneAtBoundary: reverseSceneAtBoundary,
      beginReverse: (scene) => {
        const started = beginCinematicRun(scene, -1);
        if (started) lastScrollYRef.current = window.scrollY;
        return started;
      }
    });

    root.addEventListener(PHONE_LAB_CONTACT_AUTOPLAY_EVENT, onAutoplay);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    // Lazy adapters publish their refs after React commits. A settling frame
    // lets a newly mounted transition finish its endpoint effect before the
    // shell reapplies the current PH/Crane scroll frame; otherwise the stage
    // can remain invisible until the next physical scroll event.
    schedule();
    settleFrame = window.requestAnimationFrame(schedule);
    return () => {
      root.removeEventListener(PHONE_LAB_CONTACT_AUTOPLAY_EVENT, onAutoplay);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      reverseGesture.dispose();
      clearRunTimers();
      if (completionFrame) window.cancelAnimationFrame(completionFrame);
      if (frame) window.cancelAnimationFrame(frame);
      if (settleFrame) window.cancelAnimationFrame(settleFrame);
      visualRunRef.current = null;
      snapLock.dispose();
      if (snapLockRef.current === snapLock) snapLockRef.current = null;
      delete root.dataset.phoneLabContactSnapScene;
      delete root.dataset.phoneLabContactVisualRun;
      delete root.dataset.phoneLabContactVisualProgress;
      if (scheduleCoordinatorRef.current === schedule) {
        scheduleCoordinatorRef.current = null;
      }
    };
  }, [
    ensureScene,
    ensureTransition,
    fixedStageRegistered,
    fullJourney,
    publishActiveScene,
    publishNavigationScene,
    reducedMotion
  ]);

  useEffect(() => {
    if (!fullJourney) return;
    scheduleCoordinatorRef.current?.();
  }, [adapterRevision, fullJourney]);

  useEffect(() => () => {
    for (const state of lifecycleStates.current.values()) state.handle.dispose?.();
    labPhRef.current?.dispose?.();
    phEducationRef.current?.dispose?.();
    educationCraneRef.current?.dispose?.();
    craneContactRef.current?.dispose?.();
  }, []);

  const navigate = useCallback((scene: SceneId) => {
    setNavigationMenuOpen(false);
    window.location.assign(
      phoneLabContactNavigationHref(window.location.href, scene)
    );
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
      data-phone-acceptance-active-scene={activeScene}
      data-phone-fixed-stage={fixedStageRegistered ? 'registered' : 'priming'}
    >
      {fullJourney ? (
        <>
          <div
            ref={stageHostRef}
            className="phone-lab-contact__stage-host"
            data-phone-stage-host="persistent"
            aria-hidden="true"
          >
            <div
              ref={phStageRef}
              className="phone-lab-contact__stage phone-lab-contact__stage--ph"
              data-phone-acceptance-stage-active="false"
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

            <div
              ref={craneStageRef}
              className="phone-lab-contact__stage phone-lab-contact__stage--crane"
              data-phone-acceptance-stage-active="false"
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
          </div>

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
          />

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
          />

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
                pendingLabel={entryScene === 'contact'
                  ? undefined
                  : '正在加载场景…'}
              />
            </div>
          </div>
        </section>
      )}
      <StoryNav
        currentScene={navigationScene}
        visible
        menuOpen={navigationMenuOpen}
        menuItems={labContactMenuItems}
        onToggleMenu={() => setNavigationMenuOpen((open) => !open)}
        onNavigate={navigate}
      />
    </main>
  );
}
