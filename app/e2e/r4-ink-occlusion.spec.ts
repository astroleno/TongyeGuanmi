import { expect, test, type Page } from '@playwright/test';

type InkMode = 'horizontal' | 'radial' | 'depth';

type AlphaProbe = {
  primaryMin: number;
  secondaryMin: number | null;
};

async function probeOwnershipAlpha(page: Page, mode: InkMode, progress: number): Promise<AlphaProbe> {
  return page.evaluate(async ({ fieldMode, fieldProgress }) => {
    const modulePath = '/src/vendor/ink-scene-transition.js';
    const { createInkBoundaryTransition } = await import(modulePath);
    const frameModulePath = '/src/transitions/shared/inkField.ts';
    const { createInkFieldFrame } = await import(frameModulePath);
    const width = 320;
    const height = 180;
    const canvas = document.createElement('canvas');
    canvas.style.position = 'fixed';
    canvas.style.left = '-10000px';
    canvas.style.top = '0';
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    document.body.append(canvas);

    const depthSource = (() => {
      const source = document.createElement('canvas');
      source.width = 256;
      source.height = 2;
      const context = source.getContext('2d');
      if (!context) throw new Error('Depth probe canvas unavailable');
      const image = context.createImageData(source.width, source.height);
      for (let y = 0; y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
          const offset = (y * source.width + x) * 4;
          const rank = Math.round(x / (source.width - 1) * 255);
          image.data[offset] = rank;
          image.data[offset + 1] = rank;
          image.data[offset + 2] = rank;
          image.data[offset + 3] = 255;
        }
      }
      context.putImageData(image, 0, 0);
      return source.toDataURL('image/png');
    })();
    const spec = fieldMode === 'horizontal'
      ? { kind: 'horizontal' as const, direction: 'top-to-bottom' as const, seed: 'alpha-horizontal' }
      : fieldMode === 'radial'
        ? { kind: 'radial' as const, origin: { x: 0.5, y: 0.5 }, seed: 'alpha-radial' }
        : {
            kind: 'depth' as const,
            depthSrc: depthSource,
            seed: 'alpha-depth',
            transform: {
              viewport: { width, height },
              cover: { x: 0, y: 0, width, height },
              camera: { scale: 1, translateX: 0, translateY: 0, originX: 0.5, originY: 0.5 }
            }
          };
    const frame = createInkFieldFrame(
      spec,
      fieldProgress,
      { width, height },
      fieldMode === 'depth'
        ? {
            secondaryHorizontal: {
              direction: 'top-to-bottom',
              gateRank: 0.37
            }
          }
        : undefined
    );
    const transition = createInkBoundaryTransition(canvas, {
      colorLift: 0.92,
      coverAlpha: 0.82,
      fadeOutStart: 0.94,
      fadeOutEnd: 0.995,
      dprLimit: 1
    });
    if (!transition) throw new Error('WebGL Ink probe unavailable');

    transition.render(frame);
    if (fieldMode === 'depth') {
      await new Promise((resolve) => setTimeout(resolve, 120));
      transition.render(frame);
    }

    const gl = canvas.getContext('webgl');
    if (!gl) throw new Error('WebGL readback unavailable');
    const readAlpha = (x: number, y: number): number => {
      const pixel = new Uint8Array(4);
      gl.readPixels(
        Math.max(0, Math.min(width - 1, Math.round(x))),
        Math.max(0, Math.min(height - 1, Math.round(y))),
        1,
        1,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        pixel
      );
      return (pixel[3] ?? 0) / 255;
    };

    let primarySamples: number[];
    if (fieldMode === 'horizontal') {
      primarySamples = Array.from(
        { length: 32 },
        (_, index) => readAlpha(index * 10, height * (1 - frame.occlusion.gateRank))
      );
    } else if (fieldMode === 'radial') {
      const aspect = width / height;
      const radiusScale = Math.hypot(aspect * 0.5, 0.5);
      const radius = frame.occlusion.gateRank * height * radiusScale;
      primarySamples = Array.from({ length: 96 }, (_, index) => {
        const angle = index / 96 * Math.PI * 2;
        return {
          x: width * 0.5 + Math.cos(angle) * radius,
          y: height * 0.5 + Math.sin(angle) * radius
        };
      })
        .filter(({ x, y }) => x >= 0 && x < width && y >= 0 && y < height)
        .map(({ x, y }) => readAlpha(x, y));
    } else {
      primarySamples = Array.from(
        { length: 18 },
        (_, index) => readAlpha(width * frame.occlusion.gateRank, index * 10)
      );
    }

    const secondarySamples = fieldMode === 'depth'
      ? [24, 72, 248, 296].map((x) => readAlpha(x, height * (1 - 0.37)))
      : null;
    const result = {
      primaryMin: Math.min(...primarySamples),
      secondaryMin: secondarySamples ? Math.min(...secondarySamples) : null
    };
    transition.destroy();
    canvas.remove();
    return result;
  }, { fieldMode: mode, fieldProgress: progress });
}

test.describe('R4 Ink ownership alpha diagnostics', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  for (const mode of ['horizontal', 'radial', 'depth'] as const) {
    test(`${mode} ownership gates remain at or above 0.92 alpha`, async ({ page }) => {
      await page.goto('/harness/r4-g1');
      for (const progress of [0.1, 0.5, 0.9]) {
        const probe = await probeOwnershipAlpha(page, mode, progress);

        expect(probe.primaryMin).toBeGreaterThanOrEqual(0.92);
        if (mode === 'depth') {
          expect(probe.secondaryMin).toBeGreaterThanOrEqual(0.92);
        }
      }
    });
  }
});
