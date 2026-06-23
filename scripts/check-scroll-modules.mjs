import { readFile } from 'node:fs/promises';

const checks = [];

async function read(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

function assertContains(source, needle, message) {
  checks.push({ ok: source.includes(needle), message, needle });
}

function assertNotContains(source, needle, message) {
  checks.push({ ok: !source.includes(needle), message, needle });
}

const main = await read('js/main.js');
const index = await read('index.html');
const reveal = await read('js/ui/reveal.js');
const styles = await read('css/styles.css');
const template = await read('src/index.template.html');
const smoothScroll = await read('js/ui/smooth-scroll.js').catch(() => '');

assertContains(main, "lenis: 'https://cdn.jsdelivr.net/npm/lenis@1.3.23/dist/lenis.min.js'", 'main.js pins Lenis CDN version');
assertContains(main, "import { initSmoothScroll } from './ui/smooth-scroll.js';", 'main.js imports smooth-scroll module');
assertContains(main, 'await loadScript(CDN.lenis);', 'main.js loads Lenis before initialization');
assertContains(main, 'const scrollRuntime = initSmoothScroll({', 'main.js stores smooth scroll runtime');

assertContains(smoothScroll, 'export function initSmoothScroll', 'smooth-scroll.js exports initSmoothScroll');
assertContains(smoothScroll, 'new window.Lenis', 'smooth-scroll.js creates Lenis from CDN global');
assertContains(smoothScroll, "lenis.on('scroll', ScrollTrigger.update)", 'Lenis updates ScrollTrigger');
assertContains(smoothScroll, 'gsap.ticker.add(tick)', 'Lenis RAF is driven by GSAP ticker');
assertContains(smoothScroll, 'getAnchorTargetY(target)', 'anchor clicks use deterministic numeric target positions');
assertContains(smoothScroll, '- getSnapOffset()', 'anchor clicks use snapped visual offset');
assertContains(smoothScroll, 'scheduleInitialHashAlignment(lenis)', 'initial hash visits align through Lenis after layout setup');
assertContains(smoothScroll, 'alignIfOffscreen', 'initial hash visits get a final visible-target correction');
assertContains(smoothScroll, 'destroy()', 'smooth-scroll.js exposes cleanup');

assertContains(index, 'class="long-canvas"', 'index.html provides the long-canvas stage');
assertContains(template, '{{> sections/hero.html}}', 'index template includes the hero section partial');
assertContains(template, '{{> sections/method.html}}', 'index template includes the method section partial');
assertContains(template, '{{> sections/services.html}}', 'index template includes the services section partial');
assertContains(template, '{{> sections/lab.html}}', 'index template includes the lab section partial');
assertContains(index, 'href="#services">场景</a>', 'top navigation restores the source scenario label');
assertContains(reveal, "const sections = ['method', 'services', 'education', 'contact'];", 'reveal.js tracks the source navigation sections');
assertContains(styles, './sections/source-copy.css', 'styles import source-copy section styles');
assertContains(styles, '.chapter-transition', 'styles define chapter transition hooks');
assertNotContains(index, 'class="post-hero-stage"', 'index.html no longer provides the old snap stage');
assertNotContains(reveal, "id: 'post-hero-section-snap'", 'reveal.js no longer creates the post-hero snap trigger');
assertNotContains(reveal, 'export function initSmoothScroll', 'reveal.js no longer owns smooth scroll');
assertContains(styles, 'body.is-lenis-active', 'styles expose Lenis active state');

const failures = checks.filter((check) => !check.ok);

if (failures.length) {
  console.error('Scroll integration checks failed:');
  failures.forEach((failure) => {
    console.error(`- ${failure.message}`);
    console.error(`  Missing/unexpected: ${failure.needle}`);
  });
  process.exit(1);
}

console.log('Scroll integration structure looks good.');
