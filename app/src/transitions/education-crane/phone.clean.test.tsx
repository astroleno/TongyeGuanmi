// @vitest-environment jsdom

import { act, createElement, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type {
  PhoneLeafMountRegistration,
  PhoneLeafReportPort
} from '../../production/phone-story/presentation';

vi.mock('../shared/sceneInk', () => ({
  createInkFieldRenderer: vi.fn(() => ({
    prewarm: vi.fn(), render: vi.fn(), rebindGeneration: vi.fn(() => true),
    destroy: vi.fn()
  }))
}));

import { PhoneEducationCraneTransition } from './phone';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('clean Education → Crane effect leaf', () => {
  it('registers only the manifest above-both Ink surface', async () => {
    const registrations: PhoneLeafMountRegistration[] = [];
    const reports = {
      registerMount(next: PhoneLeafMountRegistration) { registrations.push(next); },
      reportPrepared() {}, reportFrame() {}, reportProgress() {},
      reportComplete() {}, reportFailure() {}
    } satisfies PhoneLeafReportPort;
    const host = document.createElement('div');
    const root = createRoot(host);
    const Leaf = PhoneEducationCraneTransition as ComponentType<Readonly<{
      reports: PhoneLeafReportPort;
    }>>;
    await act(async () => { root.render(createElement(Leaf, { reports })); });
    expect(registrations[0]?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['fx:education-crane', 'canvas-webgl']
    ]);
    expect(host.querySelector('canvas')?.dataset.r4InkSegment).toBe('education-crane');
    act(() => root.unmount());
  });
});
