import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
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
}>): PhoneTransitionAdapterComponent {
  return forwardRef<PhoneTransitionAdapterHandle, PhoneTransitionAdapterProps>(function PhoneInkTransition(
    { host, from, to, reducedMotion, onReady },
    forwardedRef
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const transitionRef = useRef<PhoneInkTransition | undefined>(undefined);
    useLayoutEffect(() => {
      const canvas = canvasRef.current;
      if (!host || !to || !canvas) return;
      const transition = createPhoneInkTransition({
        host,
        canvas,
        id: options.id,
        from,
        to,
        field: options.field,
        ...(options.grade ? { grade: options.grade } : {}),
        ...(options.releaseBoundaryGeometryAtEndpoints
          ? { releaseBoundaryGeometryAtEndpoints: true }
          : {})
      });
      transitionRef.current = transition;
      transition.render(phoneInkAdapterProgress(
        0,
        reducedMotion,
        options.reducedMotionStrategy
      ));
      onReady?.();
      return () => {
        transition.dispose();
        if (transitionRef.current === transition) transitionRef.current = undefined;
      };
    }, [from, host, onReady, reducedMotion, to]);
    useImperativeHandle(forwardedRef, () => ({
      render(progress) {
        transitionRef.current?.render(phoneInkAdapterProgress(
          progress,
          reducedMotion,
          options.reducedMotionStrategy
        ));
      },
      enter() {
        transitionRef.current?.render(phoneInkAdapterProgress(
          0,
          reducedMotion,
          options.reducedMotionStrategy
        ));
      },
      leave() { transitionRef.current?.render(1); },
      reverse() {
        transitionRef.current?.render(phoneInkAdapterProgress(
          0,
          reducedMotion,
          options.reducedMotionStrategy
        ));
      },
      dispose() {
        transitionRef.current?.dispose();
        transitionRef.current = undefined;
      }
    }), [reducedMotion]);
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
