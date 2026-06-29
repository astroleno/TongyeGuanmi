import { initInkKeywords } from './components/ink-keyword.js';
import { initLoaderInkReveal } from './effects/ink-text-reveal.js';
import { createSiteRuntime } from './site/runtime.js';
import { loadRequiredLibraries } from './site/load-libraries.js';
import { initBeliefStarField } from './sections/belief.js';
import { initLayeredHero, initFallbackParallax } from './sections/hero.js';
import { initHomepageTransitions } from './transitions/homepage-transition-runtime.js';
import { initCursorGlow } from './ui/cursor-glow.js';
import { initMagneticAndTilt } from './ui/magnetic-tilt.js';
import { initPageProgress } from './ui/page-progress.js';
import { initGsapTextAndUI, initVanillaReveal } from './ui/reveal.js';
import { initSmoothScroll } from './ui/smooth-scroll.js';
import { createHomepageRuntimeIntegration } from './runtime/homepage-runtime-integration.js';

const root = document.documentElement;
const body = document.body;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const LOADER_PHRASES = ['同人于野', '观象知幂'];
const LOADER_START_DELAY_MS = 180;
const LOADER_REVEAL_MS = 1150;
const LOADER_HOLD_MS = 220;
const LOADER_GAP_MS = 160;
const LOADER_PHRASE_MS = LOADER_REVEAL_MS + LOADER_HOLD_MS + LOADER_REVEAL_MS;
const LOADER_SEQUENCE_TOTAL_MS = LOADER_START_DELAY_MS + LOADER_PHRASE_MS * LOADER_PHRASES.length + LOADER_GAP_MS;
const HERO_LOADER_EXIT_MS = 420;

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

function bootHomepageRuntime(scrollController) {
  window.__homepageRuntime = createHomepageRuntimeIntegration({
    scrollController: scrollController || null,
    rootElement: root,
    reduceMotion
  });
}

if (reduceMotion) {
  initMagneticAndTilt({ reduceMotion });
  initFallbackParallax({ root, reduceMotion, runtime });
  initVanillaReveal();
  initHomepageTransitions({ root: document, reduceMotion: true });
  bootHomepageRuntime(null);
} else {
  loadRequiredLibraries()
    .then(() => {
      const scrollRuntime = initSmoothScroll({ root, body, reduceMotion });
      initMagneticAndTilt({ reduceMotion });
      initGsapTextAndUI({ root, scrollRuntime });
      initLayeredHero({ root, body, runtime, reduceMotion });
      initHomepageTransitions({
        root: document,
        scrollRuntime,
        reduceMotion,
        gsap: window.gsap,
        ScrollTrigger: window.ScrollTrigger
      });
      bootHomepageRuntime(scrollRuntime.lenis);
    })
    .catch((error) => {
      console.warn('CDN libraries unavailable, switching to fallback.', error);
      initMagneticAndTilt({ reduceMotion });
      initFallbackParallax({ root, reduceMotion, runtime });
      initVanillaReveal();
      initHomepageTransitions({ root: document, reduceMotion: true });
      bootHomepageRuntime(null);
    });
}
