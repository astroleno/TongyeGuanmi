import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import type { InkFieldSpec } from '../../../transitions/shared/inkField';
import type { InkGradePreset } from '../../../transitions/shared/sceneInk';
import { createPhoneInkTransition, type PhoneInkTransition } from '../phone-ink';
import type {
  PhoneTransitionAdapterComponent,
  PhoneTransitionAdapterHandle,
  PhoneTransitionAdapterProps
} from '../types';

export function createPhoneInkAdapter(options: Readonly<{
  id: string;
  field: InkFieldSpec;
  grade?: InkGradePreset;
  canvasClassName?: string;
  portraitInk?: string;
}>): PhoneTransitionAdapterComponent {
  return forwardRef<PhoneTransitionAdapterHandle, PhoneTransitionAdapterProps>(function PhoneInkTransition(
    { host, from, to, reducedMotion, onReady },
    forwardedRef
  ) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const transitionRef = useRef<PhoneInkTransition | undefined>(undefined);
    useLayoutEffect(() => {
      const canvas = canvasRef.current;
      if (!host || !from || !to || !canvas) return;
      const transition = createPhoneInkTransition({
        host,
        canvas,
        id: options.id,
        from,
        to,
        field: options.field,
        ...(options.grade ? { grade: options.grade } : {})
      });
      transitionRef.current = transition;
      transition.render(reducedMotion ? 1 : 0);
      onReady?.();
      return () => {
        transition.dispose();
        if (transitionRef.current === transition) transitionRef.current = undefined;
      };
    }, [from, host, onReady, reducedMotion, to]);
    useImperativeHandle(forwardedRef, () => ({
      render(progress) { transitionRef.current?.render(reducedMotion ? 1 : progress); },
      enter() { transitionRef.current?.render(reducedMotion ? 1 : 0); },
      leave() { transitionRef.current?.render(1); },
      reverse() { transitionRef.current?.render(reducedMotion ? 1 : 0); },
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
