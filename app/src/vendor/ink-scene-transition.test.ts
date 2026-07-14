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

  it('uses one packed multiscale contour texture for the horizontal eroded edge', () => {
    expect(shaderSource).not.toContain('uBoundaryProfile');
    expect(shaderSource).not.toContain('sampledBoundary');
    expect(shaderSource).not.toContain('frame.profile');
    expect(shaderSource).toContain('uniform sampler2D uContourMap');
    expect(shaderSource).toContain('uniform float uContourSampleCount');
    expect(shaderSource).toContain('uniform float uOwnershipThreshold');
    expect(shaderSource).toContain('gl.RGBA');
    expect(shaderSource).toContain('frame.contour.samples.length');
    expect(shaderSource).toContain('frame.contour.texture');
    expect(shaderSource).toContain('vec4 horizontalContourSample');
    expect(shaderSource).toContain('float horizontalErosion');
    expect(shaderSource).toContain('float multiscaleErosion');
    expect(shaderSource).toContain('float boundaryProgress = mix(uOwnershipThreshold, p, nonHorizontalMode)');
    expect(shaderSource).toContain('float field =');
    expect(shaderSource).toContain('openingBreakup');
    expect(shaderSource).toContain('tendril');
    expect(shaderSource).toContain('float ownershipFieldScale = mix(0.58, 1.0, nonHorizontalMode)');
    expect(shaderSource).toMatch(/float edge = [^;]*field/);
  });

  it('covers the binary ownership clip with an opaque core and a wider soft edge', () => {
    expect(shaderSource).toContain('float horizontalSoftHalfWidth');
    expect(shaderSource).toContain('float horizontalSoftOcclusion');
    expect(shaderSource).toContain('horizontalCoreOcclusion = max(horizontalCoreOcclusion, horizontalSoftOcclusion)');
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
    expect(shaderSource).not.toContain('uSecondaryHorizontalGate');
    expect(shaderSource).not.toContain('secondaryOwnershipOcclusion');
    expect(shaderSource).toContain('float ownershipOcclusion(');
    expect(shaderSource).toContain('float ownershipWarp = clamp(');
    expect(shaderSource).toMatch(/ownershipOcclusion\([^)]*ownershipWarp/s);
    expect(shaderSource).toMatch(/float horizontalCoreOcclusion = ownershipOcclusion\(\s*horizontal,/s);
    expect(shaderSource).toContain('max(alpha, seamOcclusion)');
    expect(shaderSource).toMatch(/alpha\s*=\s*max\(alpha,\s*seamOcclusion\)/);
    expect(shaderSource).toMatch(/float seamOcclusion = mix\(\s*horizontalCoreOcclusion,/s);
    expect(shaderSource).not.toMatch(/horizontalCoreOcclusion[\s\S]*?\*\s*nonHorizontalMode/);
    expect(shaderSource).not.toContain('uSceneDim');
  });

  it('keeps the Main particle geometry and applies the configured gain in the shader', () => {
    expect(shaderSource).toContain('const particleGain = clamp(options.particleGain ?? 1, 0, 2);');
    expect(shaderSource).toContain('uniform float uParticleGain');
    expect(shaderSource).toContain("particleGain: gl.getUniformLocation(program, 'uParticleGain')");
    expect(shaderSource).toContain('gl.uniform1f(uniforms.particleGain, particleGain)');
    expect(shaderSource).not.toContain('particleGateLow');
    expect(shaderSource).not.toContain('particleGateHigh');
    expect(shaderSource).toMatch(/float particleRadius = mix\(0\.075, 0\.190,[^;]+\);/);
    expect(shaderSource).toContain('smoothstep(0.860, 0.975, particleSeed)');
    expect(shaderSource).toMatch(/float particles = [\s\S]*?\* uParticleGain;/);
  });

  it('allows edge-only grade to remove scene-wide body wash without changing the boundary', () => {
    expect(shaderSource).toMatch(/float coreWash = body \* uCoverAlpha/);
    expect(shaderSource).not.toContain('0.14 + uCoverAlpha');
    expect(shaderSource).toContain('alpha = max(alpha, seamOcclusion)');
  });
});
