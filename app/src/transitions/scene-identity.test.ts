import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const TRANSITIONS_ROOT = new URL('.', import.meta.url);
const FORBIDDEN_PRODUCTION_PATTERNS = [
  'cloneNode(',
  '.outerHTML',
  '<foreignObject',
  'createInkTargetTexture(',
  'targetSrc:',
  'nextSceneElement:',
  'targetElement:',
  'HERO_PATTERN_INK_TARGET_IMAGE',
  'PATTERN_STAR_MAP_INK_TARGET_IMAGE',
  "revealMode: 'ink-body'",
  'data-transition-ghost'
] as const;

const FORBIDDEN_PRESENTATION_BRIDGES = [
  "../../media/timeline-video-driver",
  '--r4-handoff-paper-alpha',
  '--r4-handoff-wash-alpha',
  'data-r4-handoff-receiver-progress'
] as const;

const FORBIDDEN_ADAPTER_ALLOCATIONS = [
  '.createElement(',
  '.createElementNS(',
  '.cloneNode(',
  '.appendChild(',
  '.insertAdjacentHTML('
] as const;

const DISAPPEAR_SCENE_HOOKS = [
  ['aod-method-top', 'renderAodExitProgress', 'renderMethodTopEntrance'],
  ['figure2-distance-expand', 'renderFigure2AnimationProgress', 'renderProofOpeningHold'],
  ['figure3-services', 'renderFigure3AnimationProgress', 'renderServicesEntrance'],
  ['ttg-lab', 'renderTtgAnimationProgress', 'renderLabHold'],
  ['ph-education', 'renderPhAnimationProgress', 'renderEducationHold'],
  ['crane-contact', 'renderCraneAnimationProgress', 'renderContactEntrance']
] as const;

function productionSources(directory: URL): URL[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '__fixtures__' || entry.name.includes('.test.')) {
      return [];
    }
    const child = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directory);
    if (entry.isDirectory()) {
      return productionSources(child);
    }
    return /\.(?:ts|tsx|js)$/.test(entry.name) ? [child] : [];
  });
}

describe('R4 transition Scene identity source contract', () => {
  it('forbids transition-owned endpoint renderers and target captures', () => {
    const productionFiles = [
      ...productionSources(TRANSITIONS_ROOT),
      new URL('../vendor/ink-scene-transition.js', import.meta.url)
    ];
    const violations = productionFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return FORBIDDEN_PRODUCTION_PATTERNS.flatMap((pattern) =>
        source.includes(pattern)
          ? [`${relative(join(TRANSITIONS_ROOT.pathname), file.pathname)}: ${pattern}`]
          : []
      );
    });

    expect(violations).toEqual([]);
  });

  it('keeps scene media and receiver presentation out of transition ownership', () => {
    const productionFiles = productionSources(TRANSITIONS_ROOT);
    const violations = productionFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return FORBIDDEN_PRESENTATION_BRIDGES.flatMap((pattern) =>
        source.includes(pattern)
          ? [`${relative(join(TRANSITIONS_ROOT.pathname), file.pathname)}: ${pattern}`]
          : []
      );
    });
    const stylesheet = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

    expect(violations).toEqual([]);
    expect(stylesheet).not.toMatch(/\[data-r4-handoff(?:-|\])/);
  });

  it('allows canvas or mask allocation only inside shared effect modules', () => {
    const adapterFiles = productionSources(TRANSITIONS_ROOT)
      .filter((file) => !file.pathname.includes('/shared/'));
    const violations = adapterFiles.flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return FORBIDDEN_ADAPTER_ALLOCATIONS.flatMap((pattern) =>
        source.includes(pattern)
          ? [`${relative(join(TRANSITIONS_ROOT.pathname), file.pathname)}: ${pattern}`]
          : []
      );
    });

    expect(violations).toEqual([]);
  });

  it('delegates every Disappear source exit and target entrance to its two scene owners', () => {
    for (const [directory, sourceHook, targetHook] of DISAPPEAR_SCENE_HOOKS) {
      const source = readFileSync(new URL(`./${directory}/index.ts`, import.meta.url), 'utf8');
      expect(source, `${directory} source lifecycle`).toContain(sourceHook);
      expect(source, `${directory} target lifecycle`).toContain(targetHook);
      for (const allocation of FORBIDDEN_ADAPTER_ALLOCATIONS) {
        expect(source, `${directory} transition-owned DOM: ${allocation}`).not.toContain(allocation);
      }
    }
  });
});
