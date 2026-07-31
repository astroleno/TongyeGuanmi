import { expect, test } from '@playwright/test';

const captures = [
  { hash: 'lab', scene: 'lab', selector: '#phone-lab-title' },
  {
    hash: 'ph-animation',
    scene: 'ph-animation',
    selector: '[data-r4-scene="ph-animation"]'
  },
  {
    hash: 'education',
    scene: 'education',
    selector: '[data-r4-scene="education"]'
  },
  {
    hash: 'crane-animation',
    scene: 'crane-animation',
    selector: '[data-r4-scene="crane-animation"]'
  },
  {
    hash: 'contact',
    scene: 'contact',
    selector: '[data-r4-scene="contact"]'
  }
] as const;

for (const capture of captures) {
  test(`captures v36 ${capture.scene}`, async ({ page }, testInfo) => {
    await page.goto(`/?v=36#${capture.hash}`);
    const shell = page.locator('.phone-lab-contact');
    await expect(shell).toHaveAttribute('data-phone-validation-mode', 'v36');
    await expect(shell).toHaveAttribute('data-phone-acceptance-load', 'ready');
    await expect(shell).toHaveAttribute(
      'data-phone-acceptance-active-scene',
      capture.scene
    );
    await expect(page.locator(capture.selector)).toHaveCount(1);
    await page.screenshot({
      path: testInfo.outputPath(`${capture.scene}.png`),
      animations: 'disabled'
    });
  });
}
