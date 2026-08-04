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

  it('specializes the shared field shader by rank kind before compilation', () => {
    expect(shaderSource).toContain('createInkBoundaryTransition');
    expect(shaderSource).not.toContain('createInkCurtainTransition');
    expect(shaderSource).toContain('fieldKind');
    expect(shaderSource).toContain('#define F${fieldKind[0].toUpperCase()}');
    expect(shaderSource).not.toContain('uniform float uFieldMode');
    expect(shaderSource).toContain('fieldDirection: gl.getUniformLocation(program, \'D\')');
    expect(shaderSource).toContain('fieldOrigin: gl.getUniformLocation(program, \'O\')');
    expect(shaderSource).toContain('depthMap: gl.getUniformLocation(program, \'X\')');
    expect(shaderSource).toContain('vec4 hq=hc(u)');
    expect(shaderSource).toContain('float rr(');
    expect(shaderSource).toContain('float dr(');
  });

  it('adds the Hero target sampler only to the target-bearing radial program', () => {
    expect(shaderSource).toContain('#define FT ${targetImage ? 1 : 0}');
    expect(shaderSource).toContain('#if defined(FR) && FT');
    expect(shaderSource).toContain("const targetUniforms = targetImage ? {");
    expect(shaderSource).toContain("if (targetTexture && targetImage) {");
  });

  it('uses one packed multiscale contour texture for the horizontal eroded edge', () => {
    expect(shaderSource).not.toContain('uBoundaryProfile');
    expect(shaderSource).not.toContain('sampledBoundary');
    expect(shaderSource).not.toContain('frame.profile');
    expect(shaderSource).toContain('contourMap: gl.getUniformLocation(program, \'M\')');
    expect(shaderSource).toContain('contourSampleCount: gl.getUniformLocation(program, \'K\')');
    expect(shaderSource).toContain('ownershipThreshold: gl.getUniformLocation(program, \'H\')');
    expect(shaderSource).toContain('gl.RGBA');
    expect(shaderSource).toContain('frame.contour.samples.length');
    expect(shaderSource).toContain('frame.contour.texture');
    expect(shaderSource).toContain('vec4 hc(');
    expect(shaderSource).toContain('float br2=br+');
    expect(shaderSource).toContain('float me=dot(hs');
    expect(shaderSource).toContain('float br=hd(u,D)+hmain');
    expect(shaderSource).toContain('float fi=');
    expect(shaderSource).toContain('float ob=');
    expect(shaderSource).toContain('float tn=');
    expect(shaderSource).toContain('float fs=0.58');
    expect(shaderSource).toMatch(/float e=[^;]*fi/);
  });

  it('uses the same radial boundary rank and contour as DOM ownership', () => {
    expect(shaderSource).toContain('float bp=H;');
    expect(shaderSource).toContain('float rc(');
    expect(shaderSource).toContain('float br=rr(u,as);float bp=H;');
    expect(shaderSource).not.toContain('float br=rr(u,as);float bp=p;');
  });

  it('covers the binary ownership clip with an opaque core and a wider soft edge', () => {
    expect(shaderSource).toContain('float sh=max(hh,');
    expect(shaderSource).toContain('float so=(1.0-smoothstep(hh,sh,abs(br-B)))*0.46');
    expect(shaderSource).toContain('float s2=');
    expect(shaderSource).toContain('ho=max(ho,max(so,s2))');
  });

  it('keeps body erosion deterministic while allowing time only in effect particles', () => {
    expect(shaderSource).toContain('seed: gl.getUniformLocation(program, \'S\')');
    expect(shaderSource).toContain('vec2 ph=');
    expect(shaderSource).not.toMatch(/vec2 ph=[^;]*T/);
    expect(shaderSource).toMatch(/vec2 pu=[^;]*T/);
  });

  it('moves procedural FBM and hash work into one deterministic prewarmed noise atlas', () => {
    expect(shaderSource).toContain('NOISE_ATLAS_SIZE = 256');
    expect(shaderSource).toContain('noiseAtlas: gl.getUniformLocation(program, \'N\')');
    expect(shaderSource).toContain('texture2D(N,');
    expect(shaderSource).not.toContain('for (int i = 0; i < 4; i++)');
    expect(shaderSource).not.toContain('p += dot(p, p + 34.37)');
  });

  it('consumes the live ownership gate and guarantees its minimum alpha', () => {
    expect(shaderSource).toContain('ownershipGateRank: gl.getUniformLocation(program, \'B\')');
    expect(shaderSource).toContain('ownershipCore: gl.getUniformLocation(program, \'E\')');
    expect(shaderSource).toContain('occlusionAlphaMin: gl.getUniformLocation(program, \'I\')');
    expect(shaderSource).not.toContain('uSecondaryHorizontalGate');
    expect(shaderSource).not.toContain('secondaryOwnershipOcclusion');
    expect(shaderSource).toContain('float oo(');
    expect(shaderSource).toContain('float ow=clamp(');
    expect(shaderSource).toContain('float py=oo(br,B,E,I,ow)');
    expect(shaderSource).toContain('float ho=oo(br,B,E,I,1.0)');
    expect(shaderSource).toContain('a=max(a,se)');
    expect(shaderSource).toContain('float se=max(ho,hb)');
    expect(shaderSource).not.toMatch(/ho[\s\S]*?\*\s*nonHorizontalMode/);
    expect(shaderSource).not.toContain('uSceneDim');
  });

  it('keeps the Main particle geometry and applies the configured gain in the shader', () => {
    expect(shaderSource).toContain('const particleGain = clamp(options.particleGain ?? 1, 0, 2);');
    expect(shaderSource).toContain("particleGain: gl.getUniformLocation(program, 'G')");
    expect(shaderSource).toContain('gl.uniform1f(uniforms.particleGain, particleGain)');
    expect(shaderSource).not.toContain('particleGateLow');
    expect(shaderSource).not.toContain('particleGateHigh');
    expect(shaderSource).toContain('float pr=mix(.075,.19,pv.a)');
    expect(shaderSource).toContain('vec4 ad(vec2 p)');
    expect(shaderSource).toContain('vec4 pv=pw>.0?ad(pi+ph):vec4(0.)');
    expect(shaderSource.indexOf('float pw=')).toBeLessThan(shaderSource.indexOf('vec4 pv=pw>.0?ad(pi+ph):vec4(0.)'));
    expect(shaderSource).toContain('smoothstep(.79,.93,ps)');
    expect(shaderSource).toMatch(/float pa=[^;]+\*G;/);
  });

  it('allows edge-only grade to remove scene-wide body wash without changing the boundary', () => {
    expect(shaderSource).toMatch(/float cw=b\*A/);
    expect(shaderSource).not.toContain('0.14 + uCoverAlpha');
    expect(shaderSource).toContain('a=max(a,se)');
  });
});
