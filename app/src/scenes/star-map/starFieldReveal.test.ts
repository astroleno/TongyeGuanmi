import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { initStarFieldReveal, starFieldCoverTransform } from './starFieldReveal';

const source = readFileSync(new URL('./starFieldReveal.ts', import.meta.url), 'utf8');

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('StarFieldReveal', () => {
  it('uses a single 90-degree cover transform for a horizontal map on portrait', () => {
    const transform = starFieldCoverTransform(1672, 941, 390, 844, {
      rotationDegrees: -90,
      zoom: 1
    });

    expect(transform.rotationRadians).toBeCloseTo(-Math.PI / 2);
    expect(transform.rotatedWidth).toBeCloseTo(941);
    expect(transform.rotatedHeight).toBeCloseTo(1672);
    expect(transform.scale).toBeCloseTo(844 / 1672);
  });

  it('enables anonymous CORS before requesting a canvas-readable CDN image', () => {
    const assignments: string[] = [];
    class FakeImage {
      decoding: 'async' | 'auto' | 'sync' = 'auto';

      addEventListener(): void {}

      set crossOrigin(value: string) {
        assignments.push(`crossOrigin:${value}`);
      }

      set src(value: string) {
        assignments.push(`src:${value}`);
      }
    }
    vi.stubGlobal('Image', FakeImage);
    const canvas = {
      getContext: () => ({})
    } as unknown as HTMLCanvasElement;

    initStarFieldReveal({
      canvas,
      sourceUrl: 'https://assets.tongye.me/releases/test/assets/back2.webp',
      autoplay: false
    });

    expect(assignments).toEqual([
      'crossOrigin:anonymous',
      'src:https://assets.tongye.me/releases/test/assets/back2.webp'
    ]);
  });

  it('keeps every Perlin pass on the exact same camera scale as the Star map', () => {
    expect(source).not.toContain('scale: 1.012');
    expect(source).not.toContain('scale: 1.004');
    expect(source).toContain('target.scale(transform.scale, transform.scale)');
  });

  it('keeps domain-warped multi-octave gradient Perlin as the generic profile', () => {
    expect(source).toContain('fractalPerlin2D');
    expect(source).toContain('gradientDot');
    expect(source).toContain('octaves: 4');
    expect(source).toContain('width / height');
    expect(source).toContain("profile: 'gradient-fbm'");
  });

  it('also preserves the exact desktop R5 mask profile for portrait parity', () => {
    expect(source).toContain("noise.profile === 'desktop-r5'");
    expect(source).toContain('desktopNoise2D');
    expect(source).toContain('const seedIndex = Math.floor(phase)');
    expect(source).toContain('seedIndex * 19.31');
    expect(source).toContain('HIGHLIGHT_OUTPUT_SCALE = 1');
  });

  it('applies Perlin only to the extracted highlight layer before Gaussian glow', () => {
    expect(source).toContain('cameraHighlightCanvas');
    expect(source).not.toContain('cameraLightCanvas');
    expect(source).not.toContain('fieldBlur');
    expect(source).not.toContain('fieldAlpha');
    expect(source).toContain('dynamicCtx.drawImage(this.highlightCanvas');
    expect(source).toContain("dynamicCtx.globalCompositeOperation = 'destination-in'");
    expect(source).toContain('wideBlur: 72');
    expect(source).toContain('mediumBlur: 26');
    expect(source).toContain('coreBlur: 4');
    expect(source).toContain('screenBlur: 0');
    expect(source).toContain('glow.screenBlur');
    expect(source).toContain('glow.screenAlpha');
    expect(source).toContain('this.ctx.filter = `blur(');
    expect(source).toContain('brightness(1.18)');
    expect(source).not.toContain('brightness(1.24) saturate(1.08)');
  });

  it('can dim only the source plate while keeping Perlin glow passes at full contrast', () => {
    expect(source).toContain('sourceOpacity?: number');
    expect(source).toContain('this.ctx.globalAlpha = clamp(options.sourceOpacity ?? 1, 0, 1)');
    expect(source).toContain('this.ctx.globalAlpha = 1');
  });

  it('uses the portable 2d context contract for browser canvas reads', () => {
    expect(source).not.toContain('willReadFrequently');
  });
});
