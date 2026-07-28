import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import type { InkGradePreset } from '../../../transitions/shared/sceneInk';
import {
  createPhoneInkTransition,
  type PhoneInkFieldRequest,
  type PhoneInkTransitionBridge
} from '../phone-ink';
import {
  claimPhoneInkSurface,
  type PhoneInkSurfaceLease
} from '../phone-ink-surface-pool';
import type {
  PhoneTransitionAdapterComponent,
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../types';

export function phoneInkAdapterProgress(
  progress: number,
  reducedMotion: boolean,
  strategy: 'receiver' | 'boundary' = 'receiver'
): number {
  if (!reducedMotion) return progress;
  return strategy === 'boundary' && progress <= 0 ? 0 : 1;
}

type PhoneInkReceiverAlignment = (
  host: HTMLElement,
  receiver: HTMLElement
) => () => void;

type PhoneInkFrameRenderer = (
  from: HTMLElement | null,
  to: HTMLElement | null,
  progress: number,
  reducedMotion: boolean,
  direction: 1 | -1,
  host: HTMLElement | null
) => number;

/**
 * Shared PhoneInkTransition is emitted independently from every lazy adapter.
 * Keep descriptor fields positional so Terser cannot split their property map.
 */
export type PhoneInkAdapterRequest = readonly [
  id: string,
  field: PhoneInkFieldRequest,
  grade: InkGradePreset | null,
  canvasClassName: string | null,
  portraitInk: string | null,
  reducedMotionStrategy: 'receiver' | 'boundary' | null,
  maskSource: boolean | null,
  alignReceiver: PhoneInkReceiverAlignment | null,
  renderFrame: PhoneInkFrameRenderer | null
];

export function createPhoneInkAdapter(
  [
    id,
    field,
    grade,
    canvasClassName,
    portraitInk,
    reducedMotionStrategy,
    maskSource,
    alignReceiver,
    renderFrame
  ]: PhoneInkAdapterRequest
): PhoneTransitionAdapterComponent {
  const options = {
    id,
    field,
    grade,
    canvasClassName,
    portraitInk,
    reducedMotionStrategy,
    maskSource,
    alignReceiver,
    renderFrame
  };
  return forwardRef<PhoneTransitionAdapterHandle, PhoneTransitionAdapterProps>(function PhoneInkTransition(
    { host, from, additionalFrom, to, reducedMotion, onReady },
    forwardedRef
  ) {
    const transitionRef = useRef<PhoneInkTransitionBridge | undefined>(undefined);
    const progressRef = useRef(0);
    const directionRef = useRef<1 | -1>(1);
    const leaseRef = useRef<PhoneInkSurfaceLease | undefined>(undefined);
    const explicitOwnershipRef = useRef(false);
    const receiverAlignmentRef = useRef<readonly [() => void, 0 | 1] | null>(null);
    const releaseReceiver = useCallback(() => {
      receiverAlignmentRef.current?.[0]();
      receiverAlignmentRef.current = null;
    }, []);
    const revoke = useCallback(() => {
      transitionRef.current?.(['dispose']);
      transitionRef.current = undefined;
      leaseRef.current = undefined;
      explicitOwnershipRef.current = false;
      releaseReceiver();
    }, [releaseReceiver]);
    const releaseEndpoint = useCallback(() => {
      transitionRef.current?.(['releaseEndpoint']);
      leaseRef.current?.release();
      leaseRef.current = undefined;
      explicitOwnershipRef.current = false;
      releaseReceiver();
    }, [releaseReceiver]);
    const release = useCallback(() => {
      leaseRef.current?.release();
      revoke();
    }, [revoke]);
    const alignReceiver = useCallback((endpoint: 0 | 1) => {
      if (!host || !to || !options.alignReceiver) return;
      receiverAlignmentRef.current = [
        receiverAlignmentRef.current?.[0] ?? options.alignReceiver(host, to),
        endpoint
      ];
    }, [host, to]);
    const ensure = useCallback(() => {
      if (transitionRef.current) return transitionRef.current;
      if (!host || !to) return undefined;
      const lease = claimPhoneInkSurface(host.ownerDocument, {
        host,
        className: options.canvasClassName ?? 'phone-story-shell__ink',
        portraitInk: options.portraitInk ?? '',
        onRevoke: revoke
      });
      leaseRef.current = lease;
      const transition = createPhoneInkTransition([
        host,
        lease.canvas,
        options.id,
        options.maskSource === false ? null : from,
        options.maskSource === false ? null : additionalFrom ?? null,
        to,
        options.field,
        options.grade
      ]);
      transitionRef.current = transition;
      return transition;
    }, [additionalFrom, from, host, revoke, to]);
    const render = useCallback((progress: number) => {
      if (progress > progressRef.current + 0.0001) directionRef.current = 1;
      if (progress < progressRef.current - 0.0001) directionRef.current = -1;
      progressRef.current = progress;
      const sampled = options.renderFrame
        ? options.renderFrame(
            from,
            to,
            progress,
            reducedMotion,
            directionRef.current,
            host
          )
        : phoneInkAdapterProgress(
            progress,
            reducedMotion,
            options.reducedMotionStrategy ?? undefined
        );
      (
        transitionRef.current
        ?? (
          (sampled > 0 && sampled < 1) || explicitOwnershipRef.current
            ? ensure()
            : undefined
        )
      )?.(['render', sampled]);
      const alignment = receiverAlignmentRef.current;
      if (
        !explicitOwnershipRef.current
        && alignment
        && Math.abs(sampled - alignment[1]) <= 0.001
      ) {
        releaseReceiver();
      }
    }, [ensure, from, host, reducedMotion, releaseReceiver, to]);
    useLayoutEffect(() => {
      if (!host || !to) return;
      onReady?.();
      return release;
    }, [host, onReady, release, to]);
    useImperativeHandle(forwardedRef, () => ({
      render,
      begin(owner) {
        explicitOwnershipRef.current = true;
        ensure()?.(['begin', owner]);
      },
      commitEndpoint(endpoint) {
        ensure()?.(['commitEndpoint', endpoint]);
        // Endpoint alignment is only a transition-time visual aid. It must
        // be gone before the Orchestrator measures and lands the receiver's
        // natural document coordinate; canvas/resource release still waits
        // until the post-hold frame.
        if (endpoint === 1) releaseReceiver();
      },
      releaseEndpoint,
      enter() {
        directionRef.current = 1;
        alignReceiver(1);
      },
      leave() {
        render(1);
        releaseEndpoint();
      },
      reverse() {
        directionRef.current = -1;
        releaseReceiver();
      },
      dispose: release
    }), [alignReceiver, ensure, release, releaseEndpoint, render]);
    return null;
  });
}
