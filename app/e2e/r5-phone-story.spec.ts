import { expect, test, type Page } from '@playwright/test';

const PHONE_SHELL = '[data-phone-validation-mode="v23"]';
const GRADE_A_SHELL = '[data-phone-validation-mode="v34"]';

async function scrollPhoneStageTo(page: Page, progress: number): Promise<void> {
  await page.evaluate(async (nextProgress) => {
    const rail = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage-rail');
    const stage = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage-canvas');
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

async function scrollGradeAFigureTo(page: Page, progress: number): Promise<void> {
  await page.evaluate(async (nextProgress) => {
    const rail = document.querySelector<HTMLElement>('.phone-grade-a__figure-track');
    const stage = document.querySelector<HTMLElement>('.phone-grade-a__surfaces');
    if (!rail || !stage) throw new Error('Grade A Figure2 rail is unavailable');
    const start = rail.getBoundingClientRect().top + window.scrollY;
    const distance = Math.max(1, rail.getBoundingClientRect().height);
    window.scrollTo({
      top: start + distance * nextProgress,
      left: 0,
      behavior: 'auto'
    });
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  }, progress);
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
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
  }, progress);
}

test('v23 Route B publishes the active phone checkpoint trace in both directions', async ({
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
  await page.goto('/?v=23', { waitUntil: 'domcontentloaded' });

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
      await expect(hero).toHaveCSS('visibility', 'visible');
      await expect(
        page.locator('.portrait-scroll-spike__scene--pattern')
      ).toHaveAttribute('data-r4-ink-ownership', 'reveal');
    } else if (checkpoint === 'pattern-complete') {
      await expect(page.locator('.portrait-scroll-spike__stage')).toHaveCSS(
        'background-color',
        'rgb(217, 192, 143)'
      );
      await expect(page.locator('.portrait-scroll-spike__toolbar-edge')).toHaveCount(0);
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
  await expect(page.locator('[data-aod-transition]')).toHaveAttribute(
    'data-portrait-aod-backdrop-progress',
    '1.0000'
  );
  await expect(page.locator('.aod-transition__layer--sun')).toHaveCSS('opacity', '0');
  await expect(page.locator('.aod-transition__layer--cloud')).toHaveCSS('opacity', '0');

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

test('v34 keeps one Pattern plate in one stable lvh viewport host', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'the formal phone route runs once');
  test.setTimeout(45_000);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=34&portrait-spike-motion=reduce', {
    waitUntil: 'domcontentloaded'
  });
  await expect(page.locator('[data-story-loader="true"]')).toBeHidden({
    timeout: 10_000
  });

  const shell = page.locator(GRADE_A_SHELL);
  const stage = page.locator('.portrait-scroll-spike__stage');
  const canvas = page.locator('.portrait-scroll-spike__stage-canvas');
  await expect(stage).toHaveCSS('position', 'fixed');
  await expect(stage).toHaveCSS('overflow', 'clip');
  await expect(stage).toHaveAttribute('data-portrait-stage-host', 'persistent');
  await expect(canvas).toHaveCSS('position', 'absolute');
  await expect(page.locator('[data-portrait-stage-backplate="true"]')).toHaveCount(0);
  await expect(page.locator('.portrait-scroll-spike__toolbar-edge')).toHaveCount(0);

  for (const sample of [
    { progress: 0.30, edge: 'pattern', color: 'rgb(217, 192, 143)' },
    { progress: 0.82, edge: 'aod', color: 'rgb(237, 228, 210)' }
  ] as const) {
    await scrollPhoneStageTo(page, sample.progress);
    await expect(shell).toHaveAttribute('data-portrait-edge-scene', sample.edge);
    await expect(stage).toHaveCSS('background-color', sample.color);
    const edge = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage');
      const canvas = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage-canvas');
      const rail = document.querySelector<HTMLElement>('.portrait-scroll-spike__stage-rail');
      const patternScene = document.querySelector<HTMLElement>('.portrait-scroll-spike__scene--pattern');
      const patternPlate = document.querySelector<HTMLElement>('.portrait-scroll-spike__pattern-motion');
      const patternImage = document.querySelector<HTMLImageElement>('.portrait-scroll-spike__pattern-image');
      if (!stage || !canvas || !rail) throw new Error('fixed stage edge surface is unavailable');
      const stageRect = stage.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const documentStyle = getComputedStyle(document.documentElement);
      const bodyStyle = getComputedStyle(document.body);
      const rootStyle = getComputedStyle(document.querySelector<HTMLElement>('#root')!);
      const stageStyle = getComputedStyle(stage);
      const railStyle = getComputedStyle(rail);
      return {
        viewportRatio: stageRect.height / window.innerHeight,
        hostCanvasHeightDelta: Math.abs(stageRect.height - canvasRect.height),
        documentBackgroundColor: documentStyle.backgroundColor,
        documentBackgroundImage: documentStyle.backgroundImage,
        documentBackgroundAttachment: documentStyle.backgroundAttachment,
        bodyBackgroundColor: bodyStyle.backgroundColor,
        bodyBackgroundImage: bodyStyle.backgroundImage,
        rootBackgroundColor: rootStyle.backgroundColor,
        rootBackgroundImage: rootStyle.backgroundImage,
        stageBackgroundImage: stageStyle.backgroundImage,
        railBackgroundColor: railStyle.backgroundColor,
        patternSceneBackgroundImage: patternScene
          ? getComputedStyle(patternScene).backgroundImage
          : '',
        patternPlateHeight: patternPlate?.getBoundingClientRect().height ?? 0,
        patternImageHeight: patternImage?.getBoundingClientRect().height ?? 0,
        patternImageSource: patternImage?.currentSrc || patternImage?.src || '',
        themeColor: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content
      };
    });
    expect(edge.viewportRatio).toBeGreaterThanOrEqual(1);
    expect(edge.hostCanvasHeightDelta).toBeLessThanOrEqual(0.5);
    expect(edge.documentBackgroundColor).toBe(sample.color);
    expect(edge.bodyBackgroundColor).toBe(sample.color);
    expect(edge.rootBackgroundColor).toBe(sample.color);
    expect(edge.documentBackgroundImage).toBe('none');
    expect(edge.bodyBackgroundImage).toBe('none');
    expect(edge.rootBackgroundImage).toBe('none');
    expect(edge.stageBackgroundImage).toBe('none');
    expect(edge.documentBackgroundAttachment).toBe('scroll');
    expect(edge.railBackgroundColor).toBe(sample.color);
    expect(edge.themeColor).toBe(sample.edge === 'pattern' ? '#d9c08f' : '#ede4d2');
    if (sample.edge === 'pattern') {
      expect(edge.patternSceneBackgroundImage).toBe('none');
      expect(edge.patternPlateHeight).toBeCloseTo(844, 0);
      expect(edge.patternImageHeight).toBeCloseTo(edge.patternPlateHeight, 0);
      expect(edge.patternImageSource).toContain('pattern-background');
      await expect(page.locator(
        '.portrait-scroll-spike__pattern-motion > .portrait-scroll-spike__pattern-image'
      )).toHaveCount(1);
      await expect(page.locator(
        '.portrait-scroll-spike__pattern-motion > [data-portrait-pattern-bloom]'
      )).toHaveCount(1);
      await expect(page.locator(
        '.portrait-scroll-spike__pattern-motion > .portrait-scroll-spike__pattern-wash'
      )).toHaveCount(1);
    }
  }
});

