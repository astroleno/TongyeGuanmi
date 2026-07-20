import { expect, test, type Page } from '@playwright/test';

const PHONE_SHELL = '[data-phone-validation-mode="v18"]';

async function scrollPhoneStageTo(page: Page, progress: number): Promise<void> {
  await page.evaluate(async (nextProgress) => {
    const rail = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage-rail');
    const stage = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage');
    if (!rail || !stage) {
      throw new Error('Phone stage geometry is unavailable');
    }
    const start = rail.getBoundingClientRect().top + window.scrollY;
    const distance = Math.max(1, rail.offsetHeight - stage.offsetHeight);
    window.scrollTo({ top: start + distance * nextProgress, left: 0, behavior: 'auto' });
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  }, progress);
}

test('v18 Route B publishes the active phone checkpoint trace in both directions', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'the formal phone route runs once');
  test.setTimeout(45_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=18', { waitUntil: 'domcontentloaded' });

  const shell = page.locator(PHONE_SHELL);
  const loader = page.locator('[data-story-loader="true"]');
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'loader');
  await expect(loader).toBeHidden({ timeout: 10_000 });
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'hero-entered');

  const forward = [
    [0.18, 'hero-to-pattern'],
    [0.30, 'pattern-complete'],
    [0.54, 'pattern-to-star-map'],
    [0.64, 'star-map-reading'],
    [0.74, 'star-map-to-aod'],
    [0.82, 'aod-stage']
  ] as const;
  for (const [progress, checkpoint] of forward) {
    await scrollPhoneStageTo(page, progress);
    await expect(shell).toHaveAttribute('data-portrait-checkpoint', checkpoint);
  }

  await scrollPhoneStageTo(page, 0.99);
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'aod-autoplay');
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'method-intro', {
    timeout: 10_000
  });

  await scrollPhoneStageTo(page, 0.74);
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'aod-stage', {
    timeout: 10_000
  });

  const reverse = [
    [0.739, 'star-map-to-aod'],
    [0.64, 'star-map-reading'],
    [0.54, 'pattern-to-star-map'],
    [0.30, 'pattern-complete'],
    [0.18, 'hero-to-pattern'],
    [0.10, 'hero-entered']
  ] as const;
  for (const [progress, checkpoint] of reverse) {
    await scrollPhoneStageTo(page, progress);
    await expect(shell).toHaveAttribute('data-portrait-checkpoint', checkpoint);
  }

  const trace = (await shell.getAttribute('data-portrait-checkpoint-trace'))?.split('>') ?? [];
  const expectedTrace = [
    'loader',
    'hero-entered',
    ...forward.map(([, checkpoint]) => checkpoint),
    'aod-autoplay',
    'aod-to-method',
    'method-intro',
    'aod-to-method',
    'aod-autoplay',
    'aod-stage',
    ...reverse.map(([, checkpoint]) => checkpoint)
  ];
  let traceIndex = -1;
  for (const checkpoint of expectedTrace) {
    traceIndex = trace.indexOf(checkpoint, traceIndex + 1);
    expect(traceIndex, `missing ${checkpoint} after trace index ${traceIndex}`).toBeGreaterThan(-1);
  }
});
