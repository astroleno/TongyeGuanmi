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

  it('consumes the live ownership gate and guarantees its minimum alpha', () => {
    expect(shaderSource).toContain('uniform float uOwnershipGateRank');
    expect(shaderSource).toContain('uniform vec2 uOwnershipCore');
    expect(shaderSource).toContain('uniform float uOcclusionAlphaMin');
    expect(shaderSource).toContain('uniform vec4 uSecondaryHorizontalGate');
    expect(shaderSource).toContain('float ownershipOcclusion(');
    expect(shaderSource).toContain('float ownershipWarp = clamp(');
    expect(shaderSource).toMatch(/ownershipOcclusion\([^)]*ownershipWarp/s);
    expect(shaderSource).toMatch(/alpha\s*=\s*max\(alpha,\s*seamOcclusion\)/);
    expect(shaderSource).not.toContain('uSceneDim');
  });

  it('uses the Main particle radius, gate, and intensity without an enhancement control', () => {
    expect(shaderSource).not.toContain('uParticleStrength');
    expect(shaderSource).not.toContain('particleGateLow');
    expect(shaderSource).not.toContain('particleGateHigh');
    expect(shaderSource).toMatch(/float particleRadius = mix\(0\.075, 0\.190,[^;]+\);/);
    expect(shaderSource).toContain('smoothstep(0.860, 0.975, particleSeed)');
    expect(shaderSource).not.toMatch(/particles[^;]*mix\(0\.78, 1\.25/);
  });
});
