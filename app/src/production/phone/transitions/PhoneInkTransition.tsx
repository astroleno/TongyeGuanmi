import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef
} from 'react';
import type { InkFieldSpec } from '../../../transitions/shared/inkField';
import type { InkGradePreset } from '../../../transitions/shared/sceneInk';
import { createPhoneInkTransition, type PhoneInkTransition } from '../phone-ink';
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

export function createPhoneInkAdapter(options: Readonly<{
  id: string;
  field: InkFieldSpec;
  grade?: InkGradePreset;
  canvasClassName?: string;
  portraitInk?: string;
  reducedMotionStrategy?: 'receiver' | 'boundary';
  maskSource?: boolean;
  releaseOnLeave?: boolean;
  alignReceiver?: (
    host: HTMLElement,
    receiver: HTMLElement
  ) => () => void;
  renderFrame?: (
    from: HTMLElement | null,
    to: HTMLElement | null,
    progress: number,
    reducedMotion: boolean,
    direction: 1 | -1,
    host: HTMLElement | null
  ) => number;
}>): PhoneTransitionAdapterComponent {
  return forwardRef<PhoneTransitionAdapterHandle, PhoneTransitionAdapterProps>(function PhoneInkTransition(
    { host, from, additionalFrom, to, reducedMotion, onReady },
    forwardedRef
  ) {
    const transitionRef = useRef<PhoneInkTransition | undefined>(undefined);
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
      transitionRef.current?.dispose();
      transitionRef.current = undefined;
      leaseRef.current = undefined;
      explicitOwnershipRef.current = false;
      releaseReceiver();
    }, [releaseReceiver]);
    const releaseEndpoint = useCallback(() => {
      transitionRef.current?.releaseEndpoint();
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
        ...(options.portraitInk ? { portraitInk: options.portraitInk } : {}),
        onRevoke: revoke
      });
      leaseRef.current = lease;
      const transition = createPhoneInkTransition({
        host,
        canvas: lease.canvas,
        id: options.id,
        from: options.maskSource === false ? null : from,
        additionalFrom: options.maskSource === false
          ? null
          : additionalFrom ?? null,
        to,
        field: options.field,
        ...(options.grade ? { grade: options.grade } : {})
      });
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
          options.reducedMotionStrategy
        );
      (
        transitionRef.current
        ?? (
          (sampled > 0 && sampled < 1) || explicitOwnershipRef.current
            ? ensure()
            : undefined
        )
      )?.render(sampled);
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
        ensure()?.begin(owner);
      },
      commitEndpoint(endpoint) {
        ensure()?.commitEndpoint(endpoint);
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
