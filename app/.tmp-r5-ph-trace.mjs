import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push({
  message: String(error),
  stack: error.stack
}));
await page.goto(
  'http://127.0.0.1:4173/?v=47&portrait-spike-motion=reduce#figure2-animation',
  { waitUntil: 'domcontentloaded' }
);
await page.locator('[data-phone-direct-entry-scene="figure2-animation"]')
  .waitFor({ state: 'attached', timeout: 12_000 });
let previous = '';
const history = [];
for (let index = 0; index < 60; index += 1) {
  await page.waitForTimeout(250);
  const snapshot = await page.evaluate(() => {
    const formal = document.querySelector('[data-phone-validation-mode]');
    const continuation = document.querySelector('[data-phone-continuation="lab-contact"]');
    return {
      formal: formal ? Object.fromEntries(Object.entries(formal.dataset)) : null,
      continuation: continuation
        ? Object.fromEntries(Object.entries(continuation.dataset))
        : null,
      direct: [...document.querySelectorAll('[data-phone-direct-entry-scene]')]
        .map((node) => Object.fromEntries(Object.entries(node.dataset))),
      gradeA: Boolean(document.querySelector('.phone-grade-a'))
    };
  });
  const current = JSON.stringify(snapshot);
  if (current !== previous) history.push({ atMs: (index + 1) * 250, snapshot });
  previous = current;
}
console.log(JSON.stringify({ errors, history }, null, 2));
await browser.close();
