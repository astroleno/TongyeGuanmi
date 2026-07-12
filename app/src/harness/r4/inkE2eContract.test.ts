import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function e2eSource(group: number): string {
  return readFileSync(new URL(`../../../e2e/r4-g${group}.spec.ts`, import.meta.url), 'utf8');
}

describe('R4 Ink browser regression source contract', () => {
  it('uses circle ownership for both G1 radial handoffs with no DOM rotors', () => {
    const source = e2eSource(1);

    expect(source).toContain("patternLayerClipPath).toContain('circle(')");
    expect(source).toContain("starMapLayerClipPath).toContain('circle(')");
    expect(source).not.toContain("ClipPath).toContain('polygon(')");
    expect(source).not.toContain('[data-pattern-rotor]');
    expect(source).not.toContain('patternRotorTransforms');
  });

  it.each([2, 4, 5, 6, 7])('uses the lightweight live erosion contour in G%s', (group) => {
    const source = e2eSource(group);

    expect(source).toContain("'ink-occluded-live-gate'");
    expect(source).toContain("startsWith('polygon(')");
    expect(source).not.toContain("'ink-body'");
    expect(source).not.toContain("revealClip === 'none'");
  });

  it('uses the effect-only depth field and one figure depth surface in G3', () => {
    const source = e2eSource(3);

    expect(source).toContain("r4InkRenderer === 'field'");
    expect(source).toContain("r4InkEffectOnly === 'true'");
    expect(source).toContain('data-figure2-figure-depth-surface');
    expect(source).toContain("brandLayerClip.startsWith('polygon(')");
    expect(source).toContain("retainedArchClip.startsWith('polygon(')");
    expect(source).not.toContain('r4InkSecondaryGateKind');
    expect(source).not.toContain('proofInkTarget');
    expect(source).not.toContain('proofInkTextureReady');
    expect(source).not.toContain('figure2-proof-overlay-scene-ink');
  });
});
