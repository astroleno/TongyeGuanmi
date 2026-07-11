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

  it('renders horizontal, radial, and depth rank modes through one procedural field', () => {
    expect(shaderSource).toContain('createInkBoundaryTransition');
    expect(shaderSource).not.toContain('createInkCurtainTransition');
    expect(shaderSource).toContain('uniform float uFieldMode');
    expect(shaderSource).toContain('uniform float uFieldDirection');
    expect(shaderSource).toContain('uniform vec2 uFieldOrigin');
    expect(shaderSource).toContain('uniform sampler2D uDepthMap');
    expect(shaderSource).toContain('float horizontalRank(');
    expect(shaderSource).toContain('float radialRank(');
    expect(shaderSource).toContain('float depthRank(');
  });

  it('uses Main erosion terms to move the final edge', () => {
    expect(shaderSource).not.toContain('uBoundaryProfile');
    expect(shaderSource).not.toContain('sampledBoundary');
    expect(shaderSource).not.toContain('gl.LUMINANCE');
    expect(shaderSource).not.toContain('frame.profile');
    expect(shaderSource).toContain('float field =');
    expect(shaderSource).toContain('openingBreakup');
    expect(shaderSource).toContain('tendril');
    expect(shaderSource).toMatch(/float edge = [^;]*field/);
  });

  it('keeps body erosion deterministic while allowing time only in effect particles', () => {
    expect(shaderSource).toContain('uniform float uSeed');
    expect(shaderSource).toContain('vec2 bodyPhase');
    expect(shaderSource).not.toMatch(/bodyPhase[^;]*uTime/);
    expect(shaderSource).toMatch(/particleUv[^;]*uTime/);
  });

  it('contains a localized near-opaque seam occlusion belt without a global dim', () => {
    expect(shaderSource).toContain('float seamOcclusion');
    expect(shaderSource).toMatch(/seamOcclusion[^;]*0\.92/);
    expect(shaderSource).not.toContain('uSceneDim');
  });
});
