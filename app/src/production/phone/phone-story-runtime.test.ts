import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPhoneStoryRuntime } from './phone-story-runtime';

function root() {
  return {
    dataset: {} as DOMStringMap,
    style: {
      setProperty: () => undefined,
      removeProperty: () => undefined,
      getPropertyValue: () => ''
    }
  } as unknown as HTMLElement;
}

describe('phone story runtime factory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('constructs side-effect free and attaches one route-local authority', () => {
    const routeRoot = root();
    const runtime = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'brand',
      root: () => routeRoot,
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    expect(routeRoot.dataset).toEqual({});
    expect(runtime.port.getSnapshot().authorityId).toBe(runtime.authorityId);

    runtime.attach();
    runtime.attach();

    expect(routeRoot.dataset.phoneAuthorityId).toBe(runtime.authorityId);
    expect(routeRoot.dataset.phoneAuthorityScope).toBe('formal');
    runtime.dispose();
  });

  it('keeps one live authority per connected root and invalidates old evidence', () => {
    const routeRoot = root();
    const first = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'brand',
      root: () => routeRoot,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    const second = createPhoneStoryRuntime({
      scope: 'brand-lab',
      initialScene: 'services',
      root: () => routeRoot,
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    first.attach();
    second.attach();
    const beforeOldEvidence = second.port.getSnapshot();
    first.port.dispatch({
      type: 'HOLD_RECONCILED',
      authorityId: first.authorityId,
      scene: 'services'
    });

    expect(first.authorityId).not.toBe(second.authorityId);
    expect(routeRoot.dataset).toMatchObject({
      phoneAuthorityId: second.authorityId,
      phoneAuthorityScope: 'brand-lab',
      phoneCursor: 'hold:services'
    });
    expect(second.port.getSnapshot()).toBe(beforeOldEvidence);

    second.dispose();
    expect(routeRoot.dataset.phoneAuthorityId).toBeUndefined();
  });

  it('keeps formal and QA reducer traces scope-independent', () => {
    const formal = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'brand',
      root: () => root(),
      scrollY: () => 40,
      scrollTo: () => undefined
    });
    const qa = createPhoneStoryRuntime({
      scope: 'brand-lab',
      initialScene: 'brand',
      root: () => root(),
      scrollY: () => 40,
      scrollTo: () => undefined
    });
    for (const authority of [formal, qa]) {
      authority.port.dispatch({
        type: 'HOLD_RECONCILED',
        authorityId: authority.authorityId,
        scene: 'services',
        actualY: 88
      });
    }
    const comparable = (authority: typeof formal) => {
      const { authorityId, diagnostics, ...snapshot } = authority.port.getSnapshot();
      return snapshot;
    };

    expect(comparable(formal)).toEqual(comparable(qa));
    formal.dispose();
    qa.dispose();
  });

  it('cleans every attach-owned listener during a mount/probe/remount cycle', () => {
    const added: string[] = [];
    const removed: string[] = [];
    const browser = {
      scrollY: 0,
      scrollTo: () => undefined,
      requestAnimationFrame: () => 1,
      cancelAnimationFrame: () => undefined,
      addEventListener: (type: string) => added.push(`window:${type}`),
      removeEventListener: (type: string) => removed.push(`window:${type}`)
    } as unknown as Window;
    const page = {
      defaultView: browser,
      addEventListener: (type: string) => added.push(`document:${type}`),
      removeEventListener: (type: string) => removed.push(`document:${type}`)
    } as unknown as Document;
    const routeRoot = Object.assign(root(), {
      ownerDocument: page,
      addEventListener: (type: string) => added.push(`root:${type}`),
      removeEventListener: (type: string) => removed.push(`root:${type}`)
    });
    vi.stubGlobal('window', browser);
    const runtime = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'brand',
      root: () => routeRoot,
      scrollY: () => 0,
      scrollTo: () => undefined
    });

    runtime.attach();
    runtime.attach();

    expect(added).toEqual(expect.arrayContaining([
      'root:touchstart',
      'root:touchmove',
      'root:touchend',
      'root:touchcancel',
      'root:wheel',
      'window:scroll',
      'window:pageshow',
      'document:visibilitychange'
    ]));
    expect(added.filter((entry) => entry === 'root:wheel')).toHaveLength(1);
    runtime.dispose();

    expect(removed).toEqual(expect.arrayContaining([
      'root:touchstart',
      'root:touchmove',
      'root:touchend',
      'root:touchcancel',
      'root:wheel',
      'window:scroll',
      'window:pageshow',
      'document:visibilitychange'
    ]));

    const remount = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'brand',
      root: () => routeRoot,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    remount.attach();
    expect(remount.authorityId).not.toBe(runtime.authorityId);
    expect(added.filter((entry) => entry === 'root:wheel')).toHaveLength(2);
    remount.dispose();
  });
});
