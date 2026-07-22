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
import { INTRA_CHAPTER_DISSOLVE_MS } from '../../story/timings';
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
  PHONE_LAB_CONTACT_STOPS,
  type PhoneLabContactAutoplayEventDetail,
  phoneLabContactCrossedAutoplayBoundary,
  phoneLabContactOwnsNativePlayback,
  phoneLabContactPhaseFrame,
  phoneLabContactScrollProgress
} from './phone-lab-contact-timeline';
import {
  createPhoneLabContactSnapLock,
  type PhoneLabContactSnapLock
} from './phone-lab-contact-snap-lock';
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

type CinematicSceneId = 'ph-animation' | 'crane-animation';
type CinematicRunState = 'idle' | 'forward' | 'complete' | 'reverse';

const PHONE_LAB_CONTACT_SNAP_TIMEOUT_MS = 5000;
const SCENE_VISIBILITY_EPSILON_PX = 1;
const PHONE_LAB_CONTACT_PAPER_SURFACE = '#ede4d2';
const PHONE_LAB_CONTACT_PH_EDGE_SURFACE = '#9889a5';

export function phoneLabContactDirectEntryAutoplays(
  scene: LabContactSceneId,
  reducedMotion: boolean
): boolean {
  return !reducedMotion
    && (scene === 'ph-animation' || scene === 'crane-animation');
}

