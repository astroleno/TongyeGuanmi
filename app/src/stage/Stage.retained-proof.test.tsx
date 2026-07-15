import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { figure2AnimationScene } from '../scenes/figure2-animation';
import { figure2ProofScene } from '../scenes/figure2-proof';
import { HandleRegistry } from '../story/registry';
import { hiddenVisibility, holdVisibility } from '../pilot/visibility';
import { Stage } from './Stage';

describe('Stage retained Proof surfaces', () => {
  it('pre-mounts the Proof ground while Figure2 is current and Proof is hidden', () => {
    const markup = renderToStaticMarkup(createElement(Stage, {
      window: {
        current: 'figure2-animation',
        next: 'figure2-proof',
        retiring: []
      },
      modules: {
        'figure2-animation': figure2AnimationScene,
        'figure2-proof': figure2ProofScene
      },
      registry: new HandleRegistry(),
      visibilityByScene: {
        'figure2-animation': holdVisibility(false),
        'figure2-proof': hiddenVisibility()
      }
    }));

    expect(markup.match(/data-figure2-retained-ground=/g)).toHaveLength(1);
    expect(markup).toContain('data-figure2-retained-ground="true" data-visible="false"');
    expect(markup).toContain('data-stage-retained-figure2-arch="true" data-visible="true"');
  });

  it('keeps the same singleton surface roles visible on a direct Proof hold', () => {
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

    expect(markup.match(/data-figure2-retained-ground=/g)).toHaveLength(1);
    expect(markup.match(/data-stage-retained-figure2-arch=/g)).toHaveLength(1);
    expect(markup).toContain('data-figure2-retained-ground="true" data-visible="true"');
    expect(markup).toContain('data-stage-retained-figure2-arch="true" data-visible="true"');
  });
});
