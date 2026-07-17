import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StoryNav, chromeForScene } from './StoryNav';

const stylesheet = readFileSync(new URL('./StoryNav.css', import.meta.url), 'utf8');

describe('StoryNav', () => {
  it('is hidden and inert on Hero without mounting expensive blur layers', () => {
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
    expect(markup).not.toContain('class="scroll-edge-blur"');
    expect(markup).not.toContain('class="scroll-edge-blur__layer"');
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
    expect(chromeForScene('education')).toEqual({ tone: 'light' });
    expect(chromeForScene('star-map')).toEqual({ tone: 'dark' });
    expect(markup).toContain('data-visible="true"');
    expect(markup).toContain('data-tone="light"');
    expect(markup).toContain('href="#services" aria-current="page"');
    expect(markup).toContain('class="site-nav__action site-nav__toggle"');
    expect(markup).toContain('class="site-nav__action nav-cta"');
    expect(stylesheet).toMatch(
      /@media \(max-width: 720px\),[\s\S]*\.site-nav__action\s*\{[^}]*min-height:\s*34px[^}]*border-radius:\s*6px/s
    );
    expect(stylesheet).not.toMatch(/font-size:\s*11px/);
    expect(stylesheet).not.toMatch(/font-weight:\s*(?:720|760)/);
    expect(stylesheet).toMatch(
      /\.site-nav \.nav-links a\s*\{[^}]*font-size:\s*var\(--type-navigation-size\)[^}]*font-weight:\s*var\(--font-weight-strong\)/s
    );
    expect(markup).not.toContain('inert=""');
    expect(markup.match(/class="scroll-edge-blur__layer"/g)).toHaveLength(7);
    expect(markup.match(/class="scroll-edge-blur__tint"/g)).toHaveLength(1);
  });
});
