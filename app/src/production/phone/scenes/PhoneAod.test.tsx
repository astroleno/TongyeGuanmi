import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createPackedAlphaWebGlRestoreOwner } from '../../../media/packed-alpha-video';
import type {
  PhoneRenderedPresentationFrame,
  PresentationToken
} from '../phone-story/runtime';
import { PhoneAod } from './PhoneAod';

type PhoneAodTestContract = readonly [
  (
    token: PresentationToken,
    frameSequence: number,
    observedAt: number,
    origin?: 'leaf-static-poster' | 'leaf-post-paint'
  ) => PhoneRenderedPresentationFrame,
  (
    mediaTime: number | null,
    direction: 1 | -1 | null
  ) => number | null,
  unknown
];
const phoneAodTestContract = (PhoneAod as unknown as Record<symbol, unknown>)[
  Symbol.for('phone-aod-test-contract')
] as PhoneAodTestContract;
const {
  0: phoneAodPresentationFrame,
  1: phoneAodStableFrameMediaTime
} = phoneAodTestContract;

const aodSource = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'PhoneAod.tsx'),
  'utf8'
);
const aodStyles = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'PhoneAod.css'),
  'utf8'
);
const aodContinuationPath = aodSource.slice(
  aodSource.indexOf('const continueBoundPresentation'),
  aodSource.indexOf('progressListenerRef.current')
);

