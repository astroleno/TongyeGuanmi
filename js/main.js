import { initInkKeywords } from './components/ink-keyword.js';
import { initLoaderInkReveal } from './effects/ink-text-reveal.js';
import { initHomepageTransitionsWithObserver } from './observers/homepage-master-observer-loader.js';
import { createSiteRuntime } from './site/runtime.js';
import { initBeliefStarField } from './sections/belief.js';
import { initLayeredHero, initFallbackParallax } from './sections/hero.js';
import { initCursorGlow } from './ui/cursor-glow.js';
import { initMagneticAndTilt } from './ui/magnetic-tilt.js';
import { initPageProgress } from './ui/page-progress.js';
import { initGsapTextAndUI, initVanillaReveal } from './ui/reveal.js';
import { initSmoothScroll } from './ui/smooth-scroll.js';

const root = document.documentElement;
const body = document.body;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const CDN = {
  gsap: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
  scrollTrigger: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js',
  lenis: 'https://cdn.jsdelivr.net/npm/lenis@1.3.23/dist/lenis.min.js'
};

const LOADER_PHRASES = ['同人于野', '观象知幂'];
const LOADER_START_DELAY_MS = 180, LOADER_REVEAL_MS = 1150, LOADER_HOLD_MS = 220, LOADER_GAP_MS = 160;
const LOADER_PHRASE_MS = LOADER_REVEAL_MS + LOADER_HOLD_MS + LOADER_REVEAL_MS;
const LOADER_SEQUENCE_TOTAL_MS = LOADER_START_DELAY_MS + LOADER_PHRASE_MS * LOADER_PHRASES.length + LOADER_GAP_MS;
const HERO_LOADER_EXIT_MS = 420;

function loadScript(src, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    let settled = false;
    const finish = (ok, value) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (!ok) {
        script.onerror = null;
        script.onload = null;
        script.remove();
      }
      ok ? resolve(value) : reject(value);
    };
    const timer = window.setTimeout(() => finish(false, new Error(`Timed out loading ${src}`)), timeout);
    script.src = src;
    script.async = false;
    script.onload = () => finish(true);
    script.onerror = () => finish(false, new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function loadRequiredLibraries() {
  if (!window.gsap) await loadScript(CDN.gsap);
  if (!window.ScrollTrigger) await loadScript(CDN.scrollTrigger);
  try {
    if (!window.Lenis) await loadScript(CDN.lenis);
  } catch (error) {
    console.warn('Lenis unavailable, keeping native scroll.', error);
  }
  if (!window.gsap || !window.ScrollTrigger) {
    throw new Error('Required animation libraries are unavailable.');
  }
}

const runtime = createSiteRuntime({
  body,
  loaderSequenceTotalMs: LOADER_SEQUENCE_TOTAL_MS,
  heroLoaderExitMs: HERO_LOADER_EXIT_MS,
  reduceMotion
});

initPageProgress({ root });
initCursorGlow({ root, reduceMotion, lerp: (a, b, t) => a + (b - a) * t });
initLoaderInkReveal({
  body,
  reduceMotion,
  phrases: LOADER_PHRASES,
  timings: {
    startDelayMs: LOADER_START_DELAY_MS,
    revealMs: LOADER_REVEAL_MS,
    holdMs: LOADER_HOLD_MS,
    gapMs: LOADER_GAP_MS
  },
  onReadyAtChange: runtime.setLoaderReadyAt
});
initInkKeywords({ reduceMotion, maxWebglKeywords: 2 });
initBeliefStarField({ root: document, reduceMotion });

if (reduceMotion) {
  initMagneticAndTilt({ reduceMotion });
  initFallbackParallax({ root, reduceMotion, runtime });
  initVanillaReveal();
  initHomepageTransitionsWithObserver({ root, body, reduceMotion: true });
} else {
  loadRequiredLibraries()
    .then(() => {
      const scrollRuntime = initSmoothScroll({ root, body, reduceMotion });
      initMagneticAndTilt({ reduceMotion });
      initGsapTextAndUI({ root, scrollRuntime });
      initLayeredHero({ root, body, runtime, reduceMotion });
      initHomepageTransitionsWithObserver({
        root,
        body,
        scrollRuntime,
        reduceMotion,
        gsap: window.gsap,
        ScrollTrigger: window.ScrollTrigger
      });
    })
    .catch((error) => {
      console.warn('CDN libraries unavailable, switching to fallback.', error);
      initMagneticAndTilt({ reduceMotion });
      initFallbackParallax({ root, reduceMotion, runtime });
      initVanillaReveal();
      initHomepageTransitionsWithObserver({ root, body, reduceMotion: true });
    });
}
