export const DEFAULT_TRANSITION_LIBRARY_SOURCES = {
  gsap: 'js/vendor/gsap.min.js',
  scrollTrigger: 'js/vendor/ScrollTrigger.min.js',
  lenis: 'js/vendor/lenis.min.js'
};

const scriptPromises = new Map();

function findScript(src) {
  return [...document.scripts].find((script) => {
    const scriptSrc = script.getAttribute('src') || '';
    return scriptSrc === src || script.src.endsWith(src);
  });
}

function isScriptLoaded(script) {
  return script.dataset.transitionRuntimeLoaded === 'true';
}

export function loadScript(src, timeout = 10000) {
  const existing = findScript(src);
  if (existing && isScriptLoaded(existing)) return Promise.resolve();
  if (scriptPromises.has(src)) return scriptPromises.get(src);

  const promise = new Promise((resolve, reject) => {
    const script = existing || document.createElement('script');
    let settled = false;
    const timer = window.setTimeout(() => finish(false, new Error(`Timed out loading ${src}`)), timeout);

    function finish(ok, value) {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (ok) script.dataset.transitionRuntimeLoaded = 'true';
      if (!ok && !existing) script.remove();
      script.onload = null;
      script.onerror = null;
      ok ? resolve(value) : reject(value);
    }

    if (!existing) {
      script.src = src;
      script.async = false;
    }

    script.onload = () => finish(true);
    script.onerror = () => finish(false, new Error(`Failed to load ${src}`));
    if (!existing) document.head.appendChild(script);
  });

  scriptPromises.set(src, promise);
  promise.then(
    () => scriptPromises.delete(src),
    () => scriptPromises.delete(src)
  );
  return promise;
}

export async function loadTransitionLibraries({
  sources = DEFAULT_TRANSITION_LIBRARY_SOURCES,
  requireLenis = false,
  logger = console
} = {}) {
  if (!window.gsap) await loadScript(sources.gsap);
  if (!window.ScrollTrigger) await loadScript(sources.scrollTrigger);

  try {
    if (!window.Lenis && sources.lenis) await loadScript(sources.lenis);
  } catch (error) {
    if (requireLenis) throw error;
    logger?.warn?.('Lenis unavailable, keeping native scroll.', error);
  }

  if (!window.gsap || !window.ScrollTrigger) {
    throw new Error('GSAP ScrollTrigger unavailable.');
  }

  return {
    gsap: window.gsap,
    ScrollTrigger: window.ScrollTrigger,
    Lenis: window.Lenis || null
  };
}
