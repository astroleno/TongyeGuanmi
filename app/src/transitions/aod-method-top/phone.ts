import { createElement, useLayoutEffect, useMemo, useRef } from 'react';
import type {
  PhoneActivationInvocation,
  PhoneLeafCommandHandle,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';

export function PhoneAodMethodTopTransition({
  reports
}: Readonly<{ reports: PhoneLeafReportPort }>) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const commands = useMemo<PhoneLeafCommandHandle>(() => Object.freeze({
    rebind() {},
    activate(command): PhoneActivationInvocation {
      return { invocationId: command.invocationId, surfaceIds: command.surfaceIds,
        invoked: false, settlements: [] };
    },
    render(progress) {
      rootRef.current?.style.setProperty('--phone-aod-method-progress',
        Math.min(1, Math.max(0, progress)).toFixed(4));
    },
    settle() {}, pause() {}, dispose() {}
  }), []);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    reports.registerMount({
      root,
      surfaces: [{ id: 'between:aod-method-top', element: root, kind: 'dom' }],
      commands
    });
  }, [commands, reports]);
  return createElement('div', {
    ref: rootRef,
    'data-phone-transition': 'aod-method-top',
    'aria-hidden': 'true'
  });
}

export default PhoneAodMethodTopTransition;
export const phoneSegmentId = 'aod-method-top' as const;
