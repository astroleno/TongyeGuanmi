import { chromium } from '@playwright/test';

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const events = [];
await page.route('**/assets/usePhoneStoryOrchestratorRuntime-*.js', async (route) => {
  const response = await route.fetch();
  const body = await response.text();
  const before = 'function oe(e,n,t){const r=e.getSnapshot(),o=h(n);e.dispatch({type:"DIRECT_ENTRY_REQUESTED",P:r.P,target:n,source:t,oe:"stable"===r.status?r.l:r.F.v,re:"cinematic"===o.kind?{run:o.run,direction:o.direction,u:o.u}:null})}';
  const after = 'function oe(e,n,t){const r=e.getSnapshot(),o=h(n),d={type:"DIRECT_ENTRY_REQUESTED",P:r.P,target:n,source:t,oe:"stable"===r.status?r.l:r.F.v,re:"cinematic"===o.kind?{run:o.run,direction:o.direction,u:o.u}:null};console.log("DIRECT_BRIDGE",n,t,r.status,r.P,o,d,JSON.stringify(d));const z=e.dispatch(d),a=e.getSnapshot();console.log("DIRECT_AFTER",a.status,a.session,a.U,z)}';
  const preflightBefore = 'const u=new Set,p=(e,n)=>{const r=t.le(e);if(!r)return!1;try{return t.apply(r),s=e,n&&(()=>{for(const e of u)e()})(),!0}catch{return t.fe(),!1}},g=';
  const preflightAfter = 'const u=new Set,p=(e,n)=>{const r=t.le(e);if(!r)return console.log("PREFLIGHT_FALSE",e),!1;try{return t.apply(r),s=e,n&&(()=>{for(const e of u)e()})(),!0}catch{return console.log("PREFLIGHT_THROW",e),t.fe(),!1}},g=';
  if (!body.includes(before) || !body.includes(preflightBefore)) {
    throw new Error('direct bridge instrumentation target changed');
  }
  await route.fulfill({
    response,
    body: body.replace(before, after).replace(preflightBefore, preflightAfter)
  });
});
page.on('console', (message) => events.push({ type: message.type(), text: message.text() }));
page.on('pageerror', (error) => events.push({ type: 'pageerror', text: String(error) }));
await page.goto(
  'http://127.0.0.1:4173/?v=47&portrait-spike-motion=reduce#ph-animation',
  { waitUntil: 'domcontentloaded' }
);
await page.waitForTimeout(2_000);
const snapshot = await page.evaluate(() => Object.fromEntries(Object.entries(
  document.querySelector('[data-phone-validation-mode]')?.dataset ?? {}
)));
console.log(JSON.stringify({ events, snapshot }, null, 2));
await browser.close();
