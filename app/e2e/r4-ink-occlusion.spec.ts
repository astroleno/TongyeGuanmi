import { expect, test, type Page } from '@playwright/test';

type InkMode = 'horizontal' | 'radial' | 'depth';

type AlphaProbe = {
  primaryMin: number;
  secondaryMin: number | null;
};

async function probeOwnershipAlpha(
  page: Page,
  mode: InkMode,
  progress: number,
  depthScreenY?: number
): Promise<AlphaProbe> {
  return page.evaluate(async ({ fieldMode, fieldProgress, depthProbeScreenY }) => {
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
      source.width = 2;
      source.height = 256;
      const context = source.getContext('2d');
      if (!context) throw new Error('Depth probe canvas unavailable');
      const image = context.createImageData(source.width, source.height);
      for (let y = 0; y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
          const offset = (y * source.width + x) * 4;
          const rank = Math.round(y / (source.height - 1) * 255);
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
      const screenY = depthProbeScreenY ?? frame.occlusion.gateRank * height;
      primarySamples = Array.from(
        { length: 32 },
        (_, index) => readAlpha(index * 10, height - 1 - screenY)
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
  }, { fieldMode: mode, fieldProgress: progress, depthProbeScreenY: depthScreenY });
}

async function measureSvgDepthBoundary(page: Page, progress: number): Promise<{
  boundaryY: number;
  expectedY: number;
}> {
  const probe = await page.evaluate(async ({ fieldProgress, width, height }) => {
    const maskModulePath = '/src/transitions/shared/depthThresholdMask.ts';
    const { createDepthThresholdMask } = await import(maskModulePath);
    const frameModulePath = '/src/transitions/shared/inkField.ts';
    const { inkOwnershipGateProgress } = await import(frameModulePath);
    const source = document.createElement('canvas');
    source.width = 2;
    source.height = 256;
    const context = source.getContext('2d');
    if (!context) throw new Error('SVG depth probe canvas unavailable');
    const image = context.createImageData(source.width, source.height);
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const offset = (y * source.width + x) * 4;
        const rank = Math.round(y / (source.height - 1) * 255);
        image.data[offset] = rank;
        image.data[offset + 1] = rank;
        image.data[offset + 2] = rank;
        image.data[offset + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    const depthSrc = source.toDataURL('image/png');
    const preload = new Image();
    preload.src = depthSrc;
    await preload.decode();

    document.querySelector('[data-depth-mask-alignment-probe]')?.remove();
    const host = document.createElement('div');
    host.dataset.depthMaskAlignmentProbe = 'true';
    host.style.position = 'fixed';
    host.style.left = '0';
    host.style.top = '0';
    host.style.width = `${width}px`;
    host.style.height = `${height}px`;
    host.style.background = 'rgb(0, 0, 0)';
    host.style.zIndex = '2147483647';
    const target = document.createElement('div');
    target.style.position = 'absolute';
    target.style.inset = '0';
    target.style.background = 'rgb(255, 255, 255)';
    host.append(target);
    document.body.append(host);

    const transform = {
      viewport: { width, height },
      cover: { x: 0, y: 0, width, height },
      camera: { scale: 1, translateX: 0, translateY: 0, originX: 0.5, originY: 0.5 }
    } as const;
    const gateRank = inkOwnershipGateProgress(fieldProgress);
    const mask = createDepthThresholdMask({
      host,
      targets: [{ element: target, polarity: 'reveal' as const }],
      depthSrc,
      runId: `depth-mask-alignment-${fieldProgress}`,
      transform
    });
    if (!mask) throw new Error('SVG depth mask probe unavailable');
    mask.render(gateRank, transform);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return {
      expectedY: gateRank * height,
      selector: '[data-depth-mask-alignment-probe]'
    };
  }, { fieldProgress: progress, width: 320, height: 180 });

  const screenshot = await page.locator(probe.selector).screenshot();
  const boundaryY = await page.evaluate(async ({ dataUrl, width, height }) => {
    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('SVG depth screenshot decoder unavailable');
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(Math.floor(width / 2), 0, 1, height).data;
    for (let y = 1; y < height; y += 1) {
      const previous = pixels[(y - 1) * 4] ?? 0;
      const current = pixels[y * 4] ?? 0;
      if (previous >= 128 && current < 128) return y;
    }
    throw new Error('SVG depth boundary was not found');
  }, {
    dataUrl: `data:image/png;base64,${screenshot.toString('base64')}`,
    width: 320,
    height: 180
  });
  await page.evaluate(() => {
    document.querySelector('[data-depth-mask-alignment-probe]')?.remove();
  });
  return { boundaryY, expectedY: probe.expectedY };
}

test.describe('R4 Ink ownership alpha diagnostics', () => {
  test.use({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

  for (const mode of ['horizontal', 'radial', 'depth'] as const) {
    test(`${mode} ownership gates remain at or above 0.92 alpha`, async ({ page }) => {
      await page.goto('/harness/r4-g1');
      for (const progress of [0.1, 0.5, 0.9]) {
        const depthAlignment = mode === 'depth'
          ? await measureSvgDepthBoundary(page, progress)
          : null;
        const probe = await probeOwnershipAlpha(
          page,
          mode,
          progress,
          depthAlignment?.boundaryY
        );

        expect(probe.primaryMin).toBeGreaterThanOrEqual(0.92);
        if (mode === 'depth') {
          expect(Math.abs(
            (depthAlignment?.boundaryY ?? 0) - (depthAlignment?.expectedY ?? 0)
          )).toBeLessThanOrEqual(1);
          expect(probe.secondaryMin).toBeGreaterThanOrEqual(0.92);
        }
      }
    });
  }
});
