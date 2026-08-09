import { describe, expect, it, vi } from 'vitest';
import type { PresentationToken } from './machine';
import {
  createPhoneStoryPresentation,
  readPhoneScenePresentation,
  readPhoneSurfacePresentation
} from './presentation';

function element(): HTMLElement {
  return {
    dataset: {} as DOMStringMap,
    style: {
      setProperty: () => undefined,
      removeProperty: () => undefined
    },
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      right: 390,
      bottom: 844,
      width: 390,
      height: 844
    })
  } as unknown as HTMLElement;
}

const servicesToken: PresentationToken = {
  authorityId: 'presentation-authority',
  sessionId: 'session-1',
  generation: 1,
  leg: 0,
  revision: 1,
  subject: 'native:services',
  kind: 'dom-reading'
};

const figure3Token: PresentationToken = {
  authorityId: 'presentation-authority',
  sessionId: 'session-2',
  generation: 2,
  leg: 0,
  revision: 2,
  subject: 'group45:figure3',
  kind: 'packed-canvas-frame'
};

const heroToken: PresentationToken = {
  authorityId: 'presentation-authority',
  sessionId: 'session-hero',
  generation: 1,
  leg: 0,
  revision: 1,
  subject: 'front:hero',
  kind: 'static-poster'
};

const aodSegmentToken: PresentationToken = {
  authorityId: 'presentation-authority',
  sessionId: 'session-aod',
  generation: 1,
  leg: 0,
  revision: 1,
  subject: 'front:aod',
  kind: 'packed-canvas-frame'
};

