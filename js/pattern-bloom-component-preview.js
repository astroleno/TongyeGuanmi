import { mountPatternBloomTransition } from './transitions/pattern-bloom-adapter.js';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const host = document.querySelector('[data-pattern-bloom-component-preview]');

if (host) {
  mountPatternBloomTransition({ host, reduceMotion });
}
