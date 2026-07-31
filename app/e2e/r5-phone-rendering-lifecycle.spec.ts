import { expect, test } from '@playwright/test';

async function scrollLabContactBoundary(
  page: import('@playwright/test').Page,
  selector: string,
  viewportOffset: number
): Promise<void> {
  await page.evaluate(async ({ targetSelector, offset }) => {
    const target = document.querySelector<HTMLElement>(targetSelector);
    if (!target) throw new Error(`Lab/Contact boundary is unavailable: ${targetSelector}`);
    const documentTop = target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: documentTop + window.innerHeight * offset,
      left: 0,
      behavior: 'auto'
    });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, { targetSelector: selector, offset: viewportOffset });
}

test('PH and Lab-to-PH reactivate their persistent packed-alpha and Ink Canvases', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    const instrumented = window as Window & {
      __r5PackedAlphaContextLosses?: string[];
    };
    instrumented.__r5PackedAlphaContextLosses = [];
    window.addEventListener('webglcontextlost', (event) => {
      const canvas = event.target as HTMLCanvasElement | null;
      instrumented.__r5PackedAlphaContextLosses?.push(
        canvas?.dataset.phonePackedAlphaCanvas
          ?? (canvas?.dataset.phoneLabPhInk ? 'lab-ph-ink' : 'unknown')
      );
    }, true);
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=36#lab', {
    waitUntil: 'domcontentloaded'
  });
  const shell = page.locator('[data-phone-validation-mode="v36"]');
  await expect(shell).toHaveAttribute('data-phone-acceptance-load', 'ready');
  const canvas = page.locator('[data-phone-packed-alpha-canvas="ph-figure"]');
  const inkCanvas = page.locator('[data-phone-lab-ph-ink="bottom-to-top"]');
  await expect(canvas).toHaveCount(1, { timeout: 30_000 });
  await expect(inkCanvas).toHaveCount(1, { timeout: 30_000 });
  await canvas.evaluate((element) => {
    element.dataset.r5LifecycleIdentity = 'ph-persistent-canvas';
  });
  await inkCanvas.evaluate((element) => {
    element.dataset.r5LifecycleIdentity = 'lab-ph-persistent-ink';
  });

  expect(await canvas.evaluate((element) => (
    element.getContext('webgl')?.isContextLost() ?? true
  ))).toBe(false);

  await scrollLabContactBoundary(
    page,
    '[data-phone-acceptance-chapter="lab-ph-education"]',
    -0.5
  );
  await expect.poll(() => inkCanvas.getAttribute('data-phone-ink-renderer'))
    .toBe('active');
  await scrollLabContactBoundary(
    page,
    '[data-phone-acceptance-chapter="lab-ph-education"]',
    0.05
  );
  await expect(shell).toHaveAttribute(
    'data-phone-acceptance-active-scene',
    'ph-animation',
    { timeout: 30_000 }
  );
  await expect(shell).toHaveAttribute(
    'data-phone-lab-contact-visual-run',
    'ph-animation:forward',
    { timeout: 30_000 }
  );
  // End only the autonomous media run through its production event boundary;
  // surface retirement/reactivation below remains owned by the real shell.
  await page.evaluate(() => {
    const ph = document.querySelector('[data-phone-scene="ph-animation"]');
    if (!ph) throw new Error('PH production surface is unavailable');
    ph.dispatchEvent(new CustomEvent('phone-lab-contact-autoplay', {
      bubbles: true,
      detail: {
        scene: 'ph-animation',
        phase: 'complete',
        direction: 1
      }
    }));
  });
  await expect(shell).toHaveAttribute(
    'data-phone-acceptance-active-scene',
    'education',
    { timeout: 30_000 }
  );
  await scrollLabContactBoundary(
    page,
    '[data-phone-acceptance-chapter="education-crane-contact"]',
    -0.5
  );
  await expect.poll(() => canvas.evaluate((element) => ({
    identity: element.dataset.r5LifecycleIdentity,
    width: element.width
  }))).toEqual({
    identity: 'ph-persistent-canvas',
    width: 1
  });

  await canvas.evaluate((element) => {
    const instrumented = window as Window & {
      __r5PhPackedAlphaStatuses?: string[];
      __r5PhPackedAlphaObserver?: MutationObserver;
    };
    instrumented.__r5PhPackedAlphaStatuses = [];
    instrumented.__r5PhPackedAlphaObserver?.disconnect();
    instrumented.__r5PhPackedAlphaObserver = new MutationObserver(() => {
      instrumented.__r5PhPackedAlphaStatuses?.push(
        element.dataset.packedAlphaStatus ?? 'cleared'
      );
    });
    instrumented.__r5PhPackedAlphaObserver.observe(element, {
      attributes: true,
      attributeFilter: ['data-packed-alpha-status']
    });
  });

  await scrollLabContactBoundary(
    page,
    '[data-phone-acceptance-chapter="lab-ph-education"]',
    0
  );
  await shell.evaluate((element) => {
    if (element.dataset.phoneAcceptanceActiveScene === 'ph-animation') return;
    element.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      pointerType: 'touch',
      isPrimary: true,
      pointerId: 1,
      clientY: 200
    }));
    element.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      pointerType: 'touch',
      isPrimary: true,
      pointerId: 1,
      clientY: 220
    }));
  });
  await expect(shell).toHaveAttribute(
    'data-phone-acceptance-active-scene',
    'ph-animation',
    { timeout: 30_000 }
  );
  await expect.poll(() => page.evaluate(() => (
    (window as Window & { __r5PhPackedAlphaStatuses?: string[] })
      .__r5PhPackedAlphaStatuses ?? []
  ))).toContain('waiting');

  const reactivated = await canvas.evaluate((element) => ({
    identity: element.dataset.r5LifecycleIdentity,
    contextLost: element.getContext('webgl')?.isContextLost() ?? true,
    status: element.dataset.packedAlphaStatus
  }));
  expect(reactivated.identity).toBe('ph-persistent-canvas');
  expect(reactivated.contextLost).toBe(false);
  expect(reactivated.status).not.toBe('setup-failed');
  expect(await page.evaluate(() => (
    (window as Window & { __r5PackedAlphaContextLosses?: string[] })
      .__r5PackedAlphaContextLosses ?? []
  ))).not.toContain('ph-figure');

  await expect.poll(() => inkCanvas.getAttribute('data-phone-ink-renderer'))
    .toBe('active');
  const reactivatedInk = await inkCanvas.evaluate((element) => ({
    identity: element.dataset.r5LifecycleIdentity,
    contextLost: element.getContext('webgl')?.isContextLost() ?? true
  }));
  expect(reactivatedInk).toEqual({
    identity: 'lab-ph-persistent-ink',
    contextLost: false
  });
  expect(await page.evaluate(() => (
    (window as Window & { __r5PackedAlphaContextLosses?: string[] })
      .__r5PackedAlphaContextLosses ?? []
  ))).not.toContain('lab-ph-ink');
});