describe('phone presentation proof reader', () => {
  it('[stable text visibility] rejects offscreen text from a static Brand proof', () => {
    const root = element();
    const offscreenText = {
      ...element(),
      textContent: 'Brand content',
      getBoundingClientRect: () => ({
        left: 0,
        top: 844,
        right: 390,
        bottom: 900,
        width: 390,
        height: 56
      })
    } as HTMLElement;
    Object.assign(root, {
      matches: () => false,
      querySelector: () => offscreenText
    });
    vi.stubGlobal('window', {
      innerWidth: 390,
      innerHeight: 844,
      visualViewport: { offsetLeft: 0, offsetTop: 0, width: 390, height: 844 }
    });
    vi.stubGlobal('getComputedStyle', () => ({
      display: 'block',
      visibility: 'visible',
      opacity: '1'
    }));
    try {
      expect(readPhoneScenePresentation('brand', root, root)[3]).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('[R5] treats an interaction-inert transition receiver as physically visible', () => {
    const root = element();
    root.inert = true;

    expect(readPhoneSurfacePresentation(root, root, 'preflight')).toEqual([
      true,
      true,
      true,
      false,
      null
    ]);
  });

  it('[P0 Safari coverage] rejects a pseudo-element plane when the real coverage root ends before a live toolbar edge', () => {
    const root = element();
    const rail = {} as HTMLElement;
    const route = {
      querySelector: (selector: string) => (
        selector === '.portrait-scroll-spike__stage-rail' ? rail : null
      )
    } as unknown as HTMLElement;
    Object.assign(root, { closest: () => route });

    vi.stubGlobal('window', {
      innerWidth: 390,
      innerHeight: 844,
      visualViewport: { offsetLeft: 0, offsetTop: 160, width: 390, height: 844 }
    });
    vi.stubGlobal('getComputedStyle', (target: Element, pseudo?: string | null) => (
      target === rail && pseudo === '::before'
        ? { width: '390px', height: '1004px' }
        : { display: 'block', visibility: 'visible', opacity: '1' }
    ));
    try {
      expect(readPhoneSurfacePresentation(root, root, 'preflight')).toEqual([
        true,
        true,
        false,
        false,
        null
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('[Task 5] emits a static proof only after its candidate has crossed a browser presentation boundary', () => {
    const root = element();
    let scheduled: (() => void) | undefined;
    const presentation = createPhoneStoryPresentation({
      authorityId: servicesToken.authorityId,
      scope: 'formal',
      root: () => root,
      schedulePresentationFrame(callback) {
        scheduled = callback;
        return () => { scheduled = undefined; };
      }
    });
    presentation.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => root,
      presentation: () => [true, true, true, true, 'static-poster']
    });
    const report = vi.fn();

    presentation.activatePresentationAdapter('services', servicesToken, report);

    expect(report).not.toHaveBeenCalled();
    expect(scheduled).toBeTypeOf('function');
    scheduled?.();
    expect(report).toHaveBeenCalledWith(expect.objectContaining({
      token: servicesToken,
      frameSequence: 1,
      observedAt: expect.any(Number),
      connected: true,
      visible: true,
      coverageComplete: true,
      edge: 'services'
    }));
  });

  it('[Pattern↔StarMap reduced cutover] never lets a front visual hold fall back to a generic scheduled proof', () => {
    const root = element();
    const starToken: PresentationToken = {
      ...heroToken,
      sessionId: 'front-star-static-session',
      generation: 8,
      revision: 8,
      subject: 'front:star-map'
    };
    let scheduled: (() => void) | undefined;
    const presentation = createPhoneStoryPresentation({
      authorityId: starToken.authorityId,
      scope: 'formal',
      root: () => root,
      schedulePresentationFrame(callback) {
        scheduled = callback;
        return () => { scheduled = undefined; };
      }
    });
    presentation.registerSurface({
      id: 'front:star-map',
      scene: 'star-map',
      kind: 'fixed',
      root: () => root,
      coverageRoot: () => root,
      presentation: () => [true, true, true, true, 'static-poster']
    });
    const report = vi.fn();

    presentation.activatePresentationAdapter('star-map', starToken, report);

    expect(scheduled).toBeUndefined();
    expect(report).not.toHaveBeenCalled();
  });

  it('[framework admission closure] fails a declared static leaf closed when its adapter is unavailable', () => {
    const title = {
      textContent: '同野观幂',
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        right: 390,
        bottom: 120,
        width: 390,
        height: 120
      })
    } as unknown as HTMLElement;
    const root = {
      ...element(),
      querySelector: (selector: string) => (
        selector === '#portrait-spike-home' ? title : null
      )
    } as unknown as HTMLElement;
    let scheduled: (() => void) | undefined;
    const presentation = createPhoneStoryPresentation({
      authorityId: heroToken.authorityId,
      scope: 'formal',
      root: () => root,
      schedulePresentationFrame(callback) {
        scheduled = callback;
        return () => { scheduled = undefined; };
      }
    });
    presentation.registerSurface({
      id: 'front:hero',
      scene: 'hero',
      kind: 'fixed',
      root: () => root,
      coverageRoot: () => root
    });
    const report = vi.fn();

    presentation.activatePresentationAdapter('hero', heroToken, report);
    scheduled?.();

    expect(scheduled).toBeUndefined();
    expect(report).not.toHaveBeenCalled();
  });

  it('[Task 3] never fabricates a proof for a token owned by another surface', () => {
    const root = element();
    const presentation = createPhoneStoryPresentation({
      authorityId: servicesToken.authorityId,
      scope: 'formal',
      root: () => root
    });
    presentation.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => root,
      presentation: () => [true, true, true, true, 'static-poster']
    });
    const report = vi.fn();
    presentation.activatePresentationAdapter('services', {
      ...servicesToken,
      subject: 'native:contact'
    }, report);

    expect(report).not.toHaveBeenCalled();
  });

  it('[Task 3] accepts a visual proof only from an active registered frame adapter', () => {
    const root = element();
    let publish: ((frame: Readonly<{
      token: PresentationToken;
      frameSequence: number;
      observedAt: number;
    }>) => void) | undefined;
    const dispose = vi.fn();
    const presentation = createPhoneStoryPresentation({
      authorityId: figure3Token.authorityId,
      scope: 'formal',
      root: () => root
    });
    presentation.registerSurface({
      id: 'group45:figure3',
      scene: 'figure3-animation',
      kind: 'fixed',
      root: () => root,
      presentation: () => [true, true, true, true, 'static-poster'],
      adapter: {
        present: (_token, report) => { publish = report; },
        dispose
      }
    });

    const report = vi.fn();
    presentation.activatePresentationAdapter(
      'figure3-animation',
      figure3Token,
      report
    );
    publish?.({ token: figure3Token, frameSequence: 7, observedAt: 42 });

    expect(report).toHaveBeenCalledWith(expect.objectContaining({
      token: figure3Token,
      frameSequence: 7,
      edge: 'figure3'
    }));

    presentation.activatePresentationAdapter(
      'figure3-animation',
      { ...figure3Token, revision: 3 },
      report
    );
    expect(dispose).toHaveBeenCalledWith(figure3Token);
  });

  it('[P0 AOD failure contract] forwards a leaf compositor failure to the exact active session instead of waiting for a fabricated frame', () => {
    const root = element();
    const targetToken: PresentationToken = {
      ...aodSegmentToken,
      kind: 'static-poster'
    };
    const presentation = createPhoneStoryPresentation({
      authorityId: targetToken.authorityId,
      scope: 'formal',
      root: () => root
    });
    presentation.registerSurface({
      id: 'front:aod',
      scene: 'aod-animation',
      kind: 'fixed',
      root: () => root,
      coverageRoot: () => root,
      presentation: () => [true, true, true, false, null],
      adapter: {
        present(_token, _report, fail) {
          fail('aod-webgl-unavailable');
        }
      }
    });
    const report = vi.fn();
    const fail = vi.fn();

    presentation.activatePresentationAdapter(
      'aod-animation',
      targetToken,
      report,
      fail
    );

    expect(report).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledExactlyOnceWith('aod-webgl-unavailable');
  });

  it('[Group67 static leaf cutover] re-arms one rejected post-paint frame with the same immutable token', () => {
    const root = element();
    const contactToken: PresentationToken = {
      authorityId: 'presentation-authority',
      sessionId: 'contact-rearm-session',
      generation: 5,
      leg: 0,
      revision: 8,
      subject: 'native:contact',
      kind: 'static-poster'
    };
    let contentPainted = false;
    const bindings: Array<(frame: Readonly<{
      token: PresentationToken;
      frameSequence: number;
      observedAt: number;
      origin: 'leaf-static-poster';
    }>) => void> = [];
    const presentation = createPhoneStoryPresentation({
      authorityId: contactToken.authorityId,
      scope: 'formal',
      root: () => root
    });
    presentation.registerSurface({
      id: 'native:contact',
      scene: 'contact',
      kind: 'native',
      root: () => root,
      coverageRoot: () => root,
      presentation: () => [
        true,
        true,
        true,
        contentPainted,
        'static-poster'
      ],
      adapter: {
        present: (_token, report) => { bindings.push(report); }
      }
    });
    const report = vi.fn();

    presentation.activatePresentationAdapter('contact', contactToken, report);
    const first = bindings.at(0);
    if (!first) throw new Error('Expected the first Contact leaf binding');
    first({
      token: contactToken,
      frameSequence: 1,
      observedAt: 42,
      origin: 'leaf-static-poster'
    });
    expect(report).not.toHaveBeenCalled();

    contentPainted = true;
    presentation.activatePresentationAdapter('contact', contactToken, report);
    const retry = bindings.at(1);
    if (!retry) throw new Error('Expected a same-token Contact leaf re-arm');
    retry({
      token: contactToken,
      frameSequence: 2,
      observedAt: 43,
      origin: 'leaf-static-poster'
    });

    expect(bindings).toHaveLength(2);
    expect(report).toHaveBeenCalledWith(expect.objectContaining({
      token: contactToken,
      frameSequence: 2,
      edge: 'contact'
    }));
  });

  it('[P0 proof phase gate] re-arms an already-painted token when the reducer rejects the first proof', () => {
    const root = element();
    const token: PresentationToken = {
      authorityId: 'presentation-authority',
      sessionId: 'phase-rearm-session',
      generation: 7,
      leg: 0,
      revision: 11,
      subject: 'native:contact',
      kind: 'static-poster'
    };
    const bindings: Array<(frame: Readonly<{
      token: PresentationToken;
      frameSequence: number;
      observedAt: number;
      origin: 'leaf-static-poster';
    }>) => void> = [];
    const presentation = createPhoneStoryPresentation({
      authorityId: token.authorityId,
      scope: 'formal',
      root: () => root
    });
    presentation.registerSurface({
      id: 'native:contact',
      scene: 'contact',
      kind: 'native',
      root: () => root,
      coverageRoot: () => root,
      presentation: () => [true, true, true, true, 'static-poster'],
      adapter: {
        present: (_token, report) => { bindings.push(report); }
      }
    });
    let accepted = false;
    const report = vi.fn(() => accepted);

    presentation.activatePresentationAdapter('contact', token, report);
    const first = bindings.at(0);
    if (!first) throw new Error('Expected the first phase-gated binding');
    first({ token, frameSequence: 1, observedAt: 42, origin: 'leaf-static-poster' });
    expect(report).toHaveBeenCalledTimes(1);

    // The same immutable target is requested again after landing alignment.
    // A proof that was physically real but rejected by the reducer must not
    // poison the active adapter's one-shot latch.
    presentation.activatePresentationAdapter('contact', token, report);
    const retry = bindings.at(1);
    if (!retry) throw new Error('Expected the same-token phase retry');
    accepted = true;
    retry({ token, frameSequence: 2, observedAt: 43, origin: 'leaf-static-poster' });

    expect(bindings).toHaveLength(2);
    expect(report).toHaveBeenCalledTimes(2);
  });

  it('[R5] accepts AOD’s declared packed-canvas segment frame before its static visual hold', () => {
    const root = element();
    const presentation = createPhoneStoryPresentation({
      authorityId: aodSegmentToken.authorityId,
      scope: 'formal',
      root: () => root
    });
    presentation.registerSurface({
      id: 'front:aod',
      scene: 'aod-animation',
      kind: 'fixed',
      root: () => root,
      coverageRoot: () => root,
      presentation: () => [true, true, true, false, null]
    });

    expect(presentation.proofForRenderedFrame({
      token: aodSegmentToken,
      frameSequence: 1,
      observedAt: 42
    })).toMatchObject({
      token: aodSegmentToken,
      frameSequence: 1,
      edge: 'method',
      connected: true,
      visible: true,
      coverageComplete: true
    });
  });

  it('[R5] gives a generic Figure3 media-handoff frame its receiving Services edge', () => {
    const root = element();
    const presentation = createPhoneStoryPresentation({
      authorityId: figure3Token.authorityId,
      scope: 'formal',
      root: () => root
    });
    presentation.registerSurface({
      id: 'group45:figure3',
      scene: 'figure3-animation',
      kind: 'fixed',
      root: () => root,
      coverageRoot: () => root,
      presentation: () => [true, true, true, false, null]
    });

    expect(presentation.proofForRenderedFrame({
      token: figure3Token,
      frameSequence: 1,
      observedAt: 42
    })).toMatchObject({
      token: figure3Token,
      edge: 'services',
      connected: true,
      visible: true,
      coverageComplete: true
    });
  });

  it('[Group45 reduced cutover] accepts only an explicitly leaf-owned native static proof as a terminal endpoint', () => {
    const root = element();
    const staticServicesToken: PresentationToken = {
      ...servicesToken,
      sessionId: 'session-reduced-services',
      generation: 7,
      revision: 7,
      kind: 'static-poster'
    };
    const presentation = createPhoneStoryPresentation({
      authorityId: staticServicesToken.authorityId,
      scope: 'formal',
      root: () => root
    });
    presentation.registerSurface({
      id: 'native:services',
      scene: 'services',
      kind: 'native',
      root: () => root,
      coverageRoot: () => root,
      presentation: () => [true, true, true, true, 'static-poster']
    });

    expect(presentation.proofForRenderedFrame({
      token: staticServicesToken,
      frameSequence: 1,
      observedAt: 42
    })).toBeNull();

    expect(presentation.proofForRenderedFrame({
      token: staticServicesToken,
      frameSequence: 2,
      observedAt: 43,
      // Added by the leaf only after its own post-layout browser paint.
      origin: 'leaf-static-poster' as never
    })).toMatchObject({
      token: staticServicesToken,
      frameSequence: 2,
      edge: 'services',
      connected: true,
      visible: true,
      coverageComplete: true
    });
  });

  it('[Method↔Figure2 reduced cutover] accepts a fixed Figure2 static poster only when its declared target marker matches', () => {
    const root = element();
    const figure2StaticToken: PresentationToken = {
      authorityId: 'presentation-authority',
      sessionId: 'figure2-reduced-session',
      generation: 11,
      leg: 0,
      revision: 13,
      subject: 'grade-a:figure2',
      kind: 'static-poster'
    };
    let markerMatches = false;
    const presentation = createPhoneStoryPresentation({
      authorityId: figure2StaticToken.authorityId,
      scope: 'formal',
      root: () => root
    });
    presentation.registerSurface({
      id: 'grade-a:figure2',
      scene: 'figure2-animation',
      kind: 'fixed',
      root: () => root,
      coverageRoot: () => root,
      presentation: () => [true, true, true, true, 'static-poster'],
      staticPoster: (token: PresentationToken) => (
        markerMatches && token === figure2StaticToken
      )
    } as never);

    expect(presentation.proofForRenderedFrame({
      token: figure2StaticToken,
      frameSequence: 1,
      observedAt: 42,
      origin: 'leaf-static-poster'
    })).toBeNull();

    markerMatches = true;
    expect(presentation.proofForRenderedFrame({
      token: figure2StaticToken,
      frameSequence: 2,
      observedAt: 43,
      origin: 'leaf-static-poster'
    })).toMatchObject({
      token: figure2StaticToken,
      edge: 'figure2',
      connected: true,
      visible: true,
      coverageComplete: true
    });

    expect(presentation.proofForRenderedFrame({
      token: figure2StaticToken,
      frameSequence: 3,
      observedAt: 44
    })).toBeNull();
  });

  it('[front reduced cutover] accepts Hero\'s actual packed post-paint only with its registered static marker', () => {
    const root = element();
    const heroStaticToken: PresentationToken = {
      authorityId: 'presentation-authority',
      sessionId: 'hero-reduced-session',
      generation: 14,
      leg: 0,
      revision: 16,
      subject: 'front:hero',
      kind: 'static-poster'
    };
    let packedCanvasPresented = false;
    const presentation = createPhoneStoryPresentation({
      authorityId: heroStaticToken.authorityId,
      scope: 'formal',
      root: () => root
    });
    presentation.registerSurface({
      id: 'front:hero',
      scene: 'hero',
      kind: 'fixed',
      root: () => root,
      coverageRoot: () => root,
      presentation: () => [true, true, true, true, 'static-poster'],
      staticPoster: (token) => packedCanvasPresented && token === heroStaticToken
    });

    expect(presentation.proofForRenderedFrame({
      token: heroStaticToken,
      frameSequence: 1,
      observedAt: 42,
      origin: 'leaf-post-paint'
    })).toBeNull();

    packedCanvasPresented = true;
    expect(presentation.proofForRenderedFrame({
      token: heroStaticToken,
      frameSequence: 2,
      observedAt: 43,
      origin: 'leaf-post-paint'
    })).toMatchObject({
      token: heroStaticToken,
      edge: 'hero',
      connected: true,
      visible: true,
      coverageComplete: true
    });
  });

  it('[Figure2↔Proof reduced cutover] accepts a fixed Proof static poster only when its declared target marker matches', () => {
    const root = element();
    const proofStaticToken: PresentationToken = {
      authorityId: 'presentation-authority',
      sessionId: 'proof-reduced-session',
      generation: 12,
      leg: 0,
      revision: 14,
      subject: 'grade-a:proof',
      kind: 'static-poster'
    };
    let markerMatches = false;
    const presentation = createPhoneStoryPresentation({
      authorityId: proofStaticToken.authorityId,
      scope: 'formal',
      root: () => root
    });
    presentation.registerSurface({
      id: 'grade-a:proof',
      scene: 'figure2-proof',
      kind: 'fixed',
      root: () => root,
      coverageRoot: () => root,
      presentation: () => [true, true, true, true, 'static-poster'],
      staticPoster: (token: PresentationToken) => (
        markerMatches && token === proofStaticToken
      )
    } as never);

    expect(presentation.proofForRenderedFrame({
      token: proofStaticToken,
      frameSequence: 1,
      observedAt: 42,
      origin: 'leaf-static-poster'
    })).toBeNull();

    markerMatches = true;
    expect(presentation.proofForRenderedFrame({
      token: proofStaticToken,
      frameSequence: 2,
      observedAt: 43,
      origin: 'leaf-static-poster'
    })).toMatchObject({
      token: proofStaticToken,
      edge: 'proof',
      connected: true,
      visible: true,
      coverageComplete: true
    });
  });

  it('[R5] keeps a segment frame on its receiving edge when a same-token Figure3 target adapter is armed', () => {
    const root = element();
    let publish: ((frame: Readonly<{
      token: PresentationToken;
      frameSequence: number;
      observedAt: number;
    }>) => void) | undefined;
    const presentation = createPhoneStoryPresentation({
      authorityId: figure3Token.authorityId,
      scope: 'formal',
      root: () => root
    });
    presentation.registerSurface({
      id: 'group45:figure3',
      scene: 'figure3-animation',
      kind: 'fixed',
      root: () => root,
      coverageRoot: () => root,
      presentation: () => [true, true, true, false, null],
      adapter: {
        present: (_token, report) => { publish = report; }
      }
    });
    presentation.activatePresentationAdapter(
      'figure3-animation',
      figure3Token,
      vi.fn()
    );

    expect(presentation.proofForRenderedFrame({
      token: figure3Token,
      frameSequence: 1,
      observedAt: 42,
      origin: 'segment-first-frame'
    })).toMatchObject({
      token: figure3Token,
      edge: 'services',
      connected: true,
      visible: true,
      coverageComplete: true
    });
    expect(publish).toBeTypeOf('function');
  });

  it('[R5] accepts a physical source canvas while its transition role is inert', () => {
    const root = element();
    root.inert = true;
    root.dataset.phoneSurfaceRole = 'transition-source';
    const coverage = element();
    const token: PresentationToken = {
      ...figure3Token,
      subject: 'group45:ttg',
      revision: 3
    };
    const presentation = createPhoneStoryPresentation({
      authorityId: token.authorityId,
      scope: 'formal',
      root: () => coverage
    });
    presentation.registerSurface({
      id: 'group45:ttg',
      scene: 'ttg-animation',
      kind: 'fixed',
      root: () => root,
      coverageRoot: () => coverage
    });

    expect(presentation.proofForRenderedFrame({
      token,
      frameSequence: 1,
      observedAt: 42
    })).toMatchObject({
      token,
      edge: 'lab',
      connected: true,
      visible: true,
      coverageComplete: true
    });
  });

});
