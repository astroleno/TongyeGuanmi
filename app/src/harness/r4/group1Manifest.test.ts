import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createR4Group1Manifest } from './group1Manifest';
import {
  HERO_PATTERN_TOTAL_MS,
  PATTERN_COLLAPSE_MS,
  PATTERN_COLLAPSE_STOP,
  PATTERN_COPY_REVEAL_MS,
  PATTERN_COPY_STOP,
  PATTERN_STAR_MAP_INK_MS,
  PATTERN_TOTAL_MS
} from '../../story/timings';

const group1E2eSource = readFileSync(new URL('../../../e2e/r4-g1.spec.ts', import.meta.url), 'utf8');
const group1HarnessSource = readFileSync(new URL('./Group1Harness.tsx', import.meta.url), 'utf8');
const group1ManifestSource = readFileSync(new URL('./group1Manifest.ts', import.meta.url), 'utf8');

describe('R4 group1 harness manifest', () => {
  it('keeps Hero motion before Ink and exposes both Pattern gesture checkpoints', () => {
    const manifest = createR4Group1Manifest('group1');
    const segments = manifest.nodes.filter((node) => node.kind === 'segment');

    expect(segments[0]).toMatchObject({
      id: 'hero-pattern',
      policy: { kind: 'snap' },
      virtualDuration: HERO_PATTERN_TOTAL_MS
    });
    expect(segments[1]).toMatchObject({
      id: 'pattern-star-map',
      policy: {
        kind: 'stagedSnap',
        stops: [PATTERN_COLLAPSE_STOP, PATTERN_COPY_STOP],
        playMs: [PATTERN_COLLAPSE_MS, PATTERN_COPY_REVEAL_MS, PATTERN_STAR_MAP_INK_MS],
        advance: [{ kind: 'gesture' }, { kind: 'gesture' }]
      },
      virtualDuration: PATTERN_TOTAL_MS
    });
  });

  it('keeps production checkpoints and only auto-advances them inside the whole-segment harness API', () => {
    expect(group1ManifestSource).not.toContain("policy: { kind: 'scrub'");
    expect(group1HarnessSource).toContain("state === 'staged-paused'");
    expect(group1HarnessSource).toContain("runtime.send({ type: 'CHARGE_FIRED', direction })");
  });

  it('keeps Pattern and Star Map live whenever they are visible during transition', () => {
    expect(group1E2eSource).toContain("toBe('staged-paused')");
    expect(group1E2eSource).toContain('patternProgress).toBe(1)');
    expect(group1E2eSource).not.toContain('toBeCloseTo(0.74');
    expect(group1E2eSource).toContain(
      'canonicalStarHandoff.starMapCanvasMotionActive).toBe(true)'
    );
    expect(group1E2eSource).toContain(
      'patternStarMapInk?.starMapCanvasMotionActive).toBe(true)'
    );
    expect(group1E2eSource).toContain(
      'starHandoffLater.starMapCanvasRevision).toBeGreaterThan(canonicalStarHandoff.starMapCanvasRevision)'
    );
    expect(group1E2eSource).toContain(
      'starHoldLater.starMapCanvasMotionActive).toBe(true)'
    );
    expect(group1E2eSource).not.toContain("ClipPath).toContain('polygon(')");
    expect(group1E2eSource).toContain("ClipPath).toContain('circle(')");
    expect(group1E2eSource).not.toContain('[data-pattern-rotor]');
    expect(group1E2eSource).not.toContain('patternRotorTransforms');
    expect(group1E2eSource).toContain('patternFieldRotationDegrees).toBeCloseTo(120');
    expect(group1E2eSource).toContain('patternCopyOpacity).toBe(0)');
    expect(group1E2eSource).toContain("starMapCanvasFilter).toContain('brightness(0.92)')");
    expect(group1E2eSource).toContain("transitions).toContain('pattern-star-map-live-circle')");
  });
});
