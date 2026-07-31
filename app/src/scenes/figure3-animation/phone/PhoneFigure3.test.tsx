import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import * as PhoneFigure3Module from './PhoneFigure3';
import {
  PhoneFigure3,
  PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS,
  phoneFigure3CanStartPreparedRun,
  phoneFigure3EndpointIsPresented,
  phoneFigure3Frame,
  phoneFigure3HasPresentedPaperFrame,
  phoneFigure3HeldEndpoint,
  phoneFigure3MediaAction,
  phoneFigure3TargetPresentationLease,
  phoneFigure3RunStartEndpoint,
  releasePhoneFigure3Video
} from './PhoneFigure3';
import {
  phoneRuntimePresentationTokenKey,
  type PhoneExecutionToken,
  type PresentationToken
} from '../../../production/phone/phone-story/runtime';

const phoneFigure3Source = readFileSync(
  new URL('./PhoneFigure3.tsx', import.meta.url),
  'utf8'
);

describe('PhoneFigure3', () => {
  it('owns one optional Figure3 video and skips it for reduced motion', () => {
    const motionMarkup = renderToStaticMarkup(createElement(PhoneFigure3, {
      active: true,
      reducedMotion: false
    }));
    const reducedMarkup = renderToStaticMarkup(createElement(PhoneFigure3, {
      active: true,
      reducedMotion: true
    }));

    expect(motionMarkup.match(/data-media-key="figure3-motion"/g)).toHaveLength(1);
    expect(motionMarkup.match(/<video/g)).toHaveLength(1);
    expect(motionMarkup.match(/<canvas/g)).toHaveLength(1);
    expect(motionMarkup).toContain('data-phone-figure3-paper-canvas');
    expect(motionMarkup).toContain('data-phone-media-fallback="figure3"');
    expect(reducedMarkup).not.toContain('<video');
    expect(reducedMarkup).not.toContain('<canvas');
    expect(motionMarkup).toContain('data-phone-media-owner="figure3-motion"');
  });

  it('bounds the physical endpoint gate before the visible poster takes over', () => {
    expect(PHONE_FIGURE3_ENDPOINT_POSTER_FALLBACK_MS).toBe(240);
  });

  it('[Group45 direct-entry cutover] never marks a fallback endpoint ready without the mounted paper compositor paint', () => {
    expect(phoneFigure3Source).toMatch(
      /endpointFallbackTimerRef\.current = window\.setTimeout\(\(\) => \{[\s\S]*?const activeCompositor = paperCompositorRef\.current;[\s\S]*?if \(!activeCompositor\) return;[\s\S]*?finishEndpointPresentation\(\s*generation,\s*endpoint,\s*runId,\s*activeCompositor\s*\)/
    );
  });

  it('holds the last valid frame on media failure and uses reduced endpoints', () => {
    expect(phoneFigure3Frame(0.5)).toMatchObject({
      progress: 0.5,
      videoOpacity: 1,
      backdropOpacity: expect.any(Number),
      backdropScale: expect.any(Number)
    });
    expect(phoneFigure3Frame(0.5, true)).toMatchObject({
      progress: 0,
      videoOpacity: 0
    });
    expect(phoneFigure3Frame(0.5, false, true)).toMatchObject({
      progress: 0.5,
      videoOpacity: 0
    });
  });

  it('selects autonomous playback or deterministic endpoints from scroll state', () => {
    expect(phoneFigure3MediaAction(false, true)).toBe('hold-initial');
    expect(phoneFigure3MediaAction(true, true)).toBe('play-forward');
    expect(phoneFigure3MediaAction(true, true, false, false, false, -1)).toBe('play-reverse');
    expect(phoneFigure3MediaAction(false, true, false, false, true, 1)).toBe('hold-terminal');
    expect(phoneFigure3MediaAction(false, true, false, false, true, -1)).toBe('hold-terminal');
    expect(phoneFigure3MediaAction(false, false)).toBe('release');
  });

  it('keeps the orchestrator target ahead of an inactive prewarm endpoint', () => {
    expect(phoneFigure3HeldEndpoint('hold-initial', 1)).toBe(1);
    expect(phoneFigure3HeldEndpoint('hold-terminal', 0)).toBe(0);
    expect(phoneFigure3HeldEndpoint('hold-initial', null)).toBe(0);
    expect(phoneFigure3HeldEndpoint('hold-terminal', null)).toBe(1);
    expect(phoneFigure3HeldEndpoint('play-reverse', 1)).toBeNull();
  });

  it('waits for the presentable endpoint required by each direction', () => {
    expect(phoneFigure3RunStartEndpoint(1)).toBe(0);
    expect(phoneFigure3RunStartEndpoint(-1)).toBe(1);
    expect(phoneFigure3CanStartPreparedRun(1, null)).toBe(false);
    expect(phoneFigure3CanStartPreparedRun(1, 1)).toBe(false);
    expect(phoneFigure3CanStartPreparedRun(1, 0)).toBe(true);
    expect(phoneFigure3CanStartPreparedRun(-1, null)).toBe(false);
    expect(phoneFigure3CanStartPreparedRun(-1, 0)).toBe(false);
    expect(phoneFigure3CanStartPreparedRun(-1, 1)).toBe(true);
  });

  it('accepts a decoded Safari endpoint without waiting for a frame callback', () => {
    expect(phoneFigure3EndpointIsPresented(0, 0, 2, false)).toBe(true);
    expect(phoneFigure3EndpointIsPresented(0, .04, 2, false)).toBe(true);
    expect(phoneFigure3EndpointIsPresented(0, .06, 2, false)).toBe(false);
    expect(phoneFigure3EndpointIsPresented(1, 2.567, 2, false)).toBe(true);
    expect(phoneFigure3EndpointIsPresented(1, 2.567, 1, false)).toBe(false);
    expect(phoneFigure3EndpointIsPresented(1, 2.567, 2, true)).toBe(false);
  });

  it('requires a painted paper canvas before a direct Figure3 hold is presentable', () => {
    const canvas = {
      dataset: {} as DOMStringMap
    } as HTMLCanvasElement;

    expect(phoneFigure3HasPresentedPaperFrame(canvas)).toBe(false);
    canvas.dataset.phoneFigure3PaperFrame = 'ready';
    expect(phoneFigure3HasPresentedPaperFrame(canvas)).toBe(true);
  });

  it('[Group45 direct-entry cutover] rearms only the current token after a delayed compositor mount', () => {
    type Target = Readonly<{
      endpoint: 0 | 1;
      direction: 1 | -1;
      generation: number;
      runId: string;
    }>;
    type Action =
      | 'wait-for-compositor'
      | 'wait-for-runtime'
      | 'arm-current'
      | 'already-armed';
    const select = (
      PhoneFigure3Module as typeof PhoneFigure3Module & Readonly<{
        phoneFigure3TargetPreparationAction?: (
          target: Target | null,
          armed: Target | null,
          compositorMounted: boolean,
          endpointRuntimeReady?: boolean
        ) => Action;
      }>
    ).phoneFigure3TargetPreparationAction;

    expect(select).toBeTypeOf('function');
    if (!select) return;

    const current: Target = {
      endpoint: 0,
      direction: 1,
      generation: 42,
      runId: 'authority|session|42|0|42|group45%3Afigure3|packed-canvas-frame'
    };
    const stale: Target = {
      ...current,
      generation: 41,
      runId: 'authority|session|41|0|41|group45%3Afigure3|packed-canvas-frame'
    };
    const nextRevision: Target = {
      ...current,
      generation: 43,
      runId: 'authority|session|43|0|43|group45%3Afigure3|packed-canvas-frame'
    };

    expect(select(current, null, false)).toBe('wait-for-compositor');
    // The compositor mounts before its native endpoint runtime. It must not
    // consume the immutable target yet: playback creation gets a later turn
    // in the same React commit.
    expect(select(current, null, true, false)).toBe('wait-for-runtime');
    expect(select(current, null, true)).toBe('arm-current');
    expect(select(current, stale, true)).toBe('arm-current');
    expect(select(current, current, true)).toBe('already-armed');
    // A delayed callback that armed revision 42 cannot satisfy revision 43.
    expect(select(nextRevision, current, true)).toBe('arm-current');
    expect(select(nextRevision, nextRevision, true)).toBe('already-armed');
  });

  it('[Group45 direct-entry cutover] retains a current target through an inactive snapshot reconciliation', () => {
    const controller = new AbortController();
    const token: PresentationToken = {
      authorityId: 'authority',
      sessionId: 'session',
      generation: 42,
      leg: 0,
      revision: 42,
      subject: 'group45:figure3',
      kind: 'packed-canvas-frame'
    };
    const target = {
      endpoint: 0 as const,
      direction: 1 as const,
      generation: 42,
      runId: phoneRuntimePresentationTokenKey(token),
      token,
      signal: controller.signal
    };

    // A hash re-entry can publish its candidate before the projection's
    // prewarm flag reaches this leaf. The candidate's exact token owns the
    // resource lease until it is painted or its machine signal aborts.
    expect(phoneFigure3TargetPresentationLease(target, 'release'))
      .toBe('retain-target-presentation');
    expect(phoneFigure3TargetPresentationLease(null, 'release'))
      .toBe('release');
  });

  it('[Group45 reverse hard cutover] accepts only an exact prepared reverse token and rejects a stale target', () => {
    type Target = Readonly<{
      endpoint: 0 | 1;
      direction: 1 | -1;
      generation: number;
      runId: string;
      token: PresentationToken;
      signal: AbortSignal;
    }>;
    type Prepared = Readonly<{
      endpoint: 0 | 1;
      presentationKey: string;
    }>;
    type Lease = (
      target: Target | null,
      fallback: 'hold-initial' | 'hold-terminal',
      execution: PhoneExecutionToken | null,
      prepared: Prepared | null
    ) => 'hold-initial' | 'hold-terminal' | 'play-forward' | 'play-reverse'
      | 'retain-target-presentation' | 'discard-stale-target';
    const lease = (
      PhoneFigure3Module as typeof PhoneFigure3Module & Readonly<{
        phoneFigure3TargetPresentationLease?: Lease;
      }>
    ).phoneFigure3TargetPresentationLease;

    expect(lease).toBeTypeOf('function');
    if (!lease) return;

    const controller = new AbortController();
    const token: PresentationToken = {
      authorityId: 'authority',
      sessionId: 'session',
      generation: 42,
      leg: 1,
      revision: 43,
      subject: 'group45:figure3',
      kind: 'packed-canvas-frame'
    };
    const target: Target = {
      endpoint: 1,
      direction: -1,
      generation: token.generation,
      runId: phoneRuntimePresentationTokenKey(token),
      token,
      signal: controller.signal
    };
    const execution: PhoneExecutionToken = [
      token.authorityId,
      token.sessionId!,
      token.generation,
      token.leg!,
      -1,
      token
    ];
    const prepared: Prepared = {
      endpoint: target.endpoint,
      presentationKey: target.runId
    };

    expect(lease(target, 'hold-terminal', execution, prepared))
      .toBe('play-reverse');
    expect(lease(
      { ...target, token: { ...token, sessionId: 'stale' } },
      'hold-terminal',
      execution,
      prepared
    )).toBe('discard-stale-target');
  });

  it('[Group45 hard cutover] permits only the declared effect-to-canvas forward lineage', () => {
    type Target = Readonly<{
      endpoint: 0 | 1;
      direction: 1 | -1;
      generation: number;
      runId: string;
      token: PresentationToken;
      signal: AbortSignal;
    }>;
    type Prepared = Readonly<{
      endpoint: 0 | 1;
      presentationKey: string;
    }>;
    type Lease = (
      target: Target | null,
      fallback: 'hold-initial' | 'hold-terminal',
      execution: PhoneExecutionToken | null,
      prepared: Prepared | null
    ) => 'hold-initial' | 'hold-terminal' | 'play-forward' | 'play-reverse'
      | 'retain-target-presentation' | 'discard-stale-target';
    const lease = (
      PhoneFigure3Module as typeof PhoneFigure3Module & Readonly<{
        phoneFigure3TargetPresentationLease?: Lease;
      }>
    ).phoneFigure3TargetPresentationLease;

    expect(lease).toBeTypeOf('function');
    if (!lease) return;

    const controller = new AbortController();
    const targetToken: PresentationToken = {
      authorityId: 'authority',
      sessionId: 'session',
      generation: 42,
      leg: 0,
      revision: 42,
      subject: 'group45:effect',
      kind: 'effect-frame'
    };
    const executionToken: PresentationToken = {
      ...targetToken,
      leg: 1,
      revision: 43,
      subject: 'group45:figure3',
      kind: 'packed-canvas-frame'
    };
    const target: Target = {
      endpoint: 0,
      direction: 1,
      generation: targetToken.generation,
      runId: phoneRuntimePresentationTokenKey(targetToken),
      token: targetToken,
      signal: controller.signal
    };
    const execution: PhoneExecutionToken = [
      executionToken.authorityId,
      executionToken.sessionId!,
      executionToken.generation,
      executionToken.leg!,
      1,
      executionToken
    ];

    expect(lease(target, 'hold-initial', execution, {
      endpoint: 0,
      presentationKey: target.runId
    })).toBe('play-forward');
    const staleExecution: PhoneExecutionToken = [
      executionToken.authorityId,
      executionToken.sessionId!,
      executionToken.generation,
      executionToken.leg!,
      1,
      { ...executionToken, revision: targetToken.revision }
    ];
    expect(lease(target, 'hold-initial', staleExecution, {
      endpoint: 0,
      presentationKey: target.runId
    })).toBe('discard-stale-target');
  });

  it('[Group45 reverse hard cutover] bootstraps the native decoder from the current target endpoint', () => {
    type Bootstrap = (
      target: Readonly<{
        endpoint: 0 | 1;
        signal: AbortSignal;
      }> | null
    ) => 0 | 1;
    const bootstrap = (
      PhoneFigure3Module as typeof PhoneFigure3Module & Readonly<{
        phoneFigure3BootstrapEndpoint?: Bootstrap;
      }>
    ).phoneFigure3BootstrapEndpoint;

    expect(bootstrap).toBeTypeOf('function');
    if (!bootstrap) return;

    const active = new AbortController();
    const aborted = new AbortController();
    aborted.abort();
    expect(bootstrap({ endpoint: 1, signal: active.signal })).toBe(1);
    expect(bootstrap({ endpoint: 1, signal: aborted.signal })).toBe(0);
    expect(bootstrap(null)).toBe(0);
    expect(phoneFigure3Source).toContain(
      'playback.reset(phoneFigure3BootstrapEndpoint(targetPreparationRef.current));'
    );
  });

  it('[Group45 reverse hard cutover] leaves reconciliation as the only Figure3 production startRun writer', () => {
    expect([...phoneFigure3Source.matchAll(/\bstartRun\(/g)]).toHaveLength(1);
    const handle = phoneFigure3Source.slice(
      phoneFigure3Source.indexOf('useImperativeHandle')
    );
    expect(handle).not.toMatch(/enter\(\)\s*\{[\s\S]*?startRun\(/);
    expect(handle).not.toMatch(/reverse\(\)\s*\{[\s\S]*?startRun\(/);
  });

  it('disposes the retired video source and decoder', () => {
    const firstSource = { removeAttribute: vi.fn() };
    const secondSource = { removeAttribute: vi.fn() };
    const video = {
      pause: vi.fn(),
      removeAttribute: vi.fn(),
      querySelectorAll: vi.fn(() => [firstSource, secondSource]),
      load: vi.fn()
    };

    releasePhoneFigure3Video(video as unknown as HTMLVideoElement);

    expect(video.pause).toHaveBeenCalledOnce();
    expect(video.removeAttribute).toHaveBeenCalledWith('src');
    expect(firstSource.removeAttribute).toHaveBeenCalledWith('src');
    expect(secondSource.removeAttribute).toHaveBeenCalledWith('src');
    expect(video.load).toHaveBeenCalledOnce();
  });

  it('[Group45 direct-entry cutover] restores a released Figure3 source before a remount re-arms it', () => {
    type Restore = (video: HTMLVideoElement | null) => void;
    const restore = (
      PhoneFigure3Module as typeof PhoneFigure3Module & Readonly<{
        restorePhoneFigure3VideoSources?: Restore;
      }>
    ).restorePhoneFigure3VideoSources;

    expect(restore).toBeTypeOf('function');
    if (!restore) return;

    const source = (format: 'webm' | 'hevc') => {
      const attributes = new Map<string, string>([
        ['data-alpha-video-format', format]
      ]);
      return {
        getAttribute: vi.fn((name: string) => attributes.get(name) ?? null),
        setAttribute: vi.fn((name: string, value: string) => {
          attributes.set(name, value);
        })
      };
    };
    const webm = source('webm');
    const hevc = source('hevc');
    const video = {
      querySelectorAll: vi.fn(() => [webm, hevc]),
      load: vi.fn()
    };

    restore(video as unknown as HTMLVideoElement);

    expect(webm.setAttribute).toHaveBeenCalledWith(
      'src',
      expect.stringContaining('figure3-motion.webm')
    );
    expect(hevc.setAttribute).toHaveBeenCalledWith(
      'src',
      expect.stringContaining('figure3-motion-hevc-alpha.mp4')
    );
    expect(video.load).toHaveBeenCalledOnce();
  });
});
