// @vitest-environment jsdom

import { act, createElement } from 'react';
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

import {
  PHONE_BRAND_FIGURE3_DECISION,
  PHONE_BRAND_FIGURE3_FIELD,
  PhoneBrandFigure3Transition,
  phoneBrandFigure3Frame
} from './phone';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function reportFixture() {
  let registration: PhoneLeafMountRegistration | null = null;
  const reports = {
    registerMount: vi.fn((next: PhoneLeafMountRegistration) => { registration = next; }),
    reportPrepared: vi.fn(), reportFrame: vi.fn(), reportProgress: vi.fn(),
    reportComplete: vi.fn(), reportFailure: vi.fn()
  } satisfies PhoneLeafReportPort;
  return { reports, registration: () => registration };
}

describe('Phone Brand → Figure3 transition', () => {
  it('records the reviewed desktop-parity phone ink decision', () => {
    expect(PHONE_BRAND_FIGURE3_DECISION).toMatchObject({
      strategy: 'validated-phone-ink',
      camera: 'desktop-brand-figure3/star-map-aod-bottom-to-top-field',
      fallback: 'stable-endpoint-dissolve',
      forwardEndpoint: 'figure3-animation:stable-initial-frame',
      reverseEndpoint: 'brand:readable-hold'
    });
    expect(PHONE_BRAND_FIGURE3_FIELD).toEqual({
      kind: 'horizontal',
      direction: 'bottom-to-top',
      seed: 'brand-figure3'
    });
  });

  it('returns exact forward and reverse semantic endpoints', () => {
    expect(phoneBrandFigure3Frame(0)).toEqual({
      progress: 0,
      fromOpacity: 1,
      toOpacity: 0
    });
    expect(phoneBrandFigure3Frame(1)).toEqual({
      progress: 1,
      fromOpacity: 0,
      toOpacity: 1
    });
    expect(phoneBrandFigure3Frame(0, false, false, -1)).toEqual({
      progress: 0,
      fromOpacity: 1,
      toOpacity: 0
    });
  });

  it('uses stable endpoints for media failure and reduced motion', () => {
    expect(phoneBrandFigure3Frame(.3, false, true, 1).progress).toBe(1);
    expect(phoneBrandFigure3Frame(.7, false, true, -1).progress).toBe(0);
    expect(phoneBrandFigure3Frame(0, true).progress).toBe(0);
    expect(phoneBrandFigure3Frame(.3, true).progress).toBe(1);
  });

  it('registers the manifest effect surface through the clean command port', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const mount = reportFixture();
    await act(async () => {
      root.render(createElement(PhoneBrandFigure3Transition, { reports: mount.reports }));
    });
    expect(mount.registration()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['fx:brand-figure3', 'canvas-webgl']
    ]);
    act(() => root.unmount());
  });
});
