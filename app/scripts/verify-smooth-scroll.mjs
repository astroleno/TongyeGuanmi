/* global document, window, requestAnimationFrame, innerWidth, innerHeight, scrollTo, scrollY, getComputedStyle, PageTransitionEvent */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, webkit } = require(require.resolve('playwright', {
  paths: [require.resolve('@playwright/test')]
}));
const baseURL = process.env.SMOOTH_SCROLL_URL ?? 'http://127.0.0.1:4173';
const output = new URL('../../output/playwright/smooth-scroll/', import.meta.url);
await mkdir(output, { recursive: true });
const results = [];
const environments = [];
const nextPaint = (page) => page.evaluate(() => new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(resolve));
}));
const readPhone = (page) => page.evaluate(() => {
  const shell = document.querySelector('.phone-story');
  const owner = document.scrollingElement;
  return { ...shell?.dataset, y: owner.scrollTop, max: owner.scrollHeight - owner.clientHeight,
    documentReading: document.documentElement.dataset.phoneReading,
    overflowY: getComputedStyle(document.documentElement).overflowY,
    overscroll: getComputedStyle(document.documentElement).overscrollBehavior,
    width: innerWidth, height: innerHeight, layoutWidth: shell?.style.getPropertyValue('--phone-layout-width'),
    visualHeight: shell?.style.getPropertyValue('--phone-visual-height'), overflow: document.documentElement.scrollWidth > innerWidth };
});

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  if (process.env.SMOOTH_ENGINE && process.env.SMOOTH_ENGINE !== name) continue;
  const browser = await engine.launch({ headless: true, ...(name === 'chromium' ? { channel: 'chrome' } : {}) });
  environments.push({ engine: name, version: browser.version(), platform: process.platform, arch: process.arch, headless: true });
  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
    const page = await desktop.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`${baseURL}/#lab`);
    await page.waitForSelector('[data-production-story-app][data-experience-interactive="true"]');
    await page.evaluate(() => document.fonts.ready);
    await nextPaint(page);
    await page.evaluate(() => {
      const port = document.querySelector('[data-reading-scrollport="true"]');
      window.__smoothCheck = { samples: [], inputAt: null, longTasks: [], longTasksSupported: PerformanceObserver.supportedEntryTypes.includes('longtask') };
      const state = window.__smoothCheck;
      window.addEventListener('wheel', () => { state.inputAt = performance.now(); requestAnimationFrame(frame); }, { once: true, passive: true });
      if (state.longTasksSupported) {
        const observer = new PerformanceObserver((list) => state.longTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration }))));
        observer.observe({ type: 'longtask' }); state.observer = observer;
      }
      function frame(t) {
        state.samples.push({ t, y: port.scrollTop });
        if (state.inputAt === null || t - state.inputAt < 10000) requestAnimationFrame(frame);
        else { state.done = true; state.observer?.disconnect(); }
      }
    });
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, 600);
    await page.waitForFunction(() => window.__smoothCheck.done);
    const trace = await page.evaluate(() => {
      const { samples, inputAt, longTasks, longTasksSupported } = window.__smoothCheck;
      return { samples: samples.map(({ t, y }) => ({ t: t - inputAt, y })),
        longTasks: longTasks.map(({ startTime, duration }) => ({ startTime: startTime - inputAt, duration })), longTasksSupported };
    });
    const moving = trace.samples.filter(({ t, y }) => t >= 0 && y > 0);
    results.push({ engine: name, platform: 'desktop-trace', ...trace });
    assert(moving.length > 10 && moving[0].y < 600, `${name}: intermediate scroll positions`);
    assert(trace.samples.filter(({ t }) => t <= 250).at(-1).y >= 570, `${name}: 95% within 250ms`);
    assert.equal(trace.samples.find(({ t }) => t >= 600).y, 600, `${name}: settled within 600ms`);
    assert.equal(await page.locator('[data-production-story-app]').getAttribute('data-phase'), 'hold');
    const intervals = trace.samples.slice(1).map(({ t }, i) => t - trace.samples[i].t).sort((a, b) => a - b);
    const p95 = intervals[Math.floor(intervals.length * .95)];
    await page.screenshot({ path: fileURLToPath(new URL(`${name}-desktop.png`, output)) });
    results.push({ engine: name, platform: 'desktop', p95, ...trace, errors: [...errors] });
    assert.deepEqual(errors, []);
    await desktop.close();

    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const phone = await mobile.newPage();
    phone.on('pageerror', (error) => errors.push(error.message));
    await phone.goto(`${baseURL}/#lab`);
    await phone.waitForSelector('.phone-story[data-phone-reading="enabled"]');
    await phone.evaluate(() => document.fonts.ready);
    await nextPaint(phone);
    if (name === 'chromium') {
      const cdp = await mobile.newCDPSession(phone);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 190, y: 680 }] });
      for (let y = 660; y >= 380; y -= 20) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 190, y }] });
        await phone.waitForTimeout(24); // Physical input cadence, not a readiness wait.
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await phone.waitForFunction(() => scrollY > 100);
      await phone.waitForFunction(() => {
        window.__stillCount = window.__lastY === scrollY ? (window.__stillCount ?? 0) + 1 : 0;
        window.__lastY = scrollY; return window.__stillCount >= 6;
      });
      const nativeTouch = await readPhone(phone);
      assert.equal(nativeTouch.phoneScene, 'lab'); assert.equal(nativeTouch.phoneStatus, 'stable');
      results.push({ engine: name, platform: 'phone-trusted-touch', ...nativeTouch });
      await cdp.detach();
    }
    for (const [position, width, height] of [['top', 360, 800], ['middle', 430, 932], ['bottom', 390, 844], ['middle', 390, 720], ['middle', 844, 390], ['middle', 390, 844]]) {
      await phone.evaluate((position) => {
        const owner = document.scrollingElement, max = owner.scrollHeight - owner.clientHeight;
        scrollTo(0, position === 'top' ? 0 : position === 'bottom' ? max : Math.min(600, max / 2));
      }, position);
      await nextPaint(phone);
      const before = await readPhone(phone);
      const anchor = await phone.evaluate(() => {
        const nodes = [...document.querySelectorAll('.phone-story__reading-flow :is(h1,h2,h3,p,li,input,textarea)')];
        const index = nodes.findIndex((node) => { const box = node.getBoundingClientRect(); return box.height > 0 && box.bottom > 0 && box.top < innerHeight; });
        return { index, top: nodes[index]?.getBoundingClientRect().top };
      });
      await phone.setViewportSize({ width, height });
      await nextPaint(phone);
      await phone.waitForFunction(({ width, height }) => {
        const shell = document.querySelector('.phone-story');
        return shell?.dataset.phoneStatus === 'faulted' || shell?.dataset.phoneStatus === 'stable'
          && shell.style.getPropertyValue('--phone-layout-width') === `${width}px`
          && shell.style.getPropertyValue('--phone-visual-height') === `${height}px`;
      }, { width, height }, { timeout: 10000 }).catch(async (error) => {
        console.error({ position, width, height, actual: await readPhone(phone) }); throw error;
      });
      await nextPaint(phone);
      const after = await readPhone(phone);
      results.push({ engine: name, platform: 'phone-resize', position, width, height, before, after });
      assert.equal(after.phoneStatus, 'stable', JSON.stringify(after));
      assert.equal(after.phoneReading, 'enabled'); assert.equal(after.phoneCommitSequence, before.phoneCommitSequence);
      assert.equal(after.documentReading, 'enabled'); assert.equal(after.overflowY, 'auto'); assert.equal(after.overscroll, 'auto');
      assert.equal(after.overflow, false);
      const top = await phone.evaluate((index) => [...document.querySelectorAll('.phone-story__reading-flow :is(h1,h2,h3,p,li,input,textarea)')][index]?.getBoundingClientRect().top, anchor.index);
      if (position === 'top') assert(after.y <= 1);
      else if (position === 'bottom') assert(Math.abs(after.y - after.max) <= 1);
      else if (after.y > 1 && after.y < after.max - 1) assert(Math.abs(top - anchor.top) <= 2, `${name}: anchor shifted ${top - anchor.top}px`);
      results.at(-1).anchorShift = top - anchor.top;
      await phone.screenshot({ path: fileURLToPath(new URL(`${name}-phone-${width}x${height}-${position}.png`, output)) });
    }
    for (const scene of ['services', 'education', 'figure2-proof']) {
      await phone.goto(`${baseURL}/#${scene}`);
      await phone.waitForSelector(`.phone-story[data-phone-scene="${scene}"][data-phone-status="stable"][data-phone-reading="enabled"]`);
      await phone.evaluate(() => scrollTo(0, 450));
      await nextPaint(phone);
      for (const lifecycle of ['visibility', 'bfcache']) {
        const before = await readPhone(phone);
        await phone.evaluate((lifecycle) => {
          if (lifecycle === 'bfcache') window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true }));
          else {
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
          }
        }, lifecycle);
        await nextPaint(phone);
        await phone.evaluate((lifecycle) => {
          if (lifecycle === 'bfcache') window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
          else {
            delete document.visibilityState;
            document.dispatchEvent(new Event('visibilitychange'));
          }
        }, lifecycle);
        await phone.waitForFunction((revision) => {
          const shell = document.querySelector('.phone-story');
          return shell?.dataset.phoneStatus === 'faulted' || shell?.dataset.phoneStatus === 'stable'
            && Number(shell.dataset.phonePlaneRevision) > Number(revision);
        }, before.phonePlaneRevision);
        await nextPaint(phone);
        const after = await readPhone(phone);
        assert.equal(after.phoneStatus, 'stable'); assert.equal(after.phoneReading, 'enabled');
        assert.equal(after.documentReading, 'enabled'); assert.equal(after.overflowY, 'auto'); assert.equal(after.overscroll, 'auto');
        assert.equal(after.phoneCommitSequence, before.phoneCommitSequence);
        assert(Math.abs(after.y - before.y) <= 1, `${name}:${scene}:${lifecycle}: reading position changed`);
        results.push({ engine: name, platform: 'phone-lifecycle-simulated', scene, lifecycle, before, after });
      }
    }
    for (const [label, scene] of [['场景', 'services'], ['留学', 'education'], ['方法', 'method-top'], ['留学', 'education']]) {
      await phone.getByRole('button', { name: '菜单', exact: true }).click();
      await phone.getByRole('link', { name: label, exact: true }).click();
      await phone.waitForSelector(`.phone-story[data-phone-scene="${scene}"][data-phone-status="stable"][data-phone-reading="enabled"]`);
      await nextPaint(phone);
      const after = await readPhone(phone);
      assert.equal(after.documentReading, 'enabled'); assert.equal(after.overflowY, 'auto'); assert.equal(after.overscroll, 'auto');
      assert(after.max > 100); assert(after.y <= 1);
      results.push({ engine: name, platform: 'phone-menu-scroll-owner', scene, after });
    }
    const pacing = await phone.evaluate(() => new Promise((resolve) => {
      const frames = [], start = performance.now();
      function sample(now) {
        frames.push(now);
        if (now - start < 10000) return requestAnimationFrame(sample);
        const intervals = frames.slice(1).map((t, index) => t - frames[index]).sort((a, b) => a - b);
        resolve({ duration: now - start, samples: frames.length, p95: intervals[Math.floor(intervals.length * .95)], max: intervals.at(-1) });
      }
      requestAnimationFrame(sample);
    }));
    results.push({ engine: name, platform: 'phone-reading-pacing', ...pacing });
    assert.deepEqual(errors, []);
    await mobile.close();
  } catch (error) {
    console.error(name, error);
    throw error;
  } finally {
    await writeFile(new URL('results.json', output), JSON.stringify({ baseURL, environments, results, realDevice: 'not-tested' }, null, 2));
    await browser.close();
  }
}
console.log(JSON.stringify({ pass: true, records: results.length, output: fileURLToPath(output) }));
