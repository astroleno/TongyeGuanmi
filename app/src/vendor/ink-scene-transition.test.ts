import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createInkBoundaryFrame } from '../transitions/shared/inkBoundary';

const shaderSource = readFileSync(new URL('./ink-scene-transition.js', import.meta.url), 'utf8');

function polygonPoints(clipPath: string): Array<readonly [number, number]> {
  return [...clipPath.matchAll(/(-?\d+(?:\.\d+)?)% (-?\d+(?:\.\d+)?)%/g)].map((match) => [
    Number(match[1]) / 100,
    Number(match[2]) / 100
  ] as const);
}

function pointInPolygon(
  point: readonly [number, number],
  polygon: readonly (readonly [number, number])[]
): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) {
      continue;
    }
    const [currentX, currentY] = currentPoint;
    const [previousX, previousY] = previousPoint;
    const crosses = currentY > point[1] !== previousY > point[1]
      && point[0] < (previousX - currentX) * (point[1] - currentY) / (previousY - currentY) + currentX;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

describe('ink boundary shader contract', () => {
  it('does not retain the retired Scene-texture depth compositor', () => {
    expect(shaderSource).not.toContain('createInkSceneTransition');
    expect(shaderSource).not.toContain('uDepthThresholdMode');
  });

  it('keeps boundary output effect-only and never samples a target Scene', () => {
    expect(shaderSource).not.toContain('uTargetScene');
    expect(shaderSource).not.toContain('uTargetReady');
    expect(shaderSource).not.toContain('targetComposite');
    expect(shaderSource).not.toContain('targetElement');
  });

  it('renders the shared horizontal or radial boundary profile', () => {
    expect(shaderSource).toContain('createInkBoundaryTransition');
    expect(shaderSource).not.toContain('createInkCurtainTransition');
    expect(shaderSource).toContain('uniform sampler2D uBoundaryProfile');
    expect(shaderSource).toContain('uniform float uBoundaryKind');
    expect(shaderSource).toContain('uniform float uBoundaryDirection');
    expect(shaderSource).toContain('uniform vec2 uBoundaryOrigin');
    expect(shaderSource).toContain('float horizontalEdge(');
    expect(shaderSource).toContain('float radialEdge(');
  });

  it.each(['bottom-to-top', 'top-to-bottom'] as const)(
    'keeps the %s body-positive side inside the receiver reveal polygon',
    (direction) => {
      const frame = createInkBoundaryFrame(
        { kind: 'horizontal', direction, seed: `polarity-${direction}` },
        0.5,
        { width: 1440, height: 900, samples: 96 }
      );
      const sampleIndex = Math.floor(frame.profile.length / 2);
      const edgeY = (frame.profile[sampleIndex] ?? 0) / 255;
      const x = sampleIndex / (frame.profile.length - 1);
      const cssBoundaryY = 1 - edgeY;
      const revealCssY = direction === 'bottom-to-top'
        ? cssBoundaryY + 0.08
        : cssBoundaryY - 0.08;
      const concealCssY = direction === 'bottom-to-top'
        ? cssBoundaryY - 0.08
        : cssBoundaryY + 0.08;
      const bodyDistance = (cssY: number) => direction === 'bottom-to-top'
        ? edgeY - (1 - cssY)
        : (1 - cssY) - edgeY;

      expect(pointInPolygon([x, revealCssY], polygonPoints(frame.revealClipPath))).toBe(true);
      expect(pointInPolygon([x, concealCssY], polygonPoints(frame.revealClipPath))).toBe(false);
      expect(bodyDistance(revealCssY)).toBeGreaterThan(0);
      expect(bodyDistance(concealCssY)).toBeLessThan(0);
      expect(shaderSource).toContain(
        'return uBoundaryDirection < 0.5 ? edgeY - uv.y : uv.y - edgeY;'
      );
    }
  );
});
