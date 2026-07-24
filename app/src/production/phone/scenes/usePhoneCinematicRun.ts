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

export type PhoneCinematicDirection = 1 | -1;

type Player = {
  start(): void;
  stop(): void;
  dispose(): void;
};

export function usePhoneCinematicRun(options: Readonly<{
  scene: PhoneLabContactCinematicScene;
  stateKey: 'ph' | 'crane';
  rootRef: RefObject<HTMLElement | null>;
  forwardRef: RefObject<Player | null>;
  reverseRef: RefObject<Player | null>;
  reducedMotion: boolean;
  terminalProgress: number;
  reverseTimeoutMs: number;
  reverseReady: () => boolean;
  activateSurface: (mode: 'forward' | 'endpoint') => void;
  render: (progress: number, direction?: PhoneCinematicDirection) => void;
  beforeForward?: () => void;
  beforeReverse?: () => void;
}>) {
  const requestedRef = useRef<PhoneCinematicDirection | null>(null);
  const reverseStartedRef = useRef(false);
  const timerRef = useRef(0);
  const clearTimer = useCallback(() => {
    if (!timerRef.current) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = 0;
  }, []);
  const publish = useCallback((
    phase: 'start' | 'playing' | 'complete',
    direction: PhoneCinematicDirection
  ) => {
    dispatchPhoneLabContactAutoplay(options.rootRef.current, {
      scene: options.scene,
      phase,
      direction
    });
  }, [options.rootRef, options.scene]);
  const completeRun = useCallback((direction: PhoneCinematicDirection) => {
    const root = options.rootRef.current;
    clearTimer();
    reverseStartedRef.current = false;
    requestedRef.current = null;
    root?.setAttribute(
      `data-phone-${options.stateKey}-autoplay`,
      direction === 1 ? 'complete-forward' : 'complete-reverse'
    );
    root?.setAttribute(
      `data-phone-${options.stateKey}-state`,
      direction === 1 ? 'endpoint' : 'opening'
    );
    publish('complete', direction);
  }, [clearTimer, options.rootRef, options.stateKey, publish]);
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
    root.setAttribute(
      `data-phone-${options.stateKey}-autoplay`,
      'playing-reverse'
    );
    options.reverseRef.current?.start();
    publish('playing', -1);
  }, [
    clearTimer,
    options.reverseReady,
    options.reverseRef,
    options.rootRef,
    options.stateKey,
    publish
  ]);
  const stopRun = useCallback(() => {
    requestedRef.current = null;
    reverseStartedRef.current = false;
    clearTimer();
    options.forwardRef.current?.stop();
    options.reverseRef.current?.stop();
  }, [clearTimer, options.forwardRef, options.reverseRef]);
  const startRun = useCallback((direction: PhoneCinematicDirection) => {
    const root = options.rootRef.current;
    if (!root) return;
    requestedRef.current = direction;
    root.setAttribute(
      `data-phone-${options.stateKey}-autoplay`,
      direction === 1 ? 'starting-forward' : 'starting-reverse'
    );
    publish('start', direction);
    if (options.reducedMotion) {
      options.render(direction === 1 ? options.terminalProgress : 0, direction);
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
    root.setAttribute(
      `data-phone-${options.stateKey}-autoplay`,
      'preparing-reverse'
    );
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
    options.stateKey,
    options.terminalProgress,
    publish
  ]);
  const disposeRun = useCallback(() => {
    stopRun();
    options.forwardRef.current?.dispose();
    options.reverseRef.current?.dispose();
  }, [options.forwardRef, options.reverseRef, stopRun]);
  const publishPlaying = useCallback(() => publish('playing', 1), [publish]);

  return useMemo(() => ({
    requestedRef,
    beginPreparedReverse,
    completeRun,
    publishPlaying,
    startRun,
    stopRun,
    disposeRun
  } as const), [
    beginPreparedReverse,
    completeRun,
    disposeRun,
    publishPlaying,
    startRun,
    stopRun
  ]);
}