function phoneLabContactEdgeSurface(scene: LabContactSceneId): string {
  return scene === 'ph-animation'
    ? PHONE_LAB_CONTACT_PH_EDGE_SURFACE
    : PHONE_LAB_CONTACT_PAPER_SURFACE;
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
  if (previous?.handle === handle && previous.active === active) return;
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
  const phPhaseRef = useRef<HTMLElement | null>(null);
  const cranePhaseRef = useRef<HTMLElement | null>(null);
  const phStageRef = useRef<HTMLDivElement | null>(null);
  const craneStageRef = useRef<HTMLDivElement | null>(null);
  const educationSlotRef = useRef<HTMLElement | null>(null);
  const contactSlotRef = useRef<HTMLElement | null>(null);
  const lifecycleStates = useRef(new Map<LabContactSceneId, LifecycleState>());
  const cinematicRunStates = useRef<Record<CinematicSceneId, CinematicRunState>>({
    'ph-animation': 'idle',
    'crane-animation': 'idle'
  });
  const lastScrollYRef = useRef(0);
  const snapLockRef = useRef<PhoneLabContactSnapLock | null>(null);
  const currentNavigationScene = useRef<SceneId>(entryScene);
  const currentActiveScene = useRef<LabContactSceneId>(entryScene);
  const previousEdgeSurfaceRef = useRef<Readonly<{
    documentSurface: string;
    edgeScene: string | undefined;
    themeColor: string | undefined;
  }> | null>(null);
  const motionEnabled = phoneMotionEnabled();
  const reducedMotion = !motionEnabled;
  const fullJourney = entryScene === 'lab';
  usePhoneLabContactViewportGeometry(rootRef, motionEnabled);
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

  useEffect(() => {
    latestPhEducationRef.current = phEducationRef.current;
  }, [adapterRevision, phEducationRef]);

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

  useLayoutEffect(() => {
    const documentElement = document.documentElement;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!previousEdgeSurfaceRef.current) {
      previousEdgeSurfaceRef.current = {
        documentSurface: documentElement.style.getPropertyValue(
          '--phone-lab-contact-edge-surface'
        ),
        edgeScene: documentElement.dataset.phoneLabContactEdgeScene,
        themeColor: themeColor?.content
      };
    }
    const surface = phoneLabContactEdgeSurface(activeScene);
    documentElement.style.setProperty('--phone-lab-contact-edge-surface', surface);
    documentElement.dataset.phoneLabContactEdgeScene = activeScene;
    rootRef.current?.style.setProperty('--phone-lab-contact-edge-surface', surface);
    if (themeColor) themeColor.content = surface;
  }, [activeScene]);

  useEffect(() => () => {
    const documentElement = document.documentElement;
    const previous = previousEdgeSurfaceRef.current;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (previous?.documentSurface) {
      documentElement.style.setProperty(
        '--phone-lab-contact-edge-surface',
        previous.documentSurface
      );
    } else {
      documentElement.style.removeProperty('--phone-lab-contact-edge-surface');
    }
    if (previous?.edgeScene) {
      documentElement.dataset.phoneLabContactEdgeScene = previous.edgeScene;
    } else {
      delete documentElement.dataset.phoneLabContactEdgeScene;
    }
    if (themeColor && previous?.themeColor !== undefined) {
      themeColor.content = previous.themeColor;
    }
    rootRef.current?.style.removeProperty('--phone-lab-contact-edge-surface');
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
    if (!fullJourney || reducedMotion) return;
    const root = rootRef.current;
    if (!root) return;
    const snapLock = createPhoneLabContactSnapLock({
      root,
      getScrollY: () => window.scrollY,
      scrollTo: (y) => window.scrollTo({ top: y, left: 0, behavior: 'auto' })
    });
    snapLockRef.current = snapLock;
    let lockedScene: PhoneLabContactAutoplayEventDetail['scene'] | null = null;
    let snapTimeout = 0;
    let handoffFrame = 0;

    const releaseSnap = (
      scene: PhoneLabContactAutoplayEventDetail['scene']
    ) => {
      if (lockedScene !== scene) return;
      if (snapTimeout) window.clearTimeout(snapTimeout);
      snapTimeout = 0;
      snapLock.release();
      lockedScene = null;
      delete root.dataset.phoneLabContactSnapScene;
    };

    const completePhEducationHandoff = () => {
      const transition = latestPhEducationRef.current;
      const education = educationSlotRef.current;
      if (!transition || !education) {
        releaseSnap('ph-animation');
        return;
      }
      transition.render(1);
      releaseSnap('ph-animation');
      const educationTop = education.getBoundingClientRect().top + window.scrollY;
      window.scrollTo({ top: educationTop, left: 0, behavior: 'auto' });
      transition.leave?.();
      publishNavigationScene('education');
      publishActiveScene('education');
      syncSceneLifecycle(
        lifecycleStates.current,
        'ph-animation',
        phRef.current,
        false
      );
      syncSceneLifecycle(
        lifecycleStates.current,
        'education',
        educationRef.current,
        true
      );
    };

    const startPhEducationHandoff = (waitingSince = performance.now()) => {
      const transition = latestPhEducationRef.current;
      if (!transition) {
        if (performance.now() - waitingSince < 1000) {
          handoffFrame = window.requestAnimationFrame(() => {
            handoffFrame = 0;
            startPhEducationHandoff(waitingSince);
          });
          return;
        }
        releaseSnap('ph-animation');
        return;
      }
      transition.enter?.();
      let startedAt = 0;
      const tick: FrameRequestCallback = (now) => {
        handoffFrame = 0;
        if (!startedAt) startedAt = now;
        const progress = Math.min(
          1,
          Math.max(0, (now - startedAt) / INTRA_CHAPTER_DISSOLVE_MS)
        );
        transition.render(progress);
        if (progress >= 1) {
          completePhEducationHandoff();
          return;
        }
        handoffFrame = window.requestAnimationFrame(tick);
      };
      handoffFrame = window.requestAnimationFrame(tick);
    };

    const onAutoplay = (event: Event) => {
      const detail = (event as CustomEvent<PhoneLabContactAutoplayEventDetail>).detail;
      if (
        !detail
        || (detail.scene !== 'ph-animation' && detail.scene !== 'crane-animation')
      ) {
        return;
      }
      if (detail.phase === 'start') {
        const phase = detail.scene === 'ph-animation'
          ? phPhaseRef.current
          : cranePhaseRef.current;
        const stage = detail.scene === 'ph-animation'
          ? phStageRef.current
          : craneStageRef.current;
        if (!phase) return;
        cinematicRunStates.current[detail.scene] = detail.direction === 1
          ? 'forward'
          : 'reverse';
        if (snapTimeout) window.clearTimeout(snapTimeout);
        lockedScene = detail.scene;
        const phaseTop = phase.getBoundingClientRect().top + window.scrollY;
        const distance = Math.max(
          1,
          phase.offsetHeight - (stage?.offsetHeight || window.innerHeight)
        );
        // AOD's accepted snap topology collapses the otherwise invisible
        // sticky distance while native media owns time. Forward lands at the
        // far edge; reverse lands at the near edge. Once playback completes,
        // the next physical gesture immediately pushes the camera away.
        const phaseProgress = detail.direction === 1
          ? PHONE_LAB_CONTACT_STOPS.sceneMotionEnd
          : PHONE_LAB_CONTACT_STOPS.handoffEnd;
        snapLock.lock(phaseTop + distance * phaseProgress);
        root.dataset.phoneLabContactSnapScene = detail.scene;
        snapTimeout = window.setTimeout(
          () => releaseSnap(detail.scene),
          PHONE_LAB_CONTACT_SNAP_TIMEOUT_MS
        );
        return;
      }
      cinematicRunStates.current[detail.scene] = detail.direction === 1
        ? 'complete'
        : 'idle';
      if (detail.scene === 'ph-animation' && detail.direction === 1) {
        startPhEducationHandoff();
        return;
      }
      releaseSnap(detail.scene);
    };

    root.addEventListener(PHONE_LAB_CONTACT_AUTOPLAY_EVENT, onAutoplay);
    return () => {
      root.removeEventListener(PHONE_LAB_CONTACT_AUTOPLAY_EVENT, onAutoplay);
      if (snapTimeout) window.clearTimeout(snapTimeout);
      if (handoffFrame) window.cancelAnimationFrame(handoffFrame);
      snapLock.release();
      snapLock.dispose();
      if (snapLockRef.current === snapLock) snapLockRef.current = null;
      delete root.dataset.phoneLabContactSnapScene;
    };
  }, [fullJourney, reducedMotion]);

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

  useEffect(() => {
    if (!fullJourney) return;
    let frame = 0;
    let settleFrame = 0;
    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(render);
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
      const scrollDirection: 1 | -1 = scrollY < previousScrollY - 1
        ? -1
        : 1;
      lastScrollYRef.current = scrollY;
      const phPhase = phPhaseRef.current;
      const cranePhase = cranePhaseRef.current;
      const educationSlot = educationSlotRef.current;
      const contactSlot = contactSlotRef.current;
      if (!phPhase || !cranePhase || !educationSlot || !contactSlot) return;

      const phRect = phPhase.getBoundingClientRect();
      const craneRect = cranePhase.getBoundingClientRect();
      const phInRange = phRect.top <= 0 && phRect.bottom >= viewportHeight;
      const craneInRange = craneRect.top <= 0 && craneRect.bottom >= viewportHeight;
      const phApproaching = phRect.top > 0 && phRect.top < viewportHeight;
      const craneApproaching = craneRect.top > 0 && craneRect.top < viewportHeight;
      const phExiting = phRect.bottom > SCENE_VISIBILITY_EPSILON_PX
        && phRect.bottom < viewportHeight;
      const craneExiting = craneRect.bottom > SCENE_VISIBILITY_EPSILON_PX
        && craneRect.bottom < viewportHeight;
      const userHasScrolled = window.scrollY > 1;
      const phFrame = phoneLabContactPhaseFrame(
        phoneLabContactScrollProgress(phRect.top, phPhase.offsetHeight, viewportHeight),
        reducedMotion
      );
      const craneFrame = phoneLabContactPhaseFrame(
        phoneLabContactScrollProgress(craneRect.top, cranePhase.offsetHeight, viewportHeight),
        reducedMotion
      );
      const snappedScene = rootRef.current?.dataset.phoneLabContactSnapScene;

      const lab = labRef.current;
      const ph = phRef.current;
      const education = educationRef.current;
      const crane = craneRef.current;
      const contact = contactRef.current;

      // Before a cinematic block pins, show its verified opening camera in
      // normal document position. Hiding the sticky stage here produced a
      // full paper-coloured viewport between Education and Crane.
      if (phApproaching) {
        setStageActive(phStageRef.current, true);
        setVisualEndpoint(ph, 1);
      }
      if (craneApproaching) {
        setStageActive(craneStageRef.current, true);
        setVisualEndpoint(crane, 1);
      }

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
        // Contact is the next native document owner. Prepare it while the
        // second Education screen is still visible so no loader copy can win
        // the first Contact frame after Crane releases its snap.
        ensureScene('contact');
        ensureTransition('crane-contact');
      }
      if (userHasScrolled && craneInRange && craneFrame.progress > 0.22) {
        ensureScene('contact');
        ensureTransition('crane-contact');
      }

      const startCrossedCinematic = (
        scene: CinematicSceneId,
        handle: PhoneSceneAdapterHandle | null,
        phase: HTMLElement,
        stage: HTMLElement | null
      ): boolean => {
        if (!handle) return false;
        const runState = cinematicRunStates.current[scene];
        const canStart = scrollDirection === 1
          ? runState === 'idle'
          : runState === 'complete';
        if (!canStart) return false;
        const phaseTop = phase.getBoundingClientRect().top + scrollY;
        const phaseDistance = Math.max(
          1,
          phase.offsetHeight - (stage?.offsetHeight || viewportHeight)
        );
        if (!phoneLabContactCrossedAutoplayBoundary(
          previousScrollY,
          scrollY,
          phaseTop,
          phaseDistance,
          scrollDirection
        )) {
          return false;
        }

        publishNavigationScene(scene);
        publishActiveScene(scene);
        if (scene === 'ph-animation') {
          ensureScene('education');
          ensureTransition('ph-education');
        }
        setStageActive(stage, true);
        setVisualEndpoint(handle, 1);
        if (scene === 'ph-animation') {
          syncSceneLifecycle(lifecycleStates.current, 'lab', lab, false);
        } else {
          syncSceneLifecycle(lifecycleStates.current, 'education', education, false);
        }
        syncSceneLifecycle(
          lifecycleStates.current,
          scene,
          handle,
          true,
          scrollDirection
        );
        // enter()/reverse() dispatches the autoplay event synchronously. Its
        // AOD-style lock moves the document to the stable far/near anchor;
        // sample that corrected geometry on the next frame, not this stale
        // pre-lock rect.
        schedule();
        return true;
      };

      if (
        !reducedMotion
        && (
          startCrossedCinematic('ph-animation', ph, phPhase, phStageRef.current)
          || startCrossedCinematic(
            'crane-animation',
            crane,
            cranePhase,
            craneStageRef.current
          )
        )
      ) {
        return;
      }

      if (phInRange) {
        publishNavigationScene('ph-animation');
        publishActiveScene('ph-animation');
        setStageActive(phStageRef.current, true);
        syncSceneLifecycle(lifecycleStates.current, 'lab', lab, phFrame.handoffProgress < 1);
        // The dissolve only presents PH's zero frame. Once it has landed,
        // PH owns a native forward clock; never turn each scroll sample into
        // a video seek.
        syncSceneLifecycle(
          lifecycleStates.current,
          'ph-animation',
          ph,
          phoneLabContactOwnsNativePlayback(
            phFrame,
            snappedScene === 'ph-animation'
          ),
          scrollDirection
        );
        syncSceneLifecycle(lifecycleStates.current, 'crane-animation', crane, false);
        syncSceneLifecycle(lifecycleStates.current, 'contact', contact, false);

        // The source/receiver DOM nodes live in consecutive document blocks,
        // not one overlay stack. Cross-fading them here fades PH against an
        // off-screen Education node and exposes a blank paper viewport. Hold
        // the verified Figure2 camera; the sticky boundary itself performs
        // the continuous visual handoff as Education enters from below.
        setVisualEndpoint(ph, 1);
      } else if (phExiting) {
        setStageActive(phStageRef.current, true);
        setVisualEndpoint(ph, 1);
        syncSceneLifecycle(lifecycleStates.current, 'ph-animation', ph, false);
        syncSceneLifecycle(lifecycleStates.current, 'education', education, true);
      } else if (phRect.bottom <= SCENE_VISIBILITY_EPSILON_PX) {
        setStageActive(phStageRef.current, false);
        setVisualEndpoint(ph, 0);
        syncSceneLifecycle(lifecycleStates.current, 'ph-animation', ph, false);
      } else if (
        phRect.top >= viewportHeight
        && lifecycleStates.current.get('ph-animation')?.active
      ) {
        setStageActive(phStageRef.current, false);
        setVisualEndpoint(ph, 0);
        syncSceneLifecycle(lifecycleStates.current, 'ph-animation', ph, false);
      }

      if (craneInRange) {
        publishNavigationScene('crane-animation');
        publishActiveScene('crane-animation');
        setStageActive(craneStageRef.current, true);
        syncSceneLifecycle(lifecycleStates.current, 'education', education, craneFrame.handoffProgress < 1);
        // Education → Crane prepares a stable zero frame. The Crane adapter
        // then runs its authored 3s media/presentation clock independently
        // of document scroll.
        syncSceneLifecycle(
          lifecycleStates.current,
          'crane-animation',
          crane,
          phoneLabContactOwnsNativePlayback(
            craneFrame,
            snappedScene === 'crane-animation'
          ),
          scrollDirection
        );
        syncSceneLifecycle(lifecycleStates.current, 'contact', contact, false);

        // As with PH → Education, keep the accepted AOD camera opaque while
        // its sticky block exits. Contact then replaces it through native
        // document flow, so no detached receiver or white dissolve can win.
        setVisualEndpoint(crane, 1);
      } else if (craneExiting) {
        setStageActive(craneStageRef.current, true);
        setVisualEndpoint(crane, 1);
        syncSceneLifecycle(lifecycleStates.current, 'crane-animation', crane, false);
        syncSceneLifecycle(lifecycleStates.current, 'contact', contact, true);
      } else if (craneRect.bottom <= SCENE_VISIBILITY_EPSILON_PX) {
        setStageActive(craneStageRef.current, false);
        setVisualEndpoint(crane, 0);
        syncSceneLifecycle(lifecycleStates.current, 'crane-animation', crane, false);
      } else if (
        craneRect.top >= viewportHeight
        && lifecycleStates.current.get('crane-animation')?.active
      ) {
        setStageActive(craneStageRef.current, false);
        setVisualEndpoint(crane, 0);
        syncSceneLifecycle(lifecycleStates.current, 'crane-animation', crane, false);
      }

      const contactTop = contactSlot.getBoundingClientRect().top;
      const educationTop = educationSlot.getBoundingClientRect().top;
      if (contactTop <= viewportHeight * 0.42) {
        publishNavigationScene('contact');
        publishActiveScene('contact');
        syncSceneLifecycle(lifecycleStates.current, 'contact', contact, true);
      } else if (!craneInRange && craneRect.top <= viewportHeight * 0.42) {
        syncSceneLifecycle(lifecycleStates.current, 'contact', contact, false);
        publishNavigationScene('crane-animation');
      } else if (!phInRange && !craneInRange && educationTop <= viewportHeight * 0.42) {
        syncSceneLifecycle(lifecycleStates.current, 'contact', contact, false);
        syncSceneLifecycle(lifecycleStates.current, 'crane-animation', crane, false);
        publishNavigationScene('education');
        publishActiveScene('education');
        syncSceneLifecycle(lifecycleStates.current, 'education', education, true);
      } else if (!phInRange && phRect.top > viewportHeight * 0.42) {
        syncSceneLifecycle(lifecycleStates.current, 'contact', contact, false);
        syncSceneLifecycle(lifecycleStates.current, 'crane-animation', crane, false);
        publishNavigationScene('lab');
        publishActiveScene('lab');
        syncSceneLifecycle(lifecycleStates.current, 'lab', lab, true);
      }
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // Lazy adapters publish their refs after React commits. A settling frame
    // lets a newly mounted transition finish its endpoint effect before the
    // shell reapplies the current PH/Crane scroll frame; otherwise the stage
    // can remain invisible until the next physical scroll event.
    schedule();
    settleFrame = window.requestAnimationFrame(schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) window.cancelAnimationFrame(frame);
      if (settleFrame) window.cancelAnimationFrame(settleFrame);
    };
  }, [
    adapterRevision,
    ensureScene,
    ensureTransition,
    fullJourney,
    publishActiveScene,
    publishNavigationScene,
    reducedMotion,
    scenes,
    transitions
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
      data-phone-acceptance-active-scene={activeScene}
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
