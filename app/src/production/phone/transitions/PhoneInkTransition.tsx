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
}>): PhoneTransitionAdapterComponent {
  return forwardRef<PhoneTransitionAdapterHandle, PhoneTransitionAdapterProps>(function PhoneInkTransition(
    { host, from, to, reducedMotion },
    forwardedRef
  ) {
    const transitionRef = useRef<PhoneInkTransition | undefined>(undefined);
    useLayoutEffect(() => {
      if (!host || !from || !to) return;
      const transition = createPhoneInkTransition({
        host,
        canvas: null,
        id: options.id,
        from,
        to,
        field: options.field,
        ...(options.grade ? { grade: options.grade } : {})
      });
      transitionRef.current = transition;
      transition.render(reducedMotion ? 1 : 0);
      return () => {
        transition.dispose();
        if (transitionRef.current === transition) transitionRef.current = undefined;
      };
    }, [from, host, reducedMotion, to]);
    useImperativeHandle(forwardedRef, () => ({
      render(progress) { transitionRef.current?.render(reducedMotion ? 1 : progress); },
      enter() {},
      leave() {},
      reverse() {},
      dispose() { transitionRef.current?.dispose(); }
    }), [reducedMotion]);
    return null;
  });
}
