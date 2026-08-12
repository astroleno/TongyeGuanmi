import { chromium, devices } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome' });
const context = await browser.newContext({
  ...devices['Pixel 7'],
  viewport: { width: 390, height: 844 },
  screen: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true
});
const page = await context.newPage();
const consoleEvents = [];
const mediaResponses = [];
page.on('console', (message) => consoleEvents.push({
  type: message.type(),
  text: message.text()
}));
page.on('pageerror', (error) => consoleEvents.push({
  type: 'pageerror',
  text: String(error)
}));
page.on('response', (response) => {
  if (/\.(?:mp4|webm)(?:$|\?)/.test(response.url())) {
    mediaResponses.push({ status: response.status(), url: response.url() });
  }
});

async function cursor() {
  return page.locator('[data-phone-cursor]').getAttribute('data-phone-cursor');
}

async function driveFront(from, to, direction) {
  for (let pulse = 0; pulse < 64; pulse += 1) {
    await page.mouse.move(195, 650);
    await page.mouse.wheel(0, direction * 250);
    await page.waitForTimeout(100);
    if (await cursor() === `hold:${to}`) return;
  }
  throw new Error(`Front ${from} -> ${to} did not settle: ${await cursor()}`);
}

try {
  await page.goto('http://127.0.0.1:4173/?v=47', { waitUntil: 'domcontentloaded' });
  await page.locator('[data-phone-cursor="hold:hero"]').waitFor({ timeout: 20_000 });
  await driveFront('hero', 'pattern', 1);
  await driveFront('pattern', 'star-map', 1);
  await driveFront('star-map', 'aod-animation', 1);
  await page.waitForTimeout(1_250);

  await page.evaluate(() => {
    const root = document.querySelector('[data-phone-authority-id]');
    const sample = () => ({
      at: performance.now(),
      data: root ? Object.fromEntries(Object.entries(root.dataset)) : null
    });
    const events = [sample()];
    const observer = new MutationObserver(() => events.push(sample()));
    if (root) {
      observer.observe(root, { attributes: true });
    }
    window.__aodMethodDebug = { events, observer };
  });

  for (let pulse = 0; pulse < 64; pulse += 1) {
    await page.mouse.move(195, 650);
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(100);
    if ((await cursor()) !== 'hold:aod-animation') break;
  }
  await page.waitForTimeout(8_000);
  const report = await page.evaluate(() => {
    const root = document.querySelector('[data-phone-authority-id]');
    const aod = document.querySelector('.portrait-scroll-spike__scene--aod');
    const video = document.querySelector('[data-aod-figure-video]');
    const method = document.querySelector('#method');
    const debug = window.__aodMethodDebug;
    return {
      root: root ? Object.fromEntries(Object.entries(root.dataset)) : null,
      events: debug?.events.slice(-80) ?? [],
      aod: aod ? {
        data: Object.fromEntries(Object.entries(aod.dataset)),
        style: getComputedStyle(aod).cssText,
        rect: aod.getBoundingClientRect().toJSON()
      } : null,
      video: video ? {
        currentTime: video.currentTime,
        duration: video.duration,
        paused: video.paused,
        ended: video.ended,
        readyState: video.readyState,
        networkState: video.networkState,
        error: video.error?.message ?? null
      } : null,
      method: method ? {
        data: Object.fromEntries(Object.entries(method.dataset)),
        rect: method.getBoundingClientRect().toJSON()
      } : null,
      surfaces: Array.from(document.querySelectorAll('[data-phone-surface-role]')).map((node) => ({
        className: node.className,
        role: node.dataset.phoneSurfaceRole,
        endpoint: node.dataset.phoneBoundaryEndpoint,
        session: node.dataset.phoneBoundarySession,
        generation: node.dataset.phoneBoundaryGeneration
      }))
    };
  });
  console.log(JSON.stringify({ report, consoleEvents, mediaResponses }, null, 2));
} finally {
  await context.close();
  await browser.close();
}
