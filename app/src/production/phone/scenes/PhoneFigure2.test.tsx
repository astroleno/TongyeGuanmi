import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import * as figure2Module from './PhoneFigure2';
import { PhoneFigure2 } from './PhoneFigure2';
import type { PresentationToken } from '../phone-story/machine';
import {
  createPhoneStoryRuntime,
  type PhoneCinematicSnapshot
} from '../phone-story/runtime';
import { PhoneStoryRuntimeProvider } from '../PhoneStoryRuntimeContext';

const phoneFigure2StaticPresentationFrame = (
  figure2Module as typeof figure2Module & Readonly<{
    phoneFigure2StaticPresentationFrame?: (
      token: PresentationToken,
      frameSequence: number,
      observedAt: number
    ) => Readonly<unknown>;
  }>
).phoneFigure2StaticPresentationFrame;

const phoneFigure2MediaPlan = (
  figure2Module as typeof figure2Module & Readonly<{
    phoneFigure2MediaPlan?: (
      snapshot: PhoneCinematicSnapshot,
      reducedMotion: boolean
    ) => readonly [
      'idle' | 'static' | 'seek',
      number,
      'forward' | 'endpoint' | null
    ];
  }>
).phoneFigure2MediaPlan;

function cinematicSnapshot(
  overrides: Partial<{
    scene: 'method-top' | 'figure2-animation' | 'figure2-proof' | 'brand';
    run: 'method-figure2' | 'figure2-proof' | 'proof-brand' | null;
    direction: 1 | -1 | null;
    progress: number | null;
    status: 'stable' | 'transaction';
    phase: 'preparing' | 'animating' | 'verifying-target' | 'rollback-rendering' | null;
    scrollCorridor: 'method-grade-a' | null;
    scrollProgress: number;
  }> = {}
): PhoneCinematicSnapshot {
  return [
    overrides.scene ?? 'method-top',
    null,
    'native:method',
    'figure2-authority',
    overrides.status === 'transaction' ? 'figure2-session' : null,
    overrides.status === 'transaction' ? 3 : null,
    overrides.run ?? null,
    overrides.direction ?? null,
    overrides.status === 'transaction' ? 0 : null,
    overrides.phase ?? null,
    overrides.progress ?? null,
    overrides.status ?? 'stable',
    overrides.scene ?? 'method-top',
    'grade-a',
    0,
    overrides.scrollCorridor ?? null,
    overrides.scrollProgress ?? 0,
    null,
    null
  ];
}

describe('PhoneFigure2', () => {
  it('adapts the one canonical Figure2 root and media pair', () => {
    const authority = createPhoneStoryRuntime({
      scope: 'formal',
      initialScene: 'hero',
      root: () => null,
      scrollY: () => 0,
      scrollTo: () => undefined
    });
    const markup = renderToStaticMarkup(createElement(
      PhoneStoryRuntimeProvider,
      {
        authority,
        children: createElement(PhoneFigure2, {
          active: true,
          reducedMotion: false
        })
      }
    ));
    expect(markup.match(/data-r4-scene="figure2-animation"/g)).toHaveLength(1);
    expect(markup.match(/data-media-key="figure2-pair-motion"/g)).toHaveLength(1);
    expect(markup.match(/data-figure2-packed-alpha-canvas="true"/g)).toHaveLength(1);
    expect(markup).toContain('preload="auto"');
    expect(markup).not.toContain('poster');
  });

  it('[Method↔Figure2 reduced cutover] exposes only the original immutable token as a static leaf frame', () => {
    const token: PresentationToken = {
      authorityId: 'figure2-authority',
      sessionId: 'figure2-session',
      generation: 3,
      leg: 0,
      revision: 7,
      subject: 'grade-a:figure2',
      kind: 'static-poster'
    };

    expect(phoneFigure2StaticPresentationFrame).toBeTypeOf('function');
    if (!phoneFigure2StaticPresentationFrame) return;
    expect(phoneFigure2StaticPresentationFrame(token, 1, 84)).toEqual({
      token,
      frameSequence: 1,
      observedAt: 84,
      origin: 'leaf-static-poster'
    });
  });

  it('[Method→Figure2→Proof execution cutover] derives its only media plan from the immutable authority snapshot', () => {
    expect(phoneFigure2MediaPlan).toBeTypeOf('function');
    if (!phoneFigure2MediaPlan) return;

    expect(phoneFigure2MediaPlan(cinematicSnapshot(), false)).toEqual([
      'idle', 0, null
    ]);
    expect(phoneFigure2MediaPlan(cinematicSnapshot({
      scene: 'figure2-animation',
      scrollCorridor: 'method-grade-a',
      scrollProgress: .36
    }), false)).toEqual(['seek', .5, 'forward']);
    expect(phoneFigure2MediaPlan(cinematicSnapshot({
      status: 'transaction',
      run: 'method-figure2',
      direction: 1,
      phase: 'preparing',
      progress: 0
    }), false)).toEqual(['seek', 0, 'forward']);
    expect(phoneFigure2MediaPlan(cinematicSnapshot({
      scene: 'figure2-proof',
      status: 'transaction',
      run: 'figure2-proof',
      direction: -1,
      phase: 'animating',
      progress: .45
    }), false)).toEqual(['seek', 1, 'endpoint']);
    expect(phoneFigure2MediaPlan(cinematicSnapshot({
      status: 'transaction',
      run: 'method-figure2',
      direction: 1,
      phase: 'preparing',
      progress: 0
    }), true)).toEqual(['static', 0, 'endpoint']);
  });

});
