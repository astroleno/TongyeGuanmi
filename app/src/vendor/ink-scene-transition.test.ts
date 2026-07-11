import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const shaderSource = readFileSync(new URL('./ink-scene-transition.js', import.meta.url), 'utf8');

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
});
