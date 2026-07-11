import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { educationScene } from '../scenes/education';
import { labScene } from '../scenes/lab';
import { HandleRegistry } from '../story/registry';
import { Stage } from './Stage';
import { positionReadingAtEdge } from './reading';

describe('Stage reading layers', () => {
  it('gives long reading scenes a focusable native overflow container', () => {
    const markup = renderToStaticMarkup(createElement(Stage, {
      window: { current: 'lab', retiring: [] },
      modules: { lab: labScene },
      registry: new HandleRegistry()
    }));

    expect(markup).toContain('data-stage-layer="lab"');
    expect(markup).toContain('data-reading="true"');
    expect(markup).toContain('tabindex="0"');
  });

  it('gives both continuous two-screen scenes an explicit native scrollport', () => {
    const labMarkup = renderToStaticMarkup(createElement(Stage, {
      window: { current: 'lab', retiring: [] },
      modules: { lab: labScene },
      registry: new HandleRegistry()
    }));
    const educationMarkup = renderToStaticMarkup(createElement(Stage, {
      window: { current: 'education', retiring: [] },
      modules: { education: educationScene },
      registry: new HandleRegistry()
    }));

    expect(labMarkup).toContain('data-reading-scrollport="true"');
    expect(educationMarkup).toContain('data-reading-scrollport="true"');
  });

  it('restores a reverse-entered reading layer at its bottom edge', () => {
    const layer = {
      clientHeight: 600,
      dataset: {} as Record<string, string>,
      matches: (selector: string) => selector === '[data-reading="true"]',
      querySelector: () => null,
      scrollHeight: 1600,
      scrollTop: 0
    };

    expect(positionReadingAtEdge(layer as unknown as HTMLElement, 'bottom')).toBe(1000);
    expect(layer.scrollTop).toBe(1000);
    expect(layer.dataset.readingEdge).toBe('bottom');
  });
});
