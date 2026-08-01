import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  type PhoneLeafCommandHandle,
  type PhoneLeafMountRegistration,
  type PhoneLeafReportBinding,
  type PhoneLeafReportPort
} from './presentation';

function createNoopPhoneLeafCommandHandle(): PhoneLeafCommandHandle {
  return Object.freeze({
    rebind: () => undefined,
    activate: ({ invocationId, surfaceIds }) => ({
      invocationId, surfaceIds, invoked: true,
      settlements: surfaceIds.map((surfaceId) => ({ surfaceId, status: 'fulfilled' }))
    }),
    render: () => undefined, settle: () => undefined,
    pause: () => undefined, dispose: () => undefined
  });
}

function createThrowingPhoneLeafReportPort(label: string): PhoneLeafReportPort {
  const unbound = (operation: string): never => {
    throw new Error(`${label}: phone leaf report port is unbound (${operation})`);
  };
  return Object.freeze({
    registerMount: () => unbound('registerMount'),
    reportPrepared: () => unbound('reportPrepared'),
    reportFrame: () => unbound('reportFrame'),
    reportProgress: () => unbound('reportProgress'),
    reportComplete: () => unbound('reportComplete'),
    reportFailure: () => unbound('reportFailure')
  });
}

const source = readFileSync(
  new URL('./presentation.ts', import.meta.url),
  'utf8'
);

describe('phone presentation leaf boundary', () => {
  it('provides an explicit fail-closed report fixture', () => {
    const reports = createThrowingPhoneLeafReportPort('unbound-test');
    expect(() => reports.reportComplete()).toThrow('unbound-test');
    expect(() => reports.reportProgress(0.5)).toThrow('unbound-test');
    expect(() => reports.reportFailure({
      code: 'fixture-failure',
      message: 'fixture',
      recoverable: true
    })).toThrow('unbound-test');
  });

  it('provides an idempotent no-op command fixture over narrow commands', () => {
    const commands = createNoopPhoneLeafCommandHandle();
    expect(commands.activate({
      invocationId: 'fixture-activation',
      surfaceIds: ['fixture-surface'],
      credit: 'direct-muted-autoplay'
    })).toEqual({
      invocationId: 'fixture-activation',
      surfaceIds: ['fixture-surface'],
      invoked: true,
      settlements: [{ surfaceId: 'fixture-surface', status: 'fulfilled' }]
    });
    expect(() => commands.render(0.5)).not.toThrow();
    expect(() => commands.settle(1)).not.toThrow();
    expect(() => commands.pause('hidden')).not.toThrow();
    expect(() => commands.dispose('route-dispose')).not.toThrow();
    expect(() => commands.dispose('route-dispose')).not.toThrow();
  });

  it('supports one root, named multi-surfaces, and one leaf-wide handle', () => {
    const commands = createNoopPhoneLeafCommandHandle();
    const root = {} as HTMLElement;
    const registration: PhoneLeafMountRegistration = {
      root,
      surfaces: [
        { id: 'crane-figure-video', element: {} as HTMLElement, kind: 'video' },
        { id: 'crane-figure-canvas', element: {} as HTMLElement, kind: 'canvas-webgl' },
        { id: 'crane-flock-video', element: {} as HTMLElement, kind: 'video' },
        { id: 'crane-flock-canvas', element: {} as HTMLElement, kind: 'canvas-webgl' }
      ],
      commands
    };
    expect(registration.surfaces.map((surface) => surface.id)).toEqual([
      'crane-figure-video',
      'crane-figure-canvas',
      'crane-flock-video',
      'crane-flock-canvas'
    ]);
    expect(registration.commands).toBe(commands);
  });

  it('keeps attempt/evidence authority inside the closed builder binding', () => {
    const binding: PhoneLeafReportBinding = {
      attempt: {
        authorityId: 'fixture-authority',
        transactionId: 'fixture-transaction',
        transactionGeneration: 1,
        mode: 'segment',
        segmentId: 'hero-pattern',
        direction: 'forward'
      },
      stageIndex: 0,
      leg: 'target',
      allowedReports: ['root-connected', 'layout-measurable', 'frame-visible'],
      allowedSurfaceIds: ['pattern-image'],
      planeRevision: 1
    };
    expect(binding.allowedSurfaceIds).toEqual(['pattern-image']);
    expect(binding.leg).toBe('target');
  });

  it('does not own projector state, global listeners, React, or runtime dispatch', () => {
    expect(source).not.toMatch(/\bfrom\s+['"]react['"]/);
    expect(source).not.toMatch(/\baddEventListener\s*\(/);
    expect(source).not.toMatch(/\b(?:window|document|visualViewport)\b/);
    expect(source).not.toMatch(/from\s+['"].*runtime/);
    expect(source).not.toMatch(/\bdispatch\s*[:=(]/);
    expect(source).not.toMatch(/\b(?:let|var)\s+/);
    expect(vi.isMockFunction(createNoopPhoneLeafCommandHandle)).toBe(false);
  });
});
