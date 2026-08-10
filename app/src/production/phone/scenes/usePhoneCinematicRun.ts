import {
  useCallback,
  useMemo,
  useRef,
  type RefObject
} from 'react';
import {
  type PhoneLabContactCinematicScene
} from '../phone-lab-contact-timeline';
import type { PhoneCinematicFactReporter } from '../types';
import { phoneRuntimePresentationTokenKey } from '../phone-story/runtime';
import type { PhoneExecutionToken } from '../phone-story/runtime';
import type { PhoneRenderedPresentationFrame } from '../phone-story/runtime';
import type { PresentationToken } from '../phone-story/runtime';

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
  reverseReady: (token: PresentationToken | null) => boolean,
  activateSurface: (mode: 'forward' | 'endpoint') => void,
  render: (progress: number, direction?: PhoneCinematicDirection) => void,
  /** Draw again only after an immutable media identity has been installed. */
  presentPreparedFrame: (token: PresentationToken) => void,
  beforeForward: (() => void) | null,
  beforeReverse: (() => void) | null,
  reportFact: PhoneCinematicFactReporter
];

export type PhoneCinematicRun = readonly [
  requestedRef: { current: PhoneCinematicDirection | null },
  beginPreparedReverse: () => void,
  completeRun: (direction: PhoneCinematicDirection) => void,
  failRun: (direction: PhoneCinematicDirection) => void,
  publishPlaying: () => void,
  publishPresentedFrame: (presentationKey: string | null) => void,
  renderProgress: (progress: number, direction: PhoneCinematicDirection) => void,
  startRun: (
    direction: PhoneCinematicDirection,
    identity?: PhoneExecutionToken | null
  ) => void,
  stopRun: () => void,
  disposeRun: () => void
];

export const noopPhoneCinematicFactReporter: PhoneCinematicFactReporter = () => {
  // Leaves can be mounted outside the Group 6–7 continuation in isolated
  // previews; those callers still need a stable reporter identity.
};

export function usePhoneCinematicRun(
  [
    scene,
    rootRef,
    forwardRef,
    reverseRef,
    reducedMotion,
    terminalProgress,
    reverseReady,
    activateSurface,
    render,
    presentPreparedFrame,
    beforeForward,
    beforeReverse,
    reportFact
  ]: PhoneCinematicRunRequest
): PhoneCinematicRun {
  const options = {
    scene,
    rootRef,
    forwardRef,
    reverseRef,
    reducedMotion,
    terminalProgress,
    reverseReady,
    activateSurface,
    render,
    presentPreparedFrame,
    beforeForward,
    beforeReverse,
    reportFact
  };
  const requestedRef = useRef<PhoneCinematicDirection | null>(null);
  const activeIdentityRef = useRef<PhoneExecutionToken | null>(null);
  const presentedFrameReportedRef = useRef(false);
  const frameSequenceRef = useRef(0);
  const reverseStartedRef = useRef(false);
  const publish = useCallback((
    phase: 'playing' | 'presented' | 'progress' | 'complete' | 'failed',
    direction: PhoneCinematicDirection,
    progress?: number
  ) => {
    const identity = activeIdentityRef.current;
    const token = phase === 'presented' ? identity?.[5] ?? null : null;
    const frame: PhoneRenderedPresentationFrame | null = token
      ? {
          token,
          frameSequence: ++frameSequenceRef.current,
          observedAt: typeof performance !== 'undefined'
            && typeof performance.now === 'function'
            ? performance.now()
            : 0,
          origin: 'segment-first-frame'
        }
      : null;
    options.reportFact([
      phase,
      direction,
      identity,
      progress ?? null,
      frame
    ]);
  }, [options.reportFact]);
  const renderProgress = useCallback((
    progress: number,
    direction: PhoneCinematicDirection = 1
  ) => {
    options.render(progress, direction);
    publish('progress', direction, progress);
  }, [options.render, publish]);
  const completeRun = useCallback((direction: PhoneCinematicDirection) => {
    reverseStartedRef.current = false;
    requestedRef.current = null;
    publish('complete', direction);
    activeIdentityRef.current = null;
  }, [publish]);
  const failRun = useCallback((direction: PhoneCinematicDirection) => {
    reverseStartedRef.current = false;
    requestedRef.current = direction;
    publish('failed', direction);
    activeIdentityRef.current = null;
  }, [publish]);
  const publishPresentedFrame = useCallback((presentationKey: string | null) => {
    const direction = requestedRef.current;
    const identity = activeIdentityRef.current;
    if (
      direction === null
      || !identity
      || !identity[5]
      || presentationKey !== phoneRuntimePresentationTokenKey(identity[5])
      || presentedFrameReportedRef.current
    ) return;
    presentedFrameReportedRef.current = true;
    publish('presented', direction);
  }, [publish]);
  const beginPreparedReverse = useCallback(() => {
    const root = options.rootRef.current;
    const token = activeIdentityRef.current?.[5] ?? null;
    if (
      !root
      || requestedRef.current !== -1
      || reverseStartedRef.current
      || !options.reverseReady(token)
    ) return;
    reverseStartedRef.current = true;
    if (token) {
      publishPresentedFrame(phoneRuntimePresentationTokenKey(token));
    }
    options.reverseRef.current?.start();
    publish('playing', -1);
  }, [
    publishPresentedFrame,
    options.reverseReady,
    options.reverseRef,
    options.rootRef,
    publish
  ]);
  const stopRun = useCallback(() => {
    requestedRef.current = null;
    presentedFrameReportedRef.current = false;
    activeIdentityRef.current = null;
    reverseStartedRef.current = false;
    options.forwardRef.current?.stop();
    options.reverseRef.current?.stop();
  }, [options.forwardRef, options.reverseRef]);
  const startRun = useCallback((
    direction: PhoneCinematicDirection,
    identity?: PhoneExecutionToken | null
  ) => {
    if (!options.rootRef.current) return;
    if (identity !== undefined) {
      activeIdentityRef.current = identity;
      frameSequenceRef.current = 0;
    }
    presentedFrameReportedRef.current = false;
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
      reverseStartedRef.current = false;
      options.reverseRef.current?.stop();
      options.activateSurface('forward');
      const activeIdentity = activeIdentityRef.current;
      if (activeIdentity?.[5]) {
        options.presentPreparedFrame(activeIdentity[5]);
      }
      options.beforeForward?.();
      options.forwardRef.current?.start();
      return;
    }
    options.forwardRef.current?.stop();
    reverseStartedRef.current = false;
    options.beforeReverse?.();
    options.activateSurface('endpoint');
    const activeIdentity = activeIdentityRef.current;
    if (activeIdentity?.[5]) {
      options.presentPreparedFrame(activeIdentity[5]);
    }
    if (options.reverseReady(activeIdentityRef.current?.[5] ?? null)) {
      beginPreparedReverse();
    }
  }, [
    beginPreparedReverse,
    completeRun,
    options.activateSurface,
    options.beforeForward,
    options.beforeReverse,
    options.forwardRef,
    options.presentPreparedFrame,
    options.reducedMotion,
    options.render,
    options.reverseReady,
    options.reverseRef,
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
    publishPresentedFrame,
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
    publishPresentedFrame,
    renderProgress,
    startRun,
    stopRun
  ]);
}
