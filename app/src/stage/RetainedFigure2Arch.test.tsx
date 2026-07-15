import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { figure2AnimationScene } from '../scenes/figure2-animation';
import { figure2ProofScene } from '../scenes/figure2-proof';
import { HandleRegistry } from '../story/registry';
import { Stage } from './Stage';
import {
  FIGURE2_NEAR_ARCH_SRC,
  RetainedFigure2Arch,
  retainedFigure2ArchState
} from './RetainedFigure2Arch';

const stylesheet = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('RetainedFigure2Arch', () => {
  it('mounts one Stage-owned arch for the Figure2 and Proof window', () => {
    const markup = renderToStaticMarkup(createElement(Stage, {
      window: {
        prev: 'figure2-animation',
        current: 'figure2-proof',
        retiring: []
      },
      modules: {
        'figure2-animation': figure2AnimationScene,
        'figure2-proof': figure2ProofScene
      },
      registry: new HandleRegistry()
    }));
    const figure2Markup = renderToStaticMarkup(createElement(figure2AnimationScene.Component, {
      scene: 'figure2-animation',
      hidden: false
    }));
    const proofMarkup = renderToStaticMarkup(createElement(figure2ProofScene.Component, {
      scene: 'figure2-proof',
      hidden: false
    }));

    expect(markup.match(/data-stage-retained-figure2-arch=/g)).toHaveLength(1);
    expect(figure2Markup).not.toContain('r4-figure2__near-arch');
    expect(proofMarkup).not.toContain('r4-proof__arch');
  });

  it('derives mounted state from membership and visible state from live ownership', () => {
    const members = [
      { scene: 'figure2-animation' as const, current: false },
      { scene: 'figure2-proof' as const, current: true }
    ];

    expect(retainedFigure2ArchState(members, {
      'figure2-animation': {
        mounted: true,
        visible: false,
        inert: true,
        opacity: 0,
        pointerEvents: 'none'
      },
      'figure2-proof': {
        mounted: true,
        visible: true,
        inert: false,
        opacity: 1,
        pointerEvents: 'auto'
      }
    })).toEqual({ mounted: true, visible: true });
    expect(retainedFigure2ArchState([{ scene: 'brand', current: true }], {})).toEqual({
      mounted: false,
      visible: false
    });
  });

  it('keeps the foreground arch above the depth ink with the accepted darker grade', () => {
    const markup = renderToStaticMarkup(createElement(RetainedFigure2Arch, {
      mounted: true,
      visible: true
    }));

    expect(markup).toContain('data-stage-retained-figure2-arch="true"');
    expect(markup).toContain('data-visible="true"');
    expect(FIGURE2_NEAR_ARCH_SRC).toMatch(/figure2-near-arch\.webp$/);
    expect(markup).toContain('figure2-near-arch.webp');
    expect(stylesheet).toMatch(/\.stage-proof-retained-arch\s*\{[^}]*--r4-figure2-near-arch-brightness:\s*\.76;/s);
    expect(stylesheet).toMatch(/\.r4-figure2__middle\s*\{[^}]*brightness\(\.96\)/s);
    expect(stylesheet).toMatch(/\.stage-proof-retained-arch\s*\{[^}]*--r4-figure2-near-arch-scale:\s*1\.135;/s);
    expect(stylesheet).toMatch(/\.stage-proof-retained-arch\s*\{[^}]*--r4-figure2-near-arch-blur:\s*3\.6px;/s);
    expect(stylesheet).toMatch(/\.stage\s*>\s*\.r4-figure2-proof-ink-canvas\s*\{[^}]*z-index:\s*60;/s);
  });

  it('stays mounted while its Proof owner is temporarily hidden', () => {
    const state = retainedFigure2ArchState([
      { scene: 'figure2-proof', current: true }
    ], {
      'figure2-proof': {
        mounted: true,
        visible: false,
        inert: true,
        opacity: 0,
        pointerEvents: 'none'
      }
    });
    const markup = renderToStaticMarkup(createElement(RetainedFigure2Arch, state));

    expect(state).toEqual({ mounted: true, visible: false });
    expect(markup.match(/data-stage-retained-figure2-arch=/g)).toHaveLength(1);
    expect(markup).toContain('data-visible="false"');
  });
});
