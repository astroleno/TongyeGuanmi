import { describe, expect, it } from 'vitest';
import { acquirePhoneBoundaryGeometryLease } from './phone-boundary-geometry';

describe('phone boundary geometry leases', () => {
  it('prevents stale cleanup from clearing geometry owned by a newer run', () => {
    const endpoint = {} as HTMLElement;
    const cleared: HTMLElement[] = [];
    const clear = (element: HTMLElement) => cleared.push(element);
    const stale = acquirePhoneBoundaryGeometryLease(
      [endpoint],
      ['phone-session-1', 1],
      clear
    );
    const current = acquirePhoneBoundaryGeometryLease(
      [endpoint],
      ['phone-session-2', 2],
      clear
    );

    stale.releaseGeometry();
    expect(cleared).toEqual([]);

    current.releaseGeometry();
    expect(cleared).toEqual([endpoint]);
  });

  it('deduplicates endpoints and releases its geometry exactly once', () => {
    const source = {} as HTMLElement;
    const receiver = {} as HTMLElement;
    const cleared: HTMLElement[] = [];
    const lease = acquirePhoneBoundaryGeometryLease(
      [source, source, null, receiver],
      ['phone-session-3', 4],
      (element) => cleared.push(element)
    );

    expect(lease.owns(source)).toBe(true);
    expect(lease.owns(receiver)).toBe(true);
    lease.releaseGeometry();
    lease.releaseGeometry();

    expect(cleared).toEqual([source, receiver]);
    expect(lease.owns(source)).toBe(false);
  });
});
