import { createInkTextReveal } from '../effects/ink-text-reveal.js';

const SELECTOR = '[data-ink-reveal]';

export function initInkKeywords({
  root = document,
  selector = SELECTOR,
  reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
  maxWebglKeywords = 2
} = {}) {
  const elements = Array.from(root.querySelectorAll(selector))
    .filter((element) => element instanceof HTMLElement && element.dataset.inkBound !== 'true');

  let webglCount = 0;
  const instances = elements.map((element) => {
    element.dataset.inkBound = 'true';
    const wantsWebgl = (element.dataset.inkReveal || '').toLowerCase() === 'webgl';
    const canUseWebgl = wantsWebgl && !reduceMotion && webglCount < maxWebglKeywords;
    if (canUseWebgl) webglCount += 1;
    return canUseWebgl ? setupWebglKeyword(element) : setupLightKeyword(element);
  });

  if (!instances.length) {
    return { destroy() {} };
  }

  const play = (target) => {
    const instance = instances.find((item) => item.element === target);
    if (instance) instance.play();
  };

  let observer = null;
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        play(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.35, rootMargin: '0px 0px -8% 0px' });

    instances.forEach((instance) => observer.observe(instance.element));
  } else {
    instances.forEach((instance) => instance.play());
  }

  return {
    destroy() {
      if (observer) observer.disconnect();
      instances.forEach((instance) => instance.destroy());
    }
  };
}

function setupLightKeyword(element) {
  element.classList.add('ink-keyword', 'ink-keyword--light');

  return {
    element,
    play() {
      element.classList.add('is-ink-visible');
    },
    destroy() {
      element.classList.remove('ink-keyword', 'ink-keyword--light', 'is-ink-visible');
      delete element.dataset.inkBound;
    }
  };
}

function setupWebglKeyword(element) {
  const text = element.textContent.trim();
  element.classList.add('ink-keyword', 'ink-keyword--webgl');
  element.setAttribute('aria-label', text);

  const textSpan = document.createElement('span');
  textSpan.className = 'ink-keyword__text';
  textSpan.textContent = text;

  const canvas = document.createElement('canvas');
  canvas.className = 'ink-keyword__canvas';
  canvas.setAttribute('aria-hidden', 'true');

  element.textContent = '';
  element.append(textSpan, canvas);

  const effect = createInkTextReveal(canvas, {
    text,
    autoStart: false,
    mode: 'single-reveal',
    hostElement: element,
    textElements: [textSpan]
  });

  return {
    element,
    play() {
      element.classList.add('is-ink-visible');
      effect?.play?.({ text, mode: 'reveal' });
    },
    destroy() {
      effect?.destroy?.();
      element.textContent = text;
      element.classList.remove('ink-keyword', 'ink-keyword--webgl', 'is-ink-visible');
      element.removeAttribute('aria-label');
      delete element.dataset.inkBound;
    }
  };
}
