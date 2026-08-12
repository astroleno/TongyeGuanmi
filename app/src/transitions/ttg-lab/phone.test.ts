// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import type { PhoneLeafMountRegistration, PhoneLeafReportPort } from '../../production/phone-story/presentation';
import { PhoneTtgLabTransition } from './phone';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Phone TTG → Lab transition', () => {
  it('registers one diagnostic effect surface without endpoint ownership', async () => {
    let registration: PhoneLeafMountRegistration | null = null;
    const reports = { registerMount(next: PhoneLeafMountRegistration) { registration = next; },
      reportPrepared() {}, reportFrame() {}, reportProgress() {}, reportComplete() {},
      reportFailure() {} } satisfies PhoneLeafReportPort;
    const host = document.createElement('div'); const root = createRoot(host);
    await act(async () => { root.render(createElement(PhoneTtgLabTransition, { reports })); });
    const mounted = () => registration as PhoneLeafMountRegistration | null;
    expect(mounted()?.surfaces.map(({ id, kind }) => [id, kind]))
      .toEqual([['between:ttg-lab', 'dom']]);
    mounted()?.commands.render(.5);
    expect(host.querySelector<HTMLElement>('[data-phone-transition="ttg-lab"]')
      ).not.toBeNull();
    act(() => root.unmount());
  });
});
