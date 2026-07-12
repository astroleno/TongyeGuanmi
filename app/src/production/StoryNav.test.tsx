import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StoryNav, chromeForScene } from './StoryNav';

describe('StoryNav', () => {
  it('is hidden and inert on Hero with the exact blur sibling structure', () => {
    const markup = renderToStaticMarkup(createElement(StoryNav, {
      currentScene: 'hero',
      visible: false,
      menuOpen: false,
      onToggleMenu: vi.fn(),
      onNavigate: vi.fn()
    }));

    expect(markup).toContain('class="site-nav has-scroll-edge-blur"');
    expect(markup).toContain('data-visible="false"');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('inert=""');
    expect(markup).toContain('tabindex="-1"');
    expect(markup).toMatch(/<\/nav><div class="scroll-edge-blur"/);
    expect(markup.match(/class="scroll-edge-blur__layer"/g)).toHaveLength(7);
    expect(markup.match(/class="scroll-edge-blur__tint"/g)).toHaveLength(1);
  });

  it('uses committed scene chrome metadata and exposes the active destination', () => {
    const markup = renderToStaticMarkup(createElement(StoryNav, {
      currentScene: 'services',
      visible: true,
      menuOpen: false,
      onToggleMenu: vi.fn(),
      onNavigate: vi.fn()
    }));

    expect(chromeForScene('services')).toEqual({ tone: 'light' });
    expect(chromeForScene('star-map')).toEqual({ tone: 'dark' });
    expect(markup).toContain('data-visible="true"');
    expect(markup).toContain('data-tone="light"');
    expect(markup).toContain('href="#services" aria-current="page"');
    expect(markup).not.toContain('inert=""');
  });
});
