// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { renderHeroScrollEntryText } from './motion';

describe('Hero absolute entry sampling', () => {
  it('restores the same authored text pose after completion and reverse without animation clocks', () => {
    const root = document.createElement('section');
    root.innerHTML = '<h1 data-text-reveal style="--text-reveal-duration:1200;--text-reveal-stagger:100;--text-reveal-blur:8;--text-reveal-y:20"><span data-text-reveal-item="0">同</span><span data-text-reveal-item="1">野</span></h1>';
    const items = [...root.querySelectorAll<HTMLElement>('span')];
    renderHeroScrollEntryText(root, .6);
    const middle = items.map((item) => item.style.cssText);
    renderHeroScrollEntryText(root, 1);
    expect(items.map((item) => item.style.opacity)).toEqual(['1', '1']);
    renderHeroScrollEntryText(root, .6);
    expect(items.map((item) => item.style.cssText)).toEqual(middle);
    expect(items.every((item) => item.style.animation === 'none')).toBe(true);
    renderHeroScrollEntryText(root, 0);
    expect(items.map((item) => item.style.opacity)).toEqual(['0', '0']);
  });
});
