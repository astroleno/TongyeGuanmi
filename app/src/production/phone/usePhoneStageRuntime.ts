import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { FrontHalfCheckpointId } from '../../story/semantic-checkpoints';
import { createPhoneScrollSnapLock, type PhoneScrollSnapLock } from './phone-scroll-snap-lock';
import {
  PHONE_STAGE_STOPS,
  phoneAodCheckpointForMethodProgress,
  phoneAodCompletionCheckpoint,
  phoneStageFrame,
  type PhoneStageFrame
} from './phone-stage-timeline';
import type {
  PhoneAodAdapterHandle,
  PhoneSceneAdapterHandle,
  PhoneStageSceneId,
  PhoneTransitionAdapterHandle
} from './types';

const STAGE_SCENES: readonly PhoneStageSceneId[] = ['hero', 'pattern', 'star-map', 'aod-animation'];

gsap.registerPlugin(ScrollTrigger);

export function refreshPhoneScrollStage(): void {
  ScrollTrigger.refresh();
}

type SceneAdapterRefs = Readonly<Record<PhoneStageSceneId, RefObject<PhoneSceneAdapterHandle | null>>>;
type TransitionAdapterRefs = Readonly<{
  heroPattern: RefObject<PhoneTransitionAdapterHandle | null>;
  patternStarMap: RefObject<PhoneTransitionAdapterHandle | null>;
  starMapAod: RefObject<PhoneTransitionAdapterHandle | null>;
}>;

export type PhoneStageRuntimeOptions = Readonly<{
  rootRef: RefObject<HTMLElement | null>;
  railRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLElement | null>;
  sceneRefs: SceneAdapterRefs;
  aodRef: RefObject<PhoneAodAdapterHandle | null>;
  methodRef: RefObject<PhoneSceneAdapterHandle | null>;
  transitionRefs: TransitionAdapterRefs;
  enabled: boolean;
  reducedMotion: boolean;
  adapterRevision: number;
  mapAodToMethod: (progress: number) => number;
  onCheckpoint?(checkpoint: FrontHalfCheckpointId): void;
}>;

export type PhoneStageRuntime = Readonly<{
  stageActive: boolean;
  aodRun: 'idle' | 'forward' | 'complete' | 'reverse';
  onAodProgress(progress: number, direction: 1 | -1): void;
  onAodComplete(direction: 1 | -1): void;
}>;

