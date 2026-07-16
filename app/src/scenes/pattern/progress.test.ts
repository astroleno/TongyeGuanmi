import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PATTERN_COPY,
  type PatternRenderState,
  patternCenterForViewport,
  patternMotionEnabled,
  patternScene,
  readPatternCenter,
  renderPatternHold,
  renderPatternProgress
} from './index';
import { fixtureStaticFallbackText } from '../../story/copy-baseline';

const stylesheet = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');

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
    expect(PATTERN_COPY).toEqual([
      '一句话讲清我们干什么',
      '让 AI 从一场培训，变成账上的数字。',
      '我们不卖课、不卖软件，而是进到你的业务现场，把 AI 做成团队天天在用、月底对得上账的东西。'
    ]);
    expect(patternScene.staticFallback?.text).toEqual(PATTERN_COPY);
    expect(fixtureStaticFallbackText('pattern')).toEqual(expect.arrayContaining([...PATTERN_COPY]));
  });

  it('defines the canonical hold as the fully expanded left-side Pattern', () => {
    const root = new FakeElement();

    renderPatternHold(root as unknown as HTMLElement);

    expect(root.attributes.get('data-pattern-progress')).toBe('0.0000');
    expect(root.style.values.get('--r4-pattern-opacity')).toBe('1.0000');
    expect(root.style.values.get('--r4-pattern-copy-opacity')).toBe('0.0000');
    expect(root.style.values.get('--r4-pattern-field-rotation')).toBe('120.00deg');
    expect(patternScene.renderHold).toBe(renderPatternHold);
  });

  it('keeps its renderer active for every visible Stage layer until Pattern is hidden', () => {
    expect(patternMotionEnabled(false, false)).toBe(true);
    expect(patternMotionEnabled(true, false)).toBe(false);
    expect(patternMotionEnabled(false, true)).toBe(false);
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

  it('moves the contracted desktop statement five viewport-width units to the right', () => {
    expect(stylesheet).toMatch(
      /\.r4-pattern-scene__statement\s*\{[^}]*transform:\s*translate3d\(5vw,\s*0,\s*0\)/s
    );
  });
});
