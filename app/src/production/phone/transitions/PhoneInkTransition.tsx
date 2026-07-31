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
import {
  useOptionalPhoneStoryRuntimePort
} from '../PhoneStoryRuntimeContext';
import { phoneRouteOverlayHostFor } from '../PhoneStageRail';
import { registerPhoneRuntimeEffect } from '../phone-story/runtime';
import type {
  PhoneTransitionAdapterComponent,
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps,
  PhonePresentedFrameReporter
} from '../types';
import type { PresentationToken } from '../phone-story/runtime';

export function phoneInkAdapterProgress(
  progress: number,
  reducedMotion: boolean,
  strategy: 'receiver' | 'boundary' = 'receiver'
): number {
  if (!reducedMotion) return progress;
  return strategy === 'boundary' && progress <= 0 ? 0 : 1;
}

/**
 * The field renderer owns a short fade-in and terminal fade-out. First-frame
 * proof must sample the visibly composited interval, never an endpoint where
 * the WebGL context is active but its canvas is intentionally hidden.
 */
export function phoneInkFirstPresentationProgress(direction: 1 | -1): number {
  return direction === 1 ? .02 : .92;
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
 * Shared PhoneInkTransition is the route-overlay renderer class. Every factory
 * id is statically checked against an above-both manifest contract; local
 * endpoint layers must use their own adapter instead.
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
    { host: contentHost, from, additionalFrom, to, reducedMotion, onReady },
    forwardedRef
  ) {
    const runtime = useOptionalPhoneStoryRuntimePort();
    const effectHost = phoneRouteOverlayHostFor(contentHost);
    const transitionRef = useRef<PhoneInkTransitionBridge | undefined>(undefined);
    const progressRef = useRef(0);
    const directionRef = useRef<1 | -1>(1);
    const leaseRef = useRef<PhoneInkSurfaceLease | undefined>(undefined);
    const effectRegistrationRef = useRef<{ dispose(): void } | undefined>(undefined);
    const explicitOwnershipRef = useRef(false);
    const presentedFrameRef = useRef<PhonePresentedFrameReporter | undefined>(undefined);
    const presentedTokenRef = useRef<PresentationToken | undefined>(undefined);
    const presentedFrameSequenceRef = useRef(0);
    const firstFrameRetryRef = useRef<number | null>(null);
    const receiverAlignmentRef = useRef<readonly [() => void, 0 | 1] | null>(null);
    const cancelFirstFrameRetry = useCallback(() => {
      const frame = firstFrameRetryRef.current;
      if (frame !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(frame);
      }
      firstFrameRetryRef.current = null;
    }, []);
    const releaseEffectRegistration = useCallback(() => {
      effectRegistrationRef.current?.dispose();
      effectRegistrationRef.current = undefined;
    }, []);
    const releaseReceiver = useCallback(() => {
      receiverAlignmentRef.current?.[0]();
      receiverAlignmentRef.current = null;
    }, []);
    const revoke = useCallback(() => {
      cancelFirstFrameRetry();
      releaseEffectRegistration();
      transitionRef.current?.(['dispose']);
      transitionRef.current = undefined;
      leaseRef.current = undefined;
      explicitOwnershipRef.current = false;
      presentedFrameRef.current = undefined;
      presentedTokenRef.current = undefined;
      presentedFrameSequenceRef.current = 0;
      releaseReceiver();
    }, [cancelFirstFrameRetry, releaseEffectRegistration, releaseReceiver]);
    const releaseEndpoint = useCallback(() => {
      cancelFirstFrameRetry();
      releaseEffectRegistration();
      transitionRef.current?.(['releaseEndpoint']);
      leaseRef.current?.release();
      leaseRef.current = undefined;
      explicitOwnershipRef.current = false;
      presentedFrameRef.current = undefined;
      presentedTokenRef.current = undefined;
      presentedFrameSequenceRef.current = 0;
      releaseReceiver();
    }, [cancelFirstFrameRetry, releaseEffectRegistration, releaseReceiver]);
    const release = useCallback(() => {
      leaseRef.current?.release();
      revoke();
    }, [revoke]);
    const alignReceiver = useCallback((endpoint: 0 | 1) => {
      if (!contentHost || !to || !options.alignReceiver) return;
      receiverAlignmentRef.current = [
        receiverAlignmentRef.current?.[0] ?? options.alignReceiver(contentHost, to),
        endpoint
      ];
    }, [contentHost, to]);
    const ensure = useCallback(() => {
      if (transitionRef.current) return transitionRef.current;
      if (!effectHost || !to) return undefined;
      const lease = claimPhoneInkSurface(effectHost.ownerDocument, {
        host: effectHost,
        className: options.canvasClassName ?? 'phone-story-shell__ink',
        portraitInk: options.portraitInk ?? '',
        onRevoke: revoke
      });
      leaseRef.current = lease;
      if (runtime) {
        releaseEffectRegistration();
        effectRegistrationRef.current = registerPhoneRuntimeEffect(
          runtime,
          options.id,
          () => effectHost,
          () => lease.canvas
        );
      }
      const transition = createPhoneInkTransition([
        effectHost,
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
    }, [additionalFrom, effectHost, from, releaseEffectRegistration, revoke, runtime, to]);
    const render = useCallback((progress: number, force = false): boolean => {
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
            effectHost
          )
        : phoneInkAdapterProgress(
            progress,
            reducedMotion,
            options.reducedMotionStrategy ?? undefined
        );
      const bridge = (
        transitionRef.current
        ?? (
          (sampled > 0 && sampled < 1) || explicitOwnershipRef.current
            ? ensure()
            : undefined
        )
      );
      const rendered = bridge?.(['render', sampled, force]) === true;
      if (rendered) {
        const report = presentedFrameRef.current;
        const token = presentedTokenRef.current;
        presentedFrameRef.current = undefined;
        presentedTokenRef.current = undefined;
        report?.(token ? {
          token,
          frameSequence: ++presentedFrameSequenceRef.current,
          observedAt: typeof performance !== 'undefined'
            && typeof performance.now === 'function'
            ? performance.now()
            : 0,
          origin: 'segment-first-frame'
        } : undefined);
      }
      const alignment = receiverAlignmentRef.current;
      if (
        !explicitOwnershipRef.current
        && alignment
        && Math.abs(sampled - alignment[1]) <= 0.001
      ) {
        releaseReceiver();
      }
      return rendered;
    }, [effectHost, ensure, from, reducedMotion, releaseReceiver, to]);
    const scheduleFirstFrameRetry = useCallback((direction: 1 | -1) => {
      cancelFirstFrameRetry();
      directionRef.current = direction;
      const progress = phoneInkFirstPresentationProgress(direction);
      const renderUntilPresented = () => {
        firstFrameRetryRef.current = null;
        if (!explicitOwnershipRef.current || !presentedFrameRef.current) return;
        if (render(progress, true) || !presentedFrameRef.current) return;
        if (
          typeof window === 'undefined'
          || typeof window.requestAnimationFrame !== 'function'
        ) return;
        firstFrameRetryRef.current = window.requestAnimationFrame(
          renderUntilPresented
        );
      };
      renderUntilPresented();
    }, [cancelFirstFrameRetry, render]);
    useLayoutEffect(() => {
      if (!effectHost || !to) return;
      onReady?.();
      return release;
    }, [effectHost, onReady, release, to]);
    useImperativeHandle(forwardedRef, () => ({
      render,
      begin(owner, onPresentedFrame) {
        cancelFirstFrameRetry();
        explicitOwnershipRef.current = true;
        presentedFrameRef.current = onPresentedFrame;
        presentedTokenRef.current = owner[5];
        presentedFrameSequenceRef.current = 0;
        ensure()?.(['begin', owner]);
      },
      prepareFirstFrame(direction) {
        // A newly reclaimed shared WebGL canvas can need one browser paint
        // after prewarm before it returns a drawable frame. Retry the exact
        // token-bound in-between frame rather than admitting an endpoint or
        // manufacturing a proof; the runner's timeout remains fail-closed.
        scheduleFirstFrameRetry(direction);
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
    }), [
      alignReceiver,
      cancelFirstFrameRetry,
      ensure,
      release,
      releaseEndpoint,
      render,
      scheduleFirstFrameRetry
    ]);
    return null;
  });
}
