import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scrubDriveDurationMs } from './Group1Harness';
import { createR4Group1Manifest } from './group1Manifest';

const group1E2eSource = readFileSync(new URL('../../../e2e/r4-g1.spec.ts', import.meta.url), 'utf8');

describe('R4 group1 harness manifest', () => {
  it('uses one Hero-to-Pattern reveal while keeping Star-map scrubbable', () => {
    const manifest = createR4Group1Manifest('group1');
    const segments = manifest.nodes.filter((node) => node.kind === 'segment');

    expect(segments[0]).toMatchObject({
      id: 'hero-pattern',
      policy: { kind: 'snap' },
      virtualDuration: 2200
    });
    expect(segments[1]).toMatchObject({
      id: 'pattern-star-map',
      policy: { kind: 'scrub' },
      virtualDuration: 1800
    });
  });

  it('drives the Pattern to Star scrub from its short manifest duration', () => {
    expect(scrubDriveDurationMs(1800, 1)).toBe(1800);
    expect(scrubDriveDurationMs(1800, 0.5)).toBe(900);
  });

  it('keeps the browser regression contract aligned with live canonical holds', () => {
    expect(group1E2eSource).not.toContain("toBe('staged-paused')");
    expect(group1E2eSource).not.toContain('patternProgress).toBe(1)');
    expect(group1E2eSource).not.toContain('toBeCloseTo(0.74');
    expect(group1E2eSource).not.toContain('starMapCanvasMotionActive).toBe(false)');
    expect(group1E2eSource).toContain('patternCopyOpacity).toBeCloseTo(0.96');
    expect(group1E2eSource).toContain("starMapCanvasFilter).toContain('brightness(0.92)')");
    expect(group1E2eSource).toContain('starMapCanvasMotionActive).toBe(true)');
    expect(group1E2eSource).toContain("transitions).toContain('pattern-star-map-live-circle')");
  });
});
