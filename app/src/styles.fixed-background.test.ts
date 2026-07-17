import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const stylesheet = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...stylesheet.matchAll(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`, 'g'))]
    .map((match) => match[1] ?? '')
    .join('\n');
}

describe('viewport background contract', () => {
  it('locks the hydrated StoryApp while leaving the no-JS document scrollable', () => {
    const viewportRule = rule('html,\nbody,\n#root');
    const hydratedRule = rule('html[data-story-hydrated="true"],\nhtml[data-story-hydrated="true"] body,\nhtml[data-story-hydrated="true"] #root');
    const noJsRule = rule('html:not([data-story-hydrated="true"]),\nhtml:not([data-story-hydrated="true"]) body');
    const shellRule = rule('.stage-harness-shell');

    expect(viewportRule).toContain('height: 100%');
    expect(viewportRule).toContain('background: #07110e');
    expect(hydratedRule).toContain('overflow: hidden');
    expect(hydratedRule).toContain('overscroll-behavior: none');
    expect(noJsRule).toContain('overflow: auto');
    expect(noJsRule).toContain('overscroll-behavior: auto');
    expect(shellRule).toContain('position: fixed');
    expect(shellRule).toContain('inset: 0');
  });

  it('keeps the canonical Star-map grade identical during transition and hold', () => {
    const canvasRule = rule('.r3-star-map__canvas');

    expect(canvasRule).toContain('filter: saturate(.98) contrast(1.04) brightness(.92)');
  });

  it('keeps the live Star-map raster layers mounted throughout handoff', () => {
    expect(stylesheet).not.toContain('data-star-map-transition-motion="paused"');
    expect(rule('.r3-star-map__canvas')).toContain('opacity: var(--r3-star-canvas-opacity)');
    expect(rule('.r3-star-map__wash')).toContain('z-index: 1');
  });

  it('leaves Pattern layer rotation to the single authored Canvas renderer', () => {
    expect(stylesheet).not.toContain('@keyframes r4-pattern-dom-spin');
    expect(stylesheet).not.toContain('.r4-pattern-scene__rotor');
    expect(stylesheet).not.toContain('@keyframes r4-pattern-canvas-spin');
    expect(rule('.r4-pattern-scene__canvas')).not.toContain('animation:');
    expect(rule('.r4-pattern-scene__canvas')).not.toContain('transform:');
  });

  it('lets every named Hero reveal item apply the rise-up transform', () => {
    expect(rule('[data-text-reveal-item]')).toContain('display: inline-block');
  });

  it('matches the Hero target canvas geometry and grade to the DOM handoff surface', () => {
    const back = rule('.r4-hero-scene__back');
    const introInk = rule('.r4-hero-scene__intro-ink');

    for (const token of ['left: 50%', 'top: 50%']) {
      expect(introInk).toContain(token);
    }
    for (const token of [
      'width: 112%',
      'height: 112%',
      'blur(calc(1.15px + 6.2px * (1 - var(--r4-hero-progress))))',
      'saturate(.99)',
      'contrast(.99)',
      'brightness(calc(.20 + .44 * var(--r4-hero-progress)))',
      'var(--r4-hero-back-parallax-x)',
      'var(--r4-hero-back-parallax-y)',
      'var(--r4-hero-scroll-back-y)',
      'scale(var(--r4-hero-scroll-back-scale))'
    ]) {
      expect(back).toContain(token);
      expect(introInk).toContain(token);
    }
  });

  it('keeps Method reading inside its scene-owned combined scrollport', () => {
    expect(stylesheet).toMatch(
      /\.r4-method,[\s\S]*?\.r4-education\s*\{[^}]*overflow-y:\s*auto[^}]*overscroll-behavior:\s*contain/s
    );
    expect(rule('.r4-method__vertical')).toContain('min-height: 100%');
  });

  it('uses padded, divider-free Method rows rather than a fixed-height rail', () => {
    expect(rule('.r4-method__list')).not.toContain('height: 100%');
    expect(stylesheet).toMatch(
      /\.r4-method__row,[\s\S]*?\.r4-education__row\s*\{[^}]*padding:\s*clamp\(22px, 2\.6vw, 34px\) 0/s
    );
    expect(rule('.r4-method__row')).not.toMatch(/min-height|border-(?:top|bottom)/);
    expect(stylesheet).toMatch(
      /\.r4-method,[\s\S]*?\.r4-education\s*\{[^}]*padding:\s*clamp\(52px, 7svh, 86px\) max\(24px, 5vw\)/s
    );
  });

  it('keeps Lab and Education continuous copy inside viewport-owned scrollports', () => {
    expect(stylesheet).toMatch(
      /\.r4-method,[\s\S]*?\.r4-education\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow-y:\s*auto/s
    );
  });
});
