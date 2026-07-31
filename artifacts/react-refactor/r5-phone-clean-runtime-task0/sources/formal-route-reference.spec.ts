import { expect, test, type Page } from '/Users/aitoshuu/Documents/GitHub/TongyeGuanmi/.worktrees/r5-phone-clean-runtime/app/node_modules/@playwright/test/index.js';

const outputDir = '/private/tmp/r5-phone-clean-runtime-task0-evidence/formal/reference-frames/selected';

async function afterPaint(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
}

async function scrollGradeAProofTo(page: Page, progress: number): Promise<void> {
  await page.evaluate(async (nextProgress) => {
    const track = document.querySelector<HTMLElement>('.phone-grade-a__proof-track');
    const stage = document.querySelector<HTMLElement>('.phone-grade-a__surfaces');
    if (!track || !stage) throw new Error('Grade A Proof geometry is unavailable');
    const start = track.getBoundingClientRect().top + window.scrollY;
    const distance = Math.max(1, track.getBoundingClientRect().height - stage.clientHeight);
    window.scrollTo({ top: start + distance * nextProgress, left: 0, behavior: 'auto' });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, progress);
}

async function scrollProofBrandTo(page: Page, progress: number): Promise<void> {
  await page.evaluate(async (nextProgress) => {
    const brand = document.querySelector<HTMLElement>('#brand.phone-brand');
    const stage = document.querySelector<HTMLElement>('.phone-grade-a__surfaces');
    if (!brand || !stage) throw new Error('Proof to Brand geometry is unavailable');
    const brandTop = brand.getBoundingClientRect().top + window.scrollY;
    const stageHeight = Math.max(1, stage.clientHeight || window.innerHeight);
    window.scrollTo({
      top: brandTop - stageHeight * (1 - nextProgress),
      left: 0,
      behavior: 'auto'
    });
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, progress);
}

test('records the existing v47 Figure2 Proof to Brand path past its stale mount assertion', async ({
  page
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=47#figure2-proof-closing', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-story-loader="true"]')).toBeHidden({ timeout: 10_000 });
  await expect(page.locator('.phone-grade-a')).toHaveAttribute(
    'data-phone-grade-a-ready',
    'true',
    { timeout: 15_000 }
  );

  await scrollGradeAProofTo(page, 1);
  await expect(page.locator('[data-phone-validation-mode="v47"]')).toHaveAttribute(
    'data-portrait-checkpoint',
    'figure2-proof-closing'
  );
  await afterPaint(page);
  await page.screenshot({ path: `${outputDir}/figure2-proof-closing.jpeg`, type: 'jpeg' });

  await scrollProofBrandTo(page, 0.5);
  await expect(page.locator('[data-phone-validation-mode="v47"]')).toHaveAttribute(
    'data-portrait-checkpoint',
    'proof-to-brand'
  );
  await afterPaint(page);
  await page.screenshot({ path: `${outputDir}/proof-to-brand-midpoint.jpeg`, type: 'jpeg' });

  await scrollProofBrandTo(page, 1);
  await expect(page.locator('[data-phone-validation-mode="v47"]')).toHaveAttribute(
    'data-portrait-checkpoint',
    'brand-reading'
  );
  await expect(page.locator('#brand.phone-brand')).toBeVisible();
  await afterPaint(page);
  await page.screenshot({ path: `${outputDir}/brand-reading.jpeg`, type: 'jpeg' });
});
