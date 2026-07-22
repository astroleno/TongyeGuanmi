import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import type {
  ScenePresentationAdapterHandle,
  TransitionPresentationAdapterHandle
} from '../../story/presentation';
import type { SceneId } from '../../story/types';
import { StoryNav } from '../StoryNav';
import { hashForScene, publicMenuItems, sceneFromHash } from '../navigation';
import {
  group45PhoneSceneIds,
  type Group45PhoneSceneId
} from './adapter-groups/group4-5';
import {
  createPhoneScrollSnapLock,
  type PhoneScrollSnapLock
} from './phone-scroll-snap-lock';
import { PhoneStageRail } from './PhoneStageRail';
import { usePhoneGroup45Adapters } from './usePhoneGroup45Adapters';
import './PhoneBrandLabStory.css';

type PhoneBrandLabStoryProps = Readonly<{
  reducedMotion: boolean;
  validationMode?: string | undefined;
}>;

type VisualActivity = Readonly<{
  active: boolean;
  prewarm: boolean;
}>;

type Group45EdgeState = Readonly<{
  surface: string;
  themeColor: string;
}>;

type Group45VisualScene = Extract<
  Group45PhoneSceneId,
  'figure3-animation' | 'ttg-animation'
>;

type VisualHandoffReason = 'complete' | 'media-failure';

const GROUP45_SCENES = new Set<Group45PhoneSceneId>(group45PhoneSceneIds);
const GROUP45_NAV_ITEMS = publicMenuItems.filter((item) => item.scene === 'services');

/*
 * This cut-only QA scope deliberately starts at Brand instead of replaying the
 * still-moving Loader → Proof half. Its edge colors are local until Unit 7
 * expands the shared phone edge-surface contract.
 */
const GROUP45_EDGE_BY_SCENE: Readonly<Record<Group45PhoneSceneId, Group45EdgeState>> = {
  brand: { surface: '#ede4d2', themeColor: '#ede4d2' },
  'figure3-animation': { surface: '#ede4d2', themeColor: '#ede4d2' },
  services: { surface: '#ede4d2', themeColor: '#ede4d2' },
  'ttg-animation': { surface: '#080d10', themeColor: '#080d10' },
  lab: { surface: '#e9e1ce', themeColor: '#e9e1ce' }
};

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isGroup45Scene(scene: SceneId | undefined): scene is Group45PhoneSceneId {
  return Boolean(scene && GROUP45_SCENES.has(scene as Group45PhoneSceneId));
}

/** Unknown hashes begin at the stable Proof → Brand receiver. */
export function phoneGroup45EntryFromHash(hash: string): Group45PhoneSceneId {
  const scene = sceneFromHash(hash);
  return isGroup45Scene(scene) ? scene : 'brand';
}

/** Root flags that release the desktop overflow lock for the phone document. */
export function phoneGroup45DocumentFlags(reducedMotion: boolean): Readonly<{
  portraitSpike: 'b';
  portraitSpikeMotion: 'force' | 'reduce';
}> {
  return {
    portraitSpike: 'b',
    portraitSpikeMotion: reducedMotion ? 'reduce' : 'force'
  };
}

/**
 * The Group 4–5 visual chapters are autonomous one-screen runs. They retain a
 * progress helper for failure endpoints and future reviewed cameras, but a
 * single-viewport chapter must never manufacture an extra scroll/hold range.
 */
export function phoneGroup45TrackProgress(
  trackTop: number,
  trackHeight: number,
  viewportHeight: number
): number {
  const pinnedDistance = trackHeight - viewportHeight;
  if (pinnedDistance <= 1) return 0;
  return clamp(-trackTop / pinnedDistance);
}

/** A short, bounded dissolve window around a document-flow chapter boundary. */
export function phoneGroup45BoundaryProgress(
  targetTop: number,
  targetHeight: number,
  viewportHeight: number
): number {
  const span = Math.max(1, Math.min(viewportHeight * .24, targetHeight * .35));
  return clamp((viewportHeight - targetTop) / span);
}

function sceneIndex(scene: Group45PhoneSceneId): number {
  return group45PhoneSceneIds.indexOf(scene);
}

