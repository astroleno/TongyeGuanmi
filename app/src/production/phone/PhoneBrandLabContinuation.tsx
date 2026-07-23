import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import { createPortal } from 'react-dom';
import type {
  ScenePresentationAdapterHandle,
  TransitionPresentationAdapterHandle
} from '../../story/presentation';
import type {
  Group45CheckpointId,
  PhoneCheckpointId
} from '../../story/semantic-checkpoints';
import type { SceneId } from '../../story/types';
import { sceneFromHash } from '../navigation';
import {
  group45PhoneSceneIds,
  type Group45PhoneSceneId
} from './adapter-groups/group4-5';
import type { PhoneEdgeScene } from './phone-edge-surface';
import {
  createPhoneScrollSnapLock,
  type PhoneScrollSnapLock
} from './phone-scroll-snap-lock';
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
  navigationTarget?: Group45PhoneSceneId;
  validationMode?: string | undefined;
  onBrandRootChange?: (root: HTMLElement | null) => void;
  onCheckpoint?: (checkpoint: PhoneCheckpointId) => void;
  onEdgeScene?: (scene: PhoneEdgeScene) => void;
  onLabBoundaryChange?: (
    boundary: Readonly<{
      root: HTMLElement;
      adapter: ScenePresentationAdapterHandle;
    }> | null
  ) => void;
  onSceneChange?: (scene: Group45PhoneSceneId) => void;
  onStageSceneChange?: (scene: Group45VisualScene | null) => void;
}>;

type VisualActivity = Readonly<{
  active: boolean;
  prewarm: boolean;
}>;

export type Group45VisualScene = Extract<
  Group45PhoneSceneId,
  'figure3-animation' | 'ttg-animation'
>;

type VisualHandoffReason = 'complete' | 'media-failure';
type VisualRunDirection = 1 | -1;
export type PhoneGroup45VisualRunPhase =
  | 'initial'
  | 'forward'
  | 'complete'
  | 'reverse';

const GROUP45_SCENES = new Set<Group45PhoneSceneId>(group45PhoneSceneIds);

function group45EdgeScene(scene: Group45PhoneSceneId): PhoneEdgeScene {
  switch (scene) {
    case 'figure3-animation':
      return 'figure3';
    case 'ttg-animation':
      return 'ttg';
    default:
      return scene;
  }
}