describe('PhoneAod Route B adapter', () => {
  it('keeps its stable root mounted and reserves active for decoder resources', () => {
    const markup = renderToStaticMarkup(
      <PhoneAod active={false} reducedMotion={false} />
    );

    expect(markup).toContain(
      'class="portrait-scroll-spike__scene portrait-scroll-spike__scene--aod"'
    );
    expect(markup).toContain('data-aod-figure-canvas="true"');
    expect(markup).toContain('data-aod-figure-video="true"');
  });

  it('returns the original immutable token only as a static leaf frame', () => {
    const token = {
      authorityId: 'aod-authority',
      sessionId: 'aod-session',
      generation: 4,
      leg: 0,
      revision: 9,
      subject: 'front:aod',
      kind: 'static-poster' as const
    };

    expect(phoneAodPresentationFrame(token, 1, 48)).toEqual({
      token,
      frameSequence: 1,
      observedAt: 48,
      origin: 'leaf-static-poster'
    });
  });

  it('[Star→AOD hard cutover] keeps the immutable token shape used by the canvas proof', () => {
    const token = {
      authorityId: 'aod-authority',
      sessionId: 'aod-session',
      generation: 4,
      leg: 0,
      revision: 9,
      subject: 'front:aod',
      kind: 'static-poster' as const
    };

    expect(phoneAodPresentationFrame(token, 1, 48, 'leaf-post-paint')).toEqual({
      token,
      frameSequence: 1,
      observedAt: 48,
      origin: 'leaf-post-paint'
    });
  });

  it('keeps a synchronously restored compositor for the pending presentation lease', () => {
    const ensureCompositor = aodSource.slice(
      aodSource.indexOf('const ensureCompositor'),
      aodSource.indexOf('progressListenerRef.current')
    );
    expect(ensureCompositor).toContain('return compositorRef.current;');
    const presentationPath = aodSource.slice(
      aodSource.indexOf('presentPresentation(token'),
      aodSource.indexOf('disposePresentation(token')
    );
    expect(presentationPath).toContain(
      'ensureCompositor() ?? compositorRef.current'
    );
  });

  it('accepts an asynchronously restored exact frame only for the current binding', async () => {
    type Binding = { reported: boolean };
    type PresentationResult = (
      binding: Binding,
      current: Binding | null,
      mediaTime: number | null,
      compositor: { render: (mediaTime: number) => 'rendered' | 'waiting' }
    ) => boolean | null;
    const presentationResult = phoneAodTestContract[2] as
      | PresentationResult
      | undefined;
    expect(presentationResult).toBeTypeOf('function');
    if (!presentationResult) return;

    const binding = { reported: false };
    let current: Binding | null = binding;
    let resolveFrame: (mediaTime: number | null) => void = () => {};
    const prepare = vi.fn(() => new Promise<number | null>((resolve) => {
      resolveFrame = resolve;
    }));
    const render = vi.fn(() => 'rendered' as const);
    const report = vi.fn();
    const fail = vi.fn();
    let lost = true;
    let restored: EventListener | undefined;
    const extension = {
      restoreContext: vi.fn(),
      loseContext: vi.fn()
    };
    const canvas = {
      getContext: vi.fn(() => ({
        isContextLost: () => lost,
        getExtension: () => extension
      })),
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'webglcontextrestored') restored = listener;
      })
    } as unknown as HTMLCanvasElement;
    const owner = createPackedAlphaWebGlRestoreOwner();
    owner.markPending();
    let pending = Promise.resolve();
    owner.wait(
      canvas,
      () => {
        pending = prepare().then((mediaTime) => {
          const accepted = presentationResult(
            binding, current, mediaTime, { render }
          );
          if (accepted) report();
          else if (accepted === false) fail();
        });
      },
      fail
    );
    expect(extension.restoreContext).toHaveBeenCalledOnce();
    expect(prepare).not.toHaveBeenCalled();
    lost = false;
    restored?.(new Event('webglcontextrestored'));
    expect(prepare).toHaveBeenCalledOnce();

    resolveFrame(2.567);
    await pending;
    expect(render).toHaveBeenCalledWith(2.567);
    expect(report).toHaveBeenCalledOnce();
    expect(fail).not.toHaveBeenCalled();

    const staleBinding = { reported: false };
    current = staleBinding;
    let resolveStale: (mediaTime: number | null) => void = () => {};
    const stale = new Promise<number | null>((resolve) => {
      resolveStale = resolve;
    }).then((mediaTime) => presentationResult(
      staleBinding, current, mediaTime, { render }
    ));
    current = { reported: false };
    resolveStale(0);
    expect(await stale).toBeNull();
    expect(render).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledTimes(1);
    expect(fail).not.toHaveBeenCalled();
  });

  it('routes initial and asynchronous restore admission through one continuation', () => {
    const restorePath = aodSource.slice(
      aodSource.indexOf('const ensureCompositor'),
      aodSource.indexOf('progressListenerRef.current')
    );
    const presentationPath = aodSource.slice(
      aodSource.indexOf('presentPresentation(token'),
      aodSource.indexOf('disposePresentation(token')
    );
    expect(restorePath).toContain(
      'void continueBoundPresentation(binding, restoredCompositor)'
    );
    expect(presentationPath).toContain(
      'await continueBoundPresentation(binding, compositor)'
    );
  });

  it('[P0 WebKit reverse] reuses only the exact final packed frame for stable admission', () => {
    expect(phoneAodStableFrameMediaTime(0, -1)).toBe(0);
    expect(phoneAodStableFrameMediaTime(0.03, -1)).toBe(0.03);
    expect(phoneAodStableFrameMediaTime(0.2, -1)).toBeNull();
    expect(phoneAodStableFrameMediaTime(null, -1)).toBeNull();
  });

  it('[P0 WebKit forward] binds stable admission to the authored final rVFC without a timeline target', () => {
    expect(phoneAodStableFrameMediaTime(2.567, 1)).toBe(2.567);
    expect(phoneAodStableFrameMediaTime(2.53, 1)).toBe(2.53);
    expect(phoneAodStableFrameMediaTime(2.4, 1)).toBeNull();
    expect(phoneAodStableFrameMediaTime(null, 1)).toBeNull();

    expect(aodContinuationPath).not.toContain('stableMediaTime ?? undefined');
    expect(aodContinuationPath).toContain('preparePhoneExactTimelineFrame');
  });

  it('[P0 AOD visual] contains no animated paper treatment writer', () => {
    expect(aodStyles).not.toContain('--portrait-aod-paper-wash-background');
    expect(aodStyles).not.toContain('--portrait-aod-bottom-mist-background');
    expect(aodStyles).not.toContain('--portrait-aod-paper-solid-background');
    expect(aodStyles).not.toContain('.aod-transition__paper-solid');
  });

});