export function phoneGroup45TrackActivity(
  trackTop: number,
  trackHeight: number,
  viewportHeight: number
): VisualActivity & Readonly<{ progress: number }> {
  const trackBottom = trackTop + trackHeight;
  const oneScreenTrack = trackHeight <= viewportHeight + 1;
  const visibleHeight = Math.max(
    0,
    Math.min(trackBottom, viewportHeight) - Math.max(trackTop, 0)
  );
  const visibleRatio = visibleHeight / Math.max(1, Math.min(trackHeight, viewportHeight));
  return {
    // Match the accepted AOD entry model: decode while the next visual is one
    // viewport away, then let the runtime latch ownership once it is crossed.
    prewarm: trackTop <= viewportHeight * 1.25
      && trackBottom > viewportHeight * .1,
    active: oneScreenTrack
      ? visibleRatio >= .5
      : trackTop <= 0 && trackBottom >= viewportHeight,
    progress: phoneGroup45TrackProgress(trackTop, trackHeight, viewportHeight)
  };
}

/** A forward swipe may jump past the exact top edge; crossing still owns it. */
export function phoneGroup45CrossedVisualStart(
  previousScrollY: number,
  scrollY: number,
  trackTop: number,
  viewportHeight: number
): boolean {
  const documentTop = scrollY + trackTop;
  const triggerY = Math.max(0, documentTop - viewportHeight * .35);
  return previousScrollY < triggerY && scrollY >= triggerY;
}

function frameForTrack(element: HTMLElement | null, viewportHeight: number) {
  if (!element) return { active: false, prewarm: false, progress: 0 };
  const rect = element.getBoundingClientRect();
  return phoneGroup45TrackActivity(rect.top, rect.height, viewportHeight);
}

/**
 * Dedicated physical-device cut. It has one document scroll owner and gives
 * each visual chapter a full-viewport sticky stage; Brand/Services/Lab remain
 * the sole accessible, native-document reading tree.
 */