function group45CheckpointForScene(
  scene: Group45PhoneSceneId
): Group45CheckpointId {
  switch (scene) {
    case 'brand':
      return 'brand-reading';
    case 'figure3-animation':
      return 'figure3-stage';
    case 'services':
      return 'services-reading';
    case 'ttg-animation':
      return 'ttg-stage';
    case 'lab':
      return 'lab-stable';
  }
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** A visual cannot replay until the opposite traversal reaches its endpoint. */
export function phoneGroup45CanBeginVisualRun(
  phase: PhoneGroup45VisualRunPhase,
  direction: VisualRunDirection
): boolean {
  return direction === 1 ? phase === 'initial' : phase === 'complete';
}

export function phoneGroup45PhaseAfterVisualCompletion(
  direction: VisualRunDirection
): PhoneGroup45VisualRunPhase {
  return direction === 1 ? 'complete' : 'initial';
}

/** Figure2 keeps its adjacent terminal media parked for an immediate reverse.
 * TTG follows that same rule until Lab hands ownership to the next unit. */
export function phoneGroup45RetainsTtgTerminal(
  phase: PhoneGroup45VisualRunPhase
): boolean {
  return phase === 'complete';
}

/** Keep Figure3's verified terminal canvas beside Services until TTG needs
 * the sole media slot. This mirrors Figure2's retained adjacent endpoint and
 * prevents Safari from rebuilding the decoder at the reverse boundary. */
export function phoneGroup45RetainsFigure3Terminal(
  phase: PhoneGroup45VisualRunPhase,
  ttgPrewarming = false
): boolean {
  return phase === 'complete' && !ttgPrewarming;
}

/** Safari can hold native scroll exactly on a shared edge. Arm reverse from
 * touch intent there instead of requiring an otherwise invisible -1px scroll. */
export function phoneGroup45CanArmReverseGesture(
  phase: PhoneGroup45VisualRunPhase,
  scrollY: number,
  boundaryY: number,
  tolerance = 32
): boolean {
  return phase === 'complete'
    && Math.abs(scrollY - boundaryY) <= Math.max(0, tolerance);
}

/** A downward finger drag is the native touch intent for moving back up. */
export function phoneGroup45HasReverseGestureIntent(
  startY: number,
  currentY: number,
  threshold = 10
): boolean {
  return currentY - startY >= Math.max(1, threshold);
}

function isGroup45Scene(scene: SceneId | undefined): scene is Group45PhoneSceneId {
  return Boolean(scene && GROUP45_SCENES.has(scene as Group45PhoneSceneId));
}

export function phoneGroup45SceneFromHash(
  hash: string
): Group45PhoneSceneId | undefined {
  const scene = sceneFromHash(hash);
  return isGroup45Scene(scene) ? scene : undefined;
}

/** Unknown hashes begin at the stable Proof → Brand receiver. */
export function phoneGroup45EntryFromHash(hash: string): Group45PhoneSceneId {
  return phoneGroup45SceneFromHash(hash) ?? 'brand';
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
  _targetHeight: number,
  viewportHeight: number
): number {
  const start = viewportHeight * .85;
  const end = 0;
  return clamp((start - targetTop) / Math.max(1, start - end));
}

/**
 * Reduced motion keeps the visual endpoint at the browser's aligned edge,
 * then commits the receiver on the next physical forward scroll. Chromium and
 * WebKit quantize fractional document offsets in opposite directions, so raw
 * `targetTop < 0` cannot identify the semantic edge by itself.
 */
export function phoneGroup45ReducedReceiverProgress(
  targetTop: number,
  scrollDelta: number,
  current: 0 | 1
): 0 | 1 {
  const alignedUpperEdge = 1;
  const committedLowerEdge = -.5;
  if (targetTop > alignedUpperEdge) return 0;
  if (targetTop < committedLowerEdge) return 1;
  if (scrollDelta < -.01) return 0;
  if (scrollDelta > .01) {
    const previousTargetTop = targetTop + scrollDelta;
    return previousTargetTop <= alignedUpperEdge ? 1 : 0;
  }
  return current;
}

/**
 * An autonomous visual run owns the whole stage until its media endpoint is
 * complete. Keep the upstream scroll transition committed to that visual;
 * sampling an overshot native-scroll position here would reveal an earlier
 * chapter (or its ink mask) while the current scene is still reversing.
 */
export function phoneGroup45CommittedBoundaryProgress(
  rawProgress: number,
  visualHeld: boolean
): number {
  return visualHeld ? 1 : clamp(rawProgress);
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
  trackTop: number
): boolean {
  const documentTop = scrollY + trackTop;
  const triggerY = Math.max(0, documentTop);
  return previousScrollY < triggerY && scrollY >= triggerY;
}

/** Reverse autoplay begins at the same semantic boundary used by forward. */
export function phoneGroup45CrossedVisualBoundary(
  previousScrollY: number,
  scrollY: number,
  trackTop: number
): boolean {
  const documentTop = scrollY + trackTop;
  const movingUp = scrollY < previousScrollY - .5;
  if (!movingUp) return false;
  const crossed = previousScrollY >= documentTop - 1
    && scrollY < documentTop - 1;
  // Safari may settle a native pan on the exact shared edge and never expose
  // the otherwise-required -1px sample. Lock inside the same 32px intent
  // window used by the touch path, before momentum can be swallowed.
  const approaching = previousScrollY > documentTop + 1
    && scrollY <= documentTop + 32;
  return crossed || approaching;
}

/**
 * Match the accepted AOD reverse coordinator: once an upward gesture has
 * crossed a visual boundary, pin the physical position already presented by
 * native scroll. Pulling the document back down to the boundary would replay
 * the same reading opener before the reverse media run begins.
 */
export function phoneGroup45VisualRunAnchor(
  scrollY: number,
  boundaryY: number,
  direction: VisualRunDirection
): number {
  return direction === -1
    ? Math.min(scrollY, boundaryY)
    : boundaryY;
}

function frameForTrack(element: HTMLElement | null, viewportHeight: number) {
  if (!element) return { active: false, prewarm: false, progress: 0 };
  const rect = element.getBoundingClientRect();
  return phoneGroup45TrackActivity(rect.top, rect.height, viewportHeight);
}

/**
 * Embeddable Unit 5 continuation. The caller owns the document shell, edge
 * publisher, navigation, and the one persistent fixed stage. This component
 * contributes only native reading roots, scroll markers, and stage surfaces.
 */
export const PhoneBrandLabContinuation = forwardRef<
  PhoneBrandLabContinuationHandle,
  PhoneBrandLabContinuationProps
>(function PhoneBrandLabContinuation({
  reducedMotion,
  stageHost,
  entryScene = 'brand',
  navigationTarget,
  validationMode,
  onBrandRootChange,
  onCheckpoint,
  onEdgeScene,
  onLabBoundaryChange,
  onSceneChange,
  onStageSceneChange
}, forwardedRef) {
  const [adapterScene, setAdapterScene] = useState<Group45PhoneSceneId>(
    entryScene
  );
  const adapters = usePhoneGroup45Adapters(entryScene, adapterScene);
  const [currentScene, setCurrentScene] = useState<Group45PhoneSceneId>(entryScene);
  const [continuationActive, setContinuationActive] = useState(false);
  const [adapterRevision, setAdapterRevision] = useState(0);
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
  const visualCompletionFrameRef = useRef(0);
  const visualRunTimeoutRef = useRef(0);
  const visualRunRef = useRef<Group45VisualScene | null>(null);
  const visualRunDirectionRef = useRef<VisualRunDirection>(1);
  const visualRunPhaseRef = useRef<Record<
    Group45VisualScene,
    PhoneGroup45VisualRunPhase
  >>({
    'figure3-animation': 'initial',
    'ttg-animation': 'initial'
  });
  const reducedReceiverRef = useRef<Record<Group45VisualScene, 0 | 1>>({
    'figure3-animation': 0,
    'ttg-animation': 0
  });
  const visualSnapRef = useRef<PhoneScrollSnapLock | null>(null);
  const failedVisualsRef = useRef(new Set<Group45VisualScene>());
  const lastScrollYRef = useRef(
    typeof window === 'undefined' ? 0 : window.scrollY
  );
  const scrollDirectionLockUntilRef = useRef(0);
  const entryIndex = sceneIndex(entryScene);
  const edgeScene = stageScene === 'ttg-animation' && visualActivity.ttg.active
    ? stageScene
    : currentScene;

  useLayoutEffect(() => {
    if (!continuationActive) return;
    rootRef.current?.setAttribute('data-phone-group45-edge-scene', edgeScene);
    onEdgeScene?.(group45EdgeScene(edgeScene));
  }, [continuationActive, edgeScene, onEdgeScene]);

  useEffect(() => {
    if (!continuationActive) return;
    const activeScene = stageScene ?? currentScene;
    onSceneChange?.(activeScene);
    onCheckpoint?.(group45CheckpointForScene(activeScene));
  }, [
    continuationActive,
    currentScene,
    onCheckpoint,
    onSceneChange,
    stageScene
  ]);

  useEffect(() => {
    onStageSceneChange?.(stageScene);
  }, [onStageSceneChange, stageScene]);

  useImperativeHandle(forwardedRef, () => ({
    brandRoot: () => brandRef.current?.root() ?? null,
    labRoot: () => labRef.current?.root() ?? null,
    labAdapter: () => labRef.current
  }), []);

  const publishAdapter = useCallback(() => {
    setAdapterRevision((revision) => revision + 1);
  }, []);
  const bindBrand = useCallback((handle: ScenePresentationAdapterHandle | null) => {
    if (brandRef.current === handle) return;
    brandRef.current = handle;
    onBrandRootChange?.(handle?.root() ?? null);
    publishAdapter();
  }, [onBrandRootChange, publishAdapter]);
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
    const root = handle?.root() ?? null;
    onLabBoundaryChange?.(root && handle ? { root, adapter: handle } : null);
    publishAdapter();
  }, [onLabBoundaryChange, publishAdapter]);
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

  /**
   * A cinematic chapter owns exactly one physical screen. Once its media has
   * reached the authored endpoint, reveal the next native receiver on the
   * same document rail instead of manufacturing an extra terminal hold.
   */
  const handoffVisual = useCallback((
    scene: Group45VisualScene,
    reason: VisualHandoffReason,
    direction: VisualRunDirection = visualRunDirectionRef.current
  ) => {
    if (reason === 'complete' && reducedMotion) return;
    const receiver = direction === 1
      ? scene === 'figure3-animation'
        ? servicesRef.current?.root() ?? null
        : labRef.current?.root() ?? null
      : null;
    const track = scene === 'figure3-animation'
      ? figure3TrackRef.current
      : ttgTrackRef.current;
    const target = direction === 1
      ? scene === 'figure3-animation' ? 'services' : 'lab'
      : scene === 'figure3-animation' ? 'brand' : 'services';
    if (
      visualRunRef.current !== scene
      || visualRunDirectionRef.current !== direction
      || (direction === 1 ? !receiver : !track)
    ) return;
    if (visualRunTimeoutRef.current) {
      window.clearTimeout(visualRunTimeoutRef.current);
      visualRunTimeoutRef.current = 0;
    }
    if (visualCompletionFrameRef.current) {
      window.cancelAnimationFrame(visualCompletionFrameRef.current);
    }
    rootRef.current?.setAttribute(
      'data-phone-group45-complete-handoff',
      `${scene}-${target}:${reason}:${direction === 1 ? 'forward' : 'reverse'}`
    );
    if (direction === 1) {
      onCheckpoint?.(
        scene === 'figure3-animation'
          ? 'figure3-to-services'
          : 'ttg-to-lab'
      );
    }
    scrollDirectionLockUntilRef.current = window.performance.now() + 280;
    setScrollDirection(direction);
    // Figure3/Services and TTG/Lab share one document boundary. Commit the
    // receiver in the next compositor frame without changing scroll position
    // or translating the receiver between stage and document coordinates.
    visualCompletionFrameRef.current = window.requestAnimationFrame(() => {
      visualCompletionFrameRef.current = 0;
      const latestReceiver = direction === 1
        ? scene === 'figure3-animation'
          ? servicesRef.current?.root() ?? null
          : labRef.current?.root() ?? null
        : null;
      const latestTrack = scene === 'figure3-animation'
        ? figure3TrackRef.current
        : ttgTrackRef.current;
      if (
        visualRunRef.current !== scene
        || visualRunDirectionRef.current !== direction
        || (direction === 1 ? !latestReceiver : !latestTrack)
      ) return;
      if (scene === 'figure3-animation') {
        figure3Ref.current?.leave?.();
        if (direction === 1) figure3ServicesRef.current?.leave?.();
        else figure3ServicesRef.current?.enter?.();
      } else {
        ttgRef.current?.leave?.();
        if (direction === 1) ttgLabRef.current?.leave?.();
        else ttgLabRef.current?.enter?.();
      }
      visualRunRef.current = null;
      visualSnapRef.current?.release();
      const keepStage = direction === -1;
      const root = rootRef.current;
      root?.setAttribute('data-phone-group45-snap', 'released');
      root?.setAttribute('data-phone-group45-visual-run', 'idle');
      root?.setAttribute('data-phone-group45-stage-active', String(keepStage));
      root?.setAttribute(
        'data-phone-group45-stage-scene',
        keepStage ? scene : 'none'
      );
      root?.setAttribute('data-phone-group45-active-scene', target);
      root?.setAttribute('data-portrait-stage-active', String(keepStage));
      lastScrollYRef.current = window.scrollY;
      setCurrentScene(target);
      setStageScene(keepStage ? scene : null);
      setVisualActivity((current) => ({
        figure3: {
          ...current.figure3,
          active: false,
          prewarm: scene === 'figure3-animation'
            && (direction === -1 || phoneGroup45RetainsFigure3Terminal(
              visualRunPhaseRef.current['figure3-animation']
            ))
        },
        ttg: {
          ...current.ttg,
          active: false,
          prewarm: scene === 'ttg-animation'
            && (direction === -1 || phoneGroup45RetainsTtgTerminal(
              visualRunPhaseRef.current['ttg-animation']
            ))
        }
      }));
    });
  }, [onCheckpoint, reducedMotion]);

  const onMediaError = useCallback((scene: Group45PhoneSceneId) => {
    if (scene !== 'figure3-animation' && scene !== 'ttg-animation') return;
    const direction = visualRunDirectionRef.current;
    visualRunPhaseRef.current[scene] = phoneGroup45PhaseAfterVisualCompletion(
      direction
    );
    failedVisualsRef.current.add(scene);
    const target = direction === 1
      ? scene === 'figure3-animation' ? 'services' : 'lab'
      : scene === 'figure3-animation' ? 'brand' : 'services';
    rootRef.current?.setAttribute('data-phone-group45-media-fallback', target);
    if (scene === 'figure3-animation') {
      figure3Ref.current?.update(direction === 1 ? 1 : 0);
      figure3ServicesRef.current?.render(direction === 1 ? 1 : 0);
    } else {
      ttgRef.current?.update(direction === 1 ? 1 : 0);
      ttgLabRef.current?.render(direction === 1 ? 1 : 0);
    }
    handoffVisual(scene, 'media-failure', direction);
  }, [handoffVisual]);

  const onVisualComplete = useCallback((
    scene: Group45PhoneSceneId,
    direction: VisualRunDirection
  ) => {
    if (scene !== 'figure3-animation' && scene !== 'ttg-animation') return;
    if (
      visualRunRef.current !== scene
      || visualRunDirectionRef.current !== direction
    ) return;
    visualRunPhaseRef.current[scene] = phoneGroup45PhaseAfterVisualCompletion(
      direction
    );
    handoffVisual(scene, 'complete', direction);
  }, [handoffVisual]);

  const onVisualProgress = useCallback((
    scene: Group45PhoneSceneId,
    progress: number,
    direction: VisualRunDirection
  ) => {
    if (
      (scene !== 'figure3-animation' && scene !== 'ttg-animation')
      || visualRunRef.current !== scene
      || visualRunDirectionRef.current !== direction
    ) return;
    rootRef.current?.setAttribute(
      'data-phone-group45-visual-progress',
      `${scene}:${direction}:${clamp(progress).toFixed(4)}`
    );
    if (scene === 'figure3-animation') {
      // The transition adapter maps canonical Figure3 progress 0.8 → 1 to
      // Services entrance 0 → 1, exactly like the accepted AOD handoff.
      figure3ServicesRef.current?.render(progress);
    } else {
      // TTG publishes the desktop combined timeline: media occupies the first
      // 2500 ms and the same Lab document root dissolves over the final 600 ms.
      ttgLabRef.current?.render(progress);
    }
  }, []);

  const armVisualRunTimeout = useCallback((scene: Group45VisualScene) => {
    if (visualRunTimeoutRef.current) {
      window.clearTimeout(visualRunTimeoutRef.current);
    }
    // AOD's time-owned run must always release. Slow decode gets a generous
    // window; a missing/blocked decoder resolves through the declared endpoint.
    visualRunTimeoutRef.current = window.setTimeout(() => {
      if (visualRunRef.current === scene) onMediaError(scene);
    }, 10000);
  }, [onMediaError]);

  useEffect(() => {
    const target = navigationTarget ?? entryScene;
    reducedReceiverRef.current = {
      'figure3-animation': sceneIndex(target) >= sceneIndex('services') ? 1 : 0,
      'ttg-animation': sceneIndex(target) >= sceneIndex('lab') ? 1 : 0
    };
    setCurrentScene(entryScene);
    setAdapterScene(entryScene);
  }, [entryScene, navigationTarget]);

  useEffect(() => {
    setAdapterScene((current) => (
      sceneIndex(current) >= sceneIndex(currentScene) ? current : currentScene
    ));
  }, [currentScene]);

  useEffect(() => {
    if (!adapters.entryReady) return;
    const target = navigationTarget ?? entryScene;
    const shouldNavigate = Boolean(navigationTarget || entryScene !== 'brand');
    scrollDirectionLockUntilRef.current = window.performance.now() + 280;
    setScrollDirection(1);
    if (!shouldNavigate) {
      // A hash/deep-link is an explicit forward entry, not a reverse gesture
      // inherited from the browser's restored scroll position.
      lastScrollYRef.current = window.scrollY;
      return;
    }

    const owner = rootRef.current?.closest<HTMLElement>(
      'main.portrait-scroll-spike'
    ) ?? null;
    let frame = 0;
    let stableFrames = 0;
    let settled = false;
    let sawAodLock = owner?.dataset.phoneAodSnap === 'locked';
    const syncDirection = () => {
      scrollDirectionLockUntilRef.current = window.performance.now() + 280;
      lastScrollYRef.current = window.scrollY;
      setScrollDirection(1);
    };
    const schedule = () => {
      if (!settled && !frame) frame = window.requestAnimationFrame(position);
    };
    const position = () => {
      frame = 0;
      if (settled) return;
      const aodSnap = owner?.dataset.phoneAodSnap;
      if (aodSnap === 'locked') {
        sawAodLock = true;
        stableFrames = 0;
        return;
      }
      const element = document.getElementById(target);
      if (!element) {
        stableFrames = 0;
        schedule();
        return;
      }
      if (Math.abs(element.getBoundingClientRect().top) > 1) {
        stableFrames = 0;
        element.scrollIntoView({ block: 'start' });
        syncDirection();
        schedule();
        return;
      }
      stableFrames += 1;
      // Formal downstream deep links mark AOD complete before positioning.
      // Once that owner is settled, release this coordinator on the first
      // aligned frame so the reader's next scroll cannot be pulled back to
      // the hash target by a stale navigation requestAnimationFrame.
      if (
        owner?.dataset.portraitAodRun === 'complete'
        && aodSnap !== 'locked'
      ) {
        settled = true;
        syncDirection();
        return;
      }
      // A full-motion deep link can cross AOD before its snap coordinator
      // claims the scroll. Keep observing long enough to see that lock; if it
      // does, retry once the accepted AOD run releases at Method.
      if (
        stableFrames < 4
        || (sawAodLock && aodSnap !== 'released')
      ) {
        schedule();
        return;
      }
      settled = true;
      syncDirection();
    };
    const observer = new MutationObserver(() => {
      if (owner?.dataset.phoneAodSnap === 'locked') {
        sawAodLock = true;
        stableFrames = 0;
      }
      schedule();
    });
    if (owner) {
      observer.observe(owner, {
        attributes: true,
        attributeFilter: ['data-phone-aod-snap', 'data-portrait-aod-run']
      });
    }
    schedule();
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [adapters.entryReady, entryScene, navigationTarget]);

  useLayoutEffect(() => {
    if (!adapters.entryReady) return;
    const root = rootRef.current;
    if (!root) return;
    let frame = 0;
    const visualSnap = createPhoneScrollSnapLock({
      root,
      getScrollY: () => window.scrollY,
      scrollTo: (y) => window.scrollTo({ top: y, left: 0, behavior: 'auto' })
    });
    visualSnapRef.current = visualSnap;
    const beginVisualRun = (
      nextRun: Group45VisualScene,
      runDirection: VisualRunDirection
    ): boolean => {
      if (
        reducedMotion
        || visualRunRef.current
        || failedVisualsRef.current.has(nextRun)
        || !phoneGroup45CanBeginVisualRun(
          visualRunPhaseRef.current[nextRun],
          runDirection
        )
      ) return false;
      const track = nextRun === 'figure3-animation'
        ? figure3TrackRef.current
        : ttgTrackRef.current;
      if (!track) return false;

      visualRunRef.current = nextRun;
      visualRunDirectionRef.current = runDirection;
      visualRunPhaseRef.current[nextRun] = runDirection === 1
        ? 'forward'
        : 'reverse';
      if (runDirection === 1) {
        onCheckpoint?.(
          nextRun === 'figure3-animation'
            ? 'brand-to-figure3'
            : 'services-to-ttg'
        );
      }
      scrollDirectionLockUntilRef.current = window.performance.now() + 280;
      setScrollDirection(runDirection);
      setStageScene(nextRun);
      root.setAttribute(
        'data-phone-group45-visual-run',
        `${nextRun}:${runDirection === 1 ? 'forward' : 'reverse'}`
      );
      root.setAttribute('data-phone-group45-snap', 'locked');
      root.setAttribute('data-phone-group45-stage-active', 'true');
      root.setAttribute('data-phone-group45-stage-scene', nextRun);
      const trackTop = window.scrollY + track.getBoundingClientRect().top;
      visualSnap.lock(phoneGroup45VisualRunAnchor(
        window.scrollY,
        trackTop,
        runDirection
      ));
      armVisualRunTimeout(nextRun);

      // Match the accepted AOD coordinator: the mounted adapter starts in the
      // same turn as the scroll lock. Reverse touch intent uses this exact path
      // too, so there is still only one run owner and one semantic boundary.
      if (nextRun === 'figure3-animation') {
        if (runDirection === 1) {
          figure3ServicesRef.current?.enter?.();
          figure3Ref.current?.enter?.();
        } else {
          figure3ServicesRef.current?.reverse?.();
          figure3Ref.current?.reverse?.();
        }
      } else if (runDirection === 1) {
        ttgLabRef.current?.enter?.();
        ttgRef.current?.enter?.();
      } else {
        // Keep Lab covering the stage until TTG's terminal frame is prepared,
        // then the adapter dissolves this same root away.
        ttgLabRef.current?.reverse?.();
        ttgRef.current?.reverse?.();
      }
      return true;
    };
    const render = () => {
      frame = 0;
      const viewportHeight = Math.max(1, window.innerHeight);
      const continuationRect = root.getBoundingClientRect();
      const nextContinuationActive = continuationRect.top <= 1
        && continuationRect.bottom > 0;
      setContinuationActive((current) => (
        current === nextContinuationActive ? current : nextContinuationActive
      ));
      root.dataset.phoneGroup45Active = String(nextContinuationActive);
      const scrollY = window.scrollY;
      const previousScrollY = lastScrollYRef.current;
      const scrollDelta = scrollY - previousScrollY;
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
      const figure3Element = figure3TrackRef.current;
      const ttgElement = ttgTrackRef.current;
      const figure3Rect = figure3Element?.getBoundingClientRect();
      const ttgRect = ttgElement?.getBoundingClientRect();
      const figure3Frame = frameForTrack(figure3Element, viewportHeight);
      const ttgFrame = frameForTrack(ttgElement, viewportHeight);
      const prewarmAdapterScene = ttgFrame.prewarm
        ? 'ttg-animation'
        : figure3Frame.prewarm
          ? 'figure3-animation'
          : null;
      if (prewarmAdapterScene) {
        setAdapterScene((current) => (
          sceneIndex(current) >= sceneIndex(prewarmAdapterScene)
            ? current
            : prewarmAdapterScene
        ));
      }
      const brandFigure3Progress = phoneGroup45BoundaryProgress(
        figure3Rect?.top ?? viewportHeight,
        figure3Rect?.height ?? viewportHeight,
        viewportHeight
      );
      const servicesTtgProgress = phoneGroup45BoundaryProgress(
        ttgRect?.top ?? viewportHeight,
        ttgRect?.height ?? viewportHeight,
        viewportHeight
      );
      const figure3ReducedReceiver = reducedMotion && figure3Rect
        ? phoneGroup45ReducedReceiverProgress(
          figure3Rect.top,
          scrollDelta,
          reducedReceiverRef.current['figure3-animation']
        )
        : reducedReceiverRef.current['figure3-animation'];
      const ttgReducedReceiver = reducedMotion && ttgRect
        ? phoneGroup45ReducedReceiverProgress(
          ttgRect.top,
          scrollDelta,
          reducedReceiverRef.current['ttg-animation']
        )
        : reducedReceiverRef.current['ttg-animation'];
      if (reducedMotion) {
        reducedReceiverRef.current['figure3-animation'] = figure3ReducedReceiver;
        reducedReceiverRef.current['ttg-animation'] = ttgReducedReceiver;
      }
      const forwardDirection = nextScrollDirection === 1
        || (!nextScrollDirection && scrollY >= previousScrollY);
      const directEntryScene = navigationTarget ?? entryScene;
      const directVisualEntry = directEntryScene === 'figure3-animation'
        || directEntryScene === 'ttg-animation';
      const crossedFigure3 = figure3Element && figure3Rect && (
        phoneGroup45CrossedVisualStart(
          previousScrollY,
          scrollY,
          figure3Rect.top
        )
        || (forwardDirection
          && scrollY > previousScrollY + .5
          && figure3Frame.active
          && figure3Rect.top <= 1)
        || (directVisualEntry
          && directEntryScene === 'figure3-animation'
          && figure3Frame.active)
      );
      const crossedTtg = ttgElement && ttgRect && (
        phoneGroup45CrossedVisualStart(
          previousScrollY,
          scrollY,
          ttgRect.top
        )
        || (forwardDirection
          && scrollY > previousScrollY + .5
          && ttgFrame.active
          && ttgRect.top <= 1)
        || (directVisualEntry
          && directEntryScene === 'ttg-animation'
          && ttgFrame.active)
      );
      const crossedFigure3Boundary = figure3Element && figure3Rect
        ? phoneGroup45CrossedVisualBoundary(
          previousScrollY,
          scrollY,
          figure3Rect.top
        )
        : false;
      const crossedTtgBoundary = ttgElement && ttgRect
        ? phoneGroup45CrossedVisualBoundary(
          previousScrollY,
          scrollY,
          ttgRect.top
        )
        : false;
      if (!visualRunRef.current && !reducedMotion) {
        const nextRun = forwardDirection
          ? crossedFigure3
              && phoneGroup45CanBeginVisualRun(
                visualRunPhaseRef.current['figure3-animation'],
                1
              )
              && !failedVisualsRef.current.has('figure3-animation')
            ? 'figure3-animation'
            : crossedTtg
                && phoneGroup45CanBeginVisualRun(
                  visualRunPhaseRef.current['ttg-animation'],
                  1
                )
                && !failedVisualsRef.current.has('ttg-animation')
              ? 'ttg-animation'
              : null
          : crossedTtgBoundary
              && phoneGroup45CanBeginVisualRun(
                visualRunPhaseRef.current['ttg-animation'],
                -1
              )
              && !failedVisualsRef.current.has('ttg-animation')
            ? 'ttg-animation'
            : crossedFigure3Boundary
                && phoneGroup45CanBeginVisualRun(
                  visualRunPhaseRef.current['figure3-animation'],
                  -1
                )
                && !failedVisualsRef.current.has('figure3-animation')
              ? 'figure3-animation'
              : null;
        if (nextRun) beginVisualRun(nextRun, forwardDirection ? 1 : -1);
      }
      lastScrollYRef.current = window.scrollY;
      const heldVisual = visualRunRef.current;
      const figure3AtInitial = visualRunPhaseRef.current['figure3-animation'] === 'initial';
      const ttgAtInitial = visualRunPhaseRef.current['ttg-animation'] === 'initial';
      const figure3OwnsBoundary = figure3AtInitial && (reducedMotion
        ? brandFigure3Progress > .001
          && figure3ReducedReceiver === 0
        : figure3Frame.active
          || (brandFigure3Progress > .001 && (figure3Rect?.top ?? -1) >= 0));
      const ttgOwnsBoundary = ttgAtInitial && (reducedMotion
        ? servicesTtgProgress > .001
          && ttgReducedReceiver === 0
        : ttgFrame.active
          || (servicesTtgProgress > .001 && (ttgRect?.top ?? -1) >= 0));
      const ttgNeedsMedia = heldVisual === 'ttg-animation'
        || (ttgAtInitial && (
          ttgFrame.prewarm
          || ttgOwnsBoundary
        ));
      const activeFigure3 = {
        ...figure3Frame,
        active: heldVisual === 'figure3-animation',
        prewarm: heldVisual === 'figure3-animation'
          || (figure3AtInitial && (
            figure3Frame.prewarm
            || figure3OwnsBoundary
          ))
          || phoneGroup45RetainsFigure3Terminal(
            visualRunPhaseRef.current['figure3-animation'],
            ttgNeedsMedia
          )
      };
      const activeTtg = {
        ...ttgFrame,
        active: heldVisual === 'ttg-animation',
        prewarm: ttgNeedsMedia
          || phoneGroup45RetainsTtgTerminal(
            visualRunPhaseRef.current['ttg-animation']
          )
      };
      const nextStageScene: Group45VisualScene | null = heldVisual ?? (figure3OwnsBoundary
        ? 'figure3-animation'
        : ttgOwnsBoundary
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
      const servicesElement = servicesRef.current?.root() ?? null;
      const labElement = labRef.current?.root() ?? null;
      brandFigure3Ref.current?.render(phoneGroup45CommittedBoundaryProgress(
        brandFigure3Progress,
        heldVisual === 'figure3-animation'
      ));
      servicesTtgRef.current?.render(phoneGroup45CommittedBoundaryProgress(
        servicesTtgProgress,
        heldVisual === 'ttg-animation'
      ));
      if (reducedMotion) {
        // Reduced motion still traverses the same A/B boundary. The stable
        // visual endpoint owns exactly the boundary pixel; crossing it commits
        // the one reading root without starting media or adding a hold.
        figure3ServicesRef.current?.render(figure3ReducedReceiver);
        ttgLabRef.current?.render(ttgReducedReceiver);
      } else if (
        heldVisual !== 'ttg-animation'
        && visualRunPhaseRef.current['ttg-animation'] === 'initial'
      ) {
        // Before TTG owns the boundary, keep the one real Lab root hidden
        // underneath it. A completed forward run leaves Lab committed.
        ttgLabRef.current?.enter?.();
      }

      const readingSceneNodes: readonly [Group45PhoneSceneId, HTMLElement | null][] = [
        ['brand', brandElement],
        ['services', servicesElement],
        ['lab', labElement]
      ];
      const viewportMid = viewportHeight * .5;
      const active = heldVisual ?? nextStageScene ?? readingSceneNodes.find(([, element]) => {
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
    let reversePointerGesture: Readonly<{
      pointerId: number;
      scene: Group45VisualScene;
      startY: number;
    }> | null = null;
    let reverseTouchGesture: Readonly<{
      identifier: number;
      scene: Group45VisualScene;
      startY: number;
    }> | null = null;
    const eventTargetIsInteractive = (event: Event) => (
      event.target instanceof Element
      && Boolean(event.target.closest(
        'a, button, input, select, textarea, [role="button"]'
      ))
    );
    const reverseSceneAtBoundary = (): Group45VisualScene | null => {
      const candidates: readonly Group45VisualScene[] = [
        'ttg-animation',
        'figure3-animation'
      ];
      for (const scene of candidates) {
        const track = scene === 'figure3-animation'
          ? figure3TrackRef.current
          : ttgTrackRef.current;
        if (!track) continue;
        const boundaryY = window.scrollY + track.getBoundingClientRect().top;
        if (!phoneGroup45CanArmReverseGesture(
          visualRunPhaseRef.current[scene],
          window.scrollY,
          boundaryY
        )) continue;
        return scene;
      }
      return null;
    };
    const beginReverseGestureRun = (scene: Group45VisualScene) => {
      reversePointerGesture = null;
      reverseTouchGesture = null;
      if (beginVisualRun(scene, -1)) {
        root.dataset.phoneGroup45ReverseGesture = `${scene}:started`;
        lastScrollYRef.current = window.scrollY;
      } else {
        delete root.dataset.phoneGroup45ReverseGesture;
      }
    };
    const clearReverseGestureDatasetIfIdle = () => {
      if (!reversePointerGesture && !reverseTouchGesture) {
        delete root.dataset.phoneGroup45ReverseGesture;
      }
    };
    const onReversePointerDown = (event: PointerEvent) => {
      reversePointerGesture = null;
      if (
        event.pointerType !== 'touch'
        || !event.isPrimary
        || reducedMotion
        || visualRunRef.current
        || eventTargetIsInteractive(event)
      ) return;
      const scene = reverseSceneAtBoundary();
      if (!scene) return;
      reversePointerGesture = {
        pointerId: event.pointerId,
        scene,
        startY: event.clientY
      };
      root.dataset.phoneGroup45ReverseGesture = `${scene}:armed`;
    };
    const onReversePointerMove = (event: PointerEvent) => {
      const gesture = reversePointerGesture;
      if (
        !gesture
        || gesture.pointerId !== event.pointerId
        || !phoneGroup45HasReverseGestureIntent(
          gesture.startY,
          event.clientY
        )
      ) return;
      beginReverseGestureRun(gesture.scene);
    };
    const clearReversePointerGesture = (event: PointerEvent) => {
      if (reversePointerGesture?.pointerId !== event.pointerId) return;
      reversePointerGesture = null;
      clearReverseGestureDatasetIfIdle();
    };
    const touchWithIdentifier = (touches: TouchList, identifier: number) => {
      for (let index = 0; index < touches.length; index += 1) {
        const touch = touches.item(index);
        if (touch?.identifier === identifier) return touch;
      }
      return null;
    };
    const onReverseTouchStart = (event: TouchEvent) => {
      reverseTouchGesture = null;
      if (
        event.touches.length !== 1
        || reducedMotion
        || visualRunRef.current
        || eventTargetIsInteractive(event)
      ) return;
      const scene = reverseSceneAtBoundary();
      const touch = event.touches.item(0);
      if (!scene || !touch) return;
      reverseTouchGesture = {
        identifier: touch.identifier,
        scene,
        startY: touch.clientY
      };
      root.dataset.phoneGroup45ReverseGesture = `${scene}:armed`;
    };
    const onReverseTouchMove = (event: TouchEvent) => {
      const gesture = reverseTouchGesture;
      if (!gesture) return;
      const touch = touchWithIdentifier(event.touches, gesture.identifier);
      if (
        !touch
        || !phoneGroup45HasReverseGestureIntent(
          gesture.startY,
          touch.clientY
        )
      ) return;
      if (event.cancelable) event.preventDefault();
      beginReverseGestureRun(gesture.scene);
    };
    const clearReverseTouchGesture = (event: TouchEvent) => {
      const gesture = reverseTouchGesture;
      if (!gesture || touchWithIdentifier(event.touches, gesture.identifier)) {
        return;
      }
      reverseTouchGesture = null;
      clearReverseGestureDatasetIfIdle();
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
        if (visualRunDirectionRef.current === 1) adapter?.enter?.();
        else adapter?.reverse?.();
      }
    };
    // Register the non-passive listener before a gesture begins. If that same
    // gesture crosses into a time-owned run, iOS can cancel its remaining
    // momentum immediately instead of leaking one swipe into Lab.
    const preventHeldScroll = (event: Event) => {
      if (!visualSnap.locked) return;
      if (event.cancelable) event.preventDefault();
    };
    render();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    root.addEventListener('pointerdown', retryBlockedVisual, { passive: true });
    root.addEventListener('pointerdown', onReversePointerDown, { passive: true });
    root.addEventListener('pointermove', onReversePointerMove, { passive: true });
    root.addEventListener('pointerup', clearReversePointerGesture, { passive: true });
    root.addEventListener('pointercancel', clearReversePointerGesture, { passive: true });
    root.addEventListener('touchstart', onReverseTouchStart, { passive: true });
    root.addEventListener('touchmove', onReverseTouchMove, { passive: false });
    root.addEventListener('touchend', clearReverseTouchGesture, { passive: true });
    root.addEventListener('touchcancel', clearReverseTouchGesture, { passive: true });
    root.addEventListener('touchmove', preventHeldScroll, {
      passive: false,
      capture: true
    });
    root.addEventListener('wheel', preventHeldScroll, {
      passive: false,
      capture: true
    });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      root.removeEventListener('pointerdown', retryBlockedVisual);
      root.removeEventListener('pointerdown', onReversePointerDown);
      root.removeEventListener('pointermove', onReversePointerMove);
      root.removeEventListener('pointerup', clearReversePointerGesture);
      root.removeEventListener('pointercancel', clearReversePointerGesture);
      root.removeEventListener('touchstart', onReverseTouchStart);
      root.removeEventListener('touchmove', onReverseTouchMove);
      root.removeEventListener('touchend', clearReverseTouchGesture);
      root.removeEventListener('touchcancel', clearReverseTouchGesture);
      root.removeEventListener('touchmove', preventHeldScroll, true);
      root.removeEventListener('wheel', preventHeldScroll, true);
      if (visualRunTimeoutRef.current) {
        window.clearTimeout(visualRunTimeoutRef.current);
        visualRunTimeoutRef.current = 0;
      }
      visualRunRef.current = null;
      visualSnap.dispose();
      if (visualSnapRef.current === visualSnap) visualSnapRef.current = null;
      delete root.dataset.phoneGroup45Snap;
      delete root.dataset.phoneGroup45VisualRun;
      delete root.dataset.phoneGroup45VisualProgress;
      delete root.dataset.phoneGroup45ReverseGesture;
    };
  }, [
    adapterRevision,
    adapters.entryReady,
    armVisualRunTimeout,
    entryScene,
    navigationTarget,
    onCheckpoint,
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

  if (adapters.failed && !adapters.rootReady) {
    return (
      <section className="phone-brand-lab phone-brand-lab--fallback" data-phone-group45-state="fallback">
        <p>Brand → Lab 内容暂时无法载入，请刷新后重试。</p>
      </section>
    );
  }

  if (!adapters.rootReady) {
    return (
      <section className="phone-brand-lab phone-brand-lab--loading" data-phone-group45-state="loading">
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
      data-phone-group45-stage-active={String(stageScene !== null)}
      data-phone-group45-stage-scene={stageScene ?? 'none'}
      aria-hidden={stageScene === null}
    >
      {entryIndex <= sceneIndex('figure3-animation') && Figure3 && (
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
      {entryIndex <= sceneIndex('ttg-animation') && Ttg && (
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
      data-phone-group45-stage-active={String(stageScene !== null)}
      data-phone-group45-stage-scene={stageScene ?? 'none'}
      data-phone-lab-boundary="stable-lab-ph-input"
    >
      {stageHost ? createPortal(stageSurfaces, stageHost) : null}
      {entryIndex <= sceneIndex('brand') && Brand && (
        <Brand
          ref={bindBrand}
          active={currentScene === 'brand'}
          reducedMotion={reducedMotion}
        />
      )}
      {entryIndex <= sceneIndex('figure3-animation') && (
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
      {entryIndex <= sceneIndex('ttg-animation') && (
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
    </section>
  );
});

export default PhoneBrandLabContinuation;
