import { createElement, useLayoutEffect, useRef, type ComponentType } from 'react';
import type { PhoneActivationInvocation, PhoneLeafCommandHandle, PhoneLeafReportPort } from '../../production/phone-story/presentation';

/** Diagnostic-only leaf for between-plane transitions whose pixels are owned by choreography. */
export function createPhoneProgressLeaf(options: Readonly<{
  segmentId: string; surfaceId: `between:${string}`;
}>): ComponentType<Readonly<{ reports: PhoneLeafReportPort }>> {
  const commands = Object.freeze({
    rebind() {},
    activate(command): PhoneActivationInvocation { return { invocationId: command.invocationId,
      surfaceIds: command.surfaceIds, invoked: false, settlements: [] }; },
    render() {}, settle() {}, pause() {}, dispose() {}
  }) satisfies PhoneLeafCommandHandle;
  function PhoneProgressLeaf({ reports }: Readonly<{ reports: PhoneLeafReportPort }>) {
    const rootRef = useRef<HTMLDivElement | null>(null);
    useLayoutEffect(() => { const root = rootRef.current; if (root) reports.registerMount({ root,
      surfaces: [{ id: options.surfaceId, element: root, kind: 'dom' }], commands }); }, [commands, reports]);
    return createElement('div', { ref: rootRef, 'data-phone-transition': options.segmentId,
      'aria-hidden': 'true' });
  }
  return PhoneProgressLeaf;
}