function setSceneVisibility(element: HTMLElement | null, visible: boolean, zIndex: number): void {
  if (!element) return;
  element.style.visibility = visible ? 'visible' : 'hidden';
  element.style.zIndex = String(zIndex);
  element.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function aodReverseStartTolerance(start: number, end: number): number {
  // The media lock is intentionally just before the rail endpoint. Accept a
  // real reverse gesture from that anchor, but ignore a small toolbar-only
  // ScrollTrigger normalization delta.
  return Math.max(32, Math.abs(end - start) * 0.02);
}

function phoneRailAnchor(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

/**
 * Owns native rail sampling and generic adapter lifecycle calls. It has no
 * scene markup or asset URL knowledge; individual adapters remain the media
 * and canvas owners.
 */
export function usePhoneStageRuntime(options: PhoneStageRuntimeOptions): PhoneStageRuntime {
  const [stageActive, setStageActive] = useState(true);
  const [aodRun, setAodRun] = useState<'idle' | 'forward' | 'complete' | 'reverse'>('idle');
  const aodRunRef = useRef(aodRun);
  const aodProgressRef = useRef(0);
  const stageStartRef = useRef(0);
  const stageEndRef = useRef(1);
  const ownershipRef = useRef('');
  const activeScenesRef = useRef(new Set<PhoneStageSceneId>());
  const snapLockRef = useRef<PhoneScrollSnapLock | undefined>(undefined);
  const lastFrameProgressRef = useRef(Number.NaN);
  const checkpointRef = useRef<FrontHalfCheckpointId | undefined>(undefined);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const setAodRunState = useCallback((next: 'idle' | 'forward' | 'complete' | 'reverse') => {
    aodRunRef.current = next;
    setAodRun(next);
    const root = optionsRef.current.rootRef.current;
    if (root) root.dataset.phoneAodRun = next;
  }, []);

  const publishStageActive = useCallback((next: boolean) => {
    const root = optionsRef.current.rootRef.current;
    if (!root) return;
    if (!next && (aodRunRef.current === 'forward' || aodRunRef.current === 'reverse')) {
      root.dataset.phoneStageBoundary = 'held-by-aod';
      root.dataset.phoneStageActive = 'true';
      return;
    }
    delete root.dataset.phoneStageBoundary;
    root.dataset.phoneStageActive = String(next);
    setStageActive(next);
  }, []);

  const publishCheckpoint = useCallback((checkpoint: FrontHalfCheckpointId) => {
    const current = optionsRef.current;
    const root = current.rootRef.current;
    if (!root) return;
    root.dataset.phoneCheckpoint = checkpoint;
    if (checkpointRef.current !== checkpoint) {
      checkpointRef.current = checkpoint;
      current.onCheckpoint?.(checkpoint);
    }
  }, []);

  const applyFrame = useCallback((frame: PhoneStageFrame) => {
    const current = optionsRef.current;
    const root = current.rootRef.current;
    if (!root) return;
    const ownership = frame.ownership;
    const changed = ownershipRef.current !== ownership.key;
    ownershipRef.current = ownership.key;
    const visible = new Set(ownership.visible);
    for (const scene of STAGE_SCENES) {
      const adapter = current.sceneRefs[scene].current;
      const isVisible = visible.has(scene);
      const stackIndex = ownership.stack.indexOf(scene);
      setSceneVisibility(adapter?.root() ?? null, isVisible, stackIndex >= 0 ? ownership.stack.length + 1 - stackIndex : 0);
      if (changed && isVisible && !activeScenesRef.current.has(scene)) adapter?.enter?.();
      if (changed && !isVisible && activeScenesRef.current.has(scene)) adapter?.leave?.();
    }
    if (changed) {
      activeScenesRef.current = visible;
      root.dataset.phoneStageOwner = ownership.key;
    }
    root.dataset.phoneStageProgress = frame.progress.toFixed(4);
    // Once AOD has completed, document-flow Method owns the semantic position.
    // A rail refresh at its endpoint must not overwrite it with AOD autoplay.
    if (aodRunRef.current === 'idle') publishCheckpoint(frame.checkpoint);
    root.dataset.phoneDocumentSurface = frame.navigationScene;
    document.documentElement.dataset.phoneDocumentSurface = frame.navigationScene;
    current.sceneRefs.hero.current?.update(frame.heroProgress);
    current.sceneRefs.pattern.current?.update(frame.patternProgress);
    current.sceneRefs['star-map'].current?.update(frame.starProgress);
    if (aodRunRef.current === 'idle' || aodRunRef.current === 'complete') {
      current.aodRef.current?.update(aodProgressRef.current);
    }
    current.transitionRefs.heroPattern.current?.render(frame.heroPatternProgress);
    current.transitionRefs.patternStarMap.current?.render(frame.patternStarProgress);
    current.transitionRefs.starMapAod.current?.render(frame.starAodProgress);
  }, [publishCheckpoint]);

  const beginAodForward = useCallback(() => {
    const current = optionsRef.current;
    if (aodRunRef.current !== 'idle') return;
    const aod = current.aodRef.current;
    if (!aod) return;
    current.methodRef.current?.update(0);
    setAodRunState('forward');
    publishStageActive(true);
    const anchor = phoneRailAnchor(
      stageStartRef.current,
      stageEndRef.current,
      PHONE_STAGE_STOPS.aodAutoplayStart
    );
    snapLockRef.current?.lock(anchor);
    aod.startAutoplay(1);
  }, [publishStageActive, setAodRunState]);

  const beginAodReverse = useCallback((anchor = window.scrollY) => {
    const current = optionsRef.current;
    if (aodRunRef.current !== 'complete') return;
    const aod = current.aodRef.current;
    if (!aod) return;
    setAodRunState('reverse');
    publishStageActive(true);
    publishCheckpoint(phoneAodCheckpointForMethodProgress(1));
    snapLockRef.current?.lock(anchor);
    aod.startAutoplay(-1);
  }, [publishCheckpoint, publishStageActive, setAodRunState]);

  const onAodProgress = useCallback((progress: number) => {
    const current = optionsRef.current;
    aodProgressRef.current = Math.min(1, Math.max(0, progress));
    const methodProgress = current.mapAodToMethod(aodProgressRef.current);
    current.methodRef.current?.update(methodProgress);
    const root = current.rootRef.current;
    if (root) root.dataset.phoneAodMethodVisible = String(methodProgress > 0.001);
    if (aodRunRef.current === 'forward' || aodRunRef.current === 'reverse') {
      publishCheckpoint(phoneAodCheckpointForMethodProgress(methodProgress));
    }
  }, [publishCheckpoint]);

  const onAodComplete = useCallback((direction: 1 | -1) => {
    if (direction === 1) {
      setAodRunState('complete');
      publishStageActive(false);
    } else {
      setAodRunState('idle');
      optionsRef.current.methodRef.current?.update(0);
      snapLockRef.current?.lock(phoneRailAnchor(
        stageStartRef.current,
        stageEndRef.current,
        PHONE_STAGE_STOPS.starAodEnd
      ));
    }
    publishCheckpoint(phoneAodCompletionCheckpoint(direction));
    snapLockRef.current?.release();
  }, [publishCheckpoint, publishStageActive, setAodRunState]);

  useEffect(() => {
    const root = options.rootRef.current;
    if (!root || !options.enabled) return;
    const lock = createPhoneScrollSnapLock({
      root,
      getScrollY: () => window.scrollY,
      scrollTo: (top) => window.scrollTo({ top, left: 0, behavior: 'auto' })
    });
    snapLockRef.current = lock;
    root.dataset.phoneStagePin = 'native-fixed';
    root.dataset.phoneStageActive = 'true';
    root.dataset.phoneAodRun = 'idle';
    root.dataset.phoneAodMethodVisible = 'false';
    return () => {
      lock.dispose();
      if (snapLockRef.current === lock) snapLockRef.current = undefined;
      delete root.dataset.phoneStagePin;
      delete root.dataset.phoneStageActive;
      delete root.dataset.phoneStageOwner;
      delete root.dataset.phoneStageProgress;
      delete root.dataset.phoneCheckpoint;
      delete root.dataset.phoneAodRun;
      delete root.dataset.phoneAodMethodVisible;
      delete root.dataset.phoneStageBoundary;
      delete root.dataset.phoneDocumentSurface;
      delete document.documentElement.dataset.phoneDocumentSurface;
    };
  }, [options.enabled, options.rootRef]);

  useEffect(() => {
    const root = options.rootRef.current;
    const rail = options.railRef.current;
    if (!root || !rail || !options.enabled) return;
    let reversePointer: number | null = null;
    let reverseStartY = 0;
    const onPointerDown = (event: PointerEvent) => {
      const interactive = event.target instanceof Element
        && Boolean(event.target.closest('a, button, input, select, textarea, [role="button"]'));
      if (
        event.pointerType === 'touch'
        && !interactive
        && aodRunRef.current === 'complete'
        && Math.abs(window.scrollY - stageEndRef.current)
          <= aodReverseStartTolerance(stageStartRef.current, stageEndRef.current)
      ) {
        reversePointer = event.pointerId;
        reverseStartY = event.clientY;
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (reversePointer !== event.pointerId || event.clientY - reverseStartY < 10) return;
      reversePointer = null;
      beginAodReverse(Math.max(stageStartRef.current, stageEndRef.current - 1));
    };
    const clearPointer = (event: PointerEvent) => {
      if (reversePointer === event.pointerId) reversePointer = null;
    };
    root.addEventListener('pointerdown', onPointerDown, { passive: true });
    root.addEventListener('pointermove', onPointerMove, { passive: true });
    root.addEventListener('pointerup', clearPointer, { passive: true });
    root.addEventListener('pointercancel', clearPointer, { passive: true });
    ScrollTrigger.config({ ignoreMobileResize: true });
    const trigger = ScrollTrigger.create({
      id: 'phone-story-stage',
      trigger: rail,
      start: 'top top',
      end: 'bottom top',
      invalidateOnRefresh: true,
      onUpdate: (self) => {
        stageStartRef.current = self.start;
        stageEndRef.current = self.end;
        const frame = phoneStageFrame(self.progress, optionsRef.current.reducedMotion);
        const previous = lastFrameProgressRef.current;
        lastFrameProgressRef.current = frame.progress;
        applyFrame(frame);
        if (
          !optionsRef.current.reducedMotion
          && self.direction > 0
          && previous < 0.985
          && frame.shouldStartAodAutoplay
        ) {
          beginAodForward();
        }
        if (
          !optionsRef.current.reducedMotion
          && self.direction < 0
          && aodRunRef.current === 'complete'
          && window.scrollY < stageEndRef.current
            - aodReverseStartTolerance(stageStartRef.current, stageEndRef.current)
        ) beginAodReverse();
      },
      onRefresh: (self) => {
        stageStartRef.current = self.start;
        stageEndRef.current = self.end;
        applyFrame(phoneStageFrame(self.progress, optionsRef.current.reducedMotion));
        publishStageActive(
          aodRunRef.current !== 'complete'
            && (self.progress < 1 || aodRunRef.current === 'forward' || aodRunRef.current === 'reverse')
        );
      },
      onEnter: () => {
        if (aodRunRef.current !== 'complete') publishStageActive(true);
      },
      onEnterBack: () => {
        if (aodRunRef.current !== 'complete') publishStageActive(true);
      },
      onLeave: () => publishStageActive(false)
    });
    applyFrame(phoneStageFrame(trigger.progress, options.reducedMotion));
    const refresh = window.requestAnimationFrame(() => ScrollTrigger.refresh());
    return () => {
      window.cancelAnimationFrame(refresh);
      trigger.kill();
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', clearPointer);
      root.removeEventListener('pointercancel', clearPointer);
      for (const scene of STAGE_SCENES) options.sceneRefs[scene].current?.leave?.();
      options.aodRef.current?.resetAutoplay();
      options.transitionRefs.heroPattern.current?.dispose?.();
      options.transitionRefs.patternStarMap.current?.dispose?.();
      options.transitionRefs.starMapAod.current?.dispose?.();
      ScrollTrigger.config({ ignoreMobileResize: false });
    };
  }, [
    applyFrame,
    beginAodForward,
    beginAodReverse,
    options.adapterRevision,
    options.aodRef,
    options.enabled,
    options.railRef,
    options.reducedMotion,
    options.rootRef,
    options.sceneRefs,
    options.transitionRefs,
    publishStageActive
  ]);

  return { stageActive, aodRun, onAodProgress, onAodComplete };
}
