import {
  useCallback,
  useMemo,
  useRef,
  type RefObject
} from 'react';
import {
  dispatchPhoneLabContactAutoplay,
  type PhoneLabContactCinematicScene
} from '../phone-lab-contact-timeline';
import type { PhoneExecutionToken } from '../phone-story-state';

export type PhoneCinematicDirection = 1 | -1;

export type PhoneCinematicPlayer = {
  start(): void;
  stop(): void;
  dispose(): void;
};

/** Ordered inputs for the shared cinematic hook used by lazy scene chunks. */
export type PhoneCinematicRunRequest = readonly [
  scene: PhoneLabContactCinematicScene,
  rootRef: RefObject<HTMLElement | null>,
  forwardRef: RefObject<PhoneCinematicPlayer | null>,
  reverseRef: RefObject<PhoneCinematicPlayer | null>,
  reducedMotion: boolean,
  terminalProgress: number,
  reverseTimeoutMs: number,
  reverseReady: () => boolean,
  activateSurface: (mode: 'forward' | 'endpoint') => void,
  render: (progress: number, direction?: PhoneCinematicDirection) => void,
  beforeForward: (() => void) | null,
  beforeReverse: (() => void) | null
];

export type PhoneCinematicRun = readonly [
  requestedRef: { current: PhoneCinematicDirection | null },
  beginPreparedReverse: (force?: boolean) => void,
  completeRun: (direction: PhoneCinematicDirection) => void,
  failRun: (direction: PhoneCinematicDirection) => void,
  publishPlaying: () => void,
  renderProgress: (progress: number, direction: PhoneCinematicDirection) => void,
  startRun: (
    direction: PhoneCinematicDirection,
    identity?: PhoneExecutionToken | null
  ) => void,
  stopRun: () => void,
  disposeRun: () => void
];

export function usePhoneCinematicRun(
  [
    scene,
    rootRef,
    forwardRef,
    reverseRef,
    reducedMotion,
    terminalProgress,
    reverseTimeoutMs,
    reverseReady,
    activateSurface,
    render,
    beforeForward,
    beforeReverse
  ]: PhoneCinematicRunRequest
): PhoneCinematicRun {
  const options = {
    scene,
    rootRef,
    forwardRef,
    reverseRef,
    reducedMotion,
    terminalProgress,
    reverseTimeoutMs,
    reverseReady,
    activateSurface,
    render,
    beforeForward,
    beforeReverse
  };
  const requestedRef = useRef<PhoneCinematicDirection | null>(null);
  const activeIdentityRef = useRef<PhoneExecutionToken | null>(null);
  const reverseStartedRef = useRef(false);
  const timerRef = useRef(0);
  const clearTimer = useCallback(() => {
    if (!timerRef.current) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
  }, []);
  const publish = useCallback((
    phase: 'playing' | 'progress' | 'complete' | 'failed',
    direction: PhoneCinematicDirection,
    progress?: number
  ) => {
    const identity = activeIdentityRef.current;
    dispatchPhoneLabContactAutoplay(options.rootRef.current, [
      options.scene,
      phase,
      direction,
      identity,
      progress ?? null
    ]);
  }, [options.rootRef, options.scene]);
  const renderProgress = useCallback((
    progress: number,
    direction: PhoneCinematicDirection = 1
  ) => {
    options.render(progress, direction);
    publish('progress', direction, progress);
  }, [options.render, publish]);
  const completeRun = useCallback((direction: PhoneCinematicDirection) => {
    clearTimer();
    reverseStartedRef.current = false;
    requestedRef.current = null;
    publish('complete', direction);
    activeIdentityRef.current = null;
  }, [clearTimer, publish]);
  const failRun = useCallback((direction: PhoneCinematicDirection) => {
    clearTimer();
    reverseStartedRef.current = false;
    requestedRef.current = direction;
    publish('failed', direction);
    activeIdentityRef.current = null;
  }, [clearTimer, publish]);
  const beginPreparedReverse = useCallback((force = false) => {
    const root = options.rootRef.current;
    if (
      !root
      || requestedRef.current !== -1
      || reverseStartedRef.current
      || (!force && !options.reverseReady())
    ) return;
    clearTimer();
    reverseStartedRef.current = true;
    options.reverseRef.current?.start();
    publish('playing', -1);
  }, [
    clearTimer,
    options.reverseReady,
    options.reverseRef,
    options.rootRef,
    publish
  ]);
  const stopRun = useCallback(() => {
    requestedRef.current = null;
    activeIdentityRef.current = null;
    reverseStartedRef.current = false;
    clearTimer();
    options.forwardRef.current?.stop();
    options.reverseRef.current?.stop();
  }, [clearTimer, options.forwardRef, options.reverseRef]);
  const startRun = useCallback((
    direction: PhoneCinematicDirection,
    identity?: PhoneExecutionToken | null
  ) => {
    if (!options.rootRef.current) return;
    if (identity !== undefined) activeIdentityRef.current = identity;
    requestedRef.current = direction;
    if (options.reducedMotion) {
      renderProgress(
        direction === 1 ? options.terminalProgress : 0,
        direction
      );
      completeRun(direction);
      return;
    }
    if (direction === 1) {
      clearTimer();
      reverseStartedRef.current = false;
      options.reverseRef.current?.stop();
      options.activateSurface('forward');
      options.beforeForward?.();
      options.forwardRef.current?.start();
      return;
    }
    options.forwardRef.current?.stop();
    clearTimer();
    reverseStartedRef.current = false;
    options.beforeReverse?.();
    options.activateSurface('endpoint');
    if (options.reverseReady()) {
      beginPreparedReverse();
    } else {
      timerRef.current = window.setTimeout(
        () => beginPreparedReverse(true),
        options.reverseTimeoutMs
      );
    }
  }, [
    beginPreparedReverse,
    clearTimer,
    completeRun,
    options.activateSurface,
    options.beforeForward,
    options.beforeReverse,
    options.forwardRef,
    options.reducedMotion,
    options.render,
    options.reverseReady,
    options.reverseRef,
    options.reverseTimeoutMs,
    options.rootRef,
    options.terminalProgress,
    publish,
    renderProgress
  ]);
  const disposeRun = useCallback(() => {
    stopRun();
    options.forwardRef.current?.dispose();
    options.reverseRef.current?.dispose();
  }, [options.forwardRef, options.reverseRef, stopRun]);
  const publishPlaying = useCallback(() => publish('playing', 1), [publish]);

  return useMemo(() => [
    requestedRef,
    beginPreparedReverse,
    completeRun,
    failRun,
    publishPlaying,
    renderProgress,
    startRun,
    stopRun,
    disposeRun
  ] as const, [
    beginPreparedReverse,
    completeRun,
    disposeRun,
    failRun,
    publishPlaying,
    renderProgress,
    startRun,
    stopRun
  ]);
}
