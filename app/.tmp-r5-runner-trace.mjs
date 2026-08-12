import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const events = [];
await page.route('**/assets/PhoneContinuationBundle-*.js', async (route) => {
  const response = await route.fetch();
  const body = await response.text();
  const changes = [
    ['const u=o(a);if(!u)return l(a);', 'const u=o(a);if(!u)return console.log("RUNNER_CONFIG_NULL",a),l(a);'],
    ['if(!p||!h)return l(a);', 'if(!p||!h)return console.log("RUNNER_ROOT_NULL",!!p,!!h,a),l(a);'],
    ['if(!v)return l(a);', 'if(!v)return console.log("RUNNER_PREPARE_MISSING",a),l(a);'],
    ['catch{l(a)}})(y,_)', 'catch(e){console.log("RUNNER_CATCH",e);l(a)}})(y,_)']
  ];
  let patched = body;
  for (const [before, after] of changes) {
    if (!patched.includes(before)) throw new Error(`runner target changed: ${before}`);
    patched = patched.replace(before, after);
  }
  await route.fulfill({ response, body: patched });
});
await page.route('**/assets/phone-transition-readiness-*.js', async (route) => {
  const response = await route.fetch();
  const body = await response.text();
  const changes = [
    ['return r.set(e,a),s(),{dispose()', 'return r.set(e,a),console.log("CAP_REGISTER",e),s(),{dispose()'],
    ['waitFor(o,{signal:t,t:s}){return new Promise', 'waitFor(o,{signal:t,t:s}){console.log("CAP_WAIT",o);return new Promise'],
    ['l=globalThis.setTimeout(()=>{w(new e(d()))}', 'l=globalThis.setTimeout(()=>{console.log("CAP_TIMEOUT",o,[...r.keys()]);w(new e(d()))}']
  ];
  let patched = body;
  for (const [before, after] of changes) {
    if (!patched.includes(before)) throw new Error(`registry target changed: ${before}`);
    patched = patched.replace(before, after);
  }
  await route.fulfill({ response, body: patched });
});
page.on('console', (message) => events.push({ type: message.type(), text: message.text() }));
page.on('pageerror', (error) => events.push({ type: 'pageerror', text: String(error) }));
await page.goto(
  'http://127.0.0.1:4173/?v=47&portrait-spike-motion=reduce#ph-animation',
  { waitUntil: 'domcontentloaded' }
);
await page.waitForTimeout(3_000);
const snapshot = await page.evaluate(() => ({
  formal: Object.fromEntries(Object.entries(
    document.querySelector('[data-phone-validation-mode]')?.dataset ?? {}
  )),
  dom: {
    ph: Boolean(document.querySelector('[data-r4-scene="ph-animation"]')),
    education: Boolean(document.querySelector('[data-r4-scene="education"]')),
    phEducation: Boolean(document.querySelector('[data-phone-ph-education-layer]')),
    labPh: Boolean(document.querySelector('[data-phone-lab-ph-layer]')),
    stage: Boolean(document.querySelector('[data-portrait-stage-host]'))
  }
}));
console.log(JSON.stringify({ events, snapshot }, null, 2));
await browser.close();