test('v34 Grade A direct entry traverses Proof ↔ Figure2 ↔ Method in the persistent host', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'the formal phone route runs once');
  test.setTimeout(45_000);

  const presentationRequests: string[] = [];
  page.on('response', (response) => {
    presentationRequests.push(new URL(response.url()).pathname);
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=34&portrait-spike-motion=reduce#figure2-proof-cards', {
    waitUntil: 'domcontentloaded'
  });

  const shell = page.locator(GRADE_A_SHELL);
  const gradeA = page.locator('.phone-grade-a');
  await expect(page.locator('[data-story-loader="true"]')).toBeHidden({
    timeout: 10_000
  });
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'figure2-proof-cards');
  await expect(gradeA).toHaveAttribute('data-phone-grade-a-ready', 'true');
  await expect(page.locator('.portrait-scroll-spike')).toHaveAttribute(
    'data-portrait-aod-run',
    'complete'
  );
  await expect(page.locator('[data-r4-scene="figure2-animation"]')).toHaveCount(1);
  await expect(page.locator('[data-r4-scene="figure2-animation"]')).toHaveAttribute(
    'data-phone-figure2-alpha',
    'verified'
  );
  await expect(page.locator('[data-figure2-packed-alpha-canvas]')).toHaveAttribute(
    'data-packed-alpha-frame-ready',
    'true'
  );
  await expect(page.locator('[data-r4-scene="figure2-animation"]')).toHaveAttribute(
    'data-phone-figure2-poster-ready',
    'true'
  );
  const posterBackground = await page.locator('.r4-figure2__media-stack--combined')
    .evaluate((element) => getComputedStyle(element, '::before').backgroundImage);
  expect(posterBackground).toContain('figure2-pair-opening');
  await expect(page.locator('[data-r4-scene="figure2-proof"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="r2-stage"]')).toHaveCount(1);
  const foregroundArch = page.locator('[data-stage-retained-figure2-arch="true"]');
  await expect(foregroundArch).toHaveCount(1);
  await expect(foregroundArch).toHaveAttribute(
    'src',
    /figure2-phone-foreground-arch-[^/]+\.webp/
  );
  await expect(foregroundArch).toHaveAttribute('data-phone-figure2-arch-visible', 'true');
  await expect(foregroundArch).toHaveAttribute('data-figure2-arch-motion', 'fixed');
  const ownership = await page.evaluate(() => {
    const surfaces = document.querySelector<HTMLElement>('.phone-grade-a__surfaces');
    const arch = document.querySelector<HTMLElement>('[data-stage-retained-figure2-arch="true"]');
    const ink = document.querySelector<HTMLElement>('.r4-figure2-proof-ink-canvas');
    const cards = document.querySelector<HTMLElement>('.r4-proof-scroll__content--cards');
    return {
      parentClass: surfaces?.parentElement?.className,
      surfacePosition: surfaces ? getComputedStyle(surfaces).position : '',
      archZ: arch ? Number(getComputedStyle(arch).zIndex) : 0,
      inkZ: ink ? Number(getComputedStyle(ink).zIndex) : 0,
      cardsLeft: cards?.getBoundingClientRect().left ?? 0
    };
  });
  expect(ownership.parentClass).toContain('portrait-scroll-spike__stage-canvas');
  expect(ownership.surfacePosition).toBe('absolute');
  expect(ownership.archZ).toBeGreaterThan(ownership.inkZ);
  expect(ownership.cardsLeft).toBeGreaterThanOrEqual(36);
  const archFrame = await foregroundArch.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      scale: style.getPropertyValue('--phone-figure2-arch-scale').trim(),
      blur: style.getPropertyValue('--phone-figure2-arch-blur').trim()
    };
  });
  expect(archFrame.scale).toBe('1.1350');
  expect(archFrame.blur).toBe('3.60px');
  const proofProgress = Number(await page.locator('[data-r4-scene="figure2-proof"]')
    .getAttribute('data-phone-proof-progress'));
  expect(proofProgress).toBeCloseTo(0.5, 2);
  await expect(page.locator('[data-r4-scene="figure2-proof"]')).toHaveCSS(
    'overflow-y',
    'visible'
  );

  await scrollGradeAFigureTo(page, 0.5);
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'figure2-stage');
  await scrollGradeAFigureTo(page, 0.85);
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'figure2-to-proof');
  await scrollGradeAProofTo(page, 0.5);
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'figure2-proof-cards');
  await scrollGradeAFigureTo(page, 0.5);
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'figure2-stage');

  for (const chunk of [
    'PhoneGradeAStory',
    'PhoneFigure2',
    'PhoneFigure2Proof',
    'method-bottom-figure2',
    'figure2-distance-expand'
  ]) {
    expect(
      presentationRequests.some((path) => path.includes(`/${chunk}-`)),
      `missing Grade A phone chunk ${chunk}`
    ).toBe(true);
  }
});

