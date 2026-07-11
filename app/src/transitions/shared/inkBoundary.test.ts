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

  it('keeps radial geometry deterministic and exposes no independent conceal edge', () => {
    const spec = {
      kind: 'radial',
      origin: { x: 0.5, y: 0.58 },
      seed: 'pattern-star-map'
    } as const;
    const first = createInkBoundaryFrame(spec, 0.42, viewport);
    const second = createInkBoundaryFrame(spec, 0.42, viewport);

    expect(first.profile).toEqual(second.profile);
    expect(first.revision).toBe(second.revision);
    expect(first.concealClipPath).toBeNull();
  });

  it.each(['hero-pattern', 'pattern-star-map'])(
    'keeps the %s radial texture continuous across the wrapped angle seam',
    (seed) => {
      for (const progress of [0, 0.37, 0.5, 0.79, 1, 0.37]) {
        const frame = createInkBoundaryFrame(
          { kind: 'radial', origin: { x: 0.24, y: 0.55 }, seed },
          progress,
          viewport
        );

        expect(frame.profile[frame.profile.length - 1]).toBe(frame.profile[0]);
      }
    }
  );

  it('clamps endpoint profiles to exact fully hidden and fully revealed edges', () => {
    const spec = {
      kind: 'horizontal',
      direction: 'bottom-to-top',
      seed: 'education-crane'
    } as const;

    expect([...createInkBoundaryFrame(spec, -1, viewport).profile]).toEqual(
      Array(viewport.samples).fill(0)
    );
    expect([...createInkBoundaryFrame(spec, 2, viewport).profile]).toEqual(
      Array(viewport.samples).fill(255)
    );
  });
});
