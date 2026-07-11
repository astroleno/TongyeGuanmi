import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createR4Group1Manifest } from './group1Manifest';

const group1E2eSource = readFileSync(new URL('../../../e2e/r4-g1.spec.ts', import.meta.url), 'utf8');
const group1HarnessSource = readFileSync(new URL('./Group1Harness.tsx', import.meta.url), 'utf8');
const group1ManifestSource = readFileSync(new URL('./group1Manifest.ts', import.meta.url), 'utf8');

describe('R4 group1 harness manifest', () => {
  it('keeps Hero-to-Pattern as one reveal and Pattern-to-Star Map as two staged inputs', () => {
    const manifest = createR4Group1Manifest('group1');
    const segments = manifest.nodes.filter((node) => node.kind === 'segment');

    expect(segments[0]).toMatchObject({
      id: 'hero-pattern',
      policy: { kind: 'snap' },
      virtualDuration: 2200
    });
    expect(segments[1]).toMatchObject({
      id: 'pattern-star-map',
      policy: { kind: 'stagedSnap', stops: [0.5], playMs: [1800, 1800] },
      virtualDuration: 3600
    });
  });

  it('does not override Pattern-to-Star Map back to scrub mode in the harness', () => {
    expect(group1ManifestSource).not.toContain("policy: { kind: 'scrub'");
    expect(group1HarnessSource).toContain("before.state === 'staged-paused'");
    expect(group1HarnessSource).toContain("runtime.send({ type: 'CHARGE_FIRED', direction })");
  });

  it('keeps the browser regression contract aligned with live canonical holds', () => {
    expect(group1E2eSource).toContain("toBe('staged-paused')");
    expect(group1E2eSource).toContain('patternProgress).toBe(1)');
    expect(group1E2eSource).not.toContain('toBeCloseTo(0.74');
    expect(group1E2eSource).not.toContain('starMapCanvasMotionActive).toBe(false)');
    expect(group1E2eSource).not.toContain("ClipPath).toContain('circle(')");
    expect(group1E2eSource).toContain("ClipPath).toContain('polygon(')");
    expect(group1E2eSource).toContain('patternCopyOpacity).toBeCloseTo(0.96');
    expect(group1E2eSource).toContain("starMapCanvasFilter).toContain('brightness(0.92)')");
    expect(group1E2eSource).toContain('starMapCanvasMotionActive).toBe(true)');
    expect(group1E2eSource).toContain("transitions).toContain('pattern-star-map-live-circle')");
  });
});