export function PhoneBrandLabStory({
  reducedMotion,
  validationMode
}: PhoneBrandLabStoryProps) {
  const [entryScene, setEntryScene] = useState<Group45PhoneSceneId>(() => (
    typeof window === 'undefined' ? 'brand' : phoneGroup45EntryFromHash(window.location.hash)
  ));
  const adapters = usePhoneGroup45Adapters(entryScene);
  const [currentScene, setCurrentScene] = useState<Group45PhoneSceneId>(entryScene);
  const [menuOpen, setMenuOpen] = useState(false);
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
  const rootRef = useRef<HTMLElement | null>(null);
  const stageRailRef = useRef<HTMLElement | null>(null);
  const stageViewportRef = useRef<HTMLElement | null>(null);
  const stageCanvasRef = useRef<HTMLDivElement | null>(null);
  const [stageHost, setStageHost] = useState<HTMLElement | null>(null);
  const figure3TrackRef = useRef<HTMLDivElement | null>(null);
  const ttgTrackRef = useRef<HTMLDivElement | null>(null);
  const brandRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const figure3Ref = useRef<ScenePresentationAdapterHandle | null>(null);
  const servicesRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const ttgRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const labRef = useRef<ScenePresentationAdapterHandle | null>(null);
  const brandFigure3Ref = useRef<TransitionPresentationAdapterHandle | null>(null);
  const figure3ServicesRef = useRef<TransitionPresentationAdapterHandle | null>(null);
  const servicesTtgRef = useRef<TransitionPresentationAdapterHandle | null>(null);
  const ttgLabRef = useRef<TransitionPresentationAdapterHandle | null>(null);
  const pendingNavigationRef = useRef<Group45PhoneSceneId>(entryScene);
  const visualCompletionFrameRef = useRef(0);
  const visualRunTimeoutRef = useRef(0);
  const visualRunRef = useRef<Group45VisualScene | null>(null);
  const visualSnapRef = useRef<PhoneScrollSnapLock | null>(null);
  const failedVisualsRef = useRef(new Set<Group45VisualScene>());
  const lastScrollYRef = useRef(
    typeof window === 'undefined' ? 0 : window.scrollY
  );
  const scrollDirectionLockUntilRef = useRef(0);
  const entryIndex = sceneIndex(entryScene);
  const edgeScene = stageScene ?? currentScene;

  useLayoutEffect(() => {
    const documentElement = document.documentElement;
    const previousSpike = documentElement.dataset.portraitSpike;
    const previousMotion = documentElement.dataset.portraitSpikeMotion;
    const previousHydrated = documentElement.dataset.storyHydrated;
    const previousScope = documentElement.dataset.phoneGroup45Scope;
    const previousSurface = documentElement.style.getPropertyValue('--portrait-document-surface');
    const previousEdge = documentElement.dataset.phoneGroup45EdgeScene;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const previousThemeColor = themeColor?.content;

    // PhoneStoryShell's base CSS owns the document scroll container. This QA
    // cut uses the same lightweight root flags without importing its GSAP
    // runtime, so html/body/#root are restored from the desktop overflow lock.
    const flags = phoneGroup45DocumentFlags(reducedMotion);
    documentElement.dataset.portraitSpike = flags.portraitSpike;
    documentElement.dataset.portraitSpikeMotion = flags.portraitSpikeMotion;
    documentElement.dataset.storyHydrated = 'true';
    documentElement.dataset.phoneGroup45Scope = 'brand-lab';

    return () => {
      if (previousSpike) documentElement.dataset.portraitSpike = previousSpike;
      else delete documentElement.dataset.portraitSpike;
      if (previousMotion) documentElement.dataset.portraitSpikeMotion = previousMotion;
      else delete documentElement.dataset.portraitSpikeMotion;
      if (previousHydrated) documentElement.dataset.storyHydrated = previousHydrated;
      else delete documentElement.dataset.storyHydrated;
      if (previousScope) documentElement.dataset.phoneGroup45Scope = previousScope;
      else delete documentElement.dataset.phoneGroup45Scope;
      if (previousSurface) {
        documentElement.style.setProperty('--portrait-document-surface', previousSurface);
      } else {
        documentElement.style.removeProperty('--portrait-document-surface');
      }
      if (previousEdge) documentElement.dataset.phoneGroup45EdgeScene = previousEdge;
      else delete documentElement.dataset.phoneGroup45EdgeScene;
      if (themeColor && previousThemeColor !== undefined) themeColor.content = previousThemeColor;
    };
  }, [reducedMotion]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const documentElement = document.documentElement;
    const edge = GROUP45_EDGE_BY_SCENE[edgeScene];
    root?.style.setProperty('--phone-group45-edge-surface', edge.surface);
    root?.style.setProperty('--portrait-edge-surface', edge.surface);
    root?.setAttribute('data-phone-group45-edge-scene', edgeScene);
    documentElement.style.setProperty('--portrait-document-surface', edge.surface);
    documentElement.dataset.phoneGroup45EdgeScene = edgeScene;
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColor) themeColor.content = edge.themeColor;
  }, [edgeScene]);

  const publishAdapter = useCallback(() => {
    setAdapterRevision((revision) => revision + 1);
  }, []);
  const bindStageHost = useCallback((host: HTMLDivElement | null) => {
    if (stageCanvasRef.current === host) return;
    stageCanvasRef.current = host;
    setStageHost(host);
  }, []);
  const bindBrand = useCallback((handle: ScenePresentationAdapterHandle | null) => {
    if (brandRef.current === handle) return;
    brandRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindFigure3 = useCallback((handle: ScenePresentationAdapterHandle | null) => {
    if (figure3Ref.current === handle) return;
    figure3Ref.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindServices = useCallback((handle: ScenePresentationAdapterHandle | null) => {
    if (servicesRef.current === handle) return;
    servicesRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindTtg = useCallback((handle: ScenePresentationAdapterHandle | null) => {
    if (ttgRef.current === handle) return;
    ttgRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindLab = useCallback((handle: ScenePresentationAdapterHandle | null) => {
    if (labRef.current === handle) return;
    labRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindBrandFigure3 = useCallback((handle: TransitionPresentationAdapterHandle | null) => {
    if (brandFigure3Ref.current === handle) return;
    brandFigure3Ref.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindFigure3Services = useCallback((handle: TransitionPresentationAdapterHandle | null) => {
    if (figure3ServicesRef.current === handle) return;
    figure3ServicesRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindServicesTtg = useCallback((handle: TransitionPresentationAdapterHandle | null) => {
    if (servicesTtgRef.current === handle) return;
    servicesTtgRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);
  const bindTtgLab = useCallback((handle: TransitionPresentationAdapterHandle | null) => {
    if (ttgLabRef.current === handle) return;
    ttgLabRef.current = handle;
    publishAdapter();
  }, [publishAdapter]);

  const navigate = useCallback((scene: SceneId) => {
    const target = isGroup45Scene(scene) ? scene : 'brand';
    pendingNavigationRef.current = target;
    setMenuOpen(false);
    const hash = hashForScene(target);
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    setEntryScene(target);
  }, []);

  /**
   * A cinematic chapter owns exactly one physical screen. Once its media has
   * reached the authored endpoint, reveal the next native receiver on the
   * same document rail instead of manufacturing an extra terminal hold.
   */
  const handoffVisual = useCallback((
    scene: Group45VisualScene,
    reason: VisualHandoffReason
  ) => {
    if (reason === 'complete' && reducedMotion) return;
    const receiver = scene === 'figure3-animation'
      ? servicesRef.current?.root() ?? null
      : labRef.current?.root() ?? null;
    const target = scene === 'figure3-animation' ? 'services' : 'lab';
    if (visualRunRef.current !== scene || !receiver) return;
    if (visualRunTimeoutRef.current) {
      window.clearTimeout(visualRunTimeoutRef.current);
      visualRunTimeoutRef.current = 0;
    }
    if (visualCompletionFrameRef.current) {
      window.cancelAnimationFrame(visualCompletionFrameRef.current);
    }
    rootRef.current?.setAttribute(
      'data-phone-group45-complete-handoff',
      `${scene}-${target}:${reason}`
    );
    scrollDirectionLockUntilRef.current = window.performance.now() + 280;
    setScrollDirection(1);
    // Keep the terminal plate for one compositor frame. The second frame
    // moves the one real document to its semantic receiver; no clone, blank
    // paper screen, or additional full-screen scroll range is introduced.
    visualCompletionFrameRef.current = window.requestAnimationFrame(() => {
      visualCompletionFrameRef.current = window.requestAnimationFrame(() => {
        visualCompletionFrameRef.current = 0;
        const latestReceiver = scene === 'figure3-animation'
          ? servicesRef.current?.root() ?? null
          : labRef.current?.root() ?? null;
        if (visualRunRef.current !== scene || !latestReceiver) return;
        if (scene === 'figure3-animation') {
          figure3Ref.current?.leave?.();
        } else {
          ttgRef.current?.leave?.();
        }
        visualRunRef.current = null;
        visualSnapRef.current?.release();
        rootRef.current?.setAttribute('data-phone-group45-snap', 'released');
        rootRef.current?.setAttribute('data-phone-group45-visual-run', 'idle');
        setStageScene(null);
        setVisualActivity((current) => ({
          figure3: {
            ...current.figure3,
            active: false
          },
          ttg: {
            ...current.ttg,
            active: false
          }
        }));
        window.scrollTo({
          top: window.scrollY + latestReceiver.getBoundingClientRect().top,
          left: 0,
          behavior: 'auto'
        });
      });
    });
  }, [reducedMotion]);

  const onMediaError = useCallback((scene: Group45PhoneSceneId) => {
    if (scene !== 'figure3-animation' && scene !== 'ttg-animation') return;
    failedVisualsRef.current.add(scene);
    const target = scene === 'figure3-animation' ? 'services' : 'lab';
    rootRef.current?.setAttribute('data-phone-group45-media-fallback', target);
    if (scene === 'figure3-animation') {
      figure3Ref.current?.update(1);
      figure3ServicesRef.current?.render(1);
    } else {
      ttgRef.current?.update(1);
      ttgLabRef.current?.render(1);
    }
    handoffVisual(scene, 'media-failure');
  }, [handoffVisual]);

  const onVisualComplete = useCallback((scene: Group45PhoneSceneId) => {
    if (scene === 'figure3-animation' || scene === 'ttg-animation') {
      handoffVisual(scene, 'complete');
    }
  }, [handoffVisual]);

  const armVisualRunTimeout = useCallback((scene: Group45VisualScene) => {
    if (visualRunTimeoutRef.current) {
      window.clearTimeout(visualRunTimeoutRef.current);
    }
    // AOD's time-owned run must always release. Slow decode gets a generous
    // window; a missing/blocked decoder resolves through the declared endpoint.
    visualRunTimeoutRef.current = window.setTimeout(() => {
      if (visualRunRef.current === scene) onMediaError(scene);
    }, 6000);
  }, [onMediaError]);

  useEffect(() => {
    const onHashChange = () => {
      const target = phoneGroup45EntryFromHash(window.location.hash);
      pendingNavigationRef.current = target;
      setEntryScene(target);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    setCurrentScene(entryScene);
  }, [entryScene]);

  useEffect(() => {
    if (!adapters.ready) return;
    const target = pendingNavigationRef.current;
    scrollDirectionLockUntilRef.current = window.performance.now() + 280;
    setScrollDirection(1);
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ block: 'start' });
      // A hash/deep-link is an explicit forward entry, not a reverse gesture
      // inherited from the browser's restored scroll position.
      lastScrollYRef.current = window.scrollY;
      setScrollDirection(1);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [adapters.ready, entryScene]);

  useLayoutEffect(() => {
    if (!adapters.ready) return;
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const visualSnap = createPhoneScrollSnapLock({
      root,
      getScrollY: () => window.scrollY,
      scrollTo: (y) => window.scrollTo({ top: y, left: 0, behavior: 'auto' })
    });
    visualSnapRef.current = visualSnap;
    const render = () => {
      frame = 0;
      const viewportHeight = Math.max(1, window.innerHeight);
      const scrollY = window.scrollY;
      const previousScrollY = lastScrollYRef.current;
      const scrollDirectionLocked = window.performance.now()
        < scrollDirectionLockUntilRef.current;
      const nextScrollDirection: 1 | -1 | undefined = scrollDirectionLocked
        ? undefined
        : scrollY > previousScrollY + .5
          ? 1
          : scrollY < previousScrollY - .5
            ? -1
            : undefined;
      if (nextScrollDirection) {
        setScrollDirection((current) => (
          current === nextScrollDirection ? current : nextScrollDirection
        ));
      }
      const figure3Frame = frameForTrack(figure3TrackRef.current, viewportHeight);
      const ttgFrame = frameForTrack(ttgTrackRef.current, viewportHeight);
      const forwardDirection = nextScrollDirection === 1
        || (!nextScrollDirection && scrollY >= previousScrollY);
      const directVisualEntry = entryScene === 'figure3-animation'
        || entryScene === 'ttg-animation';
      const crossedFigure3 = figure3TrackRef.current && (
        phoneGroup45CrossedVisualStart(
          previousScrollY,
          scrollY,
          figure3TrackRef.current.getBoundingClientRect().top,
          viewportHeight
        )
        || (directVisualEntry
          && entryScene === 'figure3-animation'
          && figure3Frame.active)
      );
      const crossedTtg = ttgTrackRef.current && (
        phoneGroup45CrossedVisualStart(
          previousScrollY,
          scrollY,
          ttgTrackRef.current.getBoundingClientRect().top,
          viewportHeight
        )
        || (directVisualEntry
          && entryScene === 'ttg-animation'
          && ttgFrame.active)
      );
      if (!visualRunRef.current && forwardDirection && !reducedMotion) {
        const nextRun = crossedFigure3 && !failedVisualsRef.current.has('figure3-animation')
          ? 'figure3-animation'
          : crossedTtg && !failedVisualsRef.current.has('ttg-animation')
            ? 'ttg-animation'
            : null;
        if (nextRun) {
          const track = nextRun === 'figure3-animation'
            ? figure3TrackRef.current
            : ttgTrackRef.current;
          if (track) {
            visualRunRef.current = nextRun;
            root.setAttribute('data-phone-group45-visual-run', `${nextRun}:forward`);
            root.setAttribute('data-phone-group45-snap', 'locked');
            visualSnap.lock(window.scrollY + track.getBoundingClientRect().top);
            armVisualRunTimeout(nextRun);
            // Match the accepted AOD coordinator: start the mounted adapter in
            // the same turn that acquires the scroll lock. React state still
            // publishes visibility, but it is no longer a gate in front of
            // the first native video.play() call.
            if (nextRun === 'figure3-animation') {
              figure3Ref.current?.enter?.();
            } else {
              ttgRef.current?.enter?.();
            }
          }
        }
      }
      lastScrollYRef.current = window.scrollY;
      const heldVisual = visualRunRef.current;
      const activeFigure3 = {
        ...figure3Frame,
        active: heldVisual
          ? heldVisual === 'figure3-animation'
          : figure3Frame.active,
        prewarm: heldVisual === 'figure3-animation' || figure3Frame.prewarm
      };
      const activeTtg = {
        ...ttgFrame,
        active: heldVisual ? heldVisual === 'ttg-animation' : ttgFrame.active,
        prewarm: heldVisual === 'ttg-animation' || ttgFrame.prewarm
      };
      const nextStageScene: Group45VisualScene | null = heldVisual ?? (activeFigure3.active
        ? 'figure3-animation'
        : activeTtg.active
          ? 'ttg-animation'
          : null);
      setVisualActivity((current) => (
        current.figure3.active === activeFigure3.active
          && current.figure3.prewarm === activeFigure3.prewarm
          && current.ttg.active === activeTtg.active
          && current.ttg.prewarm === activeTtg.prewarm
          ? current
          : {
              figure3: {
                active: activeFigure3.active,
                prewarm: activeFigure3.prewarm
              },
              ttg: { active: activeTtg.active, prewarm: activeTtg.prewarm }
            }
      ));
      setStageScene((current) => current === nextStageScene
        ? current
        : nextStageScene);

      brandRef.current?.update(1);
      figure3Ref.current?.update(activeFigure3.progress);
      servicesRef.current?.update(1);
      ttgRef.current?.update(activeTtg.progress);
      labRef.current?.update(1);

      const brandElement = brandRef.current?.root() ?? null;
      const figure3Element = figure3TrackRef.current;
      const servicesElement = servicesRef.current?.root() ?? null;
      const ttgElement = ttgTrackRef.current;
      const labElement = labRef.current?.root() ?? null;
      brandFigure3Ref.current?.render(phoneGroup45BoundaryProgress(
        figure3Element?.getBoundingClientRect().top ?? viewportHeight,
        figure3Element?.getBoundingClientRect().height ?? viewportHeight,
        viewportHeight
      ));
      figure3ServicesRef.current?.render(phoneGroup45BoundaryProgress(
        servicesElement?.getBoundingClientRect().top ?? viewportHeight,
        servicesElement?.getBoundingClientRect().height ?? viewportHeight,
        viewportHeight
      ));
      servicesTtgRef.current?.render(phoneGroup45BoundaryProgress(
        ttgElement?.getBoundingClientRect().top ?? viewportHeight,
        ttgElement?.getBoundingClientRect().height ?? viewportHeight,
        viewportHeight
      ));
      ttgLabRef.current?.render(phoneGroup45BoundaryProgress(
        labElement?.getBoundingClientRect().top ?? viewportHeight,
        labElement?.getBoundingClientRect().height ?? viewportHeight,
        viewportHeight
      ));

      const sceneNodes: readonly [Group45PhoneSceneId, HTMLElement | null][] = [
        ['brand', brandElement],
        ['figure3-animation', figure3Element],
        ['services', servicesElement],
        ['ttg-animation', ttgElement],
        ['lab', labElement]
      ];
      const viewportMid = viewportHeight * .5;
      const active = sceneNodes.find(([, element]) => {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        return rect.top <= viewportMid && rect.bottom >= viewportMid;
      })?.[0] ?? entryScene;
      setCurrentScene((current) => current === active ? current : active);
      root.setAttribute('data-phone-group45-active-scene', active);
      root.setAttribute(
        'data-phone-group45-stage-active',
        String(nextStageScene !== null)
      );
      root.setAttribute(
        'data-phone-group45-stage-scene',
        nextStageScene ?? 'none'
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(render);
    };
    const retryBlockedVisual = () => {
      const scene = visualRunRef.current;
      if (!scene) return;
      const adapter = scene === 'figure3-animation'
        ? figure3Ref.current
        : ttgRef.current;
      const playbackState = adapter?.root()?.getAttribute(
        scene === 'figure3-animation'
          ? 'data-phone-figure3-playback'
          : 'data-phone-ttg-playback'
      );
      if (playbackState === 'blocked' || playbackState === 'suspended') {
        adapter?.enter?.();
      }
    };
    render();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    root.addEventListener('pointerdown', retryBlockedVisual, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      root.removeEventListener('pointerdown', retryBlockedVisual);
      if (visualRunTimeoutRef.current) {
        window.clearTimeout(visualRunTimeoutRef.current);
        visualRunTimeoutRef.current = 0;
      }
      visualRunRef.current = null;
      visualSnap.dispose();
      if (visualSnapRef.current === visualSnap) visualSnapRef.current = null;
      delete root.dataset.phoneGroup45Snap;
      delete root.dataset.phoneGroup45VisualRun;
    };
  }, [
    adapters.ready,
    armVisualRunTimeout,
    entryScene,
    reducedMotion
  ]);

  useEffect(() => () => {
    if (visualCompletionFrameRef.current) {
      window.cancelAnimationFrame(visualCompletionFrameRef.current);
    }
    if (visualRunTimeoutRef.current) {
      window.clearTimeout(visualRunTimeoutRef.current);
    }
    visualSnapRef.current?.dispose();
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

  if (adapters.failed) {
    return (
      <main className="phone-brand-lab phone-brand-lab--fallback" data-phone-group45-state="fallback">
        <p>Brand → Lab 内容暂时无法载入，请刷新后重试。</p>
      </main>
    );
  }

  if (!adapters.ready) {
    return (
      <main className="phone-brand-lab phone-brand-lab--loading" data-phone-group45-state="loading">
        <p>正在准备 Brand → Lab…</p>
      </main>
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

  return (
    <main
      ref={rootRef}
      className="portrait-scroll-spike phone-brand-lab"
      data-phone-validation-scope="brand-lab"
      data-phone-validation-mode={validationMode}
      data-phone-group45-state="ready"
      data-phone-group45-layout="persistent-fixed-stage"
      data-phone-proof-brand-input="stable-receiver"
      data-phone-motion={reducedMotion ? 'reduce' : 'full'}
      data-phone-group45-scroll-direction={scrollDirection}
      data-phone-group45-stage-active={String(stageScene !== null)}
      data-phone-group45-stage-scene={stageScene ?? 'none'}
      data-portrait-stage-active={String(stageScene !== null)}
      data-portrait-loader-ready="true"
    >
      <PhoneStageRail
        railRef={stageRailRef}
        viewportRef={stageViewportRef}
        stageRef={bindStageHost}
      >
        {entryIndex <= sceneIndex('figure3-animation') && Figure3 && (
          <Figure3
            ref={bindFigure3}
            active={visualActivity.figure3.active}
            direction={scrollDirection}
            prewarm={visualActivity.figure3.prewarm}
            reducedMotion={reducedMotion}
            onMediaError={onMediaError}
            onComplete={onVisualComplete}
          />
        )}
        {entryIndex <= sceneIndex('ttg-animation') && Ttg && (
          <Ttg
            ref={bindTtg}
            active={visualActivity.ttg.active}
            direction={scrollDirection}
            prewarm={visualActivity.ttg.prewarm}
            reducedMotion={reducedMotion}
            onMediaError={onMediaError}
            onComplete={onVisualComplete}
          />
        )}
      </PhoneStageRail>
      {entryIndex <= sceneIndex('brand') && Brand && (
        <Brand
          ref={bindBrand}
          active={currentScene === 'brand'}
          reducedMotion={reducedMotion}
        />
      )}
      {entryIndex <= sceneIndex('figure3-animation') && Figure3 && (
        <div
          id="figure3-animation"
          ref={figure3TrackRef}
          className="phone-brand-lab__visual-track phone-brand-lab__visual-track--figure3"
          data-phone-group45-track="figure3"
          aria-hidden="true"
        />
      )}
      {entryIndex <= sceneIndex('services') && Services && (
        <Services
          ref={bindServices}
          active={currentScene === 'services'}
          reducedMotion={reducedMotion}
        />
      )}
      {entryIndex <= sceneIndex('ttg-animation') && Ttg && (
        <div
          id="ttg-animation"
          ref={ttgTrackRef}
          className="phone-brand-lab__visual-track phone-brand-lab__visual-track--ttg"
          data-phone-group45-track="ttg"
          aria-hidden="true"
        />
      )}
      {entryIndex <= sceneIndex('lab') && Lab && (
        <Lab
          ref={bindLab}
          active={currentScene === 'lab'}
          reducedMotion={reducedMotion}
        />
      )}

      {entryIndex <= sceneIndex('brand') && BrandFigure3 && (
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
      {entryIndex <= sceneIndex('figure3-animation') && Figure3Services && (
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
      {entryIndex <= sceneIndex('services') && ServicesTtg && (
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
      {entryIndex <= sceneIndex('ttg-animation') && TtgLab && (
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
      <StoryNav
        currentScene={currentScene}
        visible
        menuOpen={menuOpen}
        menuItems={GROUP45_NAV_ITEMS}
        showCta={false}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onNavigate={navigate}
      />
    </main>
  );
}

export default PhoneBrandLabStory;
