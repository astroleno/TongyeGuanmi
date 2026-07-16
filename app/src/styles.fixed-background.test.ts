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

  it('keeps the mobile Method list inside the fixed viewport as its own scrollport', () => {
    expect(stylesheet).toContain('grid-template-rows: auto minmax(0, 1fr)');
    expect(stylesheet).toContain('height: 100%');
    expect(stylesheet).toContain('min-height: 0');
  });

  it('gives the Method reading rail exactly two viewportfuls while its field stays fixed', () => {
    expect(rule('.r4-method__list')).toContain('height: 100%');
    expect(rule('.r4-method__row')).toContain('min-height: 40%');
    expect(rule('.r4-method')).toContain('overflow: hidden');
  });

  it('keeps Lab and Education continuous copy inside viewport-owned scrollports', () => {
    for (const selector of ['.r4-lab', '.r4-education']) {
      const sceneRule = rule(selector);
      expect(sceneRule).toContain('height: 100%');
      expect(sceneRule).toContain('min-height: 0');
      expect(sceneRule).toContain('overflow-y: auto');
      expect(sceneRule).toContain('overscroll-behavior: contain');
    }
  });
});
