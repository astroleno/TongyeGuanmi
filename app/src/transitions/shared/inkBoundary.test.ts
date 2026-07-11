import { describe, expect, it } from 'vitest';
import { createInkBoundaryFrame } from './inkBoundary';

const viewport = { width: 1440, height: 900, samples: 96 } as const;

describe('InkBoundaryFrame', () => {
  it('builds the radial G1 edge around the Pattern center', () => {
    const frame = createInkBoundaryFrame(
      { kind: 'radial', origin: { x: 0.24, y: 0.55 }, seed: 'hero-pattern' },
      0.5,
      viewport
    );

    expect(frame.origin).toEqual({ x: 0.24, y: 0.55 });
    expect(frame.revealClipPath).toMatch(/^polygon\(/);
    expect(frame.revealClipPath).not.toContain('circle(');
    expect(frame.revealClipPath).not.toContain('inset(');
  });

  it('uses one organic profile for horizontal reveal and conceal', () => {
    const frame = createInkBoundaryFrame(
      { kind: 'horizontal', direction: 'bottom-to-top', seed: 'services-ttg' },
      0.5,
      viewport
    );

    expect(new Set(frame.profile).size).toBeGreaterThan(8);
    expect(frame.revealClipPath).toMatch(/^polygon\(/);
    expect(frame.concealClipPath).toMatch(/^polygon\(/);
    expect(frame.revealClipPath).not.toContain('inset(');
  });

  it('recreates the same boundary for forward and reverse sampling', () => {
    const spec = { kind: 'horizontal', direction: 'top-to-bottom', seed: 'ttg-lab' } as const;

    expect(createInkBoundaryFrame(spec, 0.63, viewport)).toEqual(
      createInkBoundaryFrame(spec, 0.63, viewport)
    );
  });
});
