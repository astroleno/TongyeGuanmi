// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const lifecycle = vi.hoisted(() => [] as string[]);

vi.mock('./production/presentation-profile', () => ({
  initialPresentationFamily: () => 'phone'
}));

vi.mock('./production/presentation-shell-loaders', async () => {
  const { useLayoutEffect } = await import('react');
  const routeComponent = (name: string) => function RouteComponent() {
    useLayoutEffect(() => {
      lifecycle.push(`${name}:mount`);
      return () => { lifecycle.push(`${name}:dispose`); };
    }, []);
    return <main data-test-route={name} data-phone-implementation="clean-v1" />;
  };
  const Formal = routeComponent('formal');
  const Qa = routeComponent('brand-lab');
  const Desktop = routeComponent('desktop');
  return {
    loadDesktopStoryShell: () => Promise.resolve({ default: Desktop }),
    loadPhoneStoryShell: () => Promise.resolve({ default: Formal }),
    loadPhoneBrandLabStory: () => Promise.resolve({ default: Qa })
  };
});

import { App, appRouteForPath } from './App';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const idleRecoverySnapshot = { status: 'idle' as const };
const recovery = {
  port: {
    reportRejectedChunk: vi.fn(async () => 'fail-closed' as const),
    markStable: vi.fn()
  },
  getSnapshot: () => idleRecoverySnapshot,
  subscribe: () => () => undefined,
  reportPhoneCoreRejection: vi.fn(async () => 'fail-closed' as const),
  manualReload: vi.fn()
};

afterEach(() => {
  lifecycle.length = 0;
  document.body.replaceChildren();
  window.history.replaceState(null, '', '/');
});

describe('formal route cutover', () => {
  it('accepts only the two public routes, the release harness boundary, and the 404', () => {
    expect(appRouteForPath('/', false)).toBe('formal');
    expect(appRouteForPath('/index.html', false)).toBe('formal');
    expect(appRouteForPath('/brand-lab', false)).toBe('brand-lab');
    expect(appRouteForPath('/harness/r5-phone-clean', true)).toBe('harness');
    expect(appRouteForPath('/harness/r5-phone-clean', false)).toBe('not-found');
    expect(appRouteForPath('/portrait-spike', true)).toBe('not-found');
    expect(appRouteForPath('/v47', true)).toBe('not-found');
  });

  it('disposes the formal authority before the QA route claims the same React root', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(<App chunkRecovery={recovery} />);
    });
    expect(host.querySelector('[data-test-route="formal"]')).not.toBeNull();

    window.history.pushState(null, '', '/brand-lab?scope=ignored');
    await act(async () => {
      root.render(<App chunkRecovery={recovery} />);
    });

    expect(host.querySelectorAll('[data-test-route]')).toHaveLength(1);
    expect(host.querySelector('[data-test-route="brand-lab"]')).not.toBeNull();
    expect(lifecycle).toEqual([
      'formal:mount',
      'formal:dispose',
      'brand-lab:mount'
    ]);
    await act(async () => root.unmount());
  });

  it('commits an accessible 404 before removing the static cover', async () => {
    const staticLoader = document.createElement('div');
    staticLoader.id = 'story-loader-static';
    document.body.append(staticLoader);
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    window.history.replaceState(null, '', '/missing');

    await act(async () => {
      root.render(<App chunkRecovery={recovery} />);
    });

    expect(host.querySelector('main')?.textContent).toContain('404');
    expect(document.getElementById('story-loader-static')).toBeNull();
    await act(async () => root.unmount());
  });
});
