import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  STAR_MAP_COPY,
  renderStarMapHold,
  renderStarMapProgress,
  starMapMotionEnabled,
  starMapScene
} from './index';

const stylesheet = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

class FakeStyle {
  values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }

  getPropertyValue(name: string): string {
    return this.values.get(name) ?? '';
  }
}

class FakeElement {
  style = new FakeStyle();
  attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

describe('star-map progress renderer', () => {
  it('keeps the canonical live Perlin owner active while visible', () => {
    expect(starMapMotionEnabled(true, false)).toBe(false);
    expect(starMapMotionEnabled(false, true)).toBe(false);
    expect(starMapMotionEnabled(false, false, 'next')).toBe(false);
    expect(starMapMotionEnabled(false, false)).toBe(true);
  });

  it('is idempotent for repeated progress renders', () => {
    const root = new FakeElement();

    const first = renderStarMapProgress(root as unknown as HTMLElement, 0.75);
    const second = renderStarMapProgress(root as unknown as HTMLElement, 0.75);

    expect(second).toEqual(first);
    expect(root.style.values.get('--r3-star-copy-opacity')).toBe('0.7500');
    expect(root.style.values.get('--r3-star-canvas-opacity')).toBe('0.6600');
    expect(root.attributes.get('data-star-map-progress')).toBe('0.7500');
    expect(root.attributes.get('data-star-map-copy-opaque')).toBe('false');
  });

  it('keeps both the hold container and actual Star Map text fully opaque', () => {
    const root = new FakeElement();

    renderStarMapHold(root as unknown as HTMLElement);

    expect(root.style.getPropertyValue('--r3-star-copy-opacity')).toBe('1.0000');
    expect(root.attributes.get('data-star-map-copy-opaque')).toBe('true');
    expect(stylesheet).toMatch(/\.r3-star-map\s*\{[^}]*--r3-star-copy-opacity:\s*1/s);
    expect(stylesheet).toMatch(/\.r3-star-map \.large-copy--standalone\s*\{[^}]*color:\s*rgb\(247,\s*237,\s*215\)/s);
  });

  it('keeps the final sentence accessible while protecting 未来三年 from browser splitting', () => {
    const markup = renderToStaticMarkup(createElement(starMapScene.Component, {
      scene: 'star-map',
      hidden: false
    }));

    expect(markup).toContain('class="r4-authored-phrase">未来三年</span>');
    expect(markup.replace(/<[^>]+>/g, '')).toContain(STAR_MAP_COPY);
  });
});
