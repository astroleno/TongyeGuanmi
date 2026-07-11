import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dynamicTextureUploadDue } from './ink-scene-transition.js';

const shaderSource = readFileSync(new URL('./ink-scene-transition.js', import.meta.url), 'utf8');

describe('ink scene dynamic texture upload budget', () => {
  it('skips unchanged canvas revisions and caps changing canvases at 24fps', () => {
    expect(dynamicTextureUploadDue({
      fps: 24,
      lastRevision: '10',
      nextRevision: '10',
      lastUploadAt: 0,
      now: 100
    })).toBe(false);
    expect(dynamicTextureUploadDue({
      fps: 24,
      lastRevision: '10',
      nextRevision: '11',
      lastUploadAt: 100,
      now: 120
    })).toBe(false);
    expect(dynamicTextureUploadDue({
      fps: 24,
      lastRevision: '10',
      nextRevision: '11',
      lastUploadAt: 100,
      now: 142
    })).toBe(true);
  });

  it('uses z-depth only to order a binary target reveal', () => {
    expect(shaderSource).toContain('float depthThresholdMask = step(0.0, thresholdEdge);');
    expect(shaderSource).toContain('insideMask = mix(insideMask, depthThresholdMask, uDepthThresholdMode);');
  });

  it('composites curtain targets through the curtain shader body itself', () => {
    expect(shaderSource).toContain('uniform sampler2D uTargetScene;');
    expect(shaderSource).toContain('float targetMask = body * uTargetReady;');
    expect(shaderSource).toContain('color = mix(color, targetComposite, targetMask);');
    expect(shaderSource).toContain('alpha = max(alpha, targetMask);');
  });
});
