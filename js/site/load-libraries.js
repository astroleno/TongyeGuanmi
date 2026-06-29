/**
 * CDN library loading for the homepage bootstrap.
 *
 * Extracted from js/main.js to keep the entry file a thin orchestrator
 * (verify:ink-modules enforces main.js stays under 120 lines). GSAP and
 * ScrollTrigger are required; Lenis is best-effort (native scroll is an
 * acceptable fallback).
 */

const CDN = {
  gsap: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js',
  scrollTrigger: 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/ScrollTrigger.min.js',
  lenis: 'https://cdn.jsdelivr.net/npm/lenis@1.3.23/dist/lenis.min.js'
};

export function loadScript(src, timeout = 10000) {
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

export async function loadRequiredLibraries() {
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
