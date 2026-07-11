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
  it('locks the document and stage shell to the viewport so overscroll cannot expose the base color', () => {
    const viewportRule = rule('html,\nbody,\n#root');
    const shellRule = rule('.stage-harness-shell');

    expect(viewportRule).toContain('height: 100%');
    expect(viewportRule).toContain('overflow: hidden');
    expect(viewportRule).toContain('overscroll-behavior: none');
    expect(viewportRule).toContain('background: #07110e');
    expect(shellRule).toContain('position: fixed');
    expect(shellRule).toContain('inset: 0');
  });

  it('matches main branch Star-map base exposure so Perlin highlights retain contrast', () => {
    const canvasRule = rule('.r3-star-map__canvas');

    expect(canvasRule).toContain('filter: saturate(.98) contrast(1.04) brightness(.74)');
  });

  it('lets scene Ink exclusively composite Star-map raster layers during the handoff', () => {
    const transitionRootRule = rule('.r3-star-map[data-star-map-transition-motion="paused"]');
    const transitionRasterRule = rule('.r3-star-map[data-star-map-transition-motion="paused"] .r3-star-map__canvas,\n.r3-star-map[data-star-map-transition-motion="paused"] .r3-star-map__wash');

    expect(transitionRootRule).toContain('background: transparent');
    expect(transitionRasterRule).toContain('opacity: 0');
  });

  it('rotates Pattern source layers and petal rings independently without rotating the viewport canvas', () => {
    expect(stylesheet).toContain('@keyframes r4-pattern-dom-spin');
    expect(rule('.r4-pattern-scene__rotor--02')).toContain('animation: r4-pattern-dom-spin 76s linear infinite reverse');
    expect(rule('.r4-pattern-scene__rotor--03')).toContain('animation: r4-pattern-dom-spin 42s linear infinite');
    expect(rule('.r4-pattern-scene__rotor--04')).toContain('animation: r4-pattern-dom-spin 42s linear infinite');
    expect(rule('.r4-pattern-scene__rotor--05')).toContain('animation: r4-pattern-dom-spin 96s linear infinite');
    expect(rule('.r4-pattern-scene__rotor--06')).toContain('animation: r4-pattern-dom-spin 110s linear infinite');
    expect(stylesheet).not.toContain('@keyframes r4-pattern-canvas-spin');
    expect(rule('.r4-pattern-scene__canvas')).not.toContain('animation:');
    expect(rule('.r4-pattern-scene__rotor-frame')).not.toContain('--r4-pattern-field-rotation');
  });

  it('lets every named Hero reveal item apply the rise-up transform', () => {
    expect(rule('[data-text-reveal-item]')).toContain('display: inline-block');
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
