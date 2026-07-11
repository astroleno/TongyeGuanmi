import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TextReveal, TextRevealItem } from './TextReveal';

describe('TextReveal effect naming contract', () => {
  it('exposes the three independent Hero effects by stable names', () => {
    const UntypedTextReveal = TextReveal as ComponentType<Record<string, unknown>>;
    const markup = renderToStaticMarkup(createElement(
      UntypedTextReveal,
      {
        active: true,
        effects: ['stagger', 'blur-to-clear', 'rise-up'],
        children: createElement(TextRevealItem, { index: 0, children: '同' })
      }
    ));

    expect(markup).toContain('data-text-reveal-effects="stagger blur-to-clear rise-up"');
  });

  it('does not silently opt non-Hero callers into Hero effects', () => {
    const markup = renderToStaticMarkup(createElement(
      TextReveal,
      { active: true, children: createElement(TextRevealItem, { index: 0, children: '静止文案' }) }
    ));

    expect(markup).toContain('data-text-reveal-effects=""');
  });
});
