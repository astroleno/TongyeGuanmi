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
    const release = useCallback(() => {
      transitionRef.current?.dispose();
      transitionRef.current = undefined;
      if (options.releaseOnLeave && canvasRef.current) {
        canvasRef.current.width = 1;
        canvasRef.current.height = 1;
      }
    }, []);
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
    }, [ensure, from, reducedMotion, to]);
    useLayoutEffect(() => {
      const canvas = canvasRef.current;
      if (!host || !to || !canvas) return;
      render(0);
      onReady?.();
      return release;
    }, [host, onReady, release, render, to]);
    useImperativeHandle(forwardedRef, () => ({
      render,
      enter() { render(0); },
      leave() {
        render(1);
        if (options.releaseOnLeave) release();
      },
      reverse() { render(options.reverseProgress ?? 0); },
      dispose: release
    }), [release, render]);
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
