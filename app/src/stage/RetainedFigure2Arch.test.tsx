import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { figure2AnimationScene } from '../scenes/figure2-animation';
import { figure2ProofCardsScene } from '../scenes/figure2-proof-cards';
import { figure2ProofClosingScene } from '../scenes/figure2-proof-closing';
import { figure2ProofOpeningScene } from '../scenes/figure2-proof-opening';
import { HandleRegistry } from '../story/registry';
import { Stage } from './Stage';
import {
  RetainedFigure2Arch,
  retainedFigure2ArchState
} from './RetainedFigure2Arch';

const stylesheet = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

describe('RetainedFigure2Arch', () => {
  it('mounts one Stage-owned arch for the Figure2 and Proof window', () => {
    const markup = renderToStaticMarkup(createElement(Stage, {
      window: {
        prev: 'figure2-proof-opening',
        current: 'figure2-proof-cards',
        next: 'figure2-proof-closing',
        retiring: []
      },
      modules: {
        'figure2-proof-opening': figure2ProofOpeningScene,
        'figure2-proof-cards': figure2ProofCardsScene,
        'figure2-proof-closing': figure2ProofClosingScene
      },
      registry: new HandleRegistry()
    }));
    const figure2Markup = renderToStaticMarkup(createElement(figure2AnimationScene.Component, {
      scene: 'figure2-animation',
      hidden: false
    }));
    const proofOpeningMarkup = renderToStaticMarkup(createElement(figure2ProofOpeningScene.Component, {
      scene: 'figure2-proof-opening',
      hidden: false
    }));
    const proofCardsMarkup = renderToStaticMarkup(createElement(figure2ProofCardsScene.Component, {
      scene: 'figure2-proof-cards',
      hidden: false
    }));
    const proofClosingMarkup = renderToStaticMarkup(createElement(figure2ProofClosingScene.Component, {
      scene: 'figure2-proof-closing',
      hidden: false
    }));

    expect(markup.match(/data-stage-retained-figure2-arch=/g)).toHaveLength(1);
    expect(figure2Markup).not.toContain('r4-figure2__near-arch');
    expect(proofOpeningMarkup).not.toContain('r4-proof__arch');
    expect(proofCardsMarkup).not.toContain('r4-proof__arch');
    expect(proofClosingMarkup).not.toContain('r4-proof__arch');
  });

  it('derives mounted state from membership and visible state from live ownership', () => {
    const members = [
      { scene: 'figure2-animation' as const, current: false },
      { scene: 'figure2-proof-opening' as const, current: true }
    ];

    expect(retainedFigure2ArchState(members, {
      'figure2-animation': {
        mounted: true,
        visible: false,
        inert: true,
        opacity: 0,
        pointerEvents: 'none'
      },
      'figure2-proof-opening': {
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

  it('keeps terminal direct-seek defaults above the depth ink without a dark grade', () => {
    const markup = renderToStaticMarkup(createElement(RetainedFigure2Arch, {
      mounted: true,
      visible: true
    }));

    expect(markup).toContain('data-stage-retained-figure2-arch="true"');
    expect(markup).toContain('data-visible="true"');
    expect(stylesheet).toMatch(/\.stage-proof-retained-arch\s*\{[^}]*--r4-figure2-near-arch-brightness:\s*1;/s);
    expect(stylesheet).toMatch(/\.stage-proof-retained-arch\s*\{[^}]*--r4-figure2-near-arch-scale:\s*1\.135;/s);
    expect(stylesheet).toMatch(/\.stage-proof-retained-arch\s*\{[^}]*--r4-figure2-near-arch-blur:\s*3\.6px;/s);
    expect(stylesheet).toMatch(/\.stage\s*>\s*\.r4-figure2-proof-ink-canvas\s*\{[^}]*z-index:\s*60;/s);
  });

  it('stays mounted while its Proof owner is temporarily hidden', () => {
    const state = retainedFigure2ArchState([
      { scene: 'figure2-proof-closing', current: true }
    ], {
      'figure2-proof-closing': {
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
