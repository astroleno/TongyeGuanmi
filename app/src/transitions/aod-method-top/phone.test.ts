// @vitest-environment jsdom

import { act } from 'react';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { PhoneLeafMountRegistration } from '../../production/phone-story/presentation';
import { PhoneAodMethodTopTransition } from './phone';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('clean AOD → Method transition leaf', () => {
  it('registers one between-plane DOM surface with no lifecycle authority', async () => {
    let registration: PhoneLeafMountRegistration | null = null;
    const mounted = () => registration as PhoneLeafMountRegistration | null;
    const reports = {
      registerMount: vi.fn((next: PhoneLeafMountRegistration) => { registration = next; }),
      reportPrepared: vi.fn(), reportFrame: vi.fn(), reportProgress: vi.fn(),
      reportComplete: vi.fn(), reportFailure: vi.fn()
    };
    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(PhoneAodMethodTopTransition, { reports }));
    });
    expect(mounted()?.surfaces.map(({ id, kind }) => [id, kind])).toEqual([
      ['between:aod-method-top', 'dom']
    ]);
    expect(Object.keys(mounted()?.commands ?? {}).sort()).toEqual([
      'activate', 'dispose', 'pause', 'rebind', 'render', 'settle'
    ]);
  });
});