test('v34 keeps Figure2 visible when Safari never produces a packed video frame', async ({
  page
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'the formal phone route runs once');
  test.setTimeout(45_000);

  await page.route('**/*figure2-pair-motion-rgb-alpha*.mp4', (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?v=34&portrait-spike-motion=reduce#figure2-animation', {
    waitUntil: 'domcontentloaded'
  });

  const shell = page.locator(GRADE_A_SHELL);
  const gradeA = page.locator('.phone-grade-a');
  const figure2 = page.locator('[data-r4-scene="figure2-animation"]');
  await expect(page.locator('[data-story-loader="true"]')).toBeHidden({
    timeout: 10_000
  });
  await expect(figure2).toHaveAttribute('data-phone-figure2-ready', 'true');
  await expect(gradeA).toHaveAttribute('data-phone-grade-a-ready', 'true');
  await expect(shell).toHaveAttribute('data-portrait-checkpoint', 'figure2-stage');
  await expect(gradeA).toHaveAttribute('data-phone-grade-a-active', 'true');
  await expect(figure2).toHaveAttribute(
    'data-phone-figure2-alpha',
    'poster-fallback',
    { timeout: 6_000 }
  );
  await expect(page.locator('.phone-grade-a__surfaces')).toHaveCSS('visibility', 'visible');
  const poster = await page.locator('.r4-figure2__media-stack--combined').evaluate((element) => {
    const style = getComputedStyle(element, '::before');
    return { backgroundImage: style.backgroundImage, opacity: style.opacity };
  });
  expect(poster.backgroundImage).toContain('figure2-pair-opening');
  expect(poster.opacity).toBe('1');
});
