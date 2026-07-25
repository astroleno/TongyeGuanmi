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
  releaseBoundaryGeometryAtEndpoints?: boolean;
  maskSource?: boolean;
  releaseOnLeave?: boolean;
  reverseProgress?: 0 | 1;
  alignReceiver?: (
    host: HTMLElement,
    receiver: HTMLElement
  ) => () => void;
  renderFrame?: (
    from: HTMLElement | null,
    to: HTMLElement | null,
    progress: number,
    reducedMotion: boolean
  ) => number;
}>): PhoneTransitionAdapterComponent {
  return forwardRef<PhoneTransitionAdapterHandle, PhoneTransitionAdapterProps>(function PhoneInkTransition(
    { host, from, additionalFrom, to, reducedMotion, onReady },
    forwardedRef
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const transitionRef = useRef<PhoneInkTransition | undefined>(undefined);
    const receiverAlignmentRef = useRef<readonly [() => void, 0 | 1] | null>(null);
    const releaseReceiver = useCallback(() => {
      receiverAlignmentRef.current?.[0]();
      receiverAlignmentRef.current = null;
    }, []);
    const release = useCallback(() => {
      transitionRef.current?.dispose();
      transitionRef.current = undefined;
      releaseReceiver();
      if (options.releaseOnLeave && canvasRef.current) {
        canvasRef.current.width = 1;
        canvasRef.current.height = 1;
      }
    }, [releaseReceiver]);
    const alignReceiver = useCallback((endpoint: 0 | 1) => {
      if (!host || !to || !options.alignReceiver) return;
      receiverAlignmentRef.current = [
        receiverAlignmentRef.current?.[0] ?? options.alignReceiver(host, to),
        endpoint
      ];
    }, [host, to]);
    const ensure = useCallback(() => {
      if (transitionRef.current) return transitionRef.current;
      const canvas = canvasRef.current;
      if (!host || !to || !canvas) return undefined;
      const transition = createPhoneInkTransition({
        host,
        canvas,
        id: options.id,
        from: options.maskSource === false ? null : from,
        additionalFrom: options.maskSource === false
          ? null
          : additionalFrom ?? null,
        to,
        field: options.field,
        ...(options.grade ? { grade: options.grade } : {}),
        ...(options.releaseBoundaryGeometryAtEndpoints
          ? { releaseBoundaryGeometryAtEndpoints: true }
          : {})
      });
      transitionRef.current = transition;
      return transition;
    }, [additionalFrom, from, host, to]);
    const render = useCallback((progress: number) => {
      const sampled = options.renderFrame
        ? options.renderFrame(from, to, progress, reducedMotion)
        : phoneInkAdapterProgress(
            progress,
            reducedMotion,
            options.reducedMotionStrategy
          );
      ensure()?.render(sampled);
      const alignment = receiverAlignmentRef.current;
      if (alignment && Math.abs(sampled - alignment[1]) <= 0.001) {
        releaseReceiver();
      }
    }, [ensure, from, reducedMotion, releaseReceiver, to]);
    useLayoutEffect(() => {
      const canvas = canvasRef.current;
      if (!host || !to || !canvas) return;
      render(0);
      onReady?.();
      return release;
    }, [host, onReady, release, render, to]);
    useImperativeHandle(forwardedRef, () => ({
      render,
      enter() {
        alignReceiver(1);
        render(0);
      },
      leave() {
        render(1);
        releaseReceiver();
        if (options.releaseOnLeave) release();
      },
      reverse() {
        alignReceiver(0);
        render(options.reverseProgress ?? 0);
      },
      dispose: release
    }), [alignReceiver, release, releaseReceiver, render]);
    return (
      <canvas
        ref={canvasRef}
        className={options.canvasClassName ?? 'phone-story-shell__ink'}
        data-portrait-ink={options.portraitInk}
        aria-hidden="true"
      />
    );
  });
}
