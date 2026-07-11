import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PATTERN_COPY,
  type PatternRenderState,
  patternCenterForViewport,
  patternScene,
  readPatternCenter,
  renderPatternHold,
  renderPatternProgress
} from './index';
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
  clientWidth = 1440;

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
}

describe('pattern scene renderer', () => {
  it('resolves one authored center with 760px included in the mobile range', () => {
    expect(patternCenterForViewport(1440)).toEqual({ x: 0.24, y: 0.55 });
    expect(patternCenterForViewport(761)).toEqual({ x: 0.24, y: 0.55 });
    expect(patternCenterForViewport(760)).toEqual({ x: 0.50, y: 0.58 });
    expect(patternCenterForViewport(390)).toEqual({ x: 0.50, y: 0.58 });

    const mobileRoot = new FakeElement();
    mobileRoot.clientWidth = 760;
    renderPatternHold(mobileRoot as unknown as HTMLElement);

    expect(mobileRoot.style.values.get('--r4-pattern-center-x')).toBe('50.000%');
    expect(mobileRoot.style.values.get('--r4-pattern-center-y')).toBe('58.000%');
    expect(readPatternCenter(mobileRoot as unknown as HTMLElement)).toEqual({ x: 0.5, y: 0.58 });
  });

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
    expect(end.centerYRatio).toBe(0.55);
    expect(end.mobileCenterXRatio).toBe(0.50);
    expect(end.mobileCenterYRatio).toBe(0.58);
    expect(end.largestRingScale).toBe(0.08);
    expect(end.compactRingScale).toBe(0.28);
    expect(root.style.values.get('--r4-pattern-progress')).toBe('1.0000');
    expect(root.attributes.get('data-pattern-progress')).toBe('1.0000');
  });

  it('keeps static fallback copy aligned with the belief baseline', () => {
    expect(PATTERN_COPY).toEqual([STAR_MAP_COPY]);
    expect(patternScene.staticFallback?.text).toEqual(PATTERN_COPY);
    expect(patternScene.staticFallback?.text).toEqual(fixtureStaticFallbackText('pattern'));
  });

  it('defines the canonical hold as the fully expanded left-side Pattern', () => {
    const root = new FakeElement();

    renderPatternHold(root as unknown as HTMLElement);

    expect(root.attributes.get('data-pattern-progress')).toBe('0.0000');
    expect(root.style.values.get('--r4-pattern-opacity')).toBe('1.0000');
    expect(root.style.values.get('--r4-pattern-copy-opacity')).toBe('0.9600');
    expect(root.style.values.get('--r4-pattern-field-rotation')).toBe('120.00deg');
    expect(patternScene.renderHold).toBe(renderPatternHold);
  });

  it('couples collapse and rotation progress in the authored Pattern frame', () => {
    const root = new FakeElement();
    const collapseFrame = renderPatternProgress(root as unknown as HTMLElement, 0.42, {
      rotationProgress: 0.42
    });
    const holdFrame = renderPatternHold(root as unknown as HTMLElement) as unknown as PatternRenderState;

    expect(collapseFrame.rotationProgress).toBe(collapseFrame.progress);
    expect(holdFrame.fieldRotationDegrees).toBeCloseTo(120, 3);
  });

  it('renders Pattern art through one Canvas instead of five independent DOM rotors', () => {
    const markup = renderToStaticMarkup(createElement(patternScene.Component, {
      scene: 'pattern',
      hidden: false
    }));

    expect(markup.match(/data-pattern-rotor=/g)).toBeNull();
    expect(markup.match(/data-pattern-canvas/g)).toHaveLength(1);
  });
});
