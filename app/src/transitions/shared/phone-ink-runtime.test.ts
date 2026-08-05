import { beforeEach, describe, expect, it, vi } from 'vitest';

const vendor = vi.hoisted(() => ({
  boundaryRender: vi.fn(),
  createBoundary: vi.fn()
}));

vi.mock('../../vendor/ink-scene-transition.js', () => ({
  createInkBoundaryTransition: (...args: unknown[]) => {
    vendor.createBoundary(...args);
    return {
      destroy: vi.fn(),
      prewarm: vi.fn(),
      render: vendor.boundaryRender
    };
  }
}));

import { FakeCanvas, FakeElement } from '../__fixtures__/back-half.fixture';
import { createPhoneInkRuntimeBridge } from './phone-ink-runtime';

beforeEach(() => {
  vendor.boundaryRender.mockClear();
  vendor.createBoundary.mockClear();
});

describe('phone ink runtime bridge', () => {
  it('[R5] renders the first active frame after prewarm so a transition can submit its physical proof', () => {
    const host = new FakeElement();
    const source = new FakeElement();
    const receiver = new FakeElement();
    const canvas = new FakeCanvas() as FakeCanvas & { clientWidth: number };
    canvas.clientWidth = 390;

    const bridge = createPhoneInkRuntimeBridge([
      host as unknown as HTMLElement,
      canvas as unknown as HTMLCanvasElement,
      'phone-method-bottom-figure2',
      source as unknown as HTMLElement,
      null,
      receiver as unknown as HTMLElement,
      ['horizontal', 'method-bottom-figure2', 'top-to-bottom', null, null],
      'dark'
    ]);

    // Direction is bound by the execution token, not guessed from the
    // structural `to` endpoint while the bridge is being constructed.
    expect(receiver.dataset.phoneInkAdmission).toBeUndefined();
    expect(receiver.dataset.phoneInkFrame).toBeUndefined();
    bridge(['armEndpoint', 1]);
    expect(receiver.dataset.phoneInkAdmission).toBe('pending');
    expect(bridge(['render', .003])).toBe(true);
    expect(vendor.boundaryRender).toHaveBeenCalledOnce();
    expect(canvas.style.visibility).toBe('visible');
    expect(canvas.dataset.phonePresentationEffectFrame).toBe('ready');
    expect(receiver.dataset.phoneInkFrame).toBe('ready');

    bridge(['render', 0]);
    expect(receiver.dataset.phoneInkFrame).toBeUndefined();
    bridge(['releaseEndpoint']);
    expect(receiver.dataset.phoneInkAdmission).toBeUndefined();
    bridge(['armEndpoint']);
    expect(receiver.dataset.phoneInkAdmission).toBe('pending');
    expect(receiver.dataset.phoneInkFrame).toBeUndefined();
  });

  it('[R5] can force a real redraw at fixed progress while a first-frame proof is pending', () => {
    const host = new FakeElement();
    const source = new FakeElement();
    const receiver = new FakeElement();
    const canvas = new FakeCanvas() as FakeCanvas & { clientWidth: number };
    canvas.clientWidth = 390;

    const bridge = createPhoneInkRuntimeBridge([
      host as unknown as HTMLElement,
      canvas as unknown as HTMLCanvasElement,
      'phone-method-bottom-figure2',
      source as unknown as HTMLElement,
      null,
      receiver as unknown as HTMLElement,
      ['horizontal', 'method-bottom-figure2', 'top-to-bottom', null, null],
      'dark'
    ]);

    expect(bridge(['render', .92])).toBe(true);
    expect(bridge(['render', .92])).toBe(false);
    expect(bridge(['render', .92, true])).toBe(true);
    expect(vendor.boundaryRender).toHaveBeenCalledTimes(2);
    bridge(['dispose']);
    expect(receiver.dataset.phoneInkAdmission).toBeUndefined();
  });

  it('keeps structural geometry roles fixed while proving the physical reverse receiver', () => {
    const host = new FakeElement();
    const source = new FakeElement();
    const additionalSource = new FakeElement();
    const receiver = new FakeElement();
    const canvas = new FakeCanvas() as FakeCanvas & { clientWidth: number };
    canvas.clientWidth = 390;

    const bridge = createPhoneInkRuntimeBridge([
      host as unknown as HTMLElement,
      canvas as unknown as HTMLCanvasElement,
      'phone-method-bottom-figure2',
      source as unknown as HTMLElement,
      additionalSource as unknown as HTMLElement,
      receiver as unknown as HTMLElement,
      ['horizontal', 'method-bottom-figure2', 'top-to-bottom', null, null],
      'dark'
    ]);

    bridge(['armEndpoint', -1]);
    expect(source.dataset.phoneInkAdmission).toBe('pending');
    expect(additionalSource.dataset.phoneInkAdmission).toBe('pending');
    expect(receiver.dataset.phoneInkAdmission).toBeUndefined();
    expect(bridge(['render', .92])).toBe(true);
    expect(source.dataset.r4InkOwnership).toBe('conceal');
    expect(additionalSource.dataset.r4InkOwnership).toBe('conceal');
    expect(receiver.dataset.r4InkOwnership).toBe('reveal');
    expect(source.dataset.phoneInkFrame).toBe('ready');
    expect(additionalSource.dataset.phoneInkFrame).toBe('ready');
    expect(receiver.dataset.phoneInkFrame).toBeUndefined();
    expect(bridge(['render', .5])).toBe(true);
    expect(source.dataset.r4InkOwnership).toBe('conceal');
    expect(receiver.dataset.r4InkOwnership).toBe('reveal');
    expect(bridge(['render', .003])).toBe(true);
    expect(source.dataset.r4InkOwnership).toBe('conceal');
    expect(receiver.dataset.r4InkOwnership).toBe('reveal');
    bridge(['render', 0]);
    expect(source.style.visibility).toBe('visible');
    bridge(['releaseEndpoint']);
    expect(source.dataset.phoneInkAdmission).toBeUndefined();
    expect(source.dataset.phoneInkFrame).toBeUndefined();
    expect(additionalSource.dataset.phoneInkAdmission).toBeUndefined();
    expect(additionalSource.dataset.phoneInkFrame).toBeUndefined();
  });
});
