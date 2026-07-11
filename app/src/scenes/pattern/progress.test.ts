import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PATTERN_COPY, patternScene, renderPatternProgress } from './index';
import { fixtureStaticFallbackText } from '../../story/copy-baseline';
import { STAR_MAP_COPY } from '../star-map';

class FakeStyle {
  values = new Map<string, string>();

  setProperty(name: string, value: string): void {
    this.values.set(name, value);
  }
}

class FakeElement {
  style = new FakeStyle();
  attributes = new Map<string, string>();

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
}

describe('pattern scene renderer', () => {
  it('is idempotent for 0 to 1 to 0 to 1 progress renders', () => {
    const root = new FakeElement();

    const start = renderPatternProgress(root as unknown as HTMLElement, 0);
    const end = renderPatternProgress(root as unknown as HTMLElement, 1);
    const restored = renderPatternProgress(root as unknown as HTMLElement, 0);
    const replayed = renderPatternProgress(root as unknown as HTMLElement, 1);

    expect(restored).toEqual(start);
    expect(replayed).toEqual(end);
    expect(start.largestRingScale).toBeGreaterThan(4);
    expect(end.largestRingScale).toBeLessThan(0.1);
    expect(start.fieldRotationDegrees).toBe(120);
    expect(end.fieldRotationDegrees).toBe(0);
    expect(end.centerXRatio).toBe(0.24);
    expect(root.style.values.get('--r4-pattern-progress')).toBe('1.0000');
    expect(root.attributes.get('data-pattern-progress')).toBe('1.0000');
  });

  it('keeps static fallback copy aligned with the belief baseline', () => {
    expect(PATTERN_COPY).toEqual([STAR_MAP_COPY]);
    expect(patternScene.staticFallback?.text).toEqual(PATTERN_COPY);
    expect(patternScene.staticFallback?.text).toEqual(fixtureStaticFallbackText('pattern'));
  });

  it('renders all five source-art layers as independent GPU rotors', () => {
    const markup = renderToStaticMarkup(createElement(patternScene.Component, {
      scene: 'pattern',
      hidden: false
    }));

    expect(markup.match(/data-pattern-rotor=/g)).toHaveLength(5);
    for (const layer of ['02', '03', '04', '05', '06']) {
      expect(markup).toContain(`data-pattern-rotor="${layer}"`);
    }
  });
});
