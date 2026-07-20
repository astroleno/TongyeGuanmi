import { expect, test, type Page } from '@playwright/test';

const PHONE_SHELL = '[data-phone-validation-mode="v21"]';

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

test('v21 Route B publishes the active phone checkpoint trace in both directions', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'the formal phone route runs once');
  test.setTimeout(45_000);

  const presentationRequests: string[] = [];
  page.on('response', (response) => {
    const path = new URL(response.url()).pathname;
    if (/\/(?:DesktopStoryShell|Phone(?:StoryShell|Loader|Hero|Pattern|StarMap|Aod|MethodTop)|hero-pattern|pattern-star-map|star-map-aod|aod-method-top)-/.test(path)) {
      presentationRequests.push(path);
    }
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=21', { waitUntil: 'domcontentloaded' });

  const shell = page.locator(PHONE_SHELL);
  const loader = page.locator('[data-story-loader="true"]');
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'loader');
  await expect(loader).toBeHidden({ timeout: 10_000 });
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'hero-entered');
  await expect(shell).toHaveAttribute('data-phone-aod-alpha-end', '0.55');
  await expect(page.locator('.portrait-scroll-spike__scene--hero')).toHaveCount(1);
  await expect(page.locator('.portrait-scroll-spike__scene--pattern')).toHaveCount(1);
  await expect(page.locator('.portrait-scroll-spike__scene--star')).toHaveCount(1);
  await expect(page.locator('.portrait-scroll-spike__scene--aod')).toHaveCount(1);
  await expect(page.locator('#method.portrait-scroll-spike__reading')).toHaveCount(1);
  await expect(page.locator('[data-aod-figure-video]')).toHaveCount(1);
  await expect(page.locator('[data-aod-figure-canvas]')).toHaveCount(1);
  const hero = page.locator('.portrait-scroll-spike__scene--hero');
  await expect(hero).toHaveAttribute('data-portrait-hero-title-active', 'true', {
    timeout: 5_000
  });
  await expect(shell).toHaveAttribute('data-portrait-hero-text-entrance', 'complete', {
    timeout: 5_000
  });
  await expect(page.locator('[data-portrait-figure-canvas]')).toHaveAttribute(
    'data-packed-alpha-frame-ready',
    'true',
    { timeout: 10_000 }
  );
  await expect(page.locator('[data-portrait-pattern-bloom]')).toHaveAttribute(
    'data-portrait-pattern-renderer',
    'ready',
    { timeout: 10_000 }
  );

  const forward = [
    [0.18, 'hero-to-pattern'],
    [0.30, 'pattern-complete'],
    [0.54, 'pattern-to-star-map'],
    [0.64, 'star-map-reading'],
    [0.74, 'star-map-to-aod'],
    [0.82, 'aod-stage']
  ] as const;
  const heroPatternInk = page.locator('[data-portrait-ink="hero-pattern"]');
  for (const [progress, checkpoint] of forward) {
    await scrollPhoneStageTo(page, progress);
    await expect(shell).toHaveAttribute('data-portrait-checkpoint', checkpoint);
    if (checkpoint === 'hero-to-pattern') {
      await expect(heroPatternInk).toHaveAttribute(
        'data-r4-ink-segment',
        'portrait-hero-pattern-ink'
      );
      await expect(heroPatternInk).toHaveAttribute(
        'data-phone-ink-progress',
        /^0\.(?!0000)\d{4}$/
      );
    } else if (checkpoint === 'pattern-to-star-map') {
      await expect(page.locator('[data-portrait-ink="pattern-star"]')).toHaveAttribute(
        'data-r4-ink-segment',
        'portrait-pattern-star-ink'
      );
    } else if (checkpoint === 'star-map-reading') {
      await expect(page.locator('[data-portrait-star-perlin]')).toHaveAttribute(
        'data-portrait-star-perlin',
        'ready'
      );
    } else if (checkpoint === 'star-map-to-aod') {
      await expect(page.locator('[data-portrait-ink="star-aod"]')).toHaveAttribute(
        'data-r4-ink-segment',
        'portrait-star-aod-ink'
      );
    }
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
    if (checkpoint === 'hero-to-pattern') {
      await expect(heroPatternInk).toHaveAttribute(
        'data-phone-ink-progress',
        /^0\.(?!0000)\d{4}$/
      );
    }
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
  for (const chunk of [
    'PhoneStoryShell',
    'PhoneLoader',
    'PhoneHero',
    'PhonePattern',
    'PhoneStarMap',
    'PhoneAod',
    'PhoneMethodTop',
    'hero-pattern',
    'pattern-star-map',
    'star-map-aod',
    'aod-method-top'
  ]) {
    expect(
      presentationRequests.some((path) => path.includes(`/${chunk}-`)),
      `missing selected phone chunk ${chunk}`
    ).toBe(true);
  }
  expect(
    presentationRequests.some((path) => path.includes('/DesktopStoryShell-'))
  ).toBe(false);
});
